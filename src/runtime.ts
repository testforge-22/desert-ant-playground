// Shared model runtime: one idempotent LiteRT.js loader, a registry of the seven
// models with lazy loading, timing, and the telemetry sink globals. Everything
// UI-facing subscribes to `events`.
import * as litert from "@litertjs/core";
import manifest from "../models.manifest.json";
import { MODELS_CACHE } from "./cache";

export const BASE = import.meta.env.BASE_URL;
export const MODELS_URL = `${BASE}models/`;
export const LITERT_WASM_DIR = `${BASE}litert/`;
export const INGEST_PATH = `${BASE}dal-ingest`;

export type ModelId = "tongue" | "emo" | "redact" | "gist" | "shapes" | "ear" | "clear";
export type Accelerator = "wasm" | "webgpu";

export interface ModelMeta {
  id: ModelId;
  name: string;
  tagline: string;
  /** Files under /models/<id>/ the SDK fetches (Hub revision pinned by the SDK). */
  files: string[];
  revision: string;
  /** Rough on-disk total in bytes, for the UI before anything is fetched. */
  bytes: number;
  runtime: "litert" | "pure-js";
}

const hub = new Map(manifest.models.map((m) => [m.id, m]));
const files = (id: string) => hub.get(id)?.files ?? [];
const rev = (id: string) => hub.get(id)?.revision ?? "bundled";

export const MODELS: ModelMeta[] = [
  { id: "tongue", name: "Tongue", tagline: "Which language is this text? 84 languages, pure JS.", files: ["tongue_int8.bin", "tongue_meta.json"], revision: rev("tongue"), bytes: 2.1e6, runtime: "pure-js" },
  { id: "emo", name: "Emo", tagline: "Emoji suggestions for a phrase, multilingual.", files: files("emo"), revision: rev("emo"), bytes: 11e6, runtime: "litert" },
  { id: "redact", name: "Redact", tagline: "Find and mask personal data, then restore it.", files: files("redact"), revision: rev("redact"), bytes: 27e6, runtime: "litert" },
  { id: "gist", name: "Gist", tagline: "Tag text with topics from a 36-topic taxonomy.", files: files("gist"), revision: rev("gist"), bytes: 85e6, runtime: "litert" },
  { id: "shapes", name: "Shapes", tagline: "Draw one stroke, get a clean vector shape.", files: files("shapes"), revision: rev("shapes"), bytes: 1.3e6, runtime: "litert" },
  { id: "ear", name: "Ear", tagline: "Which language is being spoken? 99 languages.", files: files("ear"), revision: rev("ear"), bytes: 23e6, runtime: "litert" },
  { id: "clear", name: "Clear", tagline: "Denoise, dereverb and level a voice recording.", files: files("clear"), revision: rev("clear"), bytes: 49e6, runtime: "litert" },
];

export const metaOf = (id: ModelId): ModelMeta => MODELS.find((m) => m.id === id)!;

// ---------------------------------------------------------------- settings

const SETTINGS_KEY = "dal.settings";
export interface Settings { accelerator: Accelerator; blockTelemetry: boolean }
const defaults: Settings = { accelerator: "wasm", blockTelemetry: true };

