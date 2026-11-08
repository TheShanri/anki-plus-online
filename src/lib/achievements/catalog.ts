// The achievement catalogue. Names are witty; descriptions are plain. Every metric reads the Snapshot the engine builds
// from the student's stored counters, so adding an achievement never needs a migration.
import type { Achievement, Category, Curriculum, Snapshot, Threshold, Tier } from "./types.ts";
import {
  ASCENDING, AUTONOMIC, BIG_THREE, BRAINSTEM_LEVEL_COUNT, BRAINSTEM_PARTS, BRAINSTEM_PERFECT_RUN, BRAINSTEM_STYLE_COUNT, CASES, CORTICAL_AREAS,
  CRANIAL_NERVES, DEEP_NUCLEI, DESCENDING, FIBER_TYPES, LIMBIC, LOBES, MAIN_VENTRICLES, PAPEZ, PATHWAYS, POSTERIOR_CIRCULATION, REFLEXES,
  TERRITORY_ARTERIES, TOTAL_CASES, VENTRICLE_SLUGS,
} from "./groups.ts";

const LIST: Achievement[] = [];
const TIER_ORDER: Tier[] = ["bronze", "silver", "gold", "platinum"];

/** A ladder: up to four thresholds, bronze to platinum (three = bronze/silver/gold). */
function ladder(id: string, category: Category, name: string, desc: string, icon: string, rungs: Threshold[], metric: (s: Snapshot) => number, unit?: string): void {
  LIST.push({ id, category, name, desc, icon, unit, metric, tiers: rungs.map((at, i) => ({ tier: TIER_ORDER[i], at })) });
}
/** A one-off at a given tier colour. */
function once(id: string, category: Category, name: string, desc: string, icon: string, tier: Tier, at: Threshold, metric: (s: Snapshot) => number, opts: { secret?: boolean; xp?: number; unit?: string } = {}): void {
  LIST.push({ id, category, name, desc, icon, metric, unit: opts.unit, secret: opts.secret, xp: opts.xp, tiers: [{ tier, at }] });
}
const flag = (k: string) => (s: Snapshot) => (s.flag(k) ? 1 : 0);
const has = (slug: string) => (s: Snapshot) => (s.seen(slug) ? 1 : 0);
const solved = (id: string) => (s: Snapshot) => (s.n("lesion:" + id) > 0 ? 1 : 0);
const solvedOf = (ids: string[]) => (s: Snapshot) => ids.filter((c) => s.n("lesion:" + c) > 0).length;
const allOf = (list: readonly string[]) => (s: Snapshot) => s.seenOf(list);
const total = (c: Curriculum) => c.slugs.length;
const pathsDone = (list: readonly string[]) => (s: Snapshot) => list.filter((p) => s.n("pathway:" + p) > 0).length;
const arteriesOf = (list: readonly string[]) => (s: Snapshot) => list.filter((a) => s.n("supply:artery:" + a) > 0).length;
const GAGE = ["orbitofrontal-cortex", "ventromedial-prefrontal-cortex"];

