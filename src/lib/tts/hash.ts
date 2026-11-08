// Clip names are a content hash; the generator (tools/tts/ttslib.py) computes the identical value.
import cfg from "./config.json";

export function normText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** First 20 hex chars of sha256("voice|lexicon|normalised text"). */
export async function clipHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(`${cfg.voice}|${cfg.lexicon}|${normText(text)}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}