export function settings(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; } catch { return { ...defaults }; }
}
export function saveSettings(patch: Partial<Settings>) {
  const next = { ...settings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  applyTelemetryGlobals(next);
  events.dispatchEvent(new CustomEvent("settings", { detail: next }));
}

// ---------------------------------------------------------------- telemetry sink
//
// The wasm cores read these globals (Sources/Usage/AppIdentity.swift). Their
// usageDisabled() is hard-coded false in the browser, so the ping is pointed at a
// same-origin path the service worker answers with 204. Tongue is the pure-JS
// port and honours __dalUsageDisabled directly.
function stableDeviceId(): string {
  const k = "dal.deviceId";
  try {
    let id = localStorage.getItem(k);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(k, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}
export const deviceId = stableDeviceId();

function applyTelemetryGlobals(s: Settings) {
  const g = globalThis as Record<string, unknown>;
  g.__dalDeviceId = deviceId;
  g.__dalAppId = "desert-ant-playground";
  if (s.blockTelemetry) {
    g.__dalIngestEndpoint = new URL(INGEST_PATH, location.href).href;
    g.__dalUsageDisabled = "1";
  } else {
    delete g.__dalIngestEndpoint;
    delete g.__dalUsageDisabled;
  }
}
applyTelemetryGlobals(settings());

// ---------------------------------------------------------------- LiteRT once
//
// @litertjs/core allows exactly one loadLiteRt() per page; every SDK calls it
// during load(), so two models loading at once would race. Hand the SDKs a
// namespace whose loadLiteRt is idempotent.
const lrt = litert as unknown as Record<string, any>;
export const litertShared = {
  ...litert,
  loadLiteRt: (path: string, options?: unknown) => lrt.getGlobalLiteRtPromise?.() ?? lrt.loadLiteRt(path, options),
};

// ---------------------------------------------------------------- registry

export type Status = "idle" | "loading" | "ready" | "error";

export interface Timing { name: string; ms: number; at: number }

export interface Entry {
  meta: ModelMeta;
  status: Status;
  instance: unknown | null;
  loadMs: number | null;
  /** Did this load hit the network for model bytes? Set from the fetch log. */
  coldLoad: boolean | null;
  error: string | null;
  timings: Timing[];
  accelerator: Accelerator | null;
}

const entries = new Map<ModelId, Entry>(MODELS.map((m) => [m.id, {
  meta: m, status: "idle", instance: null, loadMs: null, coldLoad: null, error: null, timings: [], accelerator: null,
}]));
const pending = new Map<ModelId, Promise<unknown>>();

export const events = new EventTarget();
export const entry = (id: ModelId): Entry => entries.get(id)!;
export const allEntries = (): Entry[] => [...entries.values()];

function emit(id: ModelId) { events.dispatchEvent(new CustomEvent("model", { detail: entry(id) })); }

type Loader = (opts: { onProgress: (f: number) => void; accelerator: Accelerator }) => Promise<unknown>;

const loaders: Record<ModelId, Loader> = {
  tongue: async () => (await import("@desert-ant-labs/tongue")).Tongue.load({ from: `${MODELS_URL}tongue` }),
  emo: async (o) => (await import("@desert-ant-labs/emo")).Emo.load(sdkOptions("emo", o)),
  redact: async (o) => (await import("@desert-ant-labs/redact")).Redact.load(sdkOptions("redact", o)),
  gist: async (o) => (await import("@desert-ant-labs/gist")).Gist.load(sdkOptions("gist", o)),
  shapes: async (o) => (await import("@desert-ant-labs/shapes")).Shapes.load(sdkOptions("shapes", o)),
  ear: async (o) => (await import("@desert-ant-labs/ear")).Ear.load(sdkOptions("ear", o)),
  clear: async (o) => (await import("@desert-ant-labs/clear")).Clear.load(sdkOptions("clear", o)),
};

function sdkOptions(id: ModelId, o: { onProgress: (f: number) => void; accelerator: Accelerator }) {
  // ModelLoadOptions in the SDK typings does not list the browser-only keys.
  return {
    litert: litertShared,
    litertWasmDir: LITERT_WASM_DIR,
    modelBaseUrl: `${MODELS_URL}${id}/`,
    accelerator: o.accelerator,
    onProgress: o.onProgress,
  } as any;
}

/** Whether the model's main file is already in the service worker's cache, i.e. a load will be warm. */
export async function isCached(id: ModelId): Promise<boolean> {
  const meta = metaOf(id);
  if (!("caches" in globalThis)) return false;
  try {
    const url = new URL(`${MODELS_URL}${id}/${meta.files[0]}`, location.href).href;
    if (await caches.match(url, { cacheName: MODELS_CACHE })) return true;
    // Tongue is precached by Workbox, whose keys carry a ?__WB_REVISION__ query.
    return !!(await caches.match(url, { ignoreSearch: true }));
  } catch { return false; }
}

export function load<T = unknown>(id: ModelId, onProgress?: (f: number) => void): Promise<T> {
  const e = entry(id);
  if (e.instance) return Promise.resolve(e.instance as T);
  const inflight = pending.get(id);
  if (inflight) return inflight as Promise<T>;

  const accelerator = e.meta.runtime === "litert" ? settings().accelerator : "wasm";
  e.status = "loading"; e.error = null; emit(id);
  const t0 = performance.now();
  const p = isCached(id)
    .then((cached) => {
      e.coldLoad = !cached;
      return loaders[id]({ accelerator, onProgress: (f) => { onProgress?.(f); events.dispatchEvent(new CustomEvent("progress", { detail: { id, fraction: f } })); } });
    })
    .then((instance) => {
      e.instance = instance; e.status = "ready"; e.loadMs = Math.round(performance.now() - t0);
      e.accelerator = accelerator;
      emit(id);
      return instance;
    })
    .catch((err) => {
      e.status = "error"; e.error = String(err?.message ?? err); emit(id);
      throw err;
    })
    .finally(() => pending.delete(id));
  pending.set(id, p);
  return p as Promise<T>;
}

export function dispose(id: ModelId) {
  const e = entry(id);
  const inst = e.instance as { dispose?: () => void } | null;
  try { inst?.dispose?.(); } catch { /* already gone */ }
  e.instance = null; e.status = "idle"; e.loadMs = null; e.accelerator = null; emit(id);
}

export function disposeAll() { for (const m of MODELS) if (entry(m.id).instance) dispose(m.id); }

/** Time one inference call and record it on the model's entry. */
export async function timed<T>(id: ModelId, name: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  const ms = performance.now() - t0;
  const e = entry(id);
  e.timings.push({ name, ms, at: Date.now() });
  if (e.timings.length > 200) e.timings.shift();
  events.dispatchEvent(new CustomEvent("timing", { detail: { id, name, ms } }));
  return out;
}

// ---------------------------------------------------------------- fetch log
//
// Model bytes, wasm cores and the LiteRT runtime all arrive through fetch(); the
// SDK chunks arrive as module scripts (Resource Timing). Both feed the inspector.

export interface FetchRecord { url: string; bytes: number; ms: number; at: number; fromCache: boolean | null; ok: boolean }

class FetchLog {
  readonly records: FetchRecord[] = [];
  private seen = new Map<string, FetchRecord>();

  install() {
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const t0 = performance.now();
      const res = await orig(input, init);
      // Length from headers; a streamed body is not consumed here.
      const len = Number(res.headers.get("content-length")) || 0;
      this.record({ url: abs(url), bytes: len, ms: performance.now() - t0, at: Date.now(), fromCache: res.headers.has("x-dal-cache") ? true : null, ok: res.ok });
      return res;
    }) as typeof fetch;
    // Module scripts, importmap-free chunks, wasm streamed by instantiateStreaming.
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceResourceTiming[]) this.fromTiming(e);
      }).observe({ type: "resource", buffered: true });
    } catch { /* not supported */ }
  }

  private fromTiming(e: PerformanceResourceTiming) {
    const size = e.decodedBodySize || e.transferSize || 0;
    const prev = this.seen.get(e.name);
    if (prev) { if (size > prev.bytes) prev.bytes = size; if (prev.fromCache == null) prev.fromCache = e.transferSize === 0 && size > 0; return; }
    this.record({ url: e.name, bytes: size, ms: e.duration, at: Date.now(), fromCache: e.transferSize === 0 && size > 0, ok: true });
  }

  private record(r: FetchRecord) {
    const prev = this.seen.get(r.url);
    if (prev) { if (r.bytes > prev.bytes) prev.bytes = r.bytes; return; }
    this.seen.set(r.url, r); this.records.push(r);
    events.dispatchEvent(new CustomEvent("fetch", { detail: r }));
  }
}

function abs(url: string) { try { return new URL(url, location.href).href; } catch { return url; } }

export const fetchLog = new FetchLog();
fetchLog.install();

// ---------------------------------------------------------------- blocked pings

let blocked = Number(localStorage.getItem("dal.blockedPings") ?? 0) || 0;
export const blockedPings = () => blocked;
navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type === "dal:ingest-blocked") {
    blocked += 1;
    try { localStorage.setItem("dal.blockedPings", String(blocked)); } catch { /* ignore */ }
    events.dispatchEvent(new CustomEvent("blocked", { detail: blocked }));
  }
});
