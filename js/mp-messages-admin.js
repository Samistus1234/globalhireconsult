/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: admin cross-agency inbox
   Loaded after js/mp-core.js and js/mp-messages.js on admin-mp-messages.html.

   Mirrors js/mp-messages-partner.js. Differences from the partner page:
   - Threads are listed UNFILTERED by agency — admins see every agency's
     conversations, not just one.
   - The list defaults to "Needs a reply" (gh_unread > 0); a second option
     shows everything.
   - Each row is labelled with the agency name, since an admin can't infer
     "whose thread is this" the way a single-agency partner user can.
   - Page is gated by js/auth-guard.js (data-auth-role="admin"), NOT by
     MP.requireAgency()/requireVerified() — an admin has no agency
     membership, so those guards would bounce staff to the partner signup
     flow. MP.mpFrom() needs no membership and is safe to use here.

   Escaping (see js/mp-core.js MP.esc / MP.escAttr contract comment):
   - names[t.agency_id] is AGENCY-AUTHORED free text (the exact value that
     caused the email-injection defect earlier in this branch) rendered as
     element TEXT content → MP.esc().
   - t.subject is agency-authored free text, also rendered as text content
     → MP.esc().
   - t.id / t.agency_id are server-generated UUIDs but land in data-*
     ATTRIBUTE values → MP.escAttr(), for defense in depth (matches the
     pattern already used in js/mp-messages.js / js/mp-messages-partner.js).
   ============================================ */
(function () {
  var listEl = document.getElementById('mp-thread-list');
  var filter = document.getElementById('mp-msg-filter');
  var msgsEl = document.getElementById('mp-thread-messages');
  var subjEl = document.getElementById('mp-thread-subject');
  var form = document.getElementById('mp-reply-form');
  if (!listEl || !form || !filter) return;
  var current = null, currentAgency = null;

  function esc(s) { return window.MP.esc(s); }
  function escAttr(s) { return window.MP.escAttr(s); }

  async function refreshList() {
    var r = await window.MP.mpFrom('threads')
      .select('id, agency_id, subject, gh_unread, last_message_at')
      .order('last_message_at', { ascending: false });
    if (r.error) {
      listEl.innerHTML = '<p class="mp-empty">' + esc(r.error.message) + '</p>';
      return;
    }
    var rows = r.data || [];
    if (filter.value === 'unread') rows = rows.filter(function (t) { return t.gh_unread > 0; });

    var names = {};
    var ar = await window.MP.mpFrom('agencies').select('id, name');
    (ar.data || []).forEach(function (a) { names[a.id] = a.name; });

    listEl.innerHTML = rows.length
      ? rows.map(function (t) {
          // names[t.agency_id] and t.subject are agency-authored free text —
          // both land as element TEXT content here, so esc() (not escAttr())
          // is the correct and sufficient escape. t.id / t.agency_id land in
          // data-* ATTRIBUTE values, so they go through escAttr().
          return '<button type="button" class="mp-thread-item" data-id="' + escAttr(t.id) +
                 '" data-agency="' + escAttr(t.agency_id) + '">' +
                 '<strong>' + esc(names[t.agency_id] || 'Agency') + '</strong><br>' +
                 '<span class="mp-thread-item-subject">' + esc(t.subject) + '</span>' +
                 (t.gh_unread > 0 ? ' <span class="mp-badge">' + esc(t.gh_unread) + '</span>' : '') +
                 '</button>';
        }).join('')
      : '<p class="mp-empty">Nothing waiting on a reply.</p>';

    Array.prototype.forEach.call(listEl.querySelectorAll('.mp-thread-item'), function (b) {
      b.addEventListener('click', function () {
        var subjectEl = b.querySelector('.mp-thread-item-subject');
        open(b.getAttribute('data-id'), b.getAttribute('data-agency'), subjectEl ? subjectEl.textContent : 'Conversation');
      });
    });
  }

  async function open(id, agencyId, subject) {
    current = id;
    currentAgency = agencyId || null;
    // Deep links (?thread=<id>) arrive with no known agency — resolve it so
    // a reply with an attachment uploads to the correct agency-prefixed
    // storage path (MPMsg.post()/uploadAttachments() need a real agency id,
    // not null, or the upload's storage path — and the RLS check on it —
    // is wrong).
    if (!currentAgency) {
      var tr = await window.MP.mpFrom('threads').select('agency_id').eq('id', id).maybeSingle();
      currentAgency = (tr && tr.data) ? tr.data.agency_id : null;
    }
    // .textContent, not .innerHTML — inherently safe regardless of content.
    subjEl.textContent = subject;
    var out = await window.MPMsg.loadThread(id);
    if (out.error) {
      msgsEl.innerHTML = '<p class="mp-empty">' + esc(out.error) + '</p>';
      form.hidden = true;
      return;
    }
    window.MPMsg.renderThread(msgsEl, out.rows);
    form.hidden = false;
    await window.MPMsg.markRead(id);
    refreshList();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var status = document.getElementById('mp-reply-msg');
    status.textContent = 'Sending…';
    var body = document.getElementById('mp-reply-body').value.trim();
    var files = document.getElementById('mp-reply-files').files;
    var r = await window.MPMsg.post(current, currentAgency, body, files);
    if (r.error) { status.textContent = r.error; return; }
    status.textContent = 'Sent.';
    document.getElementById('mp-reply-body').value = '';
    document.getElementById('mp-reply-files').value = '';
    open(current, currentAgency, subjEl.textContent);
  });

  // Any constraint failure must be visible, not a silent cancelled submit.
  form.addEventListener('invalid', function (e) {
    var status = document.getElementById('mp-reply-msg');
    if (status && e.target) status.textContent = 'Not sent — ' + e.target.validationMessage;
  }, true);

  filter.addEventListener('change', refreshList);
  window.addEventListener('gh:auth-ready', function () {
    window.MP.init().then(function () {
      refreshList();
      var pre = new URLSearchParams(location.search).get('thread');
      if (pre) open(pre, null, 'Conversation');
    });
  });
})();
