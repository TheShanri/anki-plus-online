// node prev.mjs <outdir> <width> <name=file[@rot]> ...
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const sharp = require("sharp");
const [outdir, w, ...items] = process.argv.slice(2);
for (const it of items) {
  const [name, rest] = it.split("=");
  const [f, rot] = rest.split("@");
  await sharp(f).rotate(+(rot || 0), { background: "#fff" }).resize({ width: +w, withoutEnlargement: true }).flatten({ background: "#fff" }).jpeg({ quality: 85 }).toFile(`${outdir}/${name}.jpg`);
}
