// Mnemonics: reads and writes through the signed-in user's Supabase client (RLS). Shared ones come from the
// class_mnemonics() security-definer function, which hides anonymous authors' names.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MnemonicsResponse, OwnMnemonic, SharedMnemonic } from "./types.ts";

type OwnRow = { id: string; card_id: string | null; structure_id: string | null; body: string; visibility: string; anonymous: boolean; hidden: boolean };
const OWN_COLS = "id, card_id, structure_id, body, visibility, anonymous, hidden";

async function ownStats(sb: SupabaseClient, ids: string[]): Promise<{ votes: Map<string, number>; reports: Map<string, number> }> {
  const votes = new Map<string, number>();
  const reports = new Map<string, number>();
  if (!ids.length) return { votes, reports };
  const { data } = await sb.rpc("my_mnemonic_stats", { p_ids: ids });
  for (const r of (data ?? []) as Array<{ id: string; votes: number; reports: number }>) {
    votes.set(r.id, r.votes);
    reports.set(r.id, r.reports);
  }
  return { votes, reports };
}

function toOwn(r: OwnRow, votes: Map<string, number>, reports: Map<string, number>): OwnMnemonic {
  return {
    id: r.id,
    cardId: r.card_id,
    structureId: r.structure_id,
    body: r.body,
    visibility: r.visibility === "class" ? "class" : "private",
    anonymous: r.anonymous,
    hidden: r.hidden,
    votes: votes.get(r.id) ?? 0,
    reports: reports.get(r.id) ?? 0,
  };
}

/** What a reveal (card) or the atlas panel (structure) shows: my mnemonics on it and the class's shared ones. */
export async function loadMnemonics(sb: SupabaseClient, userId: string, o: { courseId: string; cardId?: string; structureId?: string | null; structure?: { id: string; slug: string; name: string } | null }): Promise<MnemonicsResponse> {
  const structureId = o.structureId ?? o.structure?.id ?? null;
  let q = sb.from("mnemonics").select(OWN_COLS).eq("user_id", userId).eq("course_id", o.courseId);
  if (o.cardId && structureId) q = q.or(`card_id.eq.${o.cardId},structure_id.eq.${structureId}`);
  else if (o.cardId) q = q.eq("card_id", o.cardId);
  else if (structureId) q = q.eq("structure_id", structureId);
  else return { structure: o.structure ?? null, mine: [], shared: [] };
  const [ownR, sharedR] = await Promise.all([
    q.order("created_at"),
    sb.rpc("class_mnemonics", { p_course: o.courseId, p_cards: o.cardId ? [o.cardId] : [], p_structures: structureId ? [structureId] : [] }),
  ]);
  if (ownR.error) throw new Error(ownR.error.message);
  const rows = (ownR.data ?? []) as unknown as OwnRow[];
  const { votes, reports } = await ownStats(sb, rows.map((r) => r.id));
  const shared = ((sharedR.data ?? []) as Array<{ id: string; card_id: string | null; structure_id: string | null; body: string; author: string | null; votes: number; voted: boolean; reported: boolean }>).map(
    (r): SharedMnemonic => ({ id: r.id, cardId: r.card_id, structureId: r.structure_id, body: r.body, author: r.author, votes: r.votes, voted: r.voted, reported: r.reported }),
  );
  return { structure: o.structure ?? null, mine: rows.map((r) => toOwn(r, votes, reports)), shared };
}

export interface MnemonicInput {
  id?: string;
  cardId?: string;
  structureSlug?: string;
  body: string;
  visibility?: "private" | "class";
  anonymous?: boolean;
}

/** Create or update the caller's mnemonic. A new one is linked to the card's structure (so it shows for the whole structure). */
export async function saveMnemonic(sb: SupabaseClient, userId: string, i: MnemonicInput): Promise<{ ok: true; id: string; courseId: string; cardId: string | null; structureId: string | null } | { ok: false; error: string; status: number }> {
  const flags: Record<string, unknown> = {};
  if (i.visibility) flags.visibility = i.visibility;
  if (typeof i.anonymous === "boolean") flags.anonymous = i.anonymous;
  const now = new Date().toISOString();

  let existing: { id: string; course_id: string; card_id: string | null; structure_id: string | null; hidden: boolean } | null = null;
  let courseId = "";
  let cardId: string | null = null;
  let structureId: string | null = null;

  if (i.id) {
    const { data } = await sb.from("mnemonics").select("id, course_id, card_id, structure_id, hidden").eq("id", i.id).eq("user_id", userId).maybeSingle();
    existing = data;
    if (!existing) return { ok: false, error: "Not found", status: 404 };
  } else if (i.cardId) {
    const { data: card } = await sb.from("cards").select("id, course_id, structure_id").eq("id", i.cardId).maybeSingle();
    if (!card) return { ok: false, error: "Card not found", status: 404 };
    courseId = card.course_id;
    cardId = card.id;
    structureId = card.structure_id;
    const { data } = await sb.from("mnemonics").select("id, course_id, card_id, structure_id, hidden").eq("user_id", userId).eq("card_id", card.id).maybeSingle();
    existing = data;
  } else if (i.structureSlug) {
    const { data: course } = await sb.from("enrollments").select("course_id").eq("user_id", userId).order("joined_at").limit(1).maybeSingle();
    const cid = course?.course_id;
    if (!cid) return { ok: false, error: "Not enrolled", status: 403 };
    const { data: st } = await sb.from("structures").select("id, course_id").eq("course_id", cid).eq("slug", i.structureSlug).maybeSingle();
    if (!st) return { ok: false, error: "Structure not found", status: 404 };
    courseId = st.course_id;
    structureId = st.id;
    const { data } = await sb.from("mnemonics").select("id, course_id, card_id, structure_id, hidden").eq("user_id", userId).eq("structure_id", st.id).is("card_id", null).maybeSingle();
    existing = data;
  } else return { ok: false, error: "Bad request", status: 400 };

  if (existing) {
    if (existing.hidden) return { ok: false, error: "This mnemonic was hidden by a moderator", status: 403 };
    const { error } = await sb.from("mnemonics").update({ body: i.body, ...flags, updated_at: now }).eq("id", existing.id).eq("user_id", userId);
    if (error) return { ok: false, error: error.message, status: 500 };
    return { ok: true, id: existing.id, courseId: existing.course_id, cardId: existing.card_id, structureId: existing.structure_id };
  }
  const { data, error } = await sb.from("mnemonics").insert({ user_id: userId, course_id: courseId, card_id: cardId, structure_id: structureId, body: i.body, ...flags }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save", status: 500 };
  return { ok: true, id: data.id, courseId, cardId, structureId };
}