// ------------------------------------------------------------------------------------------------ Explorer
ladder("ex-tourist", "explorer", "Neuroanatomical Tourist", "Look at different structures in the atlas.", "Compass", [10, 50, 100, total], (s) => s.seenOf(s.cur.slugs), "structures");
ladder("ex-3d", "explorer", "Spin Doctor", "View structures in the 3D brain.", "Rotate3d", [25, 100, 250], (s) => s.seenVia("3d"), "structures");
ladder("ex-mri", "explorer", "Voxel Voyeur", "View structures on the MRI slices.", "ScanLine", [25, 100, 250], (s) => s.seenVia("mri"), "structures");
ladder("ex-lobes", "explorer", "Lobe Hopper", "Visit every lobe: frontal, parietal, temporal, occipital and insular.", "Brain", [2, 3, 4, 5], (s) => Object.values(LOBES).filter((l) => s.seenOf(l.slugs) > 0).length, "lobes");
once("ex-ventricles", "explorer", "Ventricle Valet", "Find the lateral, third and fourth ventricles and the cerebral aqueduct.", "Droplets", "silver", MAIN_VENTRICLES.length, allOf(MAIN_VENTRICLES), { unit: "of 4" });
once("ex-csf", "explorer", "The Whole CSF Circuit", "Find every ventricle, foramen and the choroid plexus.", "Waves", "gold", VENTRICLE_SLUGS.length, allOf(VENTRICLE_SLUGS), { unit: "structures" });
ladder("ex-cn", "explorer", "Cranial Nerve Roll Call", "Find the twelve cranial nerves.", "Cable", [3, 6, 9, 12], allOf(CRANIAL_NERVES), "nerves");
ladder("ex-deep", "explorer", "Deep Dive", "Find the deep nuclei: basal ganglia, thalamus, amygdala and friends.", "Anchor", [3, 6, 8, DEEP_NUCLEI.length], allOf(DEEP_NUCLEI), "nuclei");
ladder("ex-cortex", "explorer", "Cortex Cartographer", "Find the named functional areas of the cortex.", "Map", [4, 8, 12, CORTICAL_AREAS.length], allOf(CORTICAL_AREAS), "areas");
once("ex-stem", "explorer", "Stem Cell", "Find the midbrain, pons and medulla.", "Layers", "silver", 3, allOf(BRAINSTEM_PARTS), { unit: "of 3" });
once("ex-fibers", "explorer", "Three Kinds of Wire", "Find association, commissural and projection fibres.", "Network", "silver", 3, allOf(FIBER_TYPES), { unit: "of 3" });
const UNIT_INFO: Record<string, [string, string, string]> = {
  u1: ["Field Guide: the Cord and Nerves", "Find the structures of Unit 1 (overview, nerves, spinal cord). Counts percent of the unit.", "Footprints"],
  u2: ["Field Guide: the Brainstem", "Find the structures of Unit 2 (the brainstem). Counts percent of the unit.", "Radar"],
  u3: ["Field Guide: the Cerebrum", "Find the structures of Unit 3 (the cerebrum). Counts percent of the unit.", "Telescope"],
};
for (const slug of Object.keys(UNIT_INFO)) {
  ladder("unit-" + slug, "explorer", UNIT_INFO[slug][0], UNIT_INFO[slug][1], UNIT_INFO[slug][2], [25, 50, 75, 100], (s) => {
    const u = s.cur.units.find((x) => x.slug === slug);
    return u && u.slugs.length ? Math.floor((100 * s.seenOf(u.slugs)) / u.slugs.length) : 0;
  }, "%");
}

// ------------------------------------------------------------------------------------------------ Curious mind
ladder("cu-regions", "curious", "Oh, I'm Just Curious", "Unlock regions that are not on the syllabus.", "Search", [1, 5, 15, 40], (s) => s.distinct("curious:"), "regions");
once("cu-day", "curious", "Rabbit Hole", "Unlock five off-syllabus regions in one day.", "Rabbit", "silver", 5, (s) => s.best("curious_day_best"), { unit: "in a day" });
once("cu-rebel", "curious", "Syllabus Rebel", "Unlock 25 off-syllabus regions.", "Rocket", "gold", 25, (s) => s.distinct("curious:"), { unit: "regions" });
once("cu-extra", "curious", "Extra Credit", "Unlock 10 off-syllabus regions after finding 50 syllabus structures.", "Lightbulb", "silver", 10, (s) => (s.seenOf(s.cur.slugs) >= 50 ? s.distinct("curious:") : 0), { unit: "regions" });

// ------------------------------------------------------------------------------------------------ Cartographer
ladder("ca-views", "cartographer", "Point of View", "Try the different viewing modes.", "Eye", [2, 4, 6], (s) => s.distinct("viewmode:"), "views");
ladder("ca-cuts", "cartographer", "Cut Above", "Use the cutting plane.", "Scissors", [1, 25, 100, 300], (s) => s.n("cuts"), "cuts");
once("ca-planes", "cartographer", "Axial, Coronal, Sagittal", "Cut in all three planes.", "Box", "silver", 3, (s) => s.distinct("cut:"), { unit: "of 3" });
ladder("ca-multi", "cartographer", "Multi-Tasker", "Open the multi-view.", "LayoutGrid", [1, 10, 50], (s) => s.n("multiview"), "times");
once("ca-multiplanar", "cartographer", "Multiplanar Mind", "Cut in all three planes and view 10 structures on MRI.", "Move3d", "gold", 1, (s) => (s.distinct("cut:") >= 3 && s.seenVia("mri") >= 10 ? 1 : 0));
once("ca-every", "cartographer", "Every Which Way", "Use 3D, MRI, a cut and the multi-view.", "Shapes", "silver", 4, (s) => (s.seenVia("3d") > 0 ? 1 : 0) + (s.seenVia("mri") > 0 ? 1 : 0) + (s.n("cuts") > 0 ? 1 : 0) + (s.n("multiview") > 0 ? 1 : 0), { unit: "of 4" });
once("ca-info", "cartographer", "Read the Fine Print", "Open the info panel on 20 structures.", "BookOpen", "bronze", 20, (s) => s.seenVia("info"), { unit: "structures" });

