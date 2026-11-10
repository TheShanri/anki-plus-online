// Redirect-target check, kept free of dependencies so client components can import it cheaply.

/** Only same-site relative paths are accepted as a redirect target. Browsers drop tabs/newlines and read a backslash
 *  as a slash when resolving a URL, so such paths could leave the site: anything with those characters is refused. */
export function safeNext(next: string | null | undefined, fallback = "/study"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    return new URL(next, "https://same.site").origin === "https://same.site" ? next : fallback;
  } catch {
    return fallback;
  }
}
