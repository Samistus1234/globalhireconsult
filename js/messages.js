/* ============================================
   GLOBALHIRE@ELAB — Messages Page
   Communication hub + campaign activity log
   ============================================ */

(function () {
  var adminProfile = null;

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadActivity();
  });

  function updateAdminUI() {
    var nameEl = document.getElementById('admin-user-name');
    var roleEl = document.getElementById('admin-user-role');
    var avatarEl = document.getElementById('admin-user-avatar');
    if (nameEl) nameEl.textContent = adminProfile.full_name || 'Admin';
    if (roleEl) roleEl.textContent = 'Platform Admin';
    if (avatarEl) {
      avatarEl.textContent = adminProfile.avatar_initials || 'A';
      var colors = GHE.avatarColors[adminProfile.avatar_color_index || 0];
      avatarEl.style.background = colors[0];
      avatarEl.style.color = colors[1];
    }
    document.getElementById('admin-signout')?.addEventListener('click', function (e) {
      e.preventDefault();
      GHAuth.signOut();
    });
  }

  async function loadActivity() {
    var { data: logs } = await ghFrom('campaign_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    logs = logs || [];

    var countEl = document.getElementById('activity-count');
    if (countEl) countEl.textContent = logs.length + ' events';

    var list = document.getElementById('activity-list');
    if (!list) return;

    if (logs.length === 0) {
      list.innerHTML = '<div style="padding:var(--space-8);text-align:center;color:var(--text-tertiary);">No activity yet.</div>';
      return;
    }

    var eventColors = {
      matching_started: 'var(--secondary)',
      matching_completed: 'var(--primary)',
      outreach_started: 'var(--accent-amber)',
      outreach_completed: 'var(--success)',
      response_received: 'var(--accent-cyan)',
      status_changed: 'var(--accent-coral)'
    };

    list.innerHTML = logs.map(function (log) {
      var color = eventColors[log.event_type] || 'var(--text-tertiary)';
      var time = log.created_at ? new Date(log.created_at).toLocaleString() : '-';
      var detail = '';
      if (log.event_data) {
        var d = typeof log.event_data === 'string' ? JSON.parse(log.event_data) : log.event_data;
        detail = Object.entries(d).map(function (kv) { return kv[0] + ': ' + kv[1]; }).join(' | ');
      }

      return '<div class="activity-item">' +
        '<div class="activity-dot" style="background:' + color + '"></div>' +
        '<div class="activity-content">' +
        '<div class="activity-text"><strong>' + (log.event_type || 'event').replace(/_/g, ' ') + '</strong>' + (detail ? ' — ' + detail : '') + '</div>' +
        '<div class="activity-time">' + time + '</div>' +
        '</div></div>';
    }).join('');
  }
})();
