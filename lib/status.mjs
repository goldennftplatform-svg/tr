const CHECK_TIMEOUT_MS = 5000;

const CHECKS = [
  {
    id: "frontend",
    group: "frontend",
    label: "Site (www)",
    url: "https://www.playtrenches.com/",
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
    label: "Unity loader",
    url: "https://www.playtrenches.com/Build/DevFix.loader.js",
    critical: true,
  },
  {
    id: "unity_wasm",
    group: "frontend",
    label: "Unity WASM",
    url: "https://www.playtrenches.com/Build/DevFix.wasm.unityweb",
    method: "HEAD",
    critical: true,
  },
  {
    id: "unity_data",
    group: "frontend",
    label: "Unity data (~63MB)",
    url: "https://www.playtrenches.com/Build/DevFix.data.unityweb",
    method: "HEAD",
    critical: true,
  },
  {
    id: "addressables",
    group: "frontend",
    label: "Addressables catalog",
    url: "https://yxb0iks1w3xnb8lu.public.blob.vercel-storage.com/WebGL/catalog_1.10.0.hash",
    critical: true,
  },
  {
    id: "backend_health",
    group: "backend",
    label: "API /health",
    url: "https://trenches-api.vercel.app/api/health",
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
    url: "https://trenches-api.vercel.app/api/tournament/status",
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
    url: "https://trench-clipping.vercel.app/",
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
];

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
        "User-Agent": "PLayTR-Status/1.0",
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
  const results = await Promise.all(CHECKS.map(runCheck));
  const summary = summarize(results);

  return {
    checkedAt,
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
