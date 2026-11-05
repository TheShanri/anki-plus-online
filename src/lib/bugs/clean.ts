const MAX_ENTRIES = 600;

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
