// Downloads the web model files listed in models.manifest.json from the Hugging
// Face Hub at the pinned revision into public/models/<id>/. Idempotent: a file
// whose size matches the Hub's tree listing is skipped.
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(root, "models.manifest.json"), "utf8"));
const only = process.argv.slice(2); // optional model ids

async function treeSizes(repo, revision) {
  const res = await fetch(`https://huggingface.co/api/models/${repo}/tree/${revision}?recursive=true`);
  if (!res.ok) throw new Error(`tree ${repo}@${revision}: HTTP ${res.status}`);
  const sizes = new Map();
  for (const item of await res.json()) if (item.type === "file") sizes.set(item.path, item.size ?? item.lfs?.size ?? null);
  return sizes;
}

async function localSize(file) {
  try { return (await stat(file)).size; } catch { return -1; }
}

for (const model of manifest.models) {
  if (only.length && !only.includes(model.id)) continue;
  const dir = path.join(root, "public", "models", model.id);
  await mkdir(dir, { recursive: true });
  const sizes = await treeSizes(model.repo, model.revision);
  const index = {};
  for (const name of model.files) {
    const expected = sizes.get(name);
    if (expected == null) throw new Error(`${model.id}: ${name} not in ${model.repo}@${model.revision}`);
    const dest = path.join(dir, name);
    index[name] = expected;
    if ((await localSize(dest)) === expected) { console.log(`  ok   ${model.id}/${name} (${(expected / 1e6).toFixed(1)} MB)`); continue; }
    const url = `https://huggingface.co/${model.repo}/resolve/${model.revision}/${name}`;
    process.stdout.write(`  get  ${model.id}/${name} (${(expected / 1e6).toFixed(1)} MB) ... `);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    const got = await localSize(dest);
    if (got !== expected) throw new Error(`${dest}: size ${got}, expected ${expected}`);
    console.log("done");
  }
  // Served next to the files so the app knows what "offline" means without a build-time import.
  await writeFile(path.join(dir, "index.json"), JSON.stringify({ repo: model.repo, revision: model.revision, files: index }, null, 2));
}
console.log("models ready");
