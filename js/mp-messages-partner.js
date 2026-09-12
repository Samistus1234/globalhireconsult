/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: partner inbox page script
   Loaded after js/mp-core.js and js/mp-messages.js on partners-messages.html.

   Contract notes honoured here (see mp-core.js / mp-messages.js):
   - MP.init() is not re-entrant → called EXACTLY once per page load.
   - MP.status === 'error' → requireAgency() returns false WITHOUT navigating,
     so this page renders its own error state (message + retry + sign-in link),
     matching the pattern in js/mp-dashboard.js.
   - No requireVerified() gate: an agency must be able to message GlobalHire
     at every status, including pending_verification — that is often the
     exact conversation that unblocks its own verification.
   - No Realtime. We poll on load, after open(), and after post() (via the
     open()/refreshList() calls already in this file) — nothing subscribes.
   - Every attribute value derived from agency data goes through
     MP.escAttr() (js/mp-core.js), not plain MP.esc(), because MP.esc()
     only neutralises text-node content and leaves quote characters intact —
     safe between tags, unsafe inside a quoted attribute.
   ============================================ */
(function () {
  var listEl = document.getElementById('mp-thread-list');
  var msgsEl = document.getElementById('mp-thread-messages');
  var subjEl = document.getElementById('mp-thread-subject');
  var form = document.getElementById('mp-reply-form');
  var bodyEl = document.getElementById('mp-messages-body');
  var errEl = document.getElementById('mp-error');
  if (!listEl || !form) return;
  var current = null;

  function esc(s) { return window.MP.esc(s); }
  function escAttr(s) { return window.MP.escAttr(s); }

  function renderError() {
    if (bodyEl) bodyEl.hidden = true;
    if (!errEl) return;
    errEl.hidden = false;
    errEl.innerHTML =
      '<div class="mp-card">' +
      '<h2>We couldn’t load your messages</h2>' +
      '<p>' + esc(window.MP.lastError) + '</p>' +
      '<p><button type="button" class="mp-btn" id="mp-retry">Retry</button>' +
      '<a class="mp-link" href="login.html">Sign in again</a></p>' +
      '</div>';
    var b = document.getElementById('mp-retry');
    if (b) b.onclick = function () { window.location.reload(); };
  }

  async function refreshList() {
    var out = await window.MPMsg.listThreads(window.MP.membership.agency_id);
    if (out.error) {
      listEl.innerHTML = '<p class="mp-empty">' + esc(out.error) + '</p>';
      return;
    }
    listEl.innerHTML = out.rows.length
      ? out.rows.map(function (t) {
          // t.id is a server-generated UUID (thread primary key), not agency
          // free text — but it still lands in a data-* attribute, so it goes
          // through escAttr() for defense in depth rather than plain esc().
          // t.subject IS agency-authored free text; it's rendered as element
          // text content here (between the tags), so esc() is the correct
          // (and sufficient) escape for that position.
          // t.agency_unread is a DB integer count, not free text — safe to
          // interpolate as-is; esc() is applied anyway for a uniform rule.
          return '<button type="button" class="mp-thread-item" data-id="' + escAttr(t.id) + '">' +
                 '<span class="mp-thread-item-subject">' + esc(t.subject) + '</span>' +
                 (t.agency_unread > 0 ? ' <span class="mp-badge">' + esc(t.agency_unread) + '</span>' : '') +
                 '</button>';
        }).join('')
      : '<p class="mp-empty">No messages yet. GlobalHire will reach out here if anything is needed.</p>';
    Array.prototype.forEach.call(listEl.querySelectorAll('.mp-thread-item'), function (b) {
      b.addEventListener('click', function () {
        var subjectEl = b.querySelector('.mp-thread-item-subject');
        open(b.getAttribute('data-id'), subjectEl ? subjectEl.textContent : 'Conversation');
      });
    });
  }

  async function open(id, subject) {
    current = id;
    // .textContent, not .innerHTML — inherently safe regardless of content,
    // no escaping needed (the browser never parses this as markup).
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
    var r = await window.MPMsg.post(current, window.MP.membership.agency_id, body, files);
    if (r.error) { status.textContent = r.error; return; }
    status.textContent = 'Sent.';
    document.getElementById('mp-reply-body').value = '';
    document.getElementById('mp-reply-files').value = '';
    open(current, subjEl.textContent);
  });

  // Any constraint failure must be visible, not a silent cancelled submit.
  form.addEventListener('invalid', function (e) {
    var status = document.getElementById('mp-reply-msg');
    if (status && e.target) status.textContent = 'Not sent — ' + e.target.validationMessage;
  }, true);

  (async function () {
    await window.MP.init();
    if (window.MP.status === 'error') { renderError(); return; }
    // No requireVerified() here on purpose: an agency must be able to reach
    // GlobalHire at every status, including pending_verification.
    if (!window.MP.requireAgency({ to: 'partners-signup.html' })) return;
    refreshList();
    var pre = new URLSearchParams(location.search).get('thread');
    if (pre) open(pre, 'Conversation');
  })();
})();
