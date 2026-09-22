// The "how it works" panel: what was fetched and from where, per-model timings,
// what the browser and runtime report, and the offline cache controls.
import { MODELS, MODELS_URL, LITERT_WASM_DIR, allEntries, blockedPings, dispose, disposeAll, events, fetchLog, load, saveSettings, settings, type Accelerator, type FetchRecord, type ModelId } from "./runtime";
import { MODELS_CACHE, CORES_CACHE } from "./cache";
import { el, fmtBytes, fmtMs } from "./ui";

export function inspector(): HTMLElement {
  const root = el("section", { class: "inspector", id: "inspector" });

  // ---- settings
  const accel = el("select", {}, el("option", { value: "wasm", text: "accelerator: wasm (XNNPACK CPU)" }), el("option", { value: "webgpu", text: "accelerator: webgpu" }));
  accel.value = settings().accelerator;
  accel.onchange = () => { saveSettings({ accelerator: accel.value as Accelerator }); disposeAll(); };
  const block = el("input", { type: "checkbox" }); block.checked = settings().blockTelemetry;
  block.onchange = () => saveSettings({ blockTelemetry: block.checked });
  const blockedEl = el("span", { class: "muted small" });
  const settingsBox = el("div", { class: "row wrap" }, accel,
    el("label", { class: "row" }, block, el("span", { text: "block the daily usage ping" }), blockedEl));

  // ---- device
  const device = el("div", { class: "kv" });
  function renderDevice() {
    const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
    const litertFile = fetchLog.records.map((r) => r.url).find((u) => u.includes("/litert/") && u.endsWith(".js"));
    const rows: [string, string][] = [
      ["browser", nav.userAgent.replace(/^Mozilla\/5\.0 /, "")],
      ["cores / memory", `${nav.hardwareConcurrency ?? "?"} threads · ${nav.deviceMemory ? nav.deviceMemory + " GB (coarse)" : "memory n/a"}`],
      ["WebGPU", nav.gpu ? "available" : "not available"],
      ["cross-origin isolated", String(crossOriginIsolated) + (crossOriginIsolated ? "" : " (no SharedArrayBuffer, so LiteRT runs single-threaded)")],
      ["LiteRT runtime", litertFile ? litertFile.split("/").pop()! : "not loaded yet"],
      ["service worker", navigator.serviceWorker?.controller ? "controlling this page" : "not controlling yet (reload once)"],
      ["installed", matchMedia("(display-mode: standalone)").matches ? "yes (home screen)" : "no (browser tab)"],
    ];
    device.replaceChildren(...rows.map(([k, v]) => el("div", {}, el("span", { class: "muted", text: k }), el("span", { text: v }))));
  }

  // ---- storage / offline
  const storage = el("div", { class: "kv" });
  const offlineList = el("div", { class: "offline" });
  async function renderStorage() {
    const est = await navigator.storage?.estimate?.().catch(() => null);
    const names = await caches.keys().catch(() => [] as string[]);
    let modelBytes = 0, coreBytes = 0;
    const cachedFiles = new Set<string>();
    for (const n of names) {
      const c = await caches.open(n);
      for (const req of await c.keys()) {
        // Workbox precache keys carry a ?__WB_REVISION__ query (Tongue lives there).
        cachedFiles.add(req.url.split("?")[0]);
        if (n !== MODELS_CACHE && n !== CORES_CACHE) continue;
        const res = await c.match(req);
        // Dev servers stream without content-length; reading the body is the fallback.
        const len = Number(res?.headers.get("content-length")) || (res ? (await res.blob()).size : 0);
        if (n === MODELS_CACHE) modelBytes += len; else coreBytes += len;
      }
    }
    const rows: [string, string][] = [
      ["origin usage", est ? `${fmtBytes(est.usage ?? 0)} of ${fmtBytes(est.quota ?? 0)} quota` : "n/a"],
      ["cached model + runtime files", fmtBytes(modelBytes)],
      ["cached wasm cores", fmtBytes(coreBytes)],
      ["caches", names.join(", ") || "none"],
    ];
    storage.replaceChildren(...rows.map(([k, v]) => el("div", {}, el("span", { class: "muted", text: k }), el("span", { text: v }))));

    offlineList.replaceChildren(...MODELS.map((m) => {
      const urls = m.files.map((f) => new URL(`${MODELS_URL}${m.id}/${f}`, location.href).href);
      const have = urls.filter((u) => cachedFiles.has(u)).length;
      const core = [...cachedFiles].some((u) => u.includes(`/${m.name}Web`));
      const complete = have === urls.length && (m.runtime === "pure-js" || core);
      const e = allEntries().find((x) => x.meta.id === m.id)!;
      const btn = el("button", { class: "ghost small", text: complete ? "cached" : e.status === "loading" ? "loading…" : "fetch for offline", disabled: complete || e.status === "loading" });
      btn.onclick = () => load(m.id).then(() => { if (!openCards.has(m.id)) dispose(m.id); }).catch(() => {});
      const evict = el("button", { class: "ghost small", text: "evict", hidden: have === 0 });
      evict.onclick = async () => { const c = await caches.open(MODELS_CACHE); for (const u of urls) await c.delete(u); dispose(m.id); renderStorage(); };
      return el("div", { class: "offline-row" },
        el("span", {}, el("strong", { text: m.name }), el("span", { class: "muted small", text: ` ${fmtBytes(m.bytes)} · ${have}/${urls.length} files${m.runtime === "litert" ? (core ? " · core" : " · no core") : ""}` })),
        el("span", { class: "row" }, btn, evict));
    }));
  }
  const openCards = new Set<ModelId>();
  document.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    const id = d.dataset?.model as ModelId | undefined;
    if (id) d.open ? openCards.add(id) : openCards.delete(id);
  }, true);

  const fetchAll = el("button", { text: "Fetch everything for offline (~330 MB)" });
  fetchAll.onclick = async () => {
    fetchAll.disabled = true;
    for (const m of MODELS) { try { await load(m.id); if (!openCards.has(m.id)) dispose(m.id); } catch { /* shown on card */ } await renderStorage(); }
    fetchAll.disabled = false;
  };
  const wipe = el("button", { class: "ghost", text: "Delete all caches" });
  wipe.onclick = async () => { for (const n of await caches.keys()) await caches.delete(n); disposeAll(); renderStorage(); };

  // ---- timings
  const timings = el("table", { class: "items" });
  function renderTimings() {
    const rows = allEntries().filter((e) => e.loadMs != null || e.timings.length);
    timings.replaceChildren(
      el("tr", {}, el("th", { text: "model" }), el("th", { text: "load" }), el("th", { text: "calls" }), el("th", { text: "last" }), el("th", { text: "median" }), el("th", { text: "min" })),
      ...rows.map((e) => {
        const ms = e.timings.map((t) => t.ms).sort((a, b) => a - b);
        return el("tr", {}, el("td", { text: e.meta.name }),
          el("td", { text: e.loadMs == null ? "" : `${fmtMs(e.loadMs)}${e.coldLoad ? " cold" : e.coldLoad === false ? " warm" : ""}` }),
          el("td", { text: String(ms.length) }),
          el("td", { text: e.timings.length ? fmtMs(e.timings.at(-1)!.ms) : "" }),
          el("td", { text: ms.length ? fmtMs(ms[Math.floor(ms.length / 2)]) : "" }),
          el("td", { text: ms.length ? fmtMs(ms[0]) : "" }));
      }));
  }

  // ---- fetch tree
  const tree = el("div", { class: "tree" });
  const total = el("span", { class: "muted small" });
  function renderTree() {
    const groups = new Map<string, FetchRecord[]>();
    for (const r of fetchLog.records) {
      const u = new URL(r.url);
      const key = u.origin !== location.origin ? u.host
        : u.pathname.startsWith(new URL(MODELS_URL, location.href).pathname) ? `models/${u.pathname.split("/models/")[1]?.split("/")[0] ?? ""}`
        : u.pathname.startsWith(new URL(LITERT_WASM_DIR, location.href).pathname) ? "litert runtime"
        : u.pathname.endsWith(".wasm") ? "wasm cores" : "app";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
    let sum = 0;
    tree.replaceChildren(...[...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, rs]) => {
      const bytes = rs.reduce((a, r) => a + r.bytes, 0); sum += bytes;
      return el("details", { class: "tree-group" },
        el("summary", {}, el("span", { text: k }), el("span", { class: "muted small", text: `${rs.length} files · ${fmtBytes(bytes)}` })),
        ...rs.map((r) => el("div", { class: "tree-file mono small" },
          el("span", { text: r.url.split("/").pop() || r.url }),
          el("span", { class: "muted", text: `${fmtBytes(r.bytes)} · ${fmtMs(r.ms)}${r.fromCache ? " · cache" : ""}${r.ok ? "" : " · FAILED"}` }))));
    }));
    total.textContent = `${fetchLog.records.length} files · ${fmtBytes(sum)} this session`;
  }

  root.append(
    el("h2", { text: "Inspector" }),
    el("h3", { text: "Settings" }), settingsBox,
    el("h3", { text: "Offline" }), storage, offlineList, el("div", { class: "row" }, fetchAll, wipe),
    el("h3", { text: "Timings" }), timings,
    el("h3", {}, el("span", { text: "Fetched this session " }), total), tree,
    el("h3", { text: "Device" }), device,
  );

  const renderBlocked = () => (blockedEl.textContent = ` · ${blockedPings()} blocked so far`);
  events.addEventListener("model", () => { renderTimings(); renderStorage(); });
  events.addEventListener("timing", renderTimings);
  events.addEventListener("fetch", () => { renderTree(); renderDevice(); });
  events.addEventListener("blocked", renderBlocked);
  navigator.serviceWorker?.ready.then(renderDevice);
  renderDevice(); renderStorage(); renderTimings(); renderTree(); renderBlocked();
  return root;
}
