#!/usr/bin/env node
// DEV FIXTURE for the study engine: course code TEST-ENGINE with a few cards of every kind, plus a test
// student. Remove it with `node scripts/engine-fixture.mjs --remove`. Never touches NSCI3250A.
//   node scripts/engine-fixture.mjs            create / refresh
//   node scripts/engine-fixture.mjs --remove   delete the fixture course and the test student
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "test-engine-1@uvm.edu";
const PASSWORD = "Engine-test-1!";
const CODE = "TEST-ENGINE";

async function findUser() {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email === EMAIL);
}

if (process.argv.includes("--remove")) {
  const { data: c } = await sb.from("courses").select("id").eq("code", CODE).maybeSingle();
  if (c) await sb.from("courses").delete().eq("id", c.id);
  const u = await findUser();
  if (u) await sb.auth.admin.deleteUser(u.id);
  console.log("removed fixture course and test student");
  process.exit(0);
}

const ok = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// course
let course = (await sb.from("courses").select("*").eq("code", CODE).maybeSingle()).data;
if (!course) {
  course = ok(await sb.from("courses").insert({ code: CODE, title: "Engine test course (dev fixture)", term: "dev", join_code: "TEST-ENGINE-0", settings: { station_seconds: 20, exam_spelling: "generous", slug: "test-engine" } }).select().single(), "course");
}
const cid = course.id;
// user
let user = await findUser();
if (!user) user = (await sb.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })).data.user;
await sb.from("profiles").upsert({ id: user.id, email: EMAIL, display_name: "Engine Tester", role: "student" });
await sb.from("enrollments").upsert({ user_id: user.id, course_id: cid, role: "student" });

// wipe + rebuild content
await sb.from("cards").delete().eq("course_id", cid);
await sb.from("structures").delete().eq("course_id", cid);
await sb.from("topics").delete().eq("course_id", cid);
await sb.from("units").delete().eq("course_id", cid);
const units = ok(await sb.from("units").insert([{ course_id: cid, slug: "u1", position: 1, title: "Unit 1: Fixture basics" }, { course_id: cid, slug: "u2", position: 2, title: "Unit 2: Fixture pathways" }]).select(), "units");
const uid = Object.fromEntries(units.map((u) => [u.slug, u.id]));
const topics = ok(await sb.from("topics").insert([
  { course_id: cid, unit_id: uid.u1, slug: "lab-a", kind: "lab", position: 1, title: "Lab A: Forebrain", meta: {} },
  { course_id: cid, unit_id: uid.u1, slug: "lec-b", kind: "lecture", position: 2, title: "Lecture B: Cranial nerves", meta: {} },
  { course_id: cid, unit_id: uid.u2, slug: "path-c", kind: "lab", position: 3, title: "Pathways and clinical", meta: { type: "pathways" } },
]).select(), "topics");
const tid = Object.fromEntries(topics.map((t) => [t.slug, t.id]));

const S = (slug, name, extra = {}) => ({
  course_id: cid, unit_id: uid.u1, slug, canonical_name: name, synonyms: extra.synonyms ?? [], region: extra.region ?? null,
  info: {
    latin: extra.latin ?? null,
    etymology: extra.ety ?? null,
    explanation: extra.explanation ?? null,
    facts: extra.facts ?? null,
  },
});
const structs = ok(await sb.from("structures").insert([
  S("caudate-nucleus", "Caudate nucleus", { latin: "nucleus caudatus", region: "basal ganglia", ety: { roots: [{ part: "cauda", lang: "Latin", meaning: "tail" }], literal: "tailed nucleus", story: "Named for its long tail curving along the lateral ventricle." }, explanation: "C-shaped grey-matter nucleus forming the lateral wall of the lateral ventricle.", facts: { function: "Motor planning and cognition", lesion: "Executive and movement deficits" } }),
  S("putamen", "Putamen", { latin: "putamen", region: "basal ganglia", ety: { roots: [{ part: "putare", lang: "Latin", meaning: "to prune, to consider" }], literal: "that which is pruned off (a shell)" }, explanation: "Lateral part of the lentiform nucleus." }),
  S("thalamus", "Thalamus", { latin: "thalamus", ety: { roots: [{ part: "thalamos", lang: "Greek", meaning: "inner chamber" }], literal: "inner room" }, explanation: "Relay station between the cortex and subcortical structures." }),
  S("hippocampus", "Hippocampus", { latin: "hippocampus", region: "medial temporal lobe", ety: { roots: [{ part: "hippos", lang: "Greek", meaning: "horse" }, { part: "kampos", lang: "Greek", meaning: "sea monster" }], literal: "sea horse" }, explanation: "Curved structure in the medial temporal lobe central to memory formation." }),
  S("facial-nerve", "Facial nerve", { synonyms: ["cranial nerve VII"], latin: "nervus facialis", explanation: "Cranial nerve VII: muscles of facial expression, taste to the anterior two thirds of the tongue." }),
  S("amygdala", "Amygdala", { latin: "corpus amygdaloideum", ety: { roots: [{ part: "amygdale", lang: "Greek", meaning: "almond" }], literal: "almond" }, explanation: "Almond-shaped nuclei in the temporal lobe involved in emotion." }),
  S("substantia-nigra", "Substantia nigra", { latin: "substantia nigra", ety: { roots: [{ part: "niger", lang: "Latin", meaning: "black" }], literal: "black substance" }, explanation: "Dopaminergic midbrain nucleus; its pars compacta degenerates in Parkinson disease." }),
]).select(), "structures");
const sid = Object.fromEntries(structs.map((s) => [s.slug, s.id]));

