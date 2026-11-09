"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, EyeOff, Flag, Lock, Pencil, Plus, ThumbsUp, Trash2, User, Users, X } from "lucide-react";
import { Badge, Button, Segmented } from "@/components/ui";
import type { MnemonicsResponse, OwnMnemonic, SharedMnemonic } from "@/lib/study/types";

type Props = {
  /** a card (the reveal): shows mnemonics of the card and of its structure */
  cardId?: string;
  /** a structure (the atlas panel): shows mnemonics of the structure, from any of its cards */
  structureSlug?: string;
  /** called when my mnemonic for exactly this card is saved (text) or removed (null) */
  onOwnChange?: (body: string | null) => void;
  /** open the add form straight away (the "keeps slipping" nudge) */
  autoOpen?: boolean;
  /** shown above the form when it opens by itself */
  nudge?: string;
  /** called when the form is dismissed without saving ("Not now") */
  onDismiss?: () => void;
};

const NOTES_KEY = "mnemonics";

function badge(m: OwnMnemonic): React.ReactNode {
  if (m.hidden) return <Badge tone="danger" icon={EyeOff}>Hidden by a moderator</Badge>;
  if (m.visibility === "private") return <Badge icon={Lock}>Private</Badge>;
  return <Badge tone="accent" icon={Users}>{m.anonymous ? "Shared with the class, anonymous" : "Shared with the class, with your name"}</Badge>;
}

async function call(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: {} };
  }
}

