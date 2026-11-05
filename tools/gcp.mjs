#!/usr/bin/env node
// Google Cloud API helper using the owner's clasp OAuth login (~/.clasprc.json has the cloud-platform scope).
// The token is never printed.
//   node tools/gcp.mjs GET <url>
//   node tools/gcp.mjs POST <url> '<json>'
import { readFileSync } from "node:fs";

export async function gcpToken() {
  const t = JSON.parse(readFileSync(process.env.USERPROFILE + "/.clasprc.json", "utf8")).tokens.default;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token refresh failed: " + JSON.stringify(j));
  return j.access_token;
}

export async function gcp(method, url, body) {
  const tok = await gcpToken();
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("gcp.mjs")) {
  const [method, url, body] = process.argv.slice(2);
  if (method && url) {
    const res = await gcp(method, url, body);
    console.log(res.status, JSON.stringify(res.data, null, 1));
  }
}
