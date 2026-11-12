"use client";

import type { CoursePathway, PathwayCard } from "@/lib/atlas/pathways";
import { Tracer3 } from "./v3/Tracer3";

/* The pathway tracer page: tracer v3 for every pathway, one picker and one URL scheme (?p=&side=&step=&limb=). The v2 tracer
 * is retired (the lesion lab keeps its own PathwayViewer). */

type Initial = { p?: string; side?: string; step?: string; limb?: string; v?: string };

export function PathwayHub({ courses, cards, courseSlug, initial }: { courses: CoursePathway[]; cards: PathwayCard[]; courseSlug: string; initial: Initial }) {
  return <Tracer3 courses={courses} cards={cards} courseSlug={courseSlug} initial={{ ...initial, p: initial.p ?? "dcml" }} />;
}
