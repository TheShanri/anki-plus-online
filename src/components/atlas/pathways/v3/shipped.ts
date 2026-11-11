/* Pathway tracer v3 ships pathway by pathway. A slug is listed here once its v3 version is finished: spec built, validator
 * green, and its per-beat contact sheets (1440x900 and 390x844) looked at and checked against the slides
 * (docs/PATHWAY_V3_STATUS.md keeps the same list). /atlas/pathways shows v3 for these and v2 for the rest;
 * ?v=3 or ?v=2 forces one version for testing. */
export const V3_SHIPPED: readonly string[] = [];

export const isShipped = (slug: string) => V3_SHIPPED.includes(slug);
