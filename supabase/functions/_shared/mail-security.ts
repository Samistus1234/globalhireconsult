/**
 * mail-security — canonical home for the two escaping helpers every
 * function that emails attacker-reachable free text needs: escapeHtml
 * (values placed inside an HTML email body/headline) and headerSafe
 * (values placed inside an SMTP header, e.g. subject:).
 *
 * Why this file exists: mp-notify shipped with its own verbatim copies of
 * both (copied from stage-change-notify's esc() and notify-interest's
 * headerSafe()) — the exact drift that let an HTML-injection and a
 * header-injection defect both reach production, because the escaping
 * convention already existed elsewhere in this codebase and simply never
 * reached mp-notify. A third local copy would perpetuate the cause: a
 * future hardening of one copy would not propagate to the others.
 *
 * STATUS: `notify-interest/index.ts` and `stage-change-notify/index.ts`
 * still carry their own local copies (esc() / headerSafe()) and are
 * PENDING MIGRATION to this module — they were deliberately NOT touched
 * when this file was introduced (they are live production email paths
 * unrelated to the feature that introduced this module). Until they
 * migrate, a change made here must be HAND-APPLIED to those two copies
 * as well, or they will drift again.
 */

/** Escape a string for use as HTML text content (or an HTML attribute
 *  value) inside an email body. No current call site in this codebase puts
 *  an escaped value inside an attribute, but quotes are escaped anyway —
 *  it costs nothing here and removes a latent trap for the next caller
 *  who does. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip CR/LF/tabs/control chars and cap length, so an attacker-controlled
 *  string cannot inject extra headers (e.g. a forged Bcc:) into an SMTP
 *  message via subject: or any other header field. Byte-identical to
 *  notify-interest/index.ts's headerSafe — do not "improve" this without
 *  hand-applying the same change to that copy (see file header). */
export function headerSafe(s: string): string {
  return String(s).replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 120);
}