// ------------------------------------------------------------------------------------------------ Quiz
ladder("qz-answers", "quiz", "Pop Quiz Regular", "Answer questions in Name that structure.", "Keyboard", [10, 50, 200, 1000], (s) => s.n("quiz:answers"), "answers");
ladder("qz-correct", "quiz", "Right Place, Right Name", "Name structures correctly.", "Check", [10, 50, 200, 750], (s) => s.n("quiz:correct"), "correct");
ladder("qz-streak", "quiz", "On a Roll", "Get a streak of correct answers in a row.", "Flame", [5, 10, 25, 50], (s) => s.best("quiz:streak"), "in a row");
ladder("qz-rounds", "quiz", "Full Rounds", "Finish quiz rounds.", "Repeat", [1, 5, 20, 50], (s) => s.n("quiz:rounds"), "rounds");
ladder("qz-perfect", "quiz", "Flawless", "Finish rounds of five or more with every answer right.", "Gem", [1, 3, 10, 25], (s) => s.n("quiz:perfect"), "perfect rounds");
once("qz-perfect10", "quiz", "Ten out of Ten", "A perfect round of ten or more questions.", "Medal", "gold", 1, (s) => s.n("quiz:perfect10"));
once("qz-perfect20", "quiz", "Twenty and Plenty", "A perfect round of twenty questions.", "Crown", "platinum", 1, (s) => s.n("quiz:perfect20"));
once("qz-unit-u1", "quiz", "Perfect Cord", "A perfect round drawn only from Unit 1 (the cord and nerves).", "Target", "silver", 1, (s) => s.n("quiz:perfect_unit:u1"));
once("qz-unit-u2", "quiz", "Perfect Brainstem", "A perfect round drawn only from Unit 2 (the brainstem).", "Target", "silver", 1, (s) => s.n("quiz:perfect_unit:u2"));
once("qz-unit-u3", "quiz", "Perfect Cerebrum", "A perfect round drawn only from Unit 3 (the cerebrum).", "Target", "silver", 1, (s) => s.n("quiz:perfect_unit:u3"));
ladder("qz-typed", "quiz", "Typist of the Cortex", "Type structure names correctly (not multiple choice).", "Keyboard", [10, 50, 200, 500], (s) => s.n("quiz:typed"), "typed");
ladder("qz-choice", "quiz", "Multiple Choice Master", "Pick structure names correctly in multiple-choice mode.", "ListChecks", [10, 50, 200], (s) => s.n("quiz:choice"), "picked");
ladder("qz-named", "quiz", "Name Dropper", "Name different structures correctly in the quiz.", "Tags", [10, 50, 100, total], (s) => s.seenVia("quiz"), "structures");