const pin = (slug, topic, structure, answer, img, target, extra = {}) => ({
  course_id: cid, topic_id: tid[topic], structure_id: sid[structure], slug, kind: "pin", position: extra.position ?? 0, status: "live",
  content: { answer, accept: extra.accept ?? [], require_side: !!extra.side, image: img, w: 1200, h: 900, target, masks: extra.masks ?? [target], pointer: extra.pointer ?? { type: "mask" }, prompt: extra.prompt ?? "Name the structure.", followups: extra.followups ?? [], tags: extra.tags ?? [] },
});
const th = (slug, topic, structure, facet, prompt, answer, extra = {}) => ({
  course_id: cid, topic_id: tid[topic], structure_id: sid[structure], slug, kind: "theory", position: 50, status: "live",
  content: { facet, prompt, format: extra.format ?? "type", answer, accept: extra.accept ?? [], keywords: extra.keywords ?? null, choices: extra.choices ?? null },
});
const I1 = "/dev/placeholder-1.svg";
const I2 = "/dev/placeholder-2.svg";
ok(await sb.from("cards").insert([
  pin("fx-caudate", "lab-a", "caudate-nucleus", "Caudate nucleus", I1, { shape: "rect", x: 0.28, y: 0.3, w: 0.13, h: 0.08 }, { position: 1, accept: ["caudate"], masks: [{ shape: "rect", x: 0.28, y: 0.3, w: 0.13, h: 0.08 }, { shape: "rect", x: 0.58, y: 0.3, w: 0.13, h: 0.08 }], followups: ["caudate-nucleus:function", "caudate-nucleus:lesion"] }),
  pin("fx-thalamus", "lab-a", "thalamus", "Thalamus", I1, { shape: "ellipse", x: 0.62, y: 0.52, w: 0.12, h: 0.2 }, { position: 2, masks: [{ shape: "ellipse", x: 0.62, y: 0.52, w: 0.12, h: 0.2 }], tags: ["practical"] }),
  pin("fx-putamen", "lab-a", "putamen", "Putamen", I1, { shape: "polygon", points: [[0.3, 0.55], [0.4, 0.5], [0.42, 0.7], [0.32, 0.72]] }, { position: 3, masks: [], pointer: { type: "pin" } }),
  pin("fx-hippocampus", "lab-a", "hippocampus", "Hippocampus", I2, { shape: "rect", x: 0.5, y: 0.66, w: 0.1, h: 0.09 }, { position: 4, masks: [], pointer: { type: "arrow" } }),
  pin("fx-amygdala", "lab-a", "amygdala", "Amygdala", I2, { shape: "ellipse", x: 0.35, y: 0.55, w: 0.08, h: 0.08 }, { position: 5, masks: [], pointer: { type: "existing", color: "green pin" }, tags: ["practical"] }),
  pin("fx-nigra", "lab-a", "substantia-nigra", "Substantia nigra", I2, { shape: "rect", x: 0.46, y: 0.7, w: 0.08, h: 0.06 }, { position: 6, masks: [{ shape: "rect", x: 0.46, y: 0.7, w: 0.08, h: 0.06 }] }),
  pin("fx-left-caudate", "lab-a", "caudate-nucleus", "Left caudate nucleus", I1, { shape: "rect", x: 0.28, y: 0.3, w: 0.13, h: 0.08 }, { position: 7, side: true, masks: [{ shape: "rect", x: 0.28, y: 0.3, w: 0.13, h: 0.08 }], prompt: "Name the structure and its side." }),
  pin("fx-cn7", "lec-b", "facial-nerve", "Facial nerve", I2, { shape: "rect", x: 0.7, y: 0.4, w: 0.1, h: 0.08 }, { position: 8, accept: ["CN VII"], masks: [{ shape: "rect", x: 0.7, y: 0.4, w: 0.1, h: 0.08 }] }),
  th("fx-caudate-function", "lab-a", "caudate-nucleus", "function", "What is the main function of the caudate nucleus?", "Motor planning and cognition", { format: "keywords", keywords: [["motor", "movement"], ["cognition", "cognitive", "executive"]] }),
  th("fx-caudate-lesion", "lab-a", "caudate-nucleus", "lesion", "A caudate lesion mainly disturbs movement. True or false?", "True", { format: "tf" }),
  th("fx-thalamus-fn", "lab-a", "thalamus", "function", "Which structure relays most sensory input to the cortex?", "Thalamus", { format: "choice", choices: ["Thalamus", "Pons", "Putamen", "Amygdala"] }),
  { course_id: cid, topic_id: tid["path-c"], structure_id: null, slug: "fx-path-dcml", kind: "pathway", position: 1, status: "live", content: { pathway: "dcml", step: "decussation", prompt: "DCML: where do 2nd-order neurons decussate?", answer: "Caudal medulla", accept: ["internal arcuate fibers", "medulla"], format: "type" } },
  { course_id: cid, topic_id: tid["path-c"], structure_id: null, slug: "fx-section-level", kind: "section", position: 2, status: "live", content: { image: I2, w: 1200, h: 900, prompt: "Which level is this section?", answer: "Rostral medulla", accept: [], format: "type" } },
  { course_id: cid, topic_id: tid["path-c"], structure_id: null, slug: "fx-clinical-1", kind: "clinical", position: 3, status: "live", content: { vignette: "A patient has loss of vibration sense in the left leg and no weakness.", prompt: "Where is the lesion?", format: "keywords", answer: "Left dorsal column (ipsilateral, below the decussation)", keywords: [["dorsal column", "fasciculus gracilis", "gracile"], ["left", "ipsilateral"]] } },
]), "cards");

console.log(`fixture ready: course ${CODE} (${cid})\ntest student: ${EMAIL} / ${PASSWORD}`);
