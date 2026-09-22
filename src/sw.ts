/// <reference lib="webworker" />
// Service worker: precache the app shell; cache model files, the LiteRT runtime
// and the wasm cores on first use so a model that has been loaded once works
// offline; answer the SDKs' usage ping locally so it never leaves the device.
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";
import { MODELS_CACHE, CORES_CACHE, CORES_MAX_ENTRIES, INGEST_MARKER } from "./cache";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting = self.skipWaiting.bind(self);
clientsClaim();

const base = new URL(self.registration.scope).pathname;
const same = (url: URL) => url.origin === self.location.origin;

// Model files + LiteRT runtime: survive redeploys (revision-pinned by the manifest).
registerRoute(
  ({ url }) => same(url) && (url.pathname.startsWith(`${base}models/`) || url.pathname.startsWith(`${base}litert/`)),
  new CacheFirst({ cacheName: MODELS_CACHE }),
);
// Hashed wasm cores: a redeploy with the same SDK keeps the same hashes, so the
// cache survives; a bumped SDK adds new entries and the LRU limit drops the old.
registerRoute(
  ({ url }) => same(url) && url.pathname.endsWith(".wasm"),
  new CacheFirst({ cacheName: CORES_CACHE, plugins: [new ExpirationPlugin({ maxEntries: CORES_MAX_ENTRIES, purgeOnQuotaError: true })] }),
);

// Usage-ping sink: the page points __dalIngestEndpoint at <base>dal-ingest; the
// vendor endpoint is matched too in case a build ignores the override.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSink = (same(url) && url.pathname.endsWith(INGEST_MARKER)) || url.hostname.endsWith("desertant.ai");
  if (!isSink) return;
  event.respondWith((async () => {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: "dal:ingest-blocked", url: url.href });
    return new Response(null, { status: 204 });
  })());
});

// Drop caches from earlier layouts of this app (a per-build cores cache existed once).
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("dal-cores-") && name !== CORES_CACHE) await caches.delete(name);
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