/** Mnemonics for a card or a structure: write your own (private or shared, anonymous or named), read and upvote the class's. */
export function MnemonicPanel({ cardId, structureSlug, onOwnChange, autoOpen, nudge, onDismiss }: Props) {
  const [data, setData] = useState<MnemonicsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [nudged, setNudged] = useState(!!autoOpen);
  const [editing, setEditing] = useState<string | "new" | null>(autoOpen ? "new" : null);
  const [text, setText] = useState("");
  const [share, setShare] = useState(false);
  const [named, setNamed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  const fetchData = useCallback(async (): Promise<MnemonicsResponse | null> => {
    const q = cardId ? `card=${encodeURIComponent(cardId)}` : `structure=${encodeURIComponent(structureSlug ?? "")}`;
    try {
      const r = await fetch(`/api/mnemonics?${q}`);
      return r.ok ? ((await r.json()) as MnemonicsResponse) : null;
    } catch {
      return null;
    }
  }, [cardId, structureSlug]);
  const load = useCallback(async () => {
    const d = await fetchData();
    setData(d);
    setFailed(!d);
  }, [fetchData]);

  // callers key this component by card / structure, so state starts fresh for each
  useEffect(() => {
    let alive = true;
    void fetchData().then((d) => {
      if (!alive) return;
      setData(d);
      setFailed(!d);
    });
    return () => {
      alive = false;
    };
  }, [fetchData]);
  useEffect(() => {
    if (editing) area.current?.focus({ preventScroll: true });
  }, [editing]);

  const exact = data?.mine.find((m) => (cardId ? m.cardId === cardId : m.cardId === null));
  const blur = () => (document.activeElement as HTMLElement | null)?.blur?.();

  const openForm = (m?: OwnMnemonic) => {
    setErr("");
    setNudged(false);
    setText(m?.body ?? "");
    setShare(m ? m.visibility === "class" : false);
    setNamed(m ? !m.anonymous : false);
    setEditing(m ? m.id : "new");
  };
  const close = (dismissed: boolean) => {
    setEditing(null);
    setNudged(false);
    blur();
    if (dismissed) onDismiss?.();
  };
  const save = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr("");
    const payload = { body, visibility: share ? "class" : "private", anonymous: share ? !named : true };
    const r = await call("/api/mnemonics", "PUT", editing === "new" ? { ...(cardId ? { cardId } : { structureSlug }), ...payload } : { id: editing, ...payload });
    setBusy(false);
    if (!r.ok) return setErr(typeof r.data.error === "string" ? r.data.error : "Could not save, try again.");
    const savedExact = editing === "new" || editing === exact?.id;
    if (cardId && savedExact) onOwnChange?.(body);
    setEditing(null);
    blur();
    await load();
  };
  const remove = async (m: OwnMnemonic) => {
    if (!window.confirm("Delete this mnemonic?")) return;
    const r = await call("/api/mnemonics", "DELETE", { id: m.id });
    if (r.ok) {
      if (cardId && m.cardId === cardId) onOwnChange?.(null);
      await load();
    }
    blur();
  };
  const vote = async (m: SharedMnemonic) => {
    const on = !m.voted;
    setData((d) => d && { ...d, shared: d.shared.map((x) => (x.id === m.id ? { ...x, voted: on, votes: x.votes + (on ? 1 : -1) } : x)) });
    const r = await call("/api/mnemonics/vote", "POST", { id: m.id, on });
    if (!r.ok) await load();
    blur();
  };
  const report = async (m: SharedMnemonic) => {
    if (!window.confirm("Report this mnemonic as inappropriate or wrong? A moderator will look at it.")) return;
    const r = await call("/api/mnemonics/report", "POST", { id: m.id });
    if (r.ok) setData((d) => d && { ...d, shared: d.shared.map((x) => (x.id === m.id ? { ...x, reported: true } : x)) });
    blur();
  };

  if (failed) return null; // the study flow never depends on this panel
  if (!data) return <div className="info-panel mnemo" data-testid={NOTES_KEY}><h4>Mnemonics</h4><p className="v-notes">Loading…</p></div>;

  const mine = data.mine;
  const where = data.structure ? ` for ${data.structure.name}` : "";
  const form = editing && (
    <div className="note-form">
      {nudge && nudged && editing === "new" && <p>{nudge}</p>}
      <textarea
        ref={area}
        rows={2}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") close(true);
          else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
        }}
        placeholder="e.g. Hippo + campus: a hippo on a campus lawn"
        aria-label="Your mnemonic"
      />
      <div className="mnemo-opts">
        <Segmented
          label="Who can see it"
          value={share ? "class" : "private"}
          onChange={(v) => setShare(v === "class")}
          size="sm"
          options={[
            { value: "private", label: "Private", icon: Lock, title: "Only me" },
            { value: "class", label: "Class", icon: Users, title: "Share with my class" },
          ]}
        />
        {share && (
          <Segmented
            label="Name"
            value={named ? "named" : "anon"}
            onChange={(v) => setNamed(v === "named")}
            size="sm"
            options={[
              { value: "anon", label: "Anonymous", icon: EyeOff },
              { value: "named", label: "My name", icon: User, title: "Show my name" },
            ]}
          />
        )}
      </div>
      <p className="v-notes">{share ? (named ? "Your classmates will see your name next to it." : "Your classmates see it without your name.") : "Only you will see it."}</p>
      {err && <p className="v-notes" style={{ color: "var(--again)" }}>{err}</p>}
      <div className="btn-row">
        <Button variant="primary" size="sm" icon={Check} loading={busy} disabled={!text.trim()} onClick={() => void save()}>Save mnemonic</Button>
        <Button variant="ghost" size="sm" icon={X} onClick={() => close(true)}>{nudged ? "Not now" : "Cancel"}</Button>
      </div>
      <p className="v-notes"><span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> saves, <span className="kbd">Esc</span> cancels</p>
    </div>
  );

  return (
    // typing, Enter and Space in here must never reach the study keys (accept, grade, undo)
    <div className="info-panel mnemo" data-testid={NOTES_KEY} onKeyDown={(e) => e.stopPropagation()}>
      <h4>{mine.length ? "Your mnemonics" : "Mnemonics"}{where}</h4>
      {mine.map((m) =>
        editing === m.id ? (
          <div key={m.id}>{form}</div>
        ) : (
          <div key={m.id} className="mnemo-item">
            <p>{m.body}</p>
            <div className="mnemo-meta">
              {badge(m)}
              <span className="v-notes">
                {m.visibility === "class" && !m.hidden ? `${m.votes} vote${m.votes === 1 ? "" : "s"}` : ""}
                {m.cardId !== (cardId ?? null) && cardId ? `${m.visibility === "class" && !m.hidden ? " · " : ""}written on another card of this structure` : ""}
              </span>
              <span className="mnemo-acts">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openForm(m)}>Edit</Button>
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => void remove(m)}>Delete</Button>
              </span>
            </div>
          </div>
        ),
      )}
      {editing === "new" && form}
      {!exact && !editing && (
        <div className="btn-row">
          <Button variant="subtle" size="sm" icon={Plus} onClick={() => openForm()}>Add a mnemonic</Button>
        </div>
      )}
      {data.shared.length > 0 && (
        <div className="mnemo-class">
          <h4>From classmates ({data.shared.length})</h4>
          {data.shared.map((m) => (
            <div key={m.id} className="mnemo-item">
              <p>{m.body}</p>
              <div className="mnemo-meta">
                <span className="v-notes">{m.author ? m.author : "A classmate"}</span>
                <span className="mnemo-acts">
                  <Button variant={m.voted ? "subtle" : "ghost"} size="sm" icon={ThumbsUp} aria-pressed={m.voted} onClick={() => void vote(m)} title="Mark as helpful (one vote each)">
                    {m.voted ? "Helpful" : "Helpful?"} ({m.votes})
                  </Button>
                  {m.reported ? <Badge tone="warn" icon={Flag}>Reported</Badge> : <Button variant="ghost" size="sm" icon={Flag} onClick={() => void report(m)}>Report</Button>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
