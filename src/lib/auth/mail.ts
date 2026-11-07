import "server-only";
import { SITE_URL } from "@/lib/env";

const FROM = "ANKI+ Online <noreply@theexaminedexistence.com>";

export const FEEDBACK_TYPES = {
  bug: "Bug",
  card: "Mistake in a card",
  idea: "Idea",
  praise: "Praise",
  other: "Other",
} as const;
export type FeedbackType = keyof typeof FEEDBACK_TYPES;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Sends one email through Resend. Never throws; returns false when there is no key or the send failed. */
export async function sendMail(to: string[], subject: string, html: string, text: string, replyTo?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to.length) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const shell = (inner: string) =>
  `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#1d2a24;line-height:1.55">${inner}` +
  `<p style="margin-top:28px;font-size:12px;color:#6b7a72">ANKI+ Online · <a href="${SITE_URL}" style="color:#6b7a72">${esc(SITE_URL.replace(/^https?:\/\//, ""))}</a></p></div>`;

export type FeedbackMailInput = {
  id: string;
  type: FeedbackType;
  message: string;
  route: string;
  cardSlug: string | null;
  senderName: string;
  senderEmail: string;
  hasScreenshot: boolean;
};

export async function sendFeedbackEmails(f: FeedbackMailInput, adminEmails: string[]): Promise<{ admin: boolean; sender: boolean }> {
  const label = FEEDBACK_TYPES[f.type];
  const link = `${SITE_URL}/admin/feedback?id=${f.id}`;
  const msg = f.message || "(no message)";
  const adminOk = await sendMail(
    adminEmails,
    `[ANKI+ feedback] ${label}: ${msg.slice(0, 60)}`,
    shell(
      `<h2 style="margin:0 0 8px;font-size:18px">${esc(label)} from ${esc(f.senderName || f.senderEmail || "anonymous")}</h2>` +
        `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #c9a227;background:#faf7ee">${esc(msg).replace(/\n/g, "<br>")}</blockquote>` +
        `<p style="font-size:14px;color:#44544b">Page: ${esc(f.route)}${f.cardSlug ? `<br>Card: ${esc(f.cardSlug)}` : ""}` +
        `${f.senderEmail ? `<br>From: ${esc(f.senderEmail)}` : ""}${f.hasScreenshot ? "<br>A screenshot is attached to the report." : ""}</p>` +
        `<p><a href="${link}" style="color:#154734">Open it in the inbox</a></p>`,
    ),
    `${label} from ${f.senderName || f.senderEmail || "anonymous"}\n\n${msg}\n\nPage: ${f.route}${f.cardSlug ? `\nCard: ${f.cardSlug}` : ""}${f.senderEmail ? `\nFrom: ${f.senderEmail}` : ""}\n\nInbox: ${link}`,
    f.senderEmail || undefined,
  );
  let senderOk = false;
  if (f.senderEmail) {
    const first = (f.senderName || "").split(/\s+/)[0];
    senderOk = await sendMail(
      [f.senderEmail],
      "We got your feedback. Thank you!",
      shell(
        `<p>Hi${first ? ` ${esc(first)}` : ""},</p>` +
          `<p>Thank you, your feedback has been received. It goes straight to the person who builds ANKI+ Online, and every note gets read.</p>` +
          `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #c9a227;background:#faf7ee;font-size:14px">${esc(msg.slice(0, 400)).replace(/\n/g, "<br>")}</blockquote>` +
          `<p>If it was a bug or a mistake in a card, we will fix it as soon as we can. Keep studying well.</p>`,
      ),
      `Hi${first ? ` ${first}` : ""},\n\nThank you, your feedback has been received. It goes straight to the person who builds ANKI+ Online, and every note gets read.\n\n"${msg.slice(0, 400)}"\n\nIf it was a bug or a mistake in a card, we will fix it as soon as we can. Keep studying well.\n\nANKI+ Online`,
    );
  }
  return { admin: adminOk, sender: senderOk };
}
