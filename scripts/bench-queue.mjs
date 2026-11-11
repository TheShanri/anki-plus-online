#!/usr/bin/env node
// Times the study queue (buildStudyPayload: the first batch, then a follow-up batch) as a test student, straight
// against the database (no Next server), and reports Supabase requests and payload size. Course data is only read.
// Creates test-bench-1@uvm.edu (a student in NSCI3250A) and deletes it again at the end.
//   node --conditions=react-server scripts/bench-queue.mjs [runs=5]
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "test-bench-1@uvm.edu";
const PASSWORD = "Bench-test-1!" + Math.random().toString(36).slice(2, 8);
const runs = Number(process.argv[2]) || 5;

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const old = list.users.find((u) => u.email === EMAIL);
if (old) await admin.auth.admin.deleteUser(old.id);
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
const uid = created.user.id;
try {
  const { data: course } = await admin.from("courses").select("id").eq("code", "NSCI3250A").single();
  await admin.from("profiles").upsert({ id: uid, email: EMAIL, display_name: "Bench Test", role: "student" });
  await admin.from("enrollments").upsert({ user_id: uid, course_id: course.id, role: "student" });
  const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: s, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;

  let requests = 0;
  let trace = null; // BENCH_TRACE=1: the requests of the second (warm) first-batch build, with start/end times
  let t0 = 0;
  const counting = async (input, init) => {
    requests++;
    const start = performance.now();
    const res = await fetch(input, init);
    if (trace) {
      const u = new URL(typeof input === "string" ? input : input.url);
      trace.push(`${String(Math.round(start - t0)).padStart(5)}-${String(Math.round(performance.now() - t0)).padEnd(5)} ${u.pathname.replace("/rest/v1/", "")}${u.searchParams.get("select") ? " " + u.searchParams.get("select").slice(0, 40) : ""}`);
    }
    return res;
  };
  const sb = createClient(URL_, KEY, { auth: { persistSession: false }, global: { fetch: counting, headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  // BENCH_SERVER=<path>: time another copy of server.ts (an A/B against an older version kept beside it)
  const { buildStudyPayload, resolveCourse } = await import(pathToFileURL(join(root, process.env.BENCH_SERVER || "src/lib/study/server.ts")).href);

  const rows = [];
  for (let i = 0; i < runs; i++) {
    requests = 0;
    trace = i === 1 && process.env.BENCH_TRACE ? [] : null;
    t0 = performance.now();
    const c = await resolveCourse(sb, uid, null);
    const first = await buildStudyPayload(sb, uid, c, { scope: { type: "all" }, scopeKey: "all", tzOffsetMin: 300, exclude: new Set(), bootstrap: true });
    const t1 = performance.now();
    if (trace) console.log(trace.join("\n"));
    trace = null;
    const r1 = requests;
    requests = 0;
    const exclude = new Set(first.queue.map((q) => q.cardId));
    const next = await buildStudyPayload(sb, uid, c, { scope: { type: "all" }, scopeKey: "all", tzOffsetMin: 300, exclude, bootstrap: false });
    const t2 = performance.now();
    const j1 = JSON.stringify(first);
    const j2 = JSON.stringify(next);
    if (i === 0) console.log("first batch, KB per key:", Object.fromEntries(Object.entries(first).map(([k, v]) => [k, +((JSON.stringify(v) ?? "").length / 1024).toFixed(1)])));
    rows.push({ first_ms: Math.round(t1 - t0), first_req: r1, first_kb: +(j1.length / 1024).toFixed(1), first_gz_kb: +(gzipSync(j1).length / 1024).toFixed(1), cards: first.cards.length, next_ms: Math.round(t2 - t1), next_req: requests, next_kb: +(j2.length / 1024).toFixed(1) });
  }
  console.table(rows);
  const med = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  console.log(`median (runs 2..${runs} are warm: course content cached in the process): first ${med("first_ms")} ms, follow-up ${med("next_ms")} ms`);
} finally {
  await admin.auth.admin.deleteUser(uid);
  console.log("removed", EMAIL);
}