// ------------------------------------------------------------------------------------------------ Pathfinder
ladder("pf-traced", "pathfinder", "Pathfinder", "Trace pathways in the pathway tracer.", "Route", [1, 7, 14, PATHWAYS.length], (s) => s.distinct("pathway:"), "pathways");
once("pf-ascending", "pathfinder", "Going Up", "Trace every ascending sensory pathway (DCML, spinothalamic, spinocerebellar, trigeminal).", "ArrowUpFromLine", "gold", ASCENDING.length, pathsDone(ASCENDING), { unit: "of 5" });
once("pf-descending", "pathfinder", "Coming Down", "Trace every descending motor pathway.", "ArrowDownToLine", "gold", DESCENDING.length, pathsDone(DESCENDING), { unit: "of 7" });
once("pf-visual", "pathfinder", "Seeing Is Believing", "Trace the visual pathway.", "Eye", "silver", 1, pathsDone(["visual"]));
once("pf-limbic", "pathfinder", "Feelings, Nothing More Than", "Trace the four limbic and reward circuits.", "Heart", "gold", LIMBIC.length, pathsDone(LIMBIC), { unit: "of 4" });
once("pf-reflex", "pathfinder", "Knee-Jerk Reaction", "Trace the jaw-jerk, pupillary, corneal and gaze reflex arcs.", "Zap", "silver", REFLEXES.length, pathsDone(REFLEXES), { unit: "of 4" });
once("pf-auto", "pathfinder", "Autonomic Pilot", "Trace the sympathetic, parasympathetic and pupillary pathways.", "Gauge", "silver", AUTONOMIC.length, pathsDone(AUTONOMIC), { unit: "of 3" });
once("pf-cerebellum", "pathfinder", "Little Brain, Big Loop", "Trace the corticopontocerebellar and cerebellar pathways.", "Orbit", "silver", 2, pathsDone(["corticopontocerebellar", "cerebellar"]), { unit: "of 2" });
once("pf-smell", "pathfinder", "Follow Your Nose", "Trace the olfactory pathway.", "Flower2", "bronze", 1, pathsDone(["olfactory"]));
ladder("pf-quiz", "pathfinder", "Pathway Pop Quiz", "Get a perfect score on the quiz at the end of a pathway.", "Award", [1, 5, 15, PATHWAYS.length], (s) => s.distinct("pathwayquiz:"), "pathways");
once("pf-all", "pathfinder", "Every Road Leads to the Brain", "Trace all 28 pathways, ascending, descending and the rest.", "Trophy", "platinum", PATHWAYS.length, (s) => s.distinct("pathway:"), { unit: "pathways", xp: 250 });

// ------------------------------------------------------------------------------------------------ Lesion detective
ladder("ls-solved", "lesion", "Lesion Detective", "Solve lesion cases correctly.", "Stethoscope", [1, 5, 12, TOTAL_CASES], (s) => s.distinct("lesion:"), "cases");
once("ls-brown", "lesion", "Brown-Séquard Mystery", "Solve the Brown-Séquard hemisection case.", "Scissors", "silver", 1, solved(CASES.brownSequard));
once("ls-wallenberg", "lesion", "Wallenberg's Window", "Solve the lateral medullary (Wallenberg) syndrome.", "Wind", "silver", 1, solved(CASES.wallenberg));
once("ls-weber", "lesion", "Weber's Crossing", "Solve the midbrain (Weber) syndrome.", "GitFork", "silver", 1, solved(CASES.weber));
once("ls-dejerine", "lesion", "Dejerine Does It", "Solve the medial medullary syndrome.", "Syringe", "silver", 1, solved(CASES.dejerine));
once("ls-locked", "lesion", "Locked In, Eyes Open", "Solve the locked-in syndrome (ventral pons).", "Lock", "silver", 1, solved(CASES.lockedIn));
once("ls-anterior", "lesion", "Anterior Spinal Alarm", "Solve the anterior spinal artery syndrome.", "ShieldAlert", "silver", 1, solved(CASES.anteriorSpinal));
once("ls-chiasm", "lesion", "Tunnel Vision", "Solve the optic chiasm lesion (bitemporal hemianopia).", "Glasses", "silver", 1, solved(CASES.chiasm));
once("ls-bg", "lesion", "Basal Ganglia Triple", "Solve the hemiballismus, Parkinson and Huntington cases.", "Dices", "gold", 3, solvedOf([CASES.ballismus, CASES.parkinson, CASES.huntington]), { unit: "of 3" });
once("ls-limbic", "lesion", "Memory and Mood", "Solve the hippocampus and amygdala cases.", "HeartCrack", "silver", 2, solvedOf([CASES.hippocampus, CASES.amygdala]), { unit: "of 2" });
once("ls-stem", "lesion", "Brainstem Syndromes", "Solve the Wallenberg, Weber, Dejerine and locked-in cases.", "Skull", "gold", 4, solvedOf([CASES.wallenberg, CASES.weber, CASES.dejerine, CASES.lockedIn]), { unit: "of 4" });
once("ls-attempts", "lesion", "Second Opinion", "Try 30 lesion cases (right or wrong).", "Users", "bronze", 30, (s) => s.n("lesionattempts"), { unit: "attempts" });

