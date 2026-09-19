/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: shared messaging module
   Loaded after js/mp-core.js. Used by partners-messages.html,
   admin-mp-messages.html, and the Messages tab in admin-mp-agencies.html.

   Contract notes:
   - Every write goes through an edge fn; there is no client INSERT grant.
   - Attachments are stored as PATHS. Signed URLs are minted on demand and
     never persisted (they expire, and a stored one is a leak).

   Security note (see also js/mp-core.js MP.esc / MP.escAttr):
   - MP.esc() builds a Text node and reads back .innerHTML. That neutralises
     '&', '<' and '>' for element TEXT content, but the HTML text-node
     serialisation algorithm never touches '"' or '\'' — those only matter
     inside an attribute value, not between tags. So MP.esc() alone is NOT
     safe to drop into a quoted attribute: an agency-chosen filename
     containing a '"' would close the attribute early and let the rest of
     the string be parsed as markup/attributes (e.g. inline event handlers).
     MP.escAttr() (js/mp-core.js) layers a quote-escape on top of MP.esc()
     and MUST be used for every agency-controlled value written into an
     HTML attribute (data-path, data-id, href, ...). Plain MP.esc() remains
     correct for values written as element text content.
   ============================================ */
(function () {
  var BUCKET = 'gh-applicant-documents';
  var MAX_BYTES = 10 * 1024 * 1024;
  var OK_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  function esc(s) { return window.MP.esc(s); }
  function escAttr(s) { return window.MP.escAttr(s); }

  // Sanitises an uploaded filename before it becomes part of a storage PATH.
  // f.name is fully attacker-controlled (the browser puts whatever the OS
  // file-picker returned there, unescaped). Left raw, a name like
  // "../../evil.pdf" or one containing '/' would change which folder the
  // object actually lands in — storage RLS still confines the write to the
  // agency's own prefix, but within that prefix the caller could still
  // write outside the intended thread/seed subfolder. mp-thread-post's
  // attachmentsInsideAgency check rejects any path containing '..', but
  // that check runs AFTER the client has already uploaded the object, so
  // sanitising only the message body is too late — the object is already
  // sitting at the wrong path in storage by then.
  //
  // This keeps only the last path segment (so no separator survives to
  // change the folder structure), keeps a short alnum extension so the
  // file stays identifiable/openable, and restricts the base name to a
  // safe character set (also destroying any '..' runs, since '.' is not
  // in the allowed set for the base). The ORIGINAL name is preserved
  // separately as the attachment's display `name` — only the stored path
  // uses the sanitised form.
  function safeFileName(name) {
    var s = String(name || '').trim();
    // Drop any directory component (POSIX or Windows separator) — only the
    // last path segment can ever reach the storage path.
    s = s.split(/[\/\\]/).pop() || '';
    if (!s) s = 'file';
    var m = /^(.*?)(\.[A-Za-z0-9]{1,10})$/.exec(s);
    var base = m ? m[1] : s;
    var ext = m ? m[2] : '';
    // Safe set: letters, digits, '-', '_'. Everything else — including any
    // '.', which is how a leftover ".." would otherwise survive — collapses
    // to '_'.
    base = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    if (!base) base = 'file';
    base = base.slice(0, 100);
    return base + ext;
  }

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
      // Stored path uses the SANITISED name (no separators, no '..', safe
      // charset) — the raw f.name never reaches the storage path. The
      // original f.name is kept below as the display `name`, so the
      // recipient still sees exactly what the sender called the file.
      var path = 'marketplace/agency/' + agencyId + '/thread/' + seed + '/' + safeFileName(f.name);
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
    validateFiles: validateFiles, safeFileName: safeFileName };
})();
