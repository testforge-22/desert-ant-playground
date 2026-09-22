# Desert Ant Playground

A small progressive web app that runs the seven [Desert Ant Labs](https://desertant.com) on-device
models that have a JavaScript SDK, entirely in the browser (WebAssembly + LiteRT.js), with an
inspector that shows what was downloaded, how long loading and inference take, and what the
device reports. Built to be tried on an Android phone from a GitHub Pages URL and to keep working
offline once the models have been fetched.

| Card | Model | What it shows |
| --- | --- | --- |
| Tongue | text language ID (84 languages, pure JS, 2 MB) | live detection while typing, reliability and script routing |
| Emo | emoji suggestions (11 MB) | top suggestions with confidence, skin tone option |
| Redact | PII detection (27 MB) | placeholders, entity table, restore round trip |
| Gist | topic tagging, 36 topics (85 MB) | ranked topics, full score distribution |
| Shapes | single-stroke shape recognition (1.3 MB) | draw on a canvas, snapped vector shape drawn back |
| Ear | spoken language ID, 99 languages (23 MB + 46 MB core) | record, top candidates, `isReliable` flag |
| Clear | speech enhancement (49 MB) | record, A/B playback, loudness stats, WAV download |

Voz (speech to text), Align, Title, Uhm and Clips are Apple-only and cannot run in a browser.

## Run locally

```sh
npm ci
npm run prepare-assets      # downloads ~200 MB of pinned model weights into public/models, copies the LiteRT runtime
npm run dev                 # http://localhost:5173
npm run build && npm run preview
```

`models.manifest.json` pins each model's Hugging Face repo and revision to what SDK 3.1.0 expects.
The weights are never committed; `public/models` and `public/litert` are generated.

### Testing on a phone over the LAN

`npm run dev:phone` binds to all interfaces. WSL2 is NAT'd, so either enable mirrored networking
(`networkingMode=mirrored` in `%UserProfile%\.wslconfig`) or add a Windows portproxy for port 5173.
The microphone needs a secure context: on the phone add `http://<windows-lan-ip>:5173` to
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, or just test on the deployed HTTPS URL.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to `main`.
2. In the repository settings, Pages, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` installs, fetches the weights (cached by manifest
   hash), builds with `BASE_PATH=/<repo>/` and deploys. The site is
   `https://<user>.github.io/<repo>/`.

## How it works

- Each model SDK is imported lazily. Its Swift-compiled WebAssembly core (5 to 46 MB) is emitted by
  Vite as a hashed asset; the `.tflite` graph is compiled by LiteRT.js (XNNPACK on CPU by default,
  WebGPU optional in the inspector).
- Model files are self-hosted under `/models/<id>/` and passed to the SDKs as `modelBaseUrl`, so
  nothing is fetched from Hugging Face at run time.
- The service worker (`src/sw.ts`, Workbox) precaches the app shell and Tongue, and caches model
  files, the LiteRT runtime and the wasm cores on first use. Loading a model once is what makes it
  available offline; the inspector's "fetch for offline" does exactly that.
- The SDKs post one anonymous usage event per device per day to the vendor's metering endpoint.
  The wasm cores cannot be told to skip it, so the page points their `__dalIngestEndpoint` at a
  same-origin path the service worker answers with `204`, and the vendor host is blocked as well.
  This is a switch in the inspector; the vendor's licence is free below 100k monthly devices and
  this metering is how they count, so leave it on if you ever ship something.
- `window.dal` exposes `load(id)`, `entry(id)` and `entries()` for driving the page from a console.

## Layout

```
index.html               app shell
src/main.ts              wiring, service worker registration, install prompt
src/runtime.ts           idempotent LiteRT loader, model registry, timings, fetch log, telemetry globals
src/cards/*.ts           one file per model
src/inspector.ts         settings, offline cache, timings, fetch tree, device info
src/audio.ts             microphone capture, playback, WAV export
src/sw.ts                service worker
scripts/fetch-models.mjs downloads pinned weights; scripts/copy-runtime.mjs copies LiteRT + Tongue files
models.manifest.json     the pinned file list
```

Models and SDKs are under the Desert Ant Labs Source-Available License 1.0.
