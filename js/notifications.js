/* ============================================
   GLOBALHIRE@ELAB — Notification Bell
   Fetches recent activity, renders dropdown
   Works on both admin dashboard & applicant portal
   ============================================ */

(function () {
  'use strict';

  // ── Detect context ──
  var isAdmin = document.body.getAttribute('data-auth-role') === 'admin';
  var isPortal = document.body.getAttribute('data-auth-role') === 'applicant';

  // ── Relative time helper ──
  function relativeTime(dateStr) {
    if (!dateStr) return '';
    var now = Date.now();
    var then = new Date(dateStr).getTime();
    var diff = Math.max(0, now - then);
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    if (hr < 48) return 'yesterday';
    var days = Math.floor(hr / 24);
    return days + ' days ago';
  }

  // ── SVG icons ──
  var ICONS = {
    person: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    message: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>'
  };

  // ── Build dropdown DOM ──
  function buildDropdown(bellBtn) {
    var dd = document.createElement('div');
    dd.className = 'notif-dropdown';
    dd.id = 'notif-dropdown';
    dd.innerHTML =
      '<div class="notif-header">' +
        '<span>Notifications</span>' +
        '<button class="notif-mark-read" id="notif-mark-read-btn">Mark all read</button>' +
      '</div>' +
      '<div class="notif-list" id="notif-list"></div>' +
      '<a class="notif-footer" href="' + (isAdmin ? 'messages.html' : '#') + '">View All</a>';

    // Position relative to the bell button's parent
    var wrapper = bellBtn.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
    }
    bellBtn.insertAdjacentElement('afterend', dd);
    return dd;
  }

  // ── Inject CSS ──
  function injectStyles() {
    var style = document.createElement('style');
    style.textContent =
      '.notif-dropdown {' +
        'position: absolute;' +
        'top: calc(100% + 8px);' +
        'right: 0;' +
        'width: 340px;' +
        'max-height: 440px;' +
        'background: var(--bg-surface);' +
        'border: 1px solid var(--border-default);' +
        'border-radius: var(--radius-lg);' +
        'box-shadow: var(--shadow-xl);' +
        'z-index: var(--z-modal);' +
        'display: none;' +
        'flex-direction: column;' +
        'opacity: 0;' +
        'transform: translateY(-8px);' +
        'transition: opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out);' +
        'overflow: hidden;' +
      '}' +
      '.notif-dropdown.open {' +
        'display: flex;' +
        'opacity: 1;' +
        'transform: translateY(0);' +
      '}' +
      '.notif-header {' +
        'display: flex;' +
        'align-items: center;' +
        'justify-content: space-between;' +
        'padding: var(--space-4) var(--space-5);' +
        'border-bottom: 1px solid var(--border-subtle);' +
        'font-weight: 700;' +
        'font-size: var(--text-sm);' +
        'color: var(--text-primary);' +
      '}' +
      '.notif-mark-read {' +
        'background: none;' +
        'border: none;' +
        'color: var(--primary);' +
        'font-size: var(--text-xs);' +
        'font-weight: 600;' +
        'cursor: pointer;' +
        'padding: var(--space-1) var(--space-2);' +
        'border-radius: var(--radius-sm);' +
        'transition: background var(--duration-fast);' +
      '}' +
      '.notif-mark-read:hover {' +
        'background: var(--primary-muted);' +
      '}' +
      '.notif-list {' +
        'flex: 1;' +
        'overflow-y: auto;' +
        'max-height: 340px;' +
      '}' +
      '.notif-item {' +
        'display: flex;' +
        'align-items: flex-start;' +
        'gap: var(--space-3);' +
        'padding: var(--space-3) var(--space-5);' +
        'cursor: pointer;' +
        'transition: background var(--duration-fast);' +
        'text-decoration: none;' +
        'color: inherit;' +
        'border-bottom: 1px solid var(--border-subtle);' +
      '}' +
      '.notif-item:hover {' +
        'background: var(--bg-hover);' +
      '}' +
      '.notif-item.unread {' +
        'background: var(--primary-muted);' +
      '}' +
      '.notif-item.unread:hover {' +
        'background: var(--bg-hover);' +
      '}' +
      '.notif-item-icon {' +
        'width: 32px;' +
        'height: 32px;' +
        'border-radius: var(--radius-md);' +
        'display: flex;' +
        'align-items: center;' +
        'justify-content: center;' +
        'flex-shrink: 0;' +
        'margin-top: 2px;' +
      '}' +
      '.notif-item-icon.icon-person { background: var(--primary-muted); color: var(--primary); }' +
      '.notif-item-icon.icon-file { background: var(--secondary-muted); color: var(--secondary); }' +
      '.notif-item-icon.icon-calendar { background: rgba(0,212,255,0.12); color: var(--accent-cyan); }' +
      '.notif-item-icon.icon-message { background: rgba(46,196,182,0.12); color: var(--success); }' +
      '.notif-item-icon.icon-check { background: rgba(46,196,182,0.12); color: var(--success); }' +
      '.notif-item-body {' +
        'flex: 1;' +
        'min-width: 0;' +
      '}' +
      '.notif-item-text {' +
        'font-size: var(--text-sm);' +
        'color: var(--text-primary);' +
        'line-height: 1.4;' +
        'display: -webkit-box;' +
        '-webkit-line-clamp: 2;' +
        '-webkit-box-orient: vertical;' +
        'overflow: hidden;' +
      '}' +
      '.notif-item-time {' +
        'font-size: var(--text-xs);' +
        'color: var(--text-tertiary);' +
        'margin-top: 2px;' +
      '}' +
      '.notif-footer {' +
        'display: block;' +
        'text-align: center;' +
        'padding: var(--space-3);' +
        'font-size: var(--text-xs);' +
        'font-weight: 600;' +
        'color: var(--primary);' +
        'text-decoration: none;' +
        'border-top: 1px solid var(--border-subtle);' +
        'transition: background var(--duration-fast);' +
      '}' +
      '.notif-footer:hover {' +
        'background: var(--bg-hover);' +
      '}' +
      '.notif-empty {' +
        'padding: var(--space-8) var(--space-5);' +
        'text-align: center;' +
        'color: var(--text-tertiary);' +
        'font-size: var(--text-sm);' +
      '}' +
      /* Badge count on bell */
      '.notification-btn { position: relative; }' +
      '.notif-dot {' +
        'position: absolute;' +
        'top: 4px;' +
        'right: 4px;' +
        'min-width: 16px;' +
        'height: 16px;' +
        'border-radius: 999px;' +
        'background: var(--accent-coral);' +
        'color: #fff;' +
        'font-size: 10px;' +
        'font-weight: 700;' +
        'display: flex;' +
        'align-items: center;' +
        'justify-content: center;' +
        'padding: 0 4px;' +
        'line-height: 1;' +
      '}' +
      '.notif-dot.hidden { display: none; }';
    document.head.appendChild(style);
  }

  // ── Fetch admin notifications ──
  async function fetchAdminNotifications() {
    var items = [];
    var cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // 1. New applicants
    try {
      var { data } = await window.ghFrom('profiles')
        .select('id, full_name, created_at')
        .eq('role', 'applicant')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach(function (r) {
          items.push({
            icon: 'person',
            text: 'New applicant: ' + (r.full_name || 'Unknown'),
            time: r.created_at,
            href: 'candidates.html'
          });
        });
      }
    } catch (e) { /* skip */ }

    // 2. New documents
    try {
      var { data } = await window.ghFrom('documents')
        .select('id, doc_type, uploaded_at, applicant_id')
        .gte('uploaded_at', cutoff)
        .order('uploaded_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach(function (r) {
          items.push({
            icon: 'file',
            text: 'New document uploaded: ' + (r.doc_type || 'Document'),
            time: r.uploaded_at,
            href: 'documents.html'
          });
        });
      }
    } catch (e) { /* skip */ }

    // 3. New consultations (non-gh table)
    try {
      var { data } = await window.ghSupabase
        .from('elab_complete_consultations')
        .select('id, full_name, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach(function (r) {
          items.push({
            icon: 'calendar',
            text: 'New consultation: ' + (r.full_name || 'Client'),
            time: r.created_at,
            href: 'elab-complete-admin.html'
          });
        });
      }
    } catch (e) { /* skip */ }

    // 4. Unread messages
    try {
      var { data } = await window.ghFrom('messages')
        .select('id, body, created_at')
        .eq('direction', 'inbound')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach(function (r) {
          var preview = (r.body || '').substring(0, 60);
          items.push({
            icon: 'message',
            text: 'New message: ' + (preview || 'Message received'),
            time: r.created_at,
            href: 'messages.html'
          });
        });
      }
    } catch (e) { /* skip */ }

    return items;
  }

  // ── Fetch portal (applicant) notifications ──
  async function fetchPortalNotifications() {
    var items = [];
    var sb = window.ghSupabase;
    if (!sb) return items;

    // Get current user
    var sess = await sb.auth.getSession();
    var user = sess && sess.data && sess.data.session && sess.data.session.user;
    if (!user) return items;
    var uid = user.id;

    // 1. Messages from eLab team (outbound messages TO the applicant)
    try {
      var { data } = await window.ghFrom('messages')
        .select('id, body, created_at')
        .eq('applicant_id', uid)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach(function (r) {
          var preview = (r.body || '').substring(0, 60);
          items.push({
            icon: 'message',
            text: 'Message from eLab: ' + (preview || 'New message'),
            time: r.created_at,
            href: '#',
            tab: 'tab-messages'
          });
        });
      }
    } catch (e) { /* skip */ }

    // 2. Document status changes (verified/rejected)
    try {
      var { data } = await window.ghFrom('documents')
        .select('id, doc_type, status, updated_at')
        .eq('applicant_id', uid)
        .neq('status', 'pending')
        .order('updated_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach(function (r) {
          var statusText = r.status === 'verified' ? 'verified' : r.status === 'rejected' ? 'rejected' : r.status;
          items.push({
            icon: r.status === 'verified' ? 'check' : 'file',
            text: (r.doc_type || 'Document') + ' has been ' + statusText,
            time: r.updated_at,
            href: '#',
            tab: 'tab-documents'
          });
        });
      }
    } catch (e) { /* skip */ }

    return items;
  }

  // ── Render notification items ──
  function renderItems(items, lastRead) {
    var listEl = document.getElementById('notif-list');
    if (!listEl) return;

    if (!items.length) {
      listEl.innerHTML = '<div class="notif-empty">No new notifications</div>';
      return;
    }

    listEl.innerHTML = '';
    items.forEach(function (item) {
      var isUnread = lastRead ? new Date(item.time) > new Date(lastRead) : true;
      var a = document.createElement('a');
      a.className = 'notif-item' + (isUnread ? ' unread' : '');
      a.href = item.href || '#';

      // For portal tabs, switch tab on click
      if (item.tab) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          if (typeof switchToTab === 'function') {
            switchToTab(item.tab);
          }
          closeDropdown();
        });
      }

      a.innerHTML =
        '<div class="notif-item-icon icon-' + item.icon + '">' + (ICONS[item.icon] || '') + '</div>' +
        '<div class="notif-item-body">' +
          '<div class="notif-item-text">' + escapeHtml(item.text) + '</div>' +
          '<div class="notif-item-time">' + relativeTime(item.time) + '</div>' +
        '</div>';

      listEl.appendChild(a);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Badge update ──
  function updateBadge(count) {
    var dot = document.querySelector('.notif-dot');
    if (!dot) return;
    if (count > 0) {
      dot.textContent = count > 99 ? '99+' : String(count);
      dot.classList.remove('hidden');
    } else {
      dot.textContent = '';
      dot.classList.add('hidden');
    }
  }

  // ── Dropdown open/close ──
  var dropdownEl = null;

  function openDropdown() {
    if (!dropdownEl) return;
    dropdownEl.style.display = 'flex';
    // Force reflow for animation
    dropdownEl.offsetHeight;
    dropdownEl.classList.add('open');
  }

  function closeDropdown() {
    if (!dropdownEl) return;
    dropdownEl.classList.remove('open');
    setTimeout(function () {
      if (!dropdownEl.classList.contains('open')) {
        dropdownEl.style.display = 'none';
      }
    }, 250);
  }

  // ── Main init ──
  async function init() {
    var bellBtn = document.querySelector('.notification-btn');
    if (!bellBtn) return;

    injectStyles();
    dropdownEl = buildDropdown(bellBtn);

    // Toggle on click
    bellBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdownEl.classList.contains('open')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (dropdownEl && dropdownEl.classList.contains('open') && !dropdownEl.contains(e.target) && !bellBtn.contains(e.target)) {
        closeDropdown();
      }
    });

    // Prevent dropdown clicks from closing
    dropdownEl.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // Fetch data
    var items = [];
    try {
      if (isAdmin) {
        items = await fetchAdminNotifications();
      } else if (isPortal) {
        items = await fetchPortalNotifications();
      }
    } catch (e) {
      console.warn('[notifications] fetch error:', e);
    }

    // Sort by time descending, limit to 20
    items.sort(function (a, b) {
      return new Date(b.time) - new Date(a.time);
    });
    items = items.slice(0, 20);

    // Read state from localStorage
    var lastRead = localStorage.getItem('notif-last-read') || null;

    // Count unread
    var unreadCount = 0;
    items.forEach(function (item) {
      if (!lastRead || new Date(item.time) > new Date(lastRead)) {
        unreadCount++;
      }
    });

    updateBadge(unreadCount);
    renderItems(items, lastRead);

    // Mark all read
    var markBtn = document.getElementById('notif-mark-read-btn');
    if (markBtn) {
      markBtn.addEventListener('click', function () {
        localStorage.setItem('notif-last-read', new Date().toISOString());
        updateBadge(0);
        // Remove unread styling
        var unreadItems = dropdownEl.querySelectorAll('.notif-item.unread');
        unreadItems.forEach(function (el) {
          el.classList.remove('unread');
        });
      });
    }
  }

  // Wait for DOM + Supabase
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 500);
    });
  } else {
    setTimeout(init, 500);
  }

})();
