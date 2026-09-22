// Names shared by the page and the service worker. Bump MODELS_CACHE only when
// the model manifest revisions change; it holds ~200 MB the user chose to keep.
export const MODELS_CACHE = "dal-models-v1";
/** Hashed wasm cores. Content-hashed names stay stable across deploys unless an SDK is bumped, so
 *  this cache is long-lived and simply LRU-limited (7 models, a little slack for a bumped SDK). */
export const CORES_CACHE = "dal-cores-v1";
export const CORES_MAX_ENTRIES = 9;
export const INGEST_MARKER = "dal-ingest";