// ------------------------------------------------------------------------------------------------ Slice sniper
ladder("sl-5", "slice", "Close Enough", "Match a section within 5 mm.", "Crosshair", [1, 5, 15, 40], (s) => s.n("slice:le5"), "matches");
ladder("sl-3", "slice", "Steady Hands", "Match a section within 3 mm.", "Focus", [1, 5, 15, 40], (s) => s.n("slice:le3"), "matches");
ladder("sl-1", "slice", "Sniper Scope", "Match a section within 1 mm.", "Scan", [1, 3, 10, 25], (s) => s.n("slice:le1"), "matches");
once("sl-exact", "slice", "Dead Centre", "Match a section exactly (0 mm off).", "Target", "platinum", 1, (s) => s.n("slice:exact"));
ladder("sl-rounds", "slice", "Slice of Life", "Play slice-match rounds.", "Layers", [5, 25, 100], (s) => s.n("slice:rounds"), "rounds");

// ------------------------------------------------------------------------------------------------ Blood supply
ladder("bs-territories", "supply", "Territorial", "Place the supply of different arteries correctly.", "HeartPulse", [3, 6, 9, TERRITORY_ARTERIES.length], (s) => s.distinct("supply:artery:"), "territories");
ladder("bs-correct", "supply", "Flow State", "Answer blood-supply questions correctly.", "Activity", [10, 50, 200], (s) => s.n("supply:correct"), "correct");
once("bs-big3", "supply", "The Big Three", "Place the ACA, MCA and PCA territories.", "Share2", "silver", 3, arteriesOf(BIG_THREE), { unit: "of 3" });
once("bs-posterior", "supply", "Posterior Circulation Station", "Place the vertebral, PICA, AICA, SCA, pontine and PCA territories.", "ArrowDownUp", "gold", POSTERIOR_CIRCULATION.length, arteriesOf(POSTERIOR_CIRCULATION), { unit: "of 6" });
once("bs-answers", "supply", "Stroke of Genius", "Answer 100 blood-supply questions.", "Zap", "silver", 100, (s) => s.n("supply:answers"), { unit: "answers" });

// ------------------------------------------------------------------------------------------------ Memory map
ladder("mm-opened", "habits", "Know Thyself", "Open your memory map.", "Fingerprint", [1, 5, 20], (s) => s.n("memory"), "times");

// ------------------------------------------------------------------------------------------------ Brainstem diver
ladder("bd-levels", "brainstem", "Level Headed", "View the levels of the brainstem section atlas.", "Layers", [3, 6, BRAINSTEM_LEVEL_COUNT], (s) => s.distinct("bslevel:"), "levels");
ladder("bd-styles", "brainstem", "Style Points", "View one level in each of its styles.", "Palette", [2, BRAINSTEM_STYLE_COUNT], (s) => s.maxOf("bsstyles:"), "styles");
once("bd-all-styles", "brainstem", "Every Level, Every Style", "View every style at every level.", "Sparkles", "platinum", BRAINSTEM_LEVEL_COUNT, (s) => s.distinct("bsstyles:", BRAINSTEM_STYLE_COUNT), { unit: "levels" });
ladder("bd-labels", "brainstem", "Label Maker", "Label brainstem structures correctly.", "Tag", [25, 100, 400], (s) => s.n("bslabel:ok"), "labels");
ladder("bd-perfect", "brainstem", "Perfect Level", `Label ${BRAINSTEM_PERFECT_RUN} structures in a row correctly at a level.`, "BadgeCheck", [1, 3, BRAINSTEM_LEVEL_COUNT], (s) => s.distinct("bsperfect:"), "levels");
once("bd-black-belt", "brainstem", "Brainstem Black Belt", "A perfect label quiz at every level.", "Swords", "platinum", BRAINSTEM_LEVEL_COUNT, (s) => s.distinct("bsperfect:"), { unit: "levels", xp: 250 });

