// Small DOM helpers and the shared card chrome. No framework: seven cards and an
// inspector do not justify one, and every byte counts on a phone.
import { type Entry, type ModelId, entry, events, load, dispose, metaOf } from "./runtime";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean> = {}, ...children: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
export const fmtMs = (ms: number) => ms < 1 ? `${ms.toFixed(2)} ms` : ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`;
export const pct = (f: number) => `${Math.round(f * 100)}%`;

const languageNames = new Intl.DisplayNames([navigator.language, "en"], { type: "language" });
export function languageName(code: string): string {
  try { return languageNames.of(code) ?? code; } catch { return code; }
}

export function bar(fraction: number, label: string, value: string): HTMLElement {
  const f = Math.max(0, Math.min(1, fraction));
  return el("div", { class: "bar" },
    el("span", { class: "bar-label", text: label }),
    el("span", { class: "bar-track" }, el("i", { style: `width:${(f * 100).toFixed(1)}%` })),
    el("span", { class: "bar-value", text: value }));
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: number | undefined;
  return (...a: A) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
}

/** The shared frame every model card renders into. */
export interface Card {
  root: HTMLDetailsElement;
  body: HTMLElement;
  out: HTMLElement;
  setBusy(label: string | null): void;
  showError(err: unknown): void;
}

export function card(id: ModelId, build: (c: Card) => void): HTMLDetailsElement {
  const meta = metaOf(id);
  const pill = el("span", { class: "pill idle", text: "not loaded" });
  const progress = el("div", { class: "progress", hidden: true }, el("i"));
  const stats = el("div", { class: "stats" });
  const out = el("div", { class: "out" });
  const body = el("div", { class: "card-body" });
  const loadBtn = el("button", { class: "ghost", text: "Load model" });
  const disposeBtn = el("button", { class: "ghost", text: "Unload", hidden: true });
  const actions = el("div", { class: "card-actions" }, loadBtn, disposeBtn);

  const root = el("details", { class: "card", id: `card-${id}`, "data-model": id },
    el("summary", {},
      el("span", { class: "card-title" }, el("strong", { text: meta.name }), el("span", { class: "tagline", text: meta.tagline })),
      pill),
    el("div", { class: "card-content" }, progress, body, out, stats, actions));

  loadBtn.onclick = () => load(id).catch(() => {});
  disposeBtn.onclick = () => dispose(id);

  function render(e: Entry) {
    pill.className = `pill ${e.status}`;
    pill.textContent = e.status === "ready" ? "ready" : e.status === "loading" ? "loading" : e.status === "error" ? "error" : "not loaded";
    loadBtn.hidden = e.status !== "idle" && e.status !== "error";
    disposeBtn.hidden = e.status !== "ready";
    if (e.status !== "loading") progress.hidden = true;
    const last = e.timings.at(-1);
    const parts: string[] = [];
    if (e.loadMs != null) parts.push(`load ${fmtMs(e.loadMs)}${e.coldLoad == null ? "" : e.coldLoad ? " (cold, downloaded)" : " (warm, from cache)"}`);
    if (e.accelerator && e.meta.runtime === "litert") parts.push(`accelerator ${e.accelerator}`);
    if (last) parts.push(`${last.name} ${fmtMs(last.ms)}`);
    if (e.timings.length > 1) {
      const sorted = e.timings.map((t) => t.ms).sort((a, b) => a - b);
      parts.push(`median ${fmtMs(sorted[Math.floor(sorted.length / 2)])} over ${sorted.length}`);
    }
    stats.textContent = parts.join(" · ");
    if (e.status === "error" && e.error) out.replaceChildren(el("p", { class: "err", text: e.error }));
  }
  events.addEventListener("model", (ev) => { const e = (ev as CustomEvent<Entry>).detail; if (e.meta.id === id) render(e); });
  events.addEventListener("timing", (ev) => { if ((ev as CustomEvent<{ id: ModelId }>).detail.id === id) render(entry(id)); });
  events.addEventListener("progress", (ev) => {
    const d = (ev as CustomEvent<{ id: ModelId; fraction: number }>).detail;
    if (d.id !== id) return;
    progress.hidden = false;
    (progress.firstElementChild as HTMLElement).style.width = `${Math.round(d.fraction * 100)}%`;
  });
  render(entry(id));

  const c: Card = {
    root, body, out,
    setBusy(label) { out.replaceChildren(label ? el("p", { class: "busy", text: label }) : ""); },
    showError(err) { out.replaceChildren(el("p", { class: "err", text: String((err as Error)?.message ?? err) })); },
  };
  build(c);
  return root;
}
