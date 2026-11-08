export type Tier = "bronze" | "silver" | "gold" | "platinum";
export const TIERS: Tier[] = ["bronze", "silver", "gold", "platinum"];
export const TIER_XP: Record<Tier, number> = { bronze: 20, silver: 40, gold: 80, platinum: 160 };

export type Category =
  | "explorer" | "curious" | "cartographer" | "quiz" | "pathfinder" | "lesion" | "slice" | "supply" | "brainstem" | "habits" | "secret";

export const CATEGORY_LABEL: Record<Category, string> = {
  explorer: "Explorer",
  curious: "Curious mind",
  cartographer: "Cartographer",
  quiz: "Quiz",
  pathfinder: "Pathfinder",
  lesion: "Lesion detective",
  slice: "Slice sniper",
  supply: "Blood supply",
  brainstem: "Brainstem diver",
  habits: "Habits",
  secret: "Secrets",
};

export interface Stat {
  count: number;
  best: number;
  firstAt: number;
  lastAt: number;
}

/** The curriculum the "all of it" achievements and the collection are measured against. */
export interface Curriculum {
  /** Every structure the atlas can show (slug). */
  slugs: string[];
  units: { slug: string; title: string; slugs: string[] }[];
}

export interface Snapshot {
  cur: Curriculum;
  n(key: string): number;
  best(key: string): number;
  /** Sum of counts over keys starting with `prefix`. */
  sum(prefix: string): number;
  /** How many keys starting with `prefix` have a count of at least `min`. */
  distinct(prefix: string, min?: number): number;
  /** The largest count among keys starting with `prefix`. */
  maxOf(prefix: string): number;
  seen(slug: string): boolean;
  /** How many of these slugs have been seen. */
  seenOf(list: readonly string[]): number;
  /** How many slugs were seen through `via`. */
  seenVia(via: string): number;
  flag(id: string): boolean;
  /** Longest run of consecutive active days, ever. */
  bestStreak: number;
}

export type Threshold = number | ((c: Curriculum) => number);

export interface Achievement {
  id: string;
  category: Category;
  name: string;
  desc: string;
  /** A lucide-react icon name. */
  icon: string;
  tiers: { tier: Tier; at: Threshold }[];
  /** Current value for the progress bar and the tier check. */
  metric: (s: Snapshot) => number;
  /** What the number counts, e.g. "structures". */
  unit?: string;
  secret?: boolean;
  /** XP override for the single-tier ones. */
  xp?: number;
}

export interface Unlock {
  id: string;
  tier: Tier;
  at: number;
}
