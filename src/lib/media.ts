// Course media (the professor's slides, lab photos, Anki images) is private: it lives in the
// `course-media` Storage bucket and is served only to enrolled members through the auth-gated
// route /api/media/<course-slug>/<media key>, which redirects to a short-lived signed URL.
// A media key is a path relative to content-build/ (see docs/CONTENT_SCHEMA.md).

export function mediaUrl(courseSlug: string, key: string): string {
  const clean = key.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `/api/media/${encodeURIComponent(courseSlug)}/${clean}`;
}
