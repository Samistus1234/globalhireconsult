// Shared tenancy check for marketplace message attachments.
// Used by mp-thread-post (replies) and mp-thread-create (a thread's opening message) so
// the two functions that write attachment paths into mp_messages enforce identical rules.
// Do not fork this — it drifted once already between sibling functions in this codebase
// (escAttr/safeHref/mail-security), which is why it now lives here as the single copy.

// An attachment path must sit literally under this agency's prefix. Reject any '..'
// outright rather than trying to normalise it.
export function attachmentsInsideAgency(attachments: { path?: string }[], agencyId: string): boolean {
  const prefix = `marketplace/agency/${agencyId}/`;
  return attachments.every((a) => {
    const p = String(a?.path ?? '');
    return p.startsWith(prefix) && !p.includes('..');
  });
}
