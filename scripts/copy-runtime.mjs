// Copies runtime files the SDKs fetch at run time (not through the bundler) into
// public/: the LiteRT.js wasm runtime directory and Tongue's bundled weights.
import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const nm = path.join(root, "node_modules");

const litertSrc = path.join(nm, "@litertjs/core/wasm");
const litertDst = path.join(root, "public/litert");
await mkdir(litertDst, { recursive: true });
for (const f of await readdir(litertSrc)) await cp(path.join(litertSrc, f), path.join(litertDst, f));
console.log(`litert runtime -> public/litert (${(await readdir(litertDst)).length} files)`);

const tongueDst = path.join(root, "public/models/tongue");
await mkdir(tongueDst, { recursive: true });
for (const f of ["tongue_int8.bin", "tongue_meta.json"]) {
  await cp(path.join(nm, "@desert-ant-labs/tongue/dist", f), path.join(tongueDst, f));
}
console.log("tongue weights -> public/models/tongue");
