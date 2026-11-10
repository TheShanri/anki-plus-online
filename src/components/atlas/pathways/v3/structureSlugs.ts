import LINKS from "@/data/atlas-links.json";

/* Course structure slug (for the Explore StructureInfo card) of a region or host key: atlas meshes through atlas-links.json
 * (structures that use exactly that mesh), nucleus proxies through their course name. */

const BY_MESH = new Map<string, string>();
for (const [slug, l] of Object.entries(LINKS as unknown as Record<string, { meshIds: string[]; approximate: boolean }>)) {
  if (!l.approximate && l.meshIds.length === 1 && !BY_MESH.has(l.meshIds[0])) BY_MESH.set(l.meshIds[0], slug);
}
const PROXY: Record<string, string> = {
  gracile: "gracile-nucleus",
  cuneate: "cuneate-nucleus",
  vpl: "thalamus",
  vpm: "thalamus",
  vavl: "thalamus",
  md: "thalamus",
  "principal-v": "principal-sensory-nucleus-of-trigeminal",
  "spinal-v": "spinal-trigeminal-nucleus",
  "motor-v": "motor-trigeminal-nucleus",
  solitary: "solitary-nucleus",
  dentate: "dentate-nucleus",
  scn: "suprachiasmatic-nucleus",
  pontine: "pontine-nuclei",
  "reticular-pons": "reticular-formation",
  "reticular-med": "reticular-formation",
};
const LINKED = new Set(Object.keys(LINKS as object));

export function slugForStop(key: string): string | null {
  const k = key.replace(/^[rh]:/, "");
  if (k.startsWith("p:")) {
    const id = k.slice(2).replace(/-[LR]$/, "");
    const s = PROXY[id];
    return s && LINKED.has(s) ? s : null;
  }
  if (k.startsWith("a:")) return BY_MESH.get(k.slice(2).split("@")[0]) ?? null;
  if (k.startsWith("c:")) {
    const mesh = k.slice(2).split("@")[0];
    if (mesh.startsWith("a:")) return BY_MESH.get(mesh.slice(2)) ?? null;
    if (/nerve_drg/.test(mesh)) return LINKED.has("dorsal-root-ganglion") ? "dorsal-root-ganglion" : null;
  }
  if (/^part:spine\/nerve_drg/.test(k)) return "dorsal-root-ganglion";
  return null;
}
