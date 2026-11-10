// Course media (the professor's slides, lab photos, Anki images) is private: it lives in the
// `course-media` Storage bucket and is served only to enrolled members through the auth-gated
// route /api/media/<course-slug>/<media key>, which redirects to a short-lived signed URL.
// A media key is a path relative to content-build/ (see docs/CONTENT_SCHEMA.md).

export function mediaUrl(courseSlug: string, key: string): string {
  const clean = key.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `/api/media/${encodeURIComponent(courseSlug)}/${clean}`;
}

/** The Storage path for /api/media/<course>/<...key>, or null when a segment could leave the course folder.
 *  Next decodes each catch-all segment, so an encoded slash ("%2F") arrives inside a segment and "a%2F..%2F.."
 *  would otherwise collapse to another course or bucket once the service-role client builds its request URL. */
export function mediaPath(course: string, key: string[]): string | null {
  const segOk = (s: string) => s !== "" && s !== "." && s !== ".." && !/[/\\\u0000-\u001f]/.test(s);
  if (!/^[\w-][\w.-]*$/.test(course) || course === "." || course === "..") return null;
  if (!key.length || !key.every(segOk)) return null;
  return `${course}/${key.join("/")}`;
}
