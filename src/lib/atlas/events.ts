/** Sent by the nav's "Atlas" link during a study session: the session opens the atlas over the card instead of
 *  the page navigating away. A tiny module so the nav does not pull in the atlas code. */
export const OPEN_ATLAS_EVENT = "anki:open-atlas";

/** True while a study session is on screen (it registers itself), so the nav knows to send the event. */
let sessionOpen = 0;
export function registerStudySession(): () => void {
  sessionOpen++;
  return () => {
    sessionOpen = Math.max(0, sessionOpen - 1);
  };
}
export function studySessionOpen(): boolean {
  return sessionOpen > 0;
}
