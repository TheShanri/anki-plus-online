"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Flame } from "lucide-react";
import { emit } from "@/lib/feedback/events";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements/catalog";
import { getSummary, onPostResult, refreshSummary, startProgressListener, subscribeSummary } from "@/lib/achievements/client";
import { RANKS } from "@/lib/achievements/engine";
import type { PostResult } from "@/lib/achievements/payload";
import type { Tier } from "@/lib/achievements/types";
import { AchIcon } from "./icons";
import "./achievements.css";

type ToastItem = { key: number; kind: "ach" | "rank"; id?: string; tier: Tier; title: string; sub: string; out?: boolean };

const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" };
const SHOW_MS = 5500;
const MAX_SHOWN = 3;

function playFor(tier: Tier, rank: boolean): void {
  // The sound engine maps these to the active theme's pack and respects the sound setting.
  if (rank || tier === "platinum") emit("level_up", { level: 1 });
  else if (tier === "gold") emit("combo", { combo: 10 });
  else if (tier === "silver") emit("streak", { days: 3 });
  else emit("save");
}

function ToastHost() {
  const [shown, setShown] = useState<ToastItem[]>([]);
  const [queued, setQueued] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  useEffect(
    () =>
      onPostResult((r: PostResult) => {
        const items: ToastItem[] = [];
        if (r.rankedUp) items.push({ key: ++seq.current, kind: "rank", tier: "platinum", title: `Rank up: ${r.summary.rank.name}`, sub: `${r.summary.xp} XP`, id: "rank" });
        for (const u of r.unlocked) {
          const a = ACHIEVEMENT_BY_ID.get(u.id);
          if (!a) continue;
          items.push({ key: ++seq.current, kind: "ach", id: u.id, tier: u.tier, title: a.name, sub: `${TIER_LABEL[u.tier]}${a.tiers.length > 1 ? " tier" : ""} unlocked` });
        }
        if (items.length) setQueued((q) => [...q, ...items]);
      }),
    [],
  );

  // move queued toasts onto the screen a few at a time, with a short stagger
  useEffect(() => {
    if (!queued.length || shown.length >= MAX_SHOWN) return;
    const t = setTimeout(() => {
      const next = queued[0];
      setQueued((q) => q.slice(1));
      setShown((s) => [...s, next]);
      playFor(next.tier, next.kind === "rank");
      setTimeout(() => setShown((s) => s.map((x) => (x.key === next.key ? { ...x, out: true } : x))), SHOW_MS);
      setTimeout(() => setShown((s) => s.filter((x) => x.key !== next.key)), SHOW_MS + 300);
    }, 450);
    return () => clearTimeout(t);
  }, [queued, shown.length]);

  const dismiss = useCallback((key: number) => setShown((s) => s.filter((x) => x.key !== key)), []);
  const router = useRouter();

  return (
    <div className="ach ach-toasts" role="status" aria-live="polite">
      {shown.map((t) => {
        const iconName = t.kind === "rank" ? "Trophy" : ACHIEVEMENT_BY_ID.get(t.id ?? "")?.icon ?? "Trophy";
        return (
          <div key={t.key} className="ach-toast" data-tier={t.tier} data-out={t.out ? "1" : undefined}>
            <span className="ach-burst" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ ["--a" as string]: `${i * 36}deg` }} />
              ))}
            </span>
            <span className="ach-medal"><AchIcon name={iconName} /></span>
            <button
              type="button"
              className="min-w-0 flex-1 bg-transparent text-left"
              onClick={() => {
                dismiss(t.key);
                router.push("/atlas/progress");
              }}
            >
              <span className="block truncate font-display text-sm text-text">{t.title}</span>
              <span className="block truncate font-mono text-[0.7rem] uppercase tracking-wider text-text-dim">{t.sub}</span>
            </button>
            <button type="button" aria-label="Dismiss" className="bg-transparent px-1 text-text-faint hover:text-text" onClick={() => dismiss(t.key)}>
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}

function XpChip() {
  const path = usePathname() ?? "";
  const summary = useSyncExternalStore(subscribeSummary, getSummary, () => null);
  const [bump, setBump] = useState(false);
  const last = useRef<number | null>(null);
  const onAtlas = path === "/atlas" || path.startsWith("/atlas/");

  useEffect(() => {
    if (onAtlas && !getSummary()) void refreshSummary();
  }, [onAtlas]);

  useEffect(() => {
    if (!summary) return;
    if (last.current !== null && summary.xp > last.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 600);
      last.current = summary.xp;
      return () => clearTimeout(t);
    }
    last.current = summary.xp;
  }, [summary]);

  if (!onAtlas || !summary || path.startsWith("/atlas/progress")) return null;
  const r = summary.rank;
  return (
    <Link href="/atlas/progress" className="ach xp-chip" data-bump={bump ? "1" : undefined} aria-label={`${r.name}, ${summary.xp} XP, ${summary.streak} day streak. Open the trophy room.`}>
      <span className="ach-medal !h-8 !w-8 font-display text-xs" data-tier="gold">{r.index + 1}</span>
      <span className="grid gap-0.5 leading-none">
        <span className="font-display text-xs">{r.name}</span>
        <span className="ach-bar !h-1 w-16" data-tier="gold"><i style={{ transform: `scaleX(${Math.max(0.03, r.pct)})` }} /></span>
      </span>
      <span className="font-mono text-[0.7rem] text-text-dim">{summary.xp}/{r.to ?? RANKS[RANKS.length - 1].xp} XP</span>
      {summary.streak > 0 && (
        <span className="xp-streak inline-flex items-center gap-0.5 font-mono text-xs text-hard">
          <Flame size={14} className="ach-flame" aria-hidden="true" />
          {summary.streak}
        </span>
      )}
    </Link>
  );
}

/** Mounted once in the root layout: batches atlas progress events to the server, shows unlock toasts and the XP chip. */
export function AtlasProgressMount() {
  useEffect(() => startProgressListener(), []);
  return (
    <>
      <ToastHost />
      <XpChip />
    </>
  );
}
