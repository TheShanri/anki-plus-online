// Resolve a card's media key to a URL. Keys are paths relative to content-build/ (served through the
// auth-gated /api/media route); dev fixtures use public paths ("/dev/...") or full URLs, used as-is.
import { mediaUrl } from "@/lib/media";

export function resolveMediaSrc(courseSlug: string, key: string): string {
  if (!key) return "";
  if (key.startsWith("/") || /^https?:\/\//.test(key) || key.startsWith("data:")) return key;
  return mediaUrl(courseSlug, key);
}
