// Generates the PWA icons without any image library: a flat rounded square with
// an ant-like six-dot mark, encoded as PNG by hand (zlib from node).
import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";

const out = new URL("../public/icons/", import.meta.url).pathname;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Six dots in two rows (an ant's legs, loosely), on cobalt. Maskable-safe: the
// mark stays inside the central 80%.
const DOTS = [[0.32, 0.42], [0.5, 0.36], [0.68, 0.42], [0.32, 0.62], [0.5, 0.68], [0.68, 0.62]];
const pixel = (u, v) => {
  const bg = [0x2d, 0x52, 0xc8, 255];
  for (const [cx, cy] of DOTS) if (Math.hypot(u - cx, v - cy) < 0.075) return [255, 255, 255, 255];
  return bg;
};
for (const size of [192, 512]) await writeFile(path.join(out, `icon-${size}.png`), png(size, pixel));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#2d52c8"/>${DOTS.map(([x, y]) => `<circle cx="${x * 100}" cy="${y * 100}" r="7.5" fill="#fff"/>`).join("")}</svg>`;
await writeFile(path.join(out, "icon.svg"), svg);
console.log("icons -> public/icons");
