"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Flame, Lock, Trophy } from "lucide-react";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from "@/lib/achievements/catalog";
import { getSummary, refreshSummary, setSummary, subscribeSummary } from "@/lib/achievements/client";
import { RANKS } from "@/lib/achievements/engine";
import type { AchievementProgress, CollectionState, ProgressPayload } from "@/lib/achievements/payload";
import { CATEGORY_LABEL, TIERS, type Achievement, type Category, type Tier } from "@/lib/achievements/types";
import { AchIcon } from "./icons";
import "./achievements.css";

const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" };
const PATHWAY_LABEL: Record<string, string> = { dcml: "DCML", alst: "ALST", dsct: "DSCT", lcst: "LCST", acst: "ACST", "umn-lmn": "UMN / LMN" };
const prettyPathway = (s: string) => PATHWAY_LABEL[s] ?? s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const COLLECTION_LABEL = ["Unseen", "Seen in the atlas", "Named in the quiz", "Mastered"] as const;

function Bar({ pct, tier }: { pct: number; tier?: Tier }) {
  return (
    <span className="ach-bar block" data-tier={tier} role="presentation">
      <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, pct))})` }} />
    </span>
  );
}

function rel(at: number): string {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129_600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} days ago`;
}

function Card({ a, p }: { a: Achievement; p: AchievementProgress }) {
  const done = p.tiers.filter((t) => t.unlockedAt !== null);
  const top = done[done.length - 1];
  const next = p.tiers.find((t) => t.unlockedAt === null);
  const locked = !top;
  const hidden = a.secret && locked;
  const iconName = hidden ? "HelpCircle" : a.icon;
  const tier = (top ?? next ?? p.tiers[0]).tier;
  const pct = next ? p.value / next.at : 1;
  return (
    <li className="panel ach-card grid content-start gap-2 !p-3" data-tier={top?.tier} data-locked={locked ? "1" : undefined}>
      <div className="flex items-start gap-3">
        <span className="ach-medal" data-tier={top ? top.tier : undefined} data-locked={locked ? "1" : undefined}>
          <AchIcon name={iconName} size={locked && !hidden ? 18 : 20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm leading-tight">{hidden ? "???" : a.name}</h3>
          <p className="mt-0.5 text-xs leading-snug text-text-dim">{hidden ? "A secret. Keep exploring, it is something a neuroanatomist would notice." : a.desc}</p>
        </div>
      </div>
      <div className="grid gap-1" data-tier={tier}>
        <div className="flex items-center justify-between gap-2 font-mono text-[0.68rem] uppercase tracking-wider text-text-dim">
          <span className="ach-pips" aria-label={`${done.length} of ${p.tiers.length} tiers`} data-tier={tier}>
            {p.tiers.map((t) => (
              <i key={t.tier} data-on={t.unlockedAt !== null ? "1" : undefined} data-tier={t.tier} title={`${TIER_LABEL[t.tier]}: ${t.at}${a.unit ? " " + a.unit : ""}`} />
            ))}
          </span>
          {hidden ? (
            <Lock size={12} aria-label="Locked" />
          ) : next ? (
            <span>
              {Math.min(p.value, next.at)} / {next.at}
              {a.unit ? ` ${a.unit}` : ""}
            </span>
          ) : (
            <span>{top ? `${TIER_LABEL[top.tier]}, ${new Date(top.unlockedAt as number).toLocaleDateString()}` : ""}</span>
          )}
        </div>
        {!hidden && <Bar pct={pct} tier={tier} />}
      </div>
    </li>
  );
}

export function TrophyRoom({ initial }: { initial: ProgressPayload }) {
  const live = useSyncExternalStore(subscribeSummary, getSummary, () => null);
  const [cat, setCat] = useState<Category | "all">("all");
  const [show, setShow] = useState<"all" | "unlocked" | "locked">("all");

  useEffect(() => {
    // the server rendered with UTC "today"; ask again with the browser's time zone
    setSummary(initial.summary);
    void refreshSummary();
  }, [initial.summary]);

  const summary = live ?? initial.summary;
  const rank = summary.rank;
  const byId = useMemo(() => new Map(initial.achievements.map((p) => [p.id, p])), [initial.achievements]);
  const tiersDone = initial.achievements.reduce((n, p) => n + p.tiers.filter((t) => t.unlockedAt !== null).length, 0);
  const tiersAll = initial.achievements.reduce((n, p) => n + p.tiers.length, 0);
  const unlockedCount = initial.achievements.filter((p) => p.tiers.some((t) => t.unlockedAt !== null)).length;
  const perTier = TIERS.map((t) => ({ t, n: initial.achievements.reduce((s, p) => s + p.tiers.filter((x) => x.tier === t && x.unlockedAt !== null).length, 0) }));

  const cats = (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => {
    const list = ACHIEVEMENTS.filter((a) => a.category === c);
    const got = list.filter((a) => byId.get(a.id)?.tiers.some((t) => t.unlockedAt !== null)).length;
    return { c, total: list.length, got };
  });
  const shown = ACHIEVEMENTS.filter((a) => {
    if (cat !== "all" && a.category !== cat) return false;
    const un = !!byId.get(a.id)?.tiers.some((t) => t.unlockedAt !== null);
    return show === "all" ? true : show === "unlocked" ? un : !un;
  });
  const goalPct = Math.min(1, summary.todayXp / summary.goalXp);

  return (
    <div className="ach grid gap-6">
      {/* rank, streak, goal */}
      <section className="panel grid gap-4 !p-4 sm:grid-cols-[1.4fr_1fr_1fr]" aria-label="Rank">
        <div className="grid gap-2" data-tier="gold">
          <p className="eyebrow">Rank {rank.index + 1} of {RANKS.length}</p>
          <div className="flex items-center gap-3">
            <span className="ach-medal !h-14 !w-14 font-display text-xl" data-tier="gold">{rank.index + 1}</span>
            <div>
              <p className="font-display text-2xl leading-none">{rank.name}</p>
              <p className="mt-1 font-mono text-xs text-text-dim">{summary.xp} XP{rank.to !== null ? `, ${rank.to - summary.xp} to ${rank.next}` : ", top rank"}</p>
            </div>
          </div>
          <Bar pct={rank.pct} tier="gold" />
          <ol className="flex flex-wrap gap-1 text-[0.65rem] uppercase tracking-wider text-text-faint" aria-label="All ranks">
            {RANKS.map((r, i) => (
              <li key={r.name} className={i <= rank.index ? "text-accent" : undefined}>{r.name}{i < RANKS.length - 1 ? " /" : ""}</li>
            ))}
          </ol>
        </div>
        <div className="grid content-start gap-1">
          <p className="eyebrow">Atlas streak</p>
          <p className="flex items-center gap-2 font-display text-3xl">
            <Flame size={28} className={summary.streak > 0 ? "ach-flame text-hard" : "text-text-faint"} aria-hidden="true" />
            {summary.streak}
            <span className="text-sm text-text-dim">{summary.streak === 1 ? "day" : "days"}</span>
          </p>
          <p className="text-xs text-text-dim">Best: {summary.bestStreak} {summary.bestStreak === 1 ? "day" : "days"}. Any atlas activity keeps it alive.</p>
        </div>
        <div className="grid content-start gap-1" data-tier="platinum">
          <p className="eyebrow">Daily goal</p>
          <p className="font-display text-3xl">{Math.min(summary.todayXp, summary.goalXp)}<span className="text-sm text-text-dim"> / {summary.goalXp} XP</span></p>
          <Bar pct={goalPct} tier="platinum" />
          <p className="text-xs text-text-dim">{summary.todayXp >= summary.goalXp ? "Goal reached today. Bonus XP earned." : "Reach it for a bonus. Quiz, trace, match and explore."}</p>
        </div>
      </section>

      {/* totals and recent */}
      <section className="grid gap-4 md:grid-cols-2" aria-label="Summary">
        <div className="panel grid gap-2 !p-4">
          <p className="eyebrow">Trophies</p>
          <p className="font-display text-2xl">{unlockedCount} <span className="text-sm text-text-dim">of {ACHIEVEMENTS.length} achievements, {tiersDone} of {tiersAll} tiers</span></p>
          <div className="flex flex-wrap gap-3">
            {perTier.map(({ t, n }) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-sm" data-tier={t}>
                <span className="ach-medal !h-6 !w-6" data-tier={t}><Trophy size={12} aria-hidden="true" /></span>
                {n} {TIER_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
        <div className="panel grid content-start gap-2 !p-4">
          <p className="eyebrow">Recent unlocks</p>
          {initial.recent.length === 0 ? (
            <p className="text-sm text-text-dim">Nothing yet. View a structure, answer a quiz question or trace a pathway to earn your first.</p>
          ) : (
            <ul className="grid gap-1.5">
              {initial.recent.slice(0, 5).map((r) => {
                const a = ACHIEVEMENT_BY_ID.get(r.id);
                if (!a) return null;
                return (
                  <li key={r.id + r.tier} className="flex items-center gap-2 text-sm" data-tier={r.tier}>
                    <span className="ach-medal !h-7 !w-7" data-tier={r.tier}><AchIcon name={a.icon} size={14} /></span>
                    <span className="min-w-0 flex-1 truncate">{a.name} <span className="text-text-dim">({TIER_LABEL[r.tier]})</span></span>
                    <span className="font-mono text-[0.68rem] text-text-faint">{rel(r.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* per mode */}
      <section aria-label="Progress by mode" className="grid gap-3">
        <h2 className="font-display text-lg">Progress by mode</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {initial.modes.map((m) => (
            <li key={m.id} className="panel grid content-start gap-1.5 !p-3">
              <Link href={m.href} className="flex items-baseline justify-between gap-2 no-underline">
                <span className="font-display text-sm">{m.label}</span>
                <span className="font-mono text-xs text-text-dim">{m.done}/{m.of}</span>
              </Link>
              <Bar pct={m.of ? m.done / m.of : 0} tier={m.done >= m.of ? "gold" : "silver"} />
              <p className="text-[0.7rem] leading-snug text-text-dim">{m.facts.join(" / ")}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* achievements grid */}
      <section aria-label="Achievements" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg">Achievements</h2>
          <div className="flex gap-1" role="group" aria-label="Filter by status">
            {(["all", "unlocked", "locked"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)} className={`rounded-sm border px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider ${show === s ? "border-accent text-accent" : "border-panel-border text-text-dim hover:text-text"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
          <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")} className={`flex-none rounded-sm border px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider ${cat === "all" ? "border-accent text-accent" : "border-panel-border text-text-dim hover:text-text"}`}>
            All {unlockedCount}/{ACHIEVEMENTS.length}
          </button>
          {cats.map((c) => (
            <button key={c.c} type="button" aria-pressed={cat === c.c} onClick={() => setCat(c.c)} className={`flex-none rounded-sm border px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider ${cat === c.c ? "border-accent text-accent" : "border-panel-border text-text-dim hover:text-text"}`}>
              {CATEGORY_LABEL[c.c]} {c.got}/{c.total}
            </button>
          ))}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => {
            const p = byId.get(a.id);
            return p ? <Card key={a.id} a={a} p={p} /> : null;
          })}
        </ul>
        {shown.length === 0 && <p className="text-sm text-text-dim">Nothing here with this filter.</p>}
      </section>

      {/* pathway stamps */}
      <section aria-label="Pathway stamps" className="panel grid gap-2 !p-4">
        <h2 className="font-display text-lg">Pathway stamp book <span className="text-sm text-text-dim">{initial.pathways.length} of 28 traced</span></h2>
        <ul className="flex flex-wrap gap-1.5">
          {PATHWAY_ORDER.map((p) => {
            const on = initial.pathways.includes(p);
            return (
              <li key={p} className={`rounded-sm border px-2 py-0.5 font-mono text-[0.7rem] ${on ? "border-good text-good" : "border-panel-border text-text-faint"}`}>
                {on ? prettyPathway(p) : "???"}
              </li>
            );
          })}
        </ul>
      </section>

      {/* collection */}
      {initial.collection && (
        <section aria-label="Structure collection" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg">Field guide</h2>
            <ul className="flex flex-wrap gap-3 text-xs text-text-dim">
              {COLLECTION_LABEL.map((l, i) => (
                <li key={l} className="inline-flex items-center gap-1.5">
                  <span className="col-tile" data-s={i} />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          {initial.collection.map((u) => {
            const count = (s: CollectionState) => u.items.filter((i) => i.state >= s).length;
            const seen = count(1);
            return (
              <details key={u.slug} className="panel !p-3" open={initial.collection!.length === 1}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-sm">{u.title}</span>
                  <span className="font-mono text-xs text-text-dim">{seen}/{u.items.length} seen, {count(2)} named, {count(3)} mastered</span>
                </summary>
                <div className="mt-2 grid gap-1">
                  <div className="flex h-2 overflow-hidden rounded-full bg-bg-3" role="img" aria-label={`${seen} of ${u.items.length} seen`}>
                    <span className="h-full bg-good" style={{ width: `${(100 * count(3)) / u.items.length}%` }} />
                    <span className="h-full bg-highlight" style={{ width: `${(100 * (count(2) - count(3))) / u.items.length}%` }} />
                    <span className="h-full bg-accent-2" style={{ width: `${(100 * (seen - count(2))) / u.items.length}%` }} />
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1">
                  {u.items.map((i) => (
                    <li key={i.slug} className="col-tile" data-s={i.state} title={i.state ? `${i.name}: ${COLLECTION_LABEL[i.state]}` : "???"} />
                  ))}
                </ul>
                <p className="mt-2 text-xs text-text-dim">Hover a square to see the structure. Unseen ones stay silhouettes until you find them in the atlas.</p>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}

const PATHWAY_ORDER = [
  "dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain", "lcst", "acst", "corticobulbar", "corticopontocerebellar", "cerebellar",
  "visual", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal", "umn-lmn", "sympathetic", "parasympathetic", "jaw-jerk", "pupillary",
  "corneal", "gaze", "basal-ganglia", "olfactory", "limbic-fornix", "limbic-amygdala", "limbic-septal", "reward",
];
