const MAX_ENTRIES = 600;

/** The JSON body of a report request as an object ({} for `null`, an array or a primitive, which `req.json()` also
 *  returns). Reading `.type` of a `null` body threw a TypeError (500). */
export function bodyObject(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** A key of `table` the client named, or `fallback`. Own keys only: `"toString" in table` is true. */
export function ownKey<T extends object>(table: T, raw: unknown, fallback: keyof T): keyof T {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(table, raw) ? (raw as keyof T) : fallback;
}

/** The client's app state, stored with a report, at most `max` characters of JSON. Cutting the JSON text itself
 *  (`JSON.parse(s.slice(0, 6000))`) threw on any longer state: a 500 after the screenshot was already uploaded. An
 *  oversized state keeps the fields that fit. */
export function clampState(raw: unknown, max = 6000): Record<string, unknown> {
  const o = bodyObject(raw);
  let s: string;
  try {
    s = JSON.stringify(o);
  } catch {
    return {};
  }
  if (s.length <= max) return JSON.parse(s) as Record<string, unknown>;
  const out: Record<string, unknown> = { truncated: true };
  let used = 20;
  for (const [k, v] of Object.entries(o)) {
    const one = JSON.stringify({ [k]: v }) ?? "";
    if (used + one.length > max) continue;
    out[k] = JSON.parse(one)[k];
    used += one.length;
  }
  return out;
}

/** Keeps arrays small and shaped like log entries; the payload is client-supplied, so treat it as untrusted. */
export function cleanLogs(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_ENTRIES).map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    let d: unknown;
    if (o.d !== undefined) {
      const s = JSON.stringify(o.d) ?? "";
      d = s.length > 2000 ? s.slice(0, 2000) : o.d;
    }
    return {
      t: Number(o.t) || 0,
      k: String(o.k ?? "").slice(0, 12),
      m: String(o.m ?? "").slice(0, 1500),
      ...(d !== undefined ? { d } : {}),
    };
  });
}
