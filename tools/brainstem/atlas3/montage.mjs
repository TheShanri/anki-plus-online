// node montage.mjs <out.jpg> <cellW> <cols> <file>...   (label = basename)
import { createRequire } from "node:module";
import { basename, dirname } from "node:path";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const sharp = require("sharp");
const [out, cw, cols, ...files] = process.argv.slice(2);
const W = +cw, C = +cols, H = Math.round(W * 0.75);
const tiles = [];
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const buf = await sharp(f).resize({ width: W, height: H - 18, fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer();
  const lab = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="18"><rect width="100%" height="100%" fill="#222"/><text x="4" y="13" font-size="12" font-family="Arial" fill="#fff">${basename(dirname(dirname(f)))}/${basename(f)}</text></svg>`);
  tiles.push({ input: buf, left: (i % C) * W, top: Math.floor(i / C) * H + 18 }, { input: lab, left: (i % C) * W, top: Math.floor(i / C) * H });
}
const rows = Math.ceil(files.length / C);
await sharp({ create: { width: W * C, height: H * rows, channels: 3, background: "#ddd" } }).composite(tiles).jpeg({ quality: 82 }).toFile(out);
