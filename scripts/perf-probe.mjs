#!/usr/bin/env node
// Times the main pages as a signed-in student (creates perf-probe@uvm.edu in NSCI3250A; --remove deletes it).
//   node scripts/perf-probe.mjs [baseUrl] [--rsc] [--remove]
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "perf-probe@uvm.edu";
const PASSWORD = "Perf-probe-1!";
const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "https://anatomy.theexaminedexistence.com";

async function findUser() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  return data.users.find((u) => u.email === EMAIL);
}
if (process.argv.includes("--remove")) {
  const u = await findUser();
  if (u) await admin.auth.admin.deleteUser(u.id);
  console.log("removed", EMAIL);
  process.exit(0);
}
let user = await findUser();
if (!user) user = (await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })).data.user;
const { data: course } = await admin.from("courses").select("id").eq("code", "NSCI3250A").single();
await admin.from("profiles").upsert({ id: user.id, email: EMAIL, display_name: "Perf Probe", role: "student" });
await admin.from("enrollments").upsert({ user_id: user.id, course_id: course.id, role: "student" });

const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (error) throw error;
const hdr = JSON.parse(Buffer.from(s.session.access_token.split(".")[0], "base64url").toString());
console.log("jwt alg", hdr.alg);
const ref = new URL(URL_).hostname.split(".")[0];
const val = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const name = `sb-${ref}-auth-token`;
const chunks = [];
for (let i = 0; i < val.length; i += 3180) chunks.push(val.slice(i, i + 3180));
const cookie = chunks.length === 1 ? `${name}=${val}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");

const pages = (process.argv.find((a) => a.startsWith("--pages="))?.slice(8).split(",")) ?? ["/study", "/atlas", "/course", "/settings", "/study/run?scope=all", "/", "/api/study/queue?scope=all&tz=240&bootstrap=1"];
const rsc = process.argv.includes("--rsc");
for (const p of pages) {
  const times = [];
  let status = 0;
  for (let i = 0; i < 4; i++) {
    const t = performance.now();
    const r = await fetch(base + p, { headers: { cookie, ...(rsc ? { RSC: "1", "Next-Router-State-Tree": encodeURIComponent(JSON.stringify(["", { children: ["__PAGE__", {}] }, null, null, true])) } : {}) }, redirect: "manual" });
    await r.arrayBuffer();
    status = r.status;
    times.push(Math.round(performance.now() - t));
  }
  console.log(p.padEnd(24), status, times.join(" "), "ms");
}
