const CHECK_TIMEOUT_MS = 5000;
const SITE = "https://www.playtrenches.com";
const FALLBACK_BUILD = "Build1";

async function discoverUnityBuild() {
  try {
    const res = await fetch(`${SITE}/`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "User-Agent": "PLayTR-Status/1.1", Accept: "text/html" },
    });
    const html = await res.text();
    const loader = html.match(/Build\/([A-Za-z0-9._-]+)\.loader\.js/);
    const data = html.match(/Build\/([A-Za-z0-9._-]+)\.data\.unityweb/);
    const wasm = html.match(/Build\/([A-Za-z0-9._-]+)\.wasm\.unityweb/);
    const framework = html.match(/Build\/([A-Za-z0-9._-]+)\.framework\.js\.unityweb/);
    const name = loader?.[1] || data?.[1] || wasm?.[1] || FALLBACK_BUILD;
    return {
      name,
      loaderUrl: `${SITE}/Build/${loader?.[1] || name}.loader.js`,
      dataUrl: `${SITE}/Build/${data?.[1] || name}.data.unityweb`,
      wasmUrl: `${SITE}/Build/${wasm?.[1] || name}.wasm.unityweb`,
      frameworkUrl: `${SITE}/Build/${framework?.[1] || name}.framework.js.unityweb`,
      apiBase: (html.match(/TRENCHES_API_BASE\s*=\s*["']([^"']+)/) || [])[1] || null,
      clipsUrl: (html.match(/TRENCHES_CLIPS_URL\s*=\s*["']([^"']+)/) || [])[1] || null,
    };
  } catch {
    return {
      name: FALLBACK_BUILD,
      loaderUrl: `${SITE}/Build/${FALLBACK_BUILD}.loader.js`,
      dataUrl: `${SITE}/Build/${FALLBACK_BUILD}.data.unityweb`,
      wasmUrl: `${SITE}/Build/${FALLBACK_BUILD}.wasm.unityweb`,
      frameworkUrl: `${SITE}/Build/${FALLBACK_BUILD}.framework.js.unityweb`,
      apiBase: null,
      clipsUrl: null,
    };
  }
}

async function discoverAddressablesCatalog() {
  try {
    const res = await fetch(`${SITE}/StreamingAssets/aa/settings.json`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "User-Agent": "PLayTR-Status/1.1", Accept: "application/json" },
    });
    const json = await res.json();
    const remote = (json.m_CatalogLocations || []).find((c) =>
      (c.m_Keys || []).includes("AddressablesMainContentCatalogRemoteHash")
    );
    const url = remote?.m_InternalId;
    if (url && /^https?:\/\//.test(url)) return url;
  } catch {
    /* fall through */
  }
  return "https://yxb0iks1w3xnb8lu.public.blob.vercel-storage.com/WebGL/catalog_1.10.0.hash";
}

async function buildChecks() {
  const [unity, catalogUrl] = await Promise.all([
    discoverUnityBuild(),
    discoverAddressablesCatalog(),
  ]);

  const apiBase = unity.apiBase || "https://trenches-api.vercel.app";
  const clipsUrl = unity.clipsUrl || "https://trench-clipping.vercel.app";

  return {
    discovery: {
      unityBuild: unity.name,
      apiBase,
      clipsUrl,
      addressablesCatalog: catalogUrl,
    },
    checks: [
      {
        id: "frontend",
        group: "frontend",
        label: "Site (www)",
        url: `${SITE}/`,
        critical: true,
      },
      {
        id: "frontend_staging",
        group: "frontend",
        label: "Staging",
        url: "https://staging.playtrenches.com/",
        critical: false,
      },
      {
        id: "unity_loader",
        group: "frontend",
        label: `Unity loader (${unity.name})`,
        url: unity.loaderUrl,
        critical: true,
      },
      {
        id: "unity_wasm",
        group: "frontend",
        label: `Unity WASM (${unity.name})`,
        url: unity.wasmUrl,
        method: "HEAD",
        critical: true,
      },
      {
        id: "unity_data",
        group: "frontend",
        label: `Unity data (${unity.name})`,
        url: unity.dataUrl,
        method: "HEAD",
        critical: true,
      },
      {
        id: "addressables",
        group: "frontend",
        label: "Addressables catalog",
        url: catalogUrl,
        critical: true,
      },
      {
        id: "backend_health",
        group: "backend",
        label: "API /health",
        url: `${apiBase}/api/health`,
        critical: true,
        validate: async (_res, body) => {
          const json = JSON.parse(body);
          if (!json.ok) throw new Error("ok !== true");
          return {
            version: json.version,
            cluster: json.cluster,
            env: json.env,
            time: json.time,
          };
        },
      },
      {
        id: "backend_tournament",
        group: "backend",
        label: "Tournament API",
        url: `${apiBase}/api/tournament/status`,
        critical: false,
        validate: async (_res, body) => {
          const json = JSON.parse(body);
          return {
            stage: json.tournament?.stage,
            entrants: json.tournament?.entrants,
          };
        },
      },
      {
        id: "clipping",
        group: "backend",
        label: "Clipping console",
        url: clipsUrl.endsWith("/") ? clipsUrl : `${clipsUrl}/`,
        critical: false,
      },
      {
        id: "photon_us",
        group: "multiplayer",
        label: "Photon US (gcams)",
        url: "https://gcams1128.exitgames.com/photon/m/?ping&r=1",
        critical: true,
      },
      {
        id: "photon_asia",
        group: "multiplayer",
        label: "Photon Asia (gcash)",
        url: "https://gcash1049.exitgames.com/photon/m/?ping&r=1",
        critical: true,
      },
      {
        id: "solana_rpc",
        group: "chain",
        label: "Solana RPC",
        url: "https://api.mainnet-beta.solana.com",
        method: "POST",
        body: { jsonrpc: "2.0", id: 1, method: "getHealth" },
        critical: true,
        validate: async (_res, text) => {
          const json = JSON.parse(text);
          if (json.error) throw new Error(json.error.message || "RPC error");
          if (json.result && json.result !== "ok") {
            throw new Error(String(json.result));
          }
          return { result: json.result ?? "ok" };
        },
      },
      {
        id: "privy",
        group: "auth",
        label: "Privy custom domain",
        url: "https://privy.playtrenches.com/",
        critical: false,
        okStatuses: [200, 404],
      },
    ],
  };
}

async function runCheck(check) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const init = {
      method: check.method || "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "PLayTR-Status/1.1",
        Accept: "*/*",
      },
    };
    if (check.body) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(check.body);
    }

    const res = await fetch(check.url, init);
    const latencyMs = Date.now() - started;
    const okStatuses = check.okStatuses || [200, 204];
    let detail = null;

    if (check.validate) {
      const bodyText = await res.text();
      detail = await check.validate(res, bodyText);
    } else if ((check.method || "GET") !== "HEAD") {
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
    }

    const statusOk = okStatuses.includes(res.status);
    return {
      id: check.id,
      group: check.group,
      label: check.label,
      url: check.url,
      critical: !!check.critical,
      ok: statusOk,
      status: res.status,
      latencyMs,
      detail,
      error: statusOk ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      id: check.id,
      group: check.group,
      label: check.label,
      url: check.url,
      critical: !!check.critical,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      detail: null,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(results) {
  const byGroup = {};
  for (const r of results) {
    if (!byGroup[r.group]) byGroup[r.group] = [];
    byGroup[r.group].push(r);
  }

  const groupStatus = (group) => {
    const items = byGroup[group] || [];
    if (!items.length) return "unknown";
    const critical = items.filter((i) => i.critical);
    const pool = critical.length ? critical : items;
    if (pool.every((i) => i.ok)) return "operational";
    if (pool.some((i) => i.ok)) return "degraded";
    return "down";
  };

  const frontend = groupStatus("frontend");
  const backend = groupStatus("backend");
  const multiplayer = groupStatus("multiplayer");
  const chain = groupStatus("chain");
  const auth = groupStatus("auth");

  const criticalDown = results.filter((r) => r.critical && !r.ok).length;
  const anyDown = results.some((r) => !r.ok);

  let overall = "operational";
  if (frontend === "down" && backend === "down") overall = "down";
  else if (
    criticalDown > 0 ||
    frontend === "degraded" ||
    backend === "degraded" ||
    frontend === "down" ||
    backend === "down"
  ) {
    overall = "degraded";
  } else if (anyDown) {
    overall = "degraded";
  }

  const health = results.find((r) => r.id === "backend_health");

  return {
    overall,
    meters: {
      frontend: {
        status: frontend,
        label: "Frontend",
        host: "Vercel · www.playtrenches.com",
      },
      backend: {
        status: backend,
        label: "Backend",
        host: "Vercel · trenches-api.vercel.app",
        version: health?.detail?.version ?? null,
        cluster: health?.detail?.cluster ?? null,
        env: health?.detail?.env ?? null,
      },
      multiplayer: {
        status: multiplayer,
        label: "Multiplayer",
        host: "Photon Realtime · exitgames.com",
      },
      chain: {
        status: chain,
        label: "Solana",
        host: "mainnet-beta RPC",
      },
      auth: {
        status: auth,
        label: "Auth",
        host: "Privy · privy.playtrenches.com",
      },
    },
  };
}

export async function getStatusPayload() {
  const checkedAt = new Date().toISOString();
  const { checks, discovery } = await buildChecks();
  const results = await Promise.all(checks.map(runCheck));
  const summary = summarize(results);

  return {
    checkedAt,
    discovery,
    hosting: {
      dns: "Amazon Route 53",
      frontend: "Vercel (www → vercel-dns-017)",
      api: "Vercel serverless (trenches-api.vercel.app)",
      assets: "Vercel Blob (Addressables) + Vercel CDN (Unity WebGL)",
      multiplayer: "Photon Realtime (Exit Games)",
      auth: "Privy (custom domain)",
      chain: "Solana mainnet via Helius (in-game) / public RPC (status)",
    },
    ...summary,
    checks: results,
  };
}
