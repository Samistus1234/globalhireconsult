/* ============================================
   GLOBALHIRE@ELAB — Placements Page
   Track applicant responses and placements
   ============================================ */

(function () {
  var adminProfile = null;

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadPlacements();
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

  async function loadPlacements() {
    var { data: matches } = await ghFrom('campaign_matches')
      .select('*')
      .not('response', 'is', null)
      .order('responded_at', { ascending: false });

    matches = matches || [];

    // Get names and campaign titles
    var applicantIds = [...new Set(matches.map(function (m) { return m.applicant_id; }))];
    var campaignIds = [...new Set(matches.map(function (m) { return m.campaign_id; }))];

    var [profilesRes, campaignsRes] = await Promise.all([
      applicantIds.length > 0 ? ghFrom('profiles').select('id, full_name, avatar_initials, avatar_color_index').in('id', applicantIds) : { data: [] },
      campaignIds.length > 0 ? ghFrom('campaigns').select('id, title, destination_country').in('id', campaignIds) : { data: [] }
    ]);

    var nameMap = {};
    (profilesRes.data || []).forEach(function (p) { nameMap[p.id] = p; });
    var campMap = {};
    (campaignsRes.data || []).forEach(function (c) { campMap[c.id] = c; });

    // KPIs
    var interested = matches.filter(function (m) { return m.response === 'interested'; }).length;
    var maybe = matches.filter(function (m) { return m.response === 'maybe'; }).length;
    var declined = matches.filter(function (m) { return m.response === 'not_interested'; }).length;

    var el1 = document.getElementById('kpi-interested');
    var el2 = document.getElementById('kpi-pending');
    var el3 = document.getElementById('kpi-maybe');
    var el4 = document.getElementById('kpi-declined');
    if (el1) el1.textContent = interested;
    if (el2) el2.textContent = interested; // pending placement = interested responses
    if (el3) el3.textContent = maybe;
    if (el4) el4.textContent = declined;

    var countEl = document.getElementById('placement-count');
    if (countEl) countEl.textContent = matches.length + ' responses';

    // Table
    var tbody = document.getElementById('placement-tbody');
    if (!tbody) return;

    if (matches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No applicant responses yet. They will appear here once applicants respond to campaign outreach.</td></tr>';
      return;
    }

    var responseMap = {
      interested: { badge: 'badge-primary', label: 'Interested' },
      maybe: { badge: 'badge-warning', label: 'Maybe Later' },
      not_interested: { badge: 'badge-error', label: 'Not Interested' }
    };

    tbody.innerHTML = matches.map(function (m) {
      var applicant = nameMap[m.applicant_id] || {};
      var campaign = campMap[m.campaign_id] || {};
      var colors = GHE.avatarColors[applicant.avatar_color_index || 0];
      var resp = responseMap[m.response] || { badge: 'badge-neutral', label: m.response || '-' };
      var date = m.responded_at ? new Date(m.responded_at).toLocaleDateString() : '-';

      return '<tr>' +
        '<td><div class="applicant-row"><div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (applicant.avatar_initials || '??') + '</div><div class="applicant-info"><div class="applicant-name">' + (applicant.full_name || 'Unknown') + '</div></div></div></td>' +
        '<td>' + (campaign.title || 'Unknown Campaign') + '</td>' +
        '<td style="font-family:var(--font-mono);font-weight:600;">' + (m.match_score || 0) + '</td>' +
        '<td><span class="badge ' + resp.badge + ' badge-dot">' + resp.label + '</span></td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + date + '</td>' +
        '</tr>';
    }).join('');
  }
})();
