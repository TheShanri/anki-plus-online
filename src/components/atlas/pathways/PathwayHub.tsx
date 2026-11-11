"use client";

import { useCallback, useState } from "react";
import type { CoursePathway, PathwayCard } from "@/lib/atlas/pathways";
import { PathwayTracer } from "./PathwayTracer";
import { Tracer3 } from "./v3/Tracer3";
import { isShipped } from "./v3/shipped";

/* The pathway tracer page: v3 for the pathways it has shipped, v2 for the rest, behind one picker and one URL scheme
 * (?p=&side=&step=&limb=). Picking a pathway of the other version swaps the tracer in place; ?v=2 / ?v=3 pins one. */

type Initial = { p?: string; side?: string; step?: string; limb?: string; v?: string };

export function PathwayHub({ courses, cards, courseSlug, initial }: { courses: CoursePathway[]; cards: PathwayCard[]; courseSlug: string; initial: Initial }) {
  const forced = initial.v === "3" ? 3 : initial.v === "2" ? 2 : null;
  const versionOf = useCallback((slug: string) => forced ?? (isShipped(slug) ? 3 : 2), [forced]);
  const [cur, setCur] = useState(() => {
    const p = initial.p ?? "dcml";
    return { version: versionOf(p), initial: { ...initial, p }, n: 0 };
  });
  // a tracer asks before it switches pathway: true = the other version takes over (remounted on that pathway)
  const onSwitch = useCallback(
    (slug: string, limb?: string) => {
      const v = versionOf(slug);
      if (v === cur.version) return false;
      const side = new URLSearchParams(window.location.search).get("side") ?? undefined;
      setCur((c) => ({ version: v, initial: { p: slug, side, step: "0", limb, v: initial.v }, n: c.n + 1 }));
      return true;
    },
    [versionOf, cur.version, initial.v],
  );
  return cur.version === 3 ? (
    <Tracer3 key={`v3-${cur.n}`} courses={courses} cards={cards} courseSlug={courseSlug} initial={cur.initial} onSwitch={onSwitch} />
  ) : (
    <PathwayTracer key={`v2-${cur.n}`} courses={courses} cards={cards} initial={cur.initial} onSwitch={onSwitch} />
  );
}
