/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: shared messaging module
   Loaded after js/mp-core.js. Used by partners-messages.html,
   admin-mp-messages.html, and the Messages tab in admin-mp-agencies.html.

   Contract notes:
   - Every write goes through an edge fn; there is no client INSERT grant.
   - Attachments are stored as PATHS. Signed URLs are minted on demand and
     never persisted (they expire, and a stored one is a leak).

   Security note (see also js/mp-core.js MP.esc):
   - MP.esc() builds a Text node and reads back .innerHTML. That neutralises
     '&', '<' and '>' for element TEXT content, but the HTML text-node
     serialisation algorithm never touches '"' or '\'' — those only matter
     inside an attribute value, not between tags. So MP.esc() alone is NOT
     safe to drop into a double-quoted attribute: an agency-chosen filename
     containing a '"' would close the attribute early and let the rest of
     the string be parsed as markup/attributes (e.g. inline event handlers).
     escAttr() below layers a quote-escape on top of MP.esc() and MUST be
     used for every agency-controlled value written into an HTML attribute
     (data-path, data-id, href, ...). Plain esc() remains correct for
     values written as element text content.
   ============================================ */
(function () {
  var BUCKET = 'gh-applicant-documents';
  var MAX_BYTES = 10 * 1024 * 1024;
  var OK_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  function esc(s) { return window.MP.esc(s); }

  // Text-content escape (MP.esc) + quote neutralisation, for values placed
  // inside a double-quoted HTML attribute.
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  async function listThreads(agencyId) {
    var q = window.MP.mpFrom('threads')
      .select('id, agency_id, subject, context_type, last_message_at, gh_unread, agency_unread')
      .order('last_message_at', { ascending: false });
    if (agencyId) q = q.eq('agency_id', agencyId);
    var r = await q;
    return r.error ? { error: r.error.message, rows: [] } : { rows: r.data || [] };
  }

  async function loadThread(threadId) {
    var r = await window.MP.mpFrom('messages')
      .select('id, sender_side, sender_user_id, body_md, attachments, created_at')
      .eq('thread_id', threadId).order('created_at', { ascending: true });
    return r.error ? { error: r.error.message, rows: [] } : { rows: r.data || [] };
  }

  function renderThread(el, messages) {
    el.innerHTML = messages.map(function (m) {
      var who = m.sender_side === 'gh' ? 'GlobalHire' : 'Agency';
      var files = (m.attachments || []).map(function (a) {
        // a.path / a.name are agency-authored (uploaded filenames) — data-path
        // is an ATTRIBUTE so it must go through escAttr(), not esc().
        return '<a href="#" class="mp-att" data-path="' + escAttr(a.path) + '">' +
               esc(a.name || a.path.split('/').pop()) + '</a>';
      }).join(' ');
      // sender_side is a two-value enum written only by our own edge fns
      // (no client insert grant) — not agency free text — but it still
      // lands in an attribute (the class list), so it is escAttr()'d too
      // for defense in depth even though it cannot carry a quote today.
      return '<div class="mp-msg-row mp-side-' + escAttr(m.sender_side) + '">' +
               '<div class="mp-msg-who">' + esc(who) + ' · ' +
                 esc(new Date(m.created_at).toLocaleString()) + '</div>' +
               '<div class="mp-msg-body">' + esc(m.body_md) + '</div>' +
               (files ? '<div class="mp-msg-files">' + files + '</div>' : '') +
             '</div>';
    }).join('');

    // Signed URLs are minted per click, never rendered into the page up front.
    Array.prototype.forEach.call(el.querySelectorAll('.mp-att'), function (a) {
      a.addEventListener('click', async function (e) {
        e.preventDefault();
        var out = await attachmentUrl(a.getAttribute('data-path'));
        if (out.url) window.open(out.url, '_blank', 'noopener');
        else a.textContent = a.textContent + ' (unavailable)';
      });
    });
  }

  async function attachmentUrl(path) {
    var r = await window.MP.callFn('mp-thread-attachment', { path: path });
    return r.ok && r.data && r.data.url ? { url: r.data.url } : { error: 'could not open file' };
  }

  function validateFiles(files) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].size > MAX_BYTES) return files[i].name + ' is larger than 10MB.';
      if (OK_MIME.indexOf(files[i].type) < 0) return files[i].name + ' must be a PDF, JPEG, PNG or WebP.';
    }
    return null;
  }

  // Uploaded BEFORE the message row exists, so the folder is keyed by a client seed
  // rather than message_id. The path still sits under the agency prefix, which is what
  // both storage RLS and mp-thread-post enforce.
  async function uploadAttachments(agencyId, seed, files) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var path = 'marketplace/agency/' + agencyId + '/thread/' + seed + '/' + f.name;
      var up = await window.ghSupabase.storage.from(BUCKET).upload(path, f, { upsert: true });
      if (up.error) throw up.error;
      out.push({ path: path, name: f.name, size: f.size, mime: f.type });
    }
    return out;
  }

  async function post(threadId, agencyId, body, files) {
    var bad = validateFiles(files || []);
    if (bad) return { error: bad };
    var attachments = [];
    try {
      if (files && files.length) {
        attachments = await uploadAttachments(agencyId, 'm' + Date.now(), files);
      }
    } catch (e) {
      // Abort rather than post a message referencing a file that isn't there.
      return { error: 'Attachment upload failed: ' + (e.message || String(e)) };
    }
    var r = await window.MP.callFn('mp-thread-post',
      { thread_id: threadId, body: body, attachments: attachments });
    return r.ok ? { ok: true } : { error: (r.data && r.data.error) || 'Could not send.' };
  }

  async function createThread(opts) {
    var r = await window.MP.callFn('mp-thread-create', {
      agency_id: opts.agencyId, subject: opts.subject,
      context_type: opts.contextType || 'agency', context_id: opts.contextId || null,
      body: opts.body, attachments: opts.attachments || [],
    });
    return r.ok && r.data ? { ok: true, thread_id: r.data.thread_id }
                          : { error: (r.data && r.data.error) || 'Could not start the thread.' };
  }

  async function markRead(threadId) {
    // mp_mark_thread_read resolves against the public wrapper (no schema
    // prefix — PostgREST only exposes public) and is granted to authenticated.
    try { await window.ghSupabase.rpc('mp_mark_thread_read', { p_thread_id: threadId }); }
    catch (e) { /* non-fatal: an unread badge is cosmetic */ }
  }

  window.MPMsg = { listThreads: listThreads, loadThread: loadThread, renderThread: renderThread,
    post: post, createThread: createThread, markRead: markRead,
    attachmentUrl: attachmentUrl, uploadAttachments: uploadAttachments,
    validateFiles: validateFiles };
})();
