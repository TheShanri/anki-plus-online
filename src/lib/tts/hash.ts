// Clip names are a content hash; the generator (tools/tts/ttslib.py) computes the identical value.
import cfg from "./config.json";

export function normText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const REVS: Record<string, number> = (cfg as { revs?: Record<string, number> }).revs ?? {};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REV_RE = Object.keys(REVS).map((k) => [k, new RegExp(`(^|[^a-z0-9])${esc(k)}(?=[^a-z0-9]|$)`)] as const);

/** "|term@rev" for every lexicon term the text contains whose pronunciation was fixed after its clips existed
 *  (config.json `revs`): only those clips get new names, and no browser keeps an old one. */
export function revSuffix(norm: string): string {
  return REV_RE.filter(([, re]) => re.test(norm))
    .map(([k]) => k)
    .sort()
    .map((k) => `|${k}@${REVS[k]}`)
    .join("");
}

/** First 20 hex chars of sha256("voice|lexicon|normalised text" + revSuffix). */
export async function clipHash(text: string): Promise<string> {
  const t = normText(text);
  const data = new TextEncoder().encode(`${cfg.voice}|${cfg.lexicon}|${t}${revSuffix(t)}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}
