// Node module hooks so build scripts can import the app's TypeScript beat model directly:
//   "@/x" -> src/x, extensionless relative imports -> .ts, JSON -> a default export, .tsx modules -> small stubs.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, join, resolve as presolve } from "node:path";

const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const STUBS = { "visualField.tsx": join(ROOT, "tools/pathways/v3/lib/stub-visualField.mjs") };

function tryFile(p) {
  for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
    const f = p + ext;
    if (existsSync(f) && !f.endsWith("/")) {
      const base = basename(f);
      if (STUBS[base]) return STUBS[base];
      if (/\.(ts|tsx|mjs|js|json)$/.test(f)) return f;
    }
  }
  return null;
}

export async function resolve(spec, ctx, next) {
  let p = null;
  if (spec.startsWith("@/")) p = tryFile(join(ROOT, "src", spec.slice(2)));
  else if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
    const parent = dirname(fileURLToPath(ctx.parentURL));
    if (!/node_modules/.test(parent)) p = tryFile(join(parent, spec));
  }
  if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (url.endsWith(".json")) {
    const src = readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${src};`, shortCircuit: true };
  }
  return next(url, ctx);
}
