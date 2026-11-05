#!/usr/bin/env node
// Cloud DNS records for theexaminedexistence.com through the gcloud login (theexaminedexistence@gmail.com).
//   node tools/dns.mjs list
//   node tools/dns.mjs set <name> <TYPE> <value> [value...]   create or replace a record set
//   node tools/dns.mjs add <name> <TYPE> <value>               append a value to a record set (TXT, MX…)
// <name> may be relative ("send") or absolute ("send.theexaminedexistence.com."). TXT values are quoted for
// you; long TXT values (DKIM) are split into 255-char strings.
import { execSync } from "node:child_process";

const PROJECT = "ordinal-space-446314-b3";
const ZONE = "theexaminedexistence-com";
const APEX = "theexaminedexistence.com.";
const GCLOUD = `"${process.env.LOCALAPPDATA}\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd"`;
const BASE = `https://dns.googleapis.com/dns/v1/projects/${PROJECT}/managedZones/${ZONE}/rrsets`;

const token = execSync(`${GCLOUD} auth print-access-token`, { encoding: "utf8" }).trim();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const fqdn = (n) => (n.endsWith(".") ? n : n === "@" ? APEX : `${n}.${APEX}`);
const txt = (v) => (v.startsWith('"') ? v : v.match(/.{1,255}/g).map((c) => `"${c}"`).join(" "));

async function get(name, type) {
  const r = await fetch(`${BASE}/${encodeURIComponent(name)}/${type}`, { headers: H });
  return r.ok ? r.json() : null;
}

async function put(name, type, rrdatas) {
  const existing = await get(name, type);
  const body = JSON.stringify({ name, type, ttl: 300, rrdatas });
  const r = existing
    ? await fetch(`${BASE}/${encodeURIComponent(name)}/${type}`, { method: "PATCH", headers: H, body })
    : await fetch(BASE, { method: "POST", headers: H, body });
  const j = await r.json();
  console.log(r.status, existing ? "updated" : "created", name, type, JSON.stringify(j.rrdatas ?? j.error?.message));
}

const [cmd, rawName, type, ...values] = process.argv.slice(2);
if (cmd === "list") {
  const j = await (await fetch(BASE, { headers: H })).json();
  for (const s of j.rrsets ?? []) console.log(s.name.padEnd(48), s.type.padEnd(6), s.rrdatas.join(" | ").slice(0, 140));
} else if (cmd === "set" || cmd === "add") {
  const name = fqdn(rawName);
  const T = type.toUpperCase();
  const vals = values.map((v) => (T === "TXT" ? txt(v) : v));
  if (cmd === "add") {
    const cur = (await get(name, T))?.rrdatas ?? [];
    await put(name, T, [...new Set([...cur, ...vals])]);
  } else await put(name, T, vals);
} else {
  console.log("usage: dns.mjs list | set <name> <TYPE> <value...> | add <name> <TYPE> <value>");
}
