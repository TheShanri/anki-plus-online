// Prints bounding boxes of hosts (for writing specs):  node tools/pathways/v3/lib/inspect.mjs a:pons part:head-targets/organ_cornea b:skin n:"Optic nerve (II).l#0"
import { hostOf } from "./fibre.mjs";
import { curveByKey } from "./nerves.mjs";
const f = (v) => v.map((x) => x.toFixed(4)).join(",");
for (const k of process.argv.slice(2)) {
  try {
    if (k.startsWith("n:")) {
      const c = curveByKey(k.slice(2));
      console.log(k, "len", c.length.toFixed(4), "a", f(c.a), "b", f(c.b), "r", Math.min(...c.r).toFixed(5), Math.max(...c.r).toFixed(5));
      continue;
    }
    const h = await hostOf(k);
    for (const m of h.meshes ?? []) console.log(k, m.name, "lo", f(m.lo), "hi", f(m.hi), "tris", m.n);
  } catch (e) {
    console.log(k, "ERR", e.message);
  }
}
