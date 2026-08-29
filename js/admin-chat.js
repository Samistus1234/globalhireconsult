/* ============================================
   GLOBALHIRE@ELAB — Admin Chat
   Pair chat between eLab staff (admin) and
   recruiters / applicants. Backed by the `chat`
   edge function + globalhire.chat_* tables
   (schema-v25-chat.sql).
   ============================================ */

(function () {
  'use strict';

  var sb = window.ghSupabase;
  var currentProfile = null;
  var currentUser = null;
  var activeThreadId = null;
  var activePeer = null; // { id, full_name, role, avatar_initials, avatar_color_index } for a not-yet-created thread
  var allPeers = [];
  var pendingAttachment = null;
  var chatAuthRetried = false;
  var currentThreadPeer = null;
  var lastListRefresh = 0;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : String(str)));
    return div.innerHTML;
  }

  function avatarColors(profile) {
    var colors = GHE.avatarColors[(profile && profile.avatar_color_index) || 0] || GHE.avatarColors[0];
    return { bg: colors[0], fg: colors[1] };
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    var out = (parts[0] ? parts[0][0] : '') + (parts[parts.length - 1] ? parts[parts.length - 1][0] : '');
    return out.toUpperCase() || '?';
  }

  function roleLabel(role) {
    var map = { recruiter: 'Recruiter', applicant: 'Candidate', admin: 'eLab Staff' };
    return map[role] || (role || '');
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' });
  }

  function chatInvoke(payload) {
    return sb.functions.invoke('chat', { body: payload }).then(function (res) {
      // supabase-js v2 puts the raw Response in error.context on non-2xx;
      // parse it so the real server error reaches the UI (and the auth retry).
      if (res.error && res.error.context && typeof res.error.context.json === 'function') {
        return res.error.context.json().then(function (body) {
          var serverMsg = body && (body.error || body.message) || null;
          res.error = Object.assign({}, res.error, { serverMessage: serverMsg });
          return res;
        }).catch(function () {
          res.error = Object.assign({}, res.error, { serverMessage: null });
          return res;
        });
      }
      return res;
    });
  }

  // ── Admin sidebar ──
  function updateAdminUI() {
    var nameEl = document.getElementById('admin-user-name');
    var roleEl = document.getElementById('admin-user-role');
    var avatarEl = document.getElementById('admin-user-avatar');
    if (nameEl) nameEl.textContent = currentProfile.full_name || currentUser.email;
    if (roleEl) roleEl.textContent = 'Platform Admin';
    if (avatarEl) {
      avatarEl.textContent = initials(currentProfile.full_name);
      var c = avatarColors(currentProfile);
      avatarEl.style.background = c.bg;
      avatarEl.style.color = c.fg;
    }
    var signout = document.getElementById('admin-signout');
    if (signout) signout.addEventListener('click', function (e) { e.preventDefault(); GHAuth.signOut(); });
  }

  // ── Conversation list ──
  async function loadThreads(silent) {
    if (!silent && Date.now() - lastListRefresh < 4000) return; // debounce bursts
    lastListRefresh = Date.now();
    var { data, error } = await chatInvoke({ action: 'list' });
    if (error) {
      if (!silent) console.error('chat list error:', error);
      return;
    }
    var threads = (data && data.threads) || [];
    var countEl = document.getElementById('chat-conv-count');
    if (countEl) countEl.textContent = threads.length + ' conversation' + (threads.length === 1 ? '' : 's');

    var listEl = document.getElementById('chat-conv-list');
    if (threads.length === 0) {
      listEl.innerHTML = '<div class="chat-empty">No conversations yet.<br><span style="font-size:var(--text-xs);color:var(--text-tertiary);">Click "New Chat" to message a recruiter or candidate.</span></div>';
      return;
    }

    listEl.innerHTML = threads.map(function (t) {
      var c = avatarColors(t.peer);
      var active = t.thread_id === activeThreadId;
      return '<div class="chat-conv' + (active ? ' active' : '') + '" data-thread="' + t.thread_id + '">' +
        '<div class="chat-conv-avatar" style="background:' + c.bg + ';color:' + c.fg + ';">' + escapeHtml(initials(t.peer.full_name)) + '</div>' +
        '<div class="chat-conv-body">' +
          '<div class="chat-conv-top">' +
            '<span class="chat-conv-name">' + escapeHtml(t.peer.full_name) + '</span>' +
            '<span class="chat-conv-time">' + fmtTime(t.last_message_at) + '</span>' +
          '</div>' +
          '<div class="chat-conv-role">' + escapeHtml(roleLabel(t.peer.role)) + '</div>' +
          '<div class="chat-conv-preview">' + escapeHtml(t.last_message_preview || '') + '</div>' +
        '</div>' +
        (t.unread > 0 ? '<span class="chat-unread-badge">' + t.unread + '</span>' : '') +
      '</div>';
    }).join('');

    listEl.querySelectorAll('.chat-conv').forEach(function (el) {
      el.addEventListener('click', function () {
        openThread(el.dataset.thread);
      });
    });
  }

  // ── Thread view ──
  async function openThread(threadId) {
    activeThreadId = threadId;
    activePeer = null;
    var { data, error } = await chatInvoke({ action: 'thread', thread_id: threadId });
    if (error) {
      console.error('chat thread error:', error);
      return;
    }
    activePeer = data.thread.peer;
    renderThreadPane(data.thread.peer, data.messages || []);
    loadThreads(true);
  }

  function renderThreadPane(peer, messages) {
    var pane = document.getElementById('chat-thread-pane');
    var c = avatarColors(peer);
    currentThreadPeer = peer;
    var peerId = peer ? peer.id : (activePeer ? activePeer.id : null);

    var head =
      '<div class="chat-thread-head">' +
        '<div class="chat-conv-avatar" style="background:' + c.bg + ';color:' + c.fg + ';">' + escapeHtml(initials(peer.full_name)) + '</div>' +
        '<div class="chat-thread-head-main">' +
          '<div class="chat-thread-title">' + escapeHtml(peer.full_name) + '</div>' +
          '<div class="chat-thread-sub">' + escapeHtml(roleLabel(peer.role)) + (peer.role === 'recruiter' ? ' · eLab placement partner' : ' · GlobalHire applicant') + '</div>' +
        '</div>' +
        (activeThreadId ? '<button class="chat-email-btn" id="chat-email-btn" title="Email ' + escapeHtml(peer.full_name) + '">📧 Email</button>' : '') +
      '</div>';

    var body;
    if (!messages || messages.length === 0) {
      body = '<div class="chat-empty">No messages yet. Say hello 👋</div>';
    } else {
      body = '<div class="chat-thread-body" id="chat-msg-body">' + messages.map(function (m) {
        var mine = m.sender_id === currentUser.id;
        if (m.kind === 'email') {
          return '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + ' chat-msg-email">' +
            renderEmailEntry(m) +
            '<div class="chat-msg-meta">' + fmtTime(m.created_at) + '</div>' +
          '</div>';
        }
        return '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '">' +
          escapeHtml(m.body) +
          (m.attachment ? renderFileCard(m.id, m.attachment) : '') +
          '<div class="chat-msg-meta">' + fmtTime(m.created_at) + (m.read_at ? ' · ✓✓' : '') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var composer =
      '<div class="chat-composer">' +
        '<button class="chat-attach-btn" id="chat-attach-btn" title="Attach file">📎</button>' +
        '<textarea id="chat-composer-input" placeholder="Type a message… (Enter to send, Shift+Enter for new line)"></textarea>' +
        '<button class="chat-send-btn" id="chat-send-btn">Send</button>' +
      '</div>' +
      '<input type="file" id="chat-attach-input" style="display:none">';

    pane.innerHTML = head + body + composer;

    var input = document.getElementById('chat-composer-input');
    var sendBtn = document.getElementById('chat-send-btn');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      input.focus();
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    var attachBtn = document.getElementById('chat-attach-btn');
    var attachInput = document.getElementById('chat-attach-input');
    if (attachBtn && attachInput) {
      attachBtn.addEventListener('click', function () { attachInput.click(); });
      attachInput.addEventListener('change', function () { handleAttach(attachInput.files[0]); attachInput.value = ''; });
    }
    var emailBtn = document.getElementById('chat-email-btn');
    if (emailBtn) emailBtn.addEventListener('click', openEmailModal);

    pane.querySelectorAll('.chat-file-card').forEach(bindFileCard);

    if (body.indexOf('chat-msg-body') !== -1) {
      var msgBody = document.getElementById('chat-msg-body');
      msgBody.scrollTop = msgBody.scrollHeight;
    }
  }

  function renderEmptyThread() {
    activeThreadId = null;
    activePeer = null;
    var pane = document.getElementById('chat-thread-pane');
    pane.innerHTML = '<div class="chat-empty" id="chat-thread-empty">' +
      '<div style="text-align:center;">' +
        '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:var(--space-3);"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
        '<div style="font-weight:600;color:var(--text-secondary);">Select a conversation</div>' +
        '<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:4px;">Chat with recruiters and candidates — or start a new one.</div>' +
      '</div></div>';
  }

  // ── Send ──
  async function sendMessage() {
    var input = document.getElementById('chat-composer-input');
    var sendBtn = document.getElementById('chat-send-btn');
    if (!input) return;
    var text = input.value.trim();
    if (!text && !pendingAttachment) return;
    if (sendBtn) sendBtn.disabled = true;

    var payload = { action: 'send', body: text };
    if (pendingAttachment) payload.attachment = pendingAttachment;
    if (activeThreadId) {
      payload.thread_id = activeThreadId;
    } else if (activePeer) {
      payload.peer_id = activePeer.id;
    } else {
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    var { data, error } = await chatInvoke(payload);
    if (sendBtn) sendBtn.disabled = false;
    if (error) {
      console.error('chat send error:', error);
      var realErr = error.serverMessage || error.message || 'Unknown error';
      // Session may have expired mid-use: refresh once and retry before giving up
      if (!chatAuthRetried && /authorization|Missing or invalid|expired|unauthorized|401/i.test(realErr)) {
        chatAuthRetried = true;
        var { error: refErr } = await sb.auth.refreshSession();
        if (!refErr) return sendMessage();
      }
      chatAuthRetried = false;
      alert('Failed to send: ' + realErr);
      return;
    }
    chatAuthRetried = false;
    input.value = '';
    pendingAttachment = null;
    if (!activeThreadId && data && data.thread_id) {
      await openThread(data.thread_id);
    } else if (data && data.message) {
      appendMessage(data.message);
      loadThreads(true);
    }
  }

  function appendMessage(message) {
    var body = document.getElementById('chat-msg-body');
    if (!body) return;
    var mine = message.sender_id === currentUser.id;
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (mine ? 'mine' : 'theirs');
    div.innerHTML = (message.kind === 'email' ? renderEmailEntry(message) : escapeHtml(message.body) +
      (message.attachment ? renderFileCard(message.id, message.attachment) : '')) +
      '<div class="chat-msg-meta">' + fmtTime(message.created_at) + (message.read_at ? ' · ✓✓' : '') + '</div>';
    body.appendChild(div);
    var newCard = div.querySelector('.chat-file-card');
    if (newCard) bindFileCard(newCard);
    body.scrollTop = body.scrollHeight;
  }

  // ── New Chat modal ──
  async function openNewChatModal() {
    var overlay = document.getElementById('chat-modal-overlay');
    overlay.classList.add('open');
    var listEl = document.getElementById('chat-peer-list');
    listEl.innerHTML = '<div class="chat-empty">Loading…</div>';
    document.getElementById('chat-peer-search').value = '';

    if (allPeers.length === 0) {
      var { data, error } = await chatInvoke({ action: 'peers' });
      if (error) {
        listEl.innerHTML = '<div class="chat-empty">' + escapeHtml(error.message || 'Failed to load') + '</div>';
        return;
      }
      allPeers = (data && data.peers) || [];
    }
    renderPeers(allPeers);
  }

  function renderPeers(peers) {
    var listEl = document.getElementById('chat-peer-list');
    if (peers.length === 0) {
      listEl.innerHTML = '<div class="chat-empty">No recruiters or candidates found.</div>';
      return;
    }
    listEl.innerHTML = peers.map(function (p) {
      var c = avatarColors(p);
      return '<div class="chat-peer" data-peer="' + p.id + '">' +
        '<div class="chat-conv-avatar" style="background:' + c.bg + ';color:' + c.fg + ';">' + escapeHtml(initials(p.full_name)) + '</div>' +
        '<div>' +
          '<div class="chat-peer-name">' + escapeHtml(p.full_name) + '</div>' +
          '<div class="chat-peer-role">' + escapeHtml(roleLabel(p.role)) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    listEl.querySelectorAll('.chat-peer').forEach(function (el) {
      el.addEventListener('click', function () {
        var pid = el.dataset.peer;
        var peer = allPeers.find(function (p) { return p.id === pid; });
        if (!peer) return;
        document.getElementById('chat-modal-overlay').classList.remove('open');
        startPendingThread(peer);
      });
    });
  }

  function startPendingThread(peer) {
    activeThreadId = null;
    activePeer = peer;
    renderThreadPane(peer, []);
    // Highlight nothing in the list (pending thread not yet persisted)
    document.querySelectorAll('.chat-conv').forEach(function (el) { el.classList.remove('active'); });
  }

  // ── Realtime: live-update on new messages ──
  // ── Attachments ──
  function fileIcon(mime) {
    if (!mime) return '📄';
    if (mime.indexOf('image/') === 0) return '🖼️';
    if (mime === 'application/pdf') return '📕';
    if (mime.indexOf('word') !== -1 || mime.indexOf('msword') !== -1) return '📝';
    if (mime.indexOf('sheet') !== -1 || mime.indexOf('excel') !== -1 || mime === 'text/csv') return '📊';
    if (mime.indexOf('zip') !== -1 || mime.indexOf('compressed') !== -1) return '📦';
    return '📄';
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderFileCard(messageId, att) {
    return '<div class="chat-file-card" data-mid="' + messageId + '">' +
      '<span class="chat-file-icon">' + fileIcon(att.mime) + '</span>' +
      '<span class="chat-file-meta">' +
        '<span class="chat-file-name">' + escapeHtml(att.name) + '</span>' +
        '<span class="chat-file-size">' + fmtBytes(att.size) + '</span>' +
      '</span>' +
      '<span class="chat-file-dl">Download</span>' +
    '</div>';
  }

  function bindFileCard(el) {
    el.addEventListener('click', function () { downloadFile(el.dataset.mid); });
  }

  async function downloadFile(messageId) {
    var { data, error } = await chatInvoke({ action: 'download-url', message_id: messageId });
    if (error) {
      console.error('download-url error:', error);
      alert('Failed to get download link: ' + (error.message || 'Unknown error'));
      return;
    }
    window.open(data.url, '_blank');
  }

  async function handleAttach(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('File too large (max 10 MB)'); return; }
    var attachBtn = document.getElementById('chat-attach-btn');
    if (attachBtn) attachBtn.disabled = true;
    try {
      var { data, error } = await chatInvoke({
        action: 'upload-url',
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        size: file.size
      });
      if (error) throw new Error(error.message || 'Failed to request upload URL');
      var up = await sb.storage.from('chat-files').uploadToSignedUrl(data.storage_path, data.token, file);
      if (up.error) throw new Error(up.error.message || 'Upload failed');
      pendingAttachment = {
        storage_path: data.storage_path,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size
      };
      await sendMessage();
    } catch (e) {
      console.error('attach error:', e);
      alert('Failed to attach file: ' + e.message);
    } finally {
      if (attachBtn) attachBtn.disabled = false;
    }
  }

  function renderEmailEntry(m) {
    var meta = m.email_meta || {};
    return '<div class="chat-email-card">' +
      '<span class="chat-email-icon">📧</span>' +
      '<span class="chat-email-meta">' +
        '<span class="chat-email-subject">' + escapeHtml(meta.subject || 'Email') + '</span>' +
        '<span class="chat-email-to">to ' + escapeHtml(meta.to_email || '') + '</span>' +
      '</span>' +
    '</div>';
  }
  function ensureEmailModal() {
    var m = document.getElementById('chat-email-modal');
    if (m) return;
    var d = document.createElement('div');
    d.id = 'chat-email-modal';
    d.className = 'chat-modal-overlay';
    d.innerHTML =
      '<div class="chat-modal">' +
        '<div class="chat-modal-head"><div class="chat-modal-title">📧 Send email</div><button class="chat-modal-close" id="chat-email-cancel">✕</button></div>' +
        '<div class="chat-modal-body" style="padding:var(--space-4) var(--space-5);overflow:auto;">' +
          '<div class="chat-email-to-label" id="chat-email-to-label"></div>' +
          '<input class="chat-email-input" id="chat-email-subject" placeholder="Subject" maxlength="150">' +
          '<textarea class="chat-email-input chat-email-body" id="chat-email-body" placeholder="Write your message…" maxlength="5000"></textarea>' +
          '<div style="display:flex;justify-content:flex-end;gap:var(--space-2);">' +
            '<button class="chat-btn" id="chat-email-cancel2">Cancel</button>' +
            '<button class="chat-btn chat-btn-primary" id="chat-email-send">Send email</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
    document.getElementById('chat-email-cancel').addEventListener('click', closeEmailModal);
    document.getElementById('chat-email-cancel2').addEventListener('click', closeEmailModal);
    document.getElementById('chat-email-send').addEventListener('click', sendEmail);
  }
  function openEmailModal() {
    if (!activeThreadId) { alert('Open a conversation first'); return; }
    ensureEmailModal();
    var label = document.getElementById('chat-email-to-label');
    if (label && currentThreadPeer) label.textContent = 'To: ' + currentThreadPeer.full_name;
    document.getElementById('chat-email-modal').classList.add('open');
    var sub = document.getElementById('chat-email-subject');
    if (sub) sub.focus();
  }
  function closeEmailModal() {
    var m = document.getElementById('chat-email-modal');
    if (!m) return;
    m.classList.remove('open');
    var sub = document.getElementById('chat-email-subject');
    var bod = document.getElementById('chat-email-body');
    if (sub) sub.value = '';
    if (bod) bod.value = '';
  }
  async function sendEmail() {
    var subject = document.getElementById('chat-email-subject').value.trim();
    var emBody = document.getElementById('chat-email-body').value.trim();
    if (!subject || !emBody) { alert('Subject and message are required'); return; }
    var btn = document.getElementById('chat-email-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    var { data, error } = await chatInvoke({ action: 'email-peer', thread_id: activeThreadId, subject: subject, body: emBody });
    if (btn) { btn.disabled = false; btn.textContent = 'Send email'; }
    if (error) {
      var realErr = error.serverMessage || error.message || 'Unknown error';
      alert('Failed to send email: ' + realErr);
      return;
    }
    closeEmailModal();
    if (activeThreadId) loadThread(activeThreadId);
    loadThreads(true);
  }
  function subscribeRealtime() {
    if (!sb || !currentUser) return;
    sb.channel('gh-chat-' + currentUser.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'globalhire',
        table: 'chat_messages'
      }, function (payload) {
        var msg = payload.new;
        if (activeThreadId && msg.thread_id === activeThreadId) {
          appendMessage(msg); // optimistic — full reload follows
          loadThreads(true);
        } else {
          loadThreads(true);
        }
      })
      .subscribe();
  }

  // ── Init ──
  window.addEventListener('gh:auth-ready', async function (e) {
    currentProfile = e.detail.profile;
    currentUser = e.detail.session.user;
    updateAdminUI();

    document.getElementById('btn-new-chat').addEventListener('click', openNewChatModal);
    document.getElementById('chat-modal-close').addEventListener('click', function () {
      document.getElementById('chat-modal-overlay').classList.remove('open');
    });
    document.getElementById('chat-modal-overlay').addEventListener('click', function (ev) {
      if (ev.target === this) this.classList.remove('open');
    });
    var searchInput = document.getElementById('chat-peer-search');
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      var filtered = allPeers.filter(function (p) {
        return String(p.full_name || '').toLowerCase().indexOf(q) !== -1;
      });
      renderPeers(q ? filtered : allPeers);
    });

    renderEmptyThread();
    await loadThreads();
    subscribeRealtime();

    // Safety-net polling (10s) in case Realtime delivery is delayed
    setInterval(function () {
      if (!document.hidden) {
        loadThreads(true);
        if (activeThreadId) {
          chatInvoke({ action: 'thread', thread_id: activeThreadId }).then(function ({ data, error }) {
            if (!error && data) renderThreadPane(data.thread.peer, data.messages || []);
          });
        }
      }
    }, 10000);
  });

})();
