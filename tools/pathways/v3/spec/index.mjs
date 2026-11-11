// Every v3 pathway spec, keyed by slug (the slugs of src/data/pathway-map.json). One file per group of pathways.
import { PATHWAYS as SENSORY } from "./sensory.mjs";
import { PATHWAYS as MOTOR } from "./motor.mjs";
export const ALL = { ...SENSORY, ...MOTOR };
