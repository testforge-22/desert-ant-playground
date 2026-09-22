import { defineConfig } from "vite";
import process from "node:process";
import { VitePWA } from "vite-plugin-pwa";

// The model SDKs locate their Swift wasm core with `new URL("XWeb.wasm",
// import.meta.url)`. Vite's dep pre-bundler would move the module and break that
// relative lookup, so the packages are served as-is in dev. Rollup rewrites the
// pattern and emits the wasm as an asset in production builds.
const DESERT_ANT_PACKAGES = [
  "@desert-ant-labs/clear",
  "@desert-ant-labs/ear",
  "@desert-ant-labs/emo",
  "@desert-ant-labs/gist",
  "@desert-ant-labs/redact",
  "@desert-ant-labs/shapes",
  "@desert-ant-labs/tongue",
  "@desert-ant-labs/core",
];

// GitHub Pages serves a project site under /<repo>/; the workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  optimizeDeps: { exclude: DESERT_ANT_PACKAGES },
  build: { target: "es2022", sourcemap: false },
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      injectManifest: {
        // App shell only. Wasm cores (5 to 46 MB each) and model files are
        // cached on first use by the runtime routes in sw.ts, not at install.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}", "models/tongue/*"],
        globIgnores: ["**/*.wasm", "litert/**", "models/!(tongue)/**"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Desert Ant Playground",
        short_name: "Desert Ant",
        description: "Seven on-device AI models running in the browser, offline.",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#111317",
        theme_color: "#2d52c8",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
