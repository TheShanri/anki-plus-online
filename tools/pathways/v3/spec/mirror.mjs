// Beats whose RIGHT side is built as the exact mirror (x -> -x) of the LEFT side, so bilateral tracts are symmetric.
// Key = build key (slug or slug:limb), value = beat indices. Applied by build.mjs after spec.build() (lib/mirror.mjs; also
// runnable on built JSON: node tools/pathways/v3/mirror.mjs). The validator then checks the mirrored fibres against their hosts.
// Side-specific host keys (nerves .l/.r, tubes and proxies -L/-R) are swapped to the other side's.
export const MIRROR = {
  cochlear: [9],
  acst: [1],
  "alst:hand": [10],
  "basal-ganglia": [3, 4, 7],
  cerebellar: [4, 6],
  corticobulbar: [1, 2, 7],
  corticopontocerebellar: [1, 4, 5],
  "dcml:hand": [7, 11],
  "dcml:foot": [7],
  "dsct:foot": [7],
  lcst: [1, 2],
  "limbic-amygdala": [1],
  "limbic-septal": [1],
  "trigeminal-pain": [11],
  "umn-lmn": [1],
  vestibular: [7],
  visual: [7],
  reward: [1],
};