// ------------------------------------------------------------------------------------------------ Habits
ladder("hb-streak", "habits", "Daily Dose", "Use the atlas on consecutive days.", "Flame", [3, 7, 14, 30], (s) => s.bestStreak, "days");
ladder("hb-goal", "habits", "Goal Getter", "Hit the daily atlas goal.", "CalendarCheck", [1, 7, 21, 60], (s) => s.distinct("goal:"), "days");
ladder("hb-days", "habits", "Regular", "Use the atlas on different days.", "Calendar", [5, 15, 30, 60], (s) => s.distinct("day:"), "days");
once("hb-night", "habits", "Night Owl", "Study in the atlas after midnight (00:00 to 04:00), ten times.", "Moon", "silver", 10, (s) => s.n("hour:night"), { unit: "actions" });
once("hb-early", "habits", "Early Bird", "Study in the atlas before 7 am (04:00 to 07:00), ten times.", "Sunrise", "silver", 10, (s) => s.n("hour:early"), { unit: "actions" });
once("hb-comeback", "habits", "Comeback Kid", "Return to the atlas after a week away.", "Undo2", "bronze", 1, (s) => s.n("comeback"));
ladder("hb-xp", "habits", "XP Hoarder", "Earn atlas XP.", "Coins", [100, 500, 2000, 5000], (s) => s.n("xp"), "XP");
once("hb-marathon", "habits", "Marathon Session", "Do 100 things in the atlas in one day.", "Timer", "gold", 100, (s) => s.best("day_events_best"), { unit: "in a day" });

// ------------------------------------------------------------------------------------------------ Secrets
function secret(id: string, name: string, desc: string, icon: string, metric: (s: Snapshot) => number, at = 1): void {
  once(id, "secret", name, desc, icon, "gold", at, metric, { secret: true, xp: 100 });
}
secret("sc-gage", "Phineas Gage", "Visit the orbitofrontal or ventromedial prefrontal cortex, the region a tamping iron famously damaged in 1848.", "Hammer", (s) => (s.seenOf(GAGE) > 0 ? 1 : 0));
secret("sc-hm", "H.M.", "Visit the hippocampus after the medial temporal lobe. Henry Molaison lost both in 1953 and could not form new memories.", "History", flag("hm"));
secret("sc-tan", "Tan", "Visit Broca's area, where Leborgne's lesion left him able to say only one word.", "MessageSquareOff", has("broca-s-area"));
secret("sc-arcuate", "The Arcuate Commute", "Go from Broca's area to Wernicke's area, as the arcuate fasciculus does.", "ArrowRightLeft", flag("arcuate"));
secret("sc-papez", "Papez Circuit", "Visit the hippocampus, fornix, mammillary bodies, anterior thalamic nucleus and cingulate gyrus.", "RefreshCw", (s) => s.seenOf(PAPEZ), PAPEZ.length);
secret("sc-eye", "The Third Eye", "Visit the pineal gland, which Descartes called the seat of the soul.", "Eye", has("pineal-gland"));
secret("sc-clock", "Master Clock", "Visit the suprachiasmatic nucleus, the body's circadian pacemaker.", "Clock", has("suprachiasmatic-nucleus"));
secret("sc-little", "Little Brain", "Visit the cerebellum. Its Latin name means little brain.", "Brain", has("cerebellum"));
secret("sc-homunculus", "Penfield's Little Men", "Visit both the motor and somatosensory homunculi.", "PersonStanding", (s) => s.seenOf(["motor-homunculus", "somatosensory-homunculus"]), 2);
secret("sc-nib", "The Pen Nib", "Visit the obex, the point of the calamus scriptorius.", "PenTool", has("obex"));
secret("sc-lentil", "Lentil Soup", "Visit the putamen and the globus pallidus, which together form the lentiform nucleus.", "Soup", (s) => s.seenOf(["putamen", "globus-pallidus"]), 2);
secret("sc-famous", "Famous Patients Club", "Unlock Phineas Gage, H.M. and Tan.", "Users", (s) => (s.flag("hm") ? 1 : 0) + (s.seenOf(GAGE) > 0 ? 1 : 0) + (s.seen("broca-s-area") ? 1 : 0), 3);

export const ACHIEVEMENTS: readonly Achievement[] = LIST;
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(LIST.map((a) => [a.id, a]));

export function resolveThreshold(t: Threshold, cur: Curriculum): number {
  return typeof t === "function" ? Math.max(1, t(cur)) : t;
}
/** The thresholds of an achievement against the real curriculum. */
export function tiersOf(a: Achievement, cur: Curriculum): { tier: Tier; at: number }[] {
  return a.tiers.map((t) => ({ tier: t.tier, at: resolveThreshold(t.at, cur) }));
}
