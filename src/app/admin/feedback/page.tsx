import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { FeedbackStatus } from "@/components/admin/FeedbackStatus";
import { requireAdmin } from "@/lib/auth/guard";
import { FEEDBACK_TYPES } from "@/lib/auth/mail";
import type { LogEntry } from "@/lib/bugs/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["new", "seen", "resolved"] as const;
const UUID = /^[0-9a-f-]{36}$/;

function Logs({ title, entries, base }: { title: string; entries: LogEntry[]; base: number }) {
  if (!entries.length) return null;
  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-sm text-text-dim">{title} ({entries.length})</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-card-sm bg-bg-2 p-3 text-xs">
        {entries.map((e) => `${((e.t - base) / 1000).toFixed(1).padStart(7)}s  ${e.k.padEnd(9)} ${e.m}${e.d !== undefined ? "  " + JSON.stringify(e.d) : ""}`).join("\n")}
      </pre>
    </details>
  );
}

export default async function FeedbackInbox({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; id?: string }> }) {
  const { status, type, id } = await searchParams;
  await requireAdmin("/admin/feedback");
  const db = createAdminClient()!;

  // Opening an item marks it seen.
  let open: Record<string, unknown> | null = null;
  let shotUrl: string | null = null;
  if (id && UUID.test(id)) {
    const { data } = await db.from("feedback").select("*, profiles(display_name, email)").eq("id", id).maybeSingle();
    if (data) {
      if (data.status === "new") {
        await db.from("feedback").update({ status: "seen" }).eq("id", id);
        data.status = "seen";
      }
      open = data;
      if (data.screenshot_path) {
        const s = await db.storage.from("bug-reports").createSignedUrl(data.screenshot_path, 600);
        shotUrl = s.data?.signedUrl ?? null;
      }
    }
  }

  let q = db
    .from("feedback")
    .select("id, created_at, type, status, route, message, card_slug, screenshot_path, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && (STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);
  if (type && type in FEEDBACK_TYPES) q = q.eq("type", type);
  const { data: list } = await q;

  const href = (o: { status?: string; type?: string; id?: string }) => {
    const p = new URLSearchParams();
    const s = "status" in o ? o.status : status;
    const t = "type" in o ? o.type : type;
    if (s) p.set("status", s);
    if (t) p.set("type", t);
    if (o.id) p.set("id", o.id);
    const qs = p.toString();
    return qs ? `/admin/feedback?${qs}` : "/admin/feedback";
  };

  const o = open as null | {
    id: string; created_at: string; type: keyof typeof FEEDBACK_TYPES; status: string; message: string | null; route: string | null;
    card_slug: string | null; admin_note: string | null; app_state: unknown; logs_before: LogEntry[]; logs_after: LogEntry[];
    profiles: { display_name: string; email: string } | { display_name: string; email: string }[] | null;
    admin_emailed: boolean; sender_emailed: boolean;
  };
  const op = o ? (Array.isArray(o.profiles) ? o.profiles[0] : o.profiles) : null;
  const before = o?.logs_before ?? [];
  const base = before.length ? before[before.length - 1].t : o ? new Date(o.created_at).getTime() : 0;

  return (
    <PageShell title="Feedback" kicker="Owner">
      <div className="mb-3 flex flex-wrap gap-2">
        {[undefined, ...STATUSES].map((s) => (
          <Link key={s ?? "all"} href={href({ status: s })} className={`btn ${status === s ? "btn-primary" : ""}`}>{s ?? "all statuses"}</Link>
        ))}
        <Link href="/admin" className="btn">Admin</Link>
        <Link href="/admin/bugs" className="btn">Old bug reports</Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[undefined, ...Object.keys(FEEDBACK_TYPES)].map((t) => (
          <Link key={t ?? "all"} href={href({ type: t })} className={`btn ${type === t ? "btn-primary" : ""}`} style={{ fontSize: "0.8rem" }}>
            {t ? FEEDBACK_TYPES[t as keyof typeof FEEDBACK_TYPES] : "all types"}
          </Link>
        ))}
      </div>

      {o && (
        <section className="panel mb-5 space-y-2 text-sm" aria-label="Selected feedback">
          <p className="text-text-faint">{FEEDBACK_TYPES[o.type]} · {new Date(o.created_at).toLocaleString()} · {o.status}</p>
          <p className="whitespace-pre-wrap text-base">{o.message || "(no message)"}</p>
          <p className="text-text-dim">
            {o.route}{o.card_slug ? ` · card ${o.card_slug}` : ""} · {op ? `${op.display_name} (${op.email})` : "anonymous"}
            {` · emailed: you ${o.admin_emailed ? "yes" : "no"}, sender ${o.sender_emailed ? "yes" : "no"}`}
          </p>
          <FeedbackStatus id={o.id} status={o.status} note={o.admin_note ?? ""} />
          {shotUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shotUrl} alt="Screenshot at the time" className="max-w-full rounded-card-sm border border-panel-border" />
          )}
          <details>
            <summary className="cursor-pointer text-text-dim">App state</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(o.app_state, null, 2)}</pre>
          </details>
          <Logs title="Logs before" entries={before} base={base} />
          <Logs title="Logs after" entries={o.logs_after ?? []} base={base} />
        </section>
      )}

      {!list?.length && <p className="panel text-text-dim">Nothing here.</p>}
      <ul className="space-y-2">
        {(list ?? []).map((f) => {
          const p = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
          return (
            <li key={f.id} className={`panel text-sm ${f.id === id ? "ring-1 ring-accent-2" : ""}`}>
              <Link href={href({ id: f.id })}>
                <b>{FEEDBACK_TYPES[f.type as keyof typeof FEEDBACK_TYPES]}</b>: {f.message || "(no message)"}
              </Link>
              <p className="text-text-faint">
                {new Date(f.created_at).toLocaleString()} · {f.route}{f.card_slug ? ` · ${f.card_slug}` : ""} · {p?.display_name ?? "anonymous"} · {f.status}{f.screenshot_path ? " · screenshot" : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
