/* ============================================
   GLOBALHIRE@ELAB — Recruiter Chat
   Chat with the eLab team from the recruiter
   portal (tab-messages). Backed by the `chat`
   edge function + globalhire.chat_* tables.
   ============================================ */

(function () {
  'use strict';

  var sb = window.ghSupabase;
  var currentProfile = null;
  var currentUser = null;
  var activeThreadId = null;
  var activePeer = null;
  var allPeers = [];

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
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' });
  }

  function chatInvoke(payload) {
    return sb.functions.invoke('chat', { body: payload });
  }

  // ── Conversation list ──
  async function loadThreads(silent) {
    var { data, error } = await chatInvoke({ action: 'list' });
    if (error) {
      if (!silent) console.error('chat list error:', error);
      return;
    }
    var threads = (data && data.threads) || [];
    var countEl = document.getElementById('rec-chat-conv-count');
    if (countEl) countEl.textContent = threads.length + ' conversation' + (threads.length === 1 ? '' : 's');

    // Unread total → sidebar badge
    var totalUnread = threads.reduce(function (acc, t) { return acc + (t.unread || 0); }, 0);
    var badge = document.getElementById('rec-chat-badge');
    if (badge) {
      if (totalUnread > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = totalUnread;
      } else {
        badge.style.display = 'none';
      }
    }

    var listEl = document.getElementById('rec-chat-conv-list');
    if (!listEl) return;
    if (threads.length === 0) {
      listEl.innerHTML = '<div class="chat-empty">No conversations yet.<br><span style="font-size:var(--text-xs);color:var(--text-tertiary);">Use "Message eLab" to reach the team.</span></div>';
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
      el.addEventListener('click', function () { openThread(el.dataset.thread); });
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
    var pane = document.getElementById('rec-chat-thread-pane');
    if (!pane) return;
    var c = avatarColors(peer);

    var head =
      '<div class="chat-thread-head">' +
        '<div class="chat-conv-avatar" style="background:' + c.bg + ';color:' + c.fg + ';">' + escapeHtml(initials(peer.full_name)) + '</div>' +
        '<div>' +
          '<div class="chat-thread-title">' + escapeHtml(peer.full_name) + '</div>' +
          '<div class="chat-thread-sub">' + escapeHtml(roleLabel(peer.role)) + ' · eLab placement team</div>' +
        '</div>' +
      '</div>';

    var body;
    if (!messages || messages.length === 0) {
      body = '<div class="chat-empty">No messages yet. Say hello 👋</div>';
    } else {
      body = '<div class="chat-thread-body" id="rec-chat-msg-body">' + messages.map(function (m) {
        var mine = m.sender_id === currentUser.id;
        return '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '">' +
          escapeHtml(m.body) +
          '<div class="chat-msg-meta">' + fmtTime(m.created_at) + (m.read_at ? ' · ✓✓' : '') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var composer =
      '<div class="chat-composer">' +
        '<textarea id="rec-chat-composer-input" placeholder="Type a message… (Enter to send, Shift+Enter for new line)"></textarea>' +
        '<button class="chat-send-btn" id="rec-chat-send-btn">Send</button>' +
      '</div>';

    pane.innerHTML = head + body + composer;

    var input = document.getElementById('rec-chat-composer-input');
    var sendBtn = document.getElementById('rec-chat-send-btn');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
      input.focus();
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (body.indexOf('rec-chat-msg-body') !== -1) {
      var msgBody = document.getElementById('rec-chat-msg-body');
      msgBody.scrollTop = msgBody.scrollHeight;
    }
  }

  // ── Send ──
  async function sendMessage() {
    var input = document.getElementById('rec-chat-composer-input');
    var sendBtn = document.getElementById('rec-chat-send-btn');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    if (sendBtn) sendBtn.disabled = true;

    var payload = { action: 'send', body: text };
    if (activeThreadId) payload.thread_id = activeThreadId;
    else if (activePeer) payload.peer_id = activePeer.id;
    else { if (sendBtn) sendBtn.disabled = false; return; }

    var { data, error } = await chatInvoke(payload);
    if (sendBtn) sendBtn.disabled = false;
    if (error) {
      console.error('chat send error:', error);
      alert('Failed to send: ' + (error.message || 'Unknown error'));
      return;
    }
    input.value = '';
    if (!activeThreadId && data && data.thread_id) {
      await openThread(data.thread_id);
    } else if (data && data.message) {
      appendMessage(data.message);
      loadThreads(true);
    }
  }

  function appendMessage(message) {
    var body = document.getElementById('rec-chat-msg-body');
    if (!body) return;
    var mine = message.sender_id === currentUser.id;
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (mine ? 'mine' : 'theirs');
    div.innerHTML = escapeHtml(message.body) +
      '<div class="chat-msg-meta">' + fmtTime(message.created_at) + (message.read_at ? ' · ✓✓' : '') + '</div>';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  // ── New Chat (pick an eLab staff member) ──
  async function openNewChatModal() {
    var overlay = document.getElementById('rec-chat-modal-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    var listEl = document.getElementById('rec-chat-peer-list');
    listEl.innerHTML = '<div class="chat-empty">Loading…</div>';
    document.getElementById('rec-chat-peer-search').value = '';

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
    var listEl = document.getElementById('rec-chat-peer-list');
    if (!listEl) return;
    if (peers.length === 0) {
      listEl.innerHTML = '<div class="chat-empty">No eLab staff found.</div>';
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
        var peer = allPeers.find(function (p) { return p.id === el.dataset.peer; });
        if (!peer) return;
        document.getElementById('rec-chat-modal-overlay').classList.remove('open');
        activeThreadId = null;
        activePeer = peer;
        renderThreadPane(peer, []);
        document.querySelectorAll('.chat-conv').forEach(function (x) { x.classList.remove('active'); });
      });
    });
  }

  // ── Realtime ──
  function subscribeRealtime() {
    if (!sb || !currentUser) return;
    sb.channel('gh-chat-rec-' + currentUser.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'globalhire',
        table: 'chat_messages'
      }, function (payload) {
        var msg = payload.new;
        if (activeThreadId && msg.thread_id === activeThreadId) {
          appendMessage(msg);
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

    var overlay = document.getElementById('rec-chat-modal-overlay');
    if (overlay) {
      document.getElementById('rec-chat-modal-close').addEventListener('click', function () {
        overlay.classList.remove('open');
      });
      overlay.addEventListener('click', function (ev) { if (ev.target === this) this.classList.remove('open'); });
      var searchInput = document.getElementById('rec-chat-peer-search');
      searchInput.addEventListener('input', function () {
        var q = searchInput.value.trim().toLowerCase();
        var filtered = allPeers.filter(function (p) {
          return String(p.full_name || '').toLowerCase().indexOf(q) !== -1;
        });
        renderPeers(q ? filtered : allPeers);
      });
    }

    // "Message eLab" button in the conversation pane header
    var newBtn = document.getElementById('rec-chat-new-btn');
    if (newBtn) newBtn.addEventListener('click', openNewChatModal);

    await loadThreads();
    subscribeRealtime();

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
