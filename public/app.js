const STATUS_COPY = {
  operational: {
    title: "All systems clear",
    copy: "Frontend and backend probes are healthy. Warzone should be joinable.",
  },
  degraded: {
    title: "Partial outage",
    copy: "Something in the stack is failing. Check the meters and endpoint list below.",
  },
  down: {
    title: "Major outage",
    copy: "Frontend and backend critical paths are failing. Players will see the game as down.",
  },
  unknown: {
    title: "Checking systems",
    copy: "Probing frontend, backend, Photon, and chain endpoints.",
  },
};

const REFRESH_MS = 30_000;
let timer = null;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function avgLatency(checks, group) {
  const items = checks.filter((c) => c.group === group && c.ok);
  if (!items.length) return null;
  return Math.round(items.reduce((s, c) => s + c.latencyMs, 0) / items.length);
}

function renderMeter(name, meter, checks) {
  const root = document.querySelector(`[data-meter="${name}"]`);
  if (!root || !meter) return;

  root.dataset.status = meter.status;
  const state = root.querySelector("[data-state]");
  const host = root.querySelector("[data-host]");
  const latency = root.querySelector("[data-latency]");
  const env = root.querySelector("[data-env]");

  if (state) {
    state.textContent = meter.status;
    state.className = `meter-state ${meter.status}`;
  }
  if (host) host.textContent = meter.host;
  if (latency) {
    const avg = avgLatency(checks, name);
    latency.textContent = avg != null ? `avg ${avg} ms` : meter.status === "down" ? "unreachable" : "—";
  }
  if (env) {
    if (meter.version || meter.cluster || meter.env) {
      const flags = meter.env
        ? Object.entries(meter.env)
            .map(([k, v]) => `${k}:${v ? "on" : "off"}`)
            .join(" · ")
        : "";
      env.textContent = [`v${meter.version || "?"}`, meter.cluster, flags].filter(Boolean).join(" · ");
    } else {
      env.textContent = "";
    }
  }
}

function renderHosting(hosting) {
  const dl = document.getElementById("hosting-map");
  if (!dl || !hosting) return;
  dl.innerHTML = "";
  for (const [key, value] of Object.entries(hosting)) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = value;
    row.append(dt, dd);
    dl.append(row);
  }
}

function renderChecks(checks) {
  const list = document.getElementById("check-list");
  if (!list) return;
  list.innerHTML = "";

  checks.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "check-row";
    row.style.animationDelay = `${Math.min(i * 0.03, 0.4)}s`;
    row.setAttribute("role", "listitem");

    const label = document.createElement("div");
    label.className = "check-label";
    label.textContent = c.label;

    const meta = document.createElement("div");
    meta.className = "check-meta";
    meta.title = c.error ? `${c.url} — ${c.error}` : c.url;
    meta.textContent = c.error
      ? `${c.error}${c.detail ? " · " + JSON.stringify(c.detail) : ""}`
      : c.detail
        ? JSON.stringify(c.detail)
        : c.url.replace(/^https?:\/\//, "");

    const latency = document.createElement("div");
    latency.className = "check-latency";
    latency.textContent = `${c.latencyMs} ms`;

    const state = document.createElement("div");
    state.className = `check-state ${c.ok ? "ok" : "fail"}`;
    state.textContent = c.ok ? "UP" : "DOWN";

    row.append(label, meta, latency, state);
    list.append(row);
  });
}

async function loadStatus() {
  const refreshBtn = document.getElementById("refresh");
  document.body.classList.add("is-loading");
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();

    const overall = data.overall || "unknown";
    const copy = STATUS_COPY[overall] || STATUS_COPY.unknown;

    const pill = document.getElementById("overall-pill");
    if (pill) {
      pill.textContent = overall;
      pill.className = `pill ${overall}`;
    }

    setText("overall-title", copy.title);
    setText("overall-copy", copy.copy);
    setText("checked-at", `checked ${formatTime(data.checkedAt)}`);

    renderMeter("frontend", data.meters.frontend, data.checks);
    renderMeter("backend", data.meters.backend, data.checks);
    renderMeter("multiplayer", data.meters.multiplayer, data.checks);
    renderMeter("chain", data.meters.chain, data.checks);
    renderMeter("auth", data.meters.auth, data.checks);
    renderHosting(data.hosting);
    renderChecks(data.checks);
  } catch (err) {
    const pill = document.getElementById("overall-pill");
    if (pill) {
      pill.textContent = "error";
      pill.className = "pill down";
    }
    setText("overall-title", "Status probe failed");
    setText("overall-copy", err.message || "Could not reach the local status API.");
  } finally {
    document.body.classList.remove("is-loading");
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function start() {
  loadStatus();
  timer = setInterval(loadStatus, REFRESH_MS);
  document.getElementById("refresh")?.addEventListener("click", () => {
    clearInterval(timer);
    loadStatus().finally(() => {
      timer = setInterval(loadStatus, REFRESH_MS);
    });
  });
}

start();
