/* ============================================
   GLOBALHIRE@ELAB — Analytics Page
   Stats and reports from live data
   ============================================ */

(function () {
  var adminProfile = null;
  var barColors = ['var(--primary)', 'var(--secondary)', 'var(--accent-amber)', 'var(--accent-cyan)', 'var(--accent-coral)', '#ff6ec7'];

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadAnalytics();
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

  async function loadAnalytics() {
    var [applicantsRes, campaignsRes, docsRes, matchesRes] = await Promise.all([
      ghFrom('admin_applicant_overview').select('specialty, pipeline_status, availability_status'),
      ghFrom('campaigns').select('id, title, destination_country, status, matched_count'),
      ghFrom('documents').select('status'),
      ghFrom('campaign_matches').select('match_score, email_status, response, campaign_id')
    ]);

    var applicants = applicantsRes.data || [];
    var campaigns = campaignsRes.data || [];
    var docs = docsRes.data || [];
    var matches = matchesRes.data || [];

    // KPIs
    var el1 = document.getElementById('kpi-applicants');
    var el2 = document.getElementById('kpi-campaigns');
    var el3 = document.getElementById('kpi-docs');
    var el4 = document.getElementById('kpi-match');
    if (el1) el1.textContent = applicants.length;
    var activeCampaigns = campaigns.filter(function (c) { return ['matching', 'review', 'sending', 'active'].indexOf(c.status) !== -1; });
    if (el2) el2.textContent = activeCampaigns.length;
    var verifiedDocs = docs.filter(function (d) { return d.status === 'verified'; }).length;
    if (el3) el3.textContent = verifiedDocs;
    var avgScore = matches.length > 0 ? Math.round(matches.reduce(function (s, m) { return s + (m.match_score || 0); }, 0) / matches.length) : 0;
    if (el4) el4.textContent = avgScore;

    // Specialty chart
    var specCounts = {};
    applicants.forEach(function (a) {
      var s = a.specialty || 'Unknown';
      specCounts[s] = (specCounts[s] || 0) + 1;
    });
    var specArr = Object.entries(specCounts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var maxSpec = specArr.length > 0 ? specArr[0][1] : 1;

    var specChart = document.getElementById('specialty-chart');
    if (specChart) {
      if (specArr.length === 0) {
        specChart.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:var(--space-6);">No specialty data yet.</div>';
      } else {
        specChart.innerHTML = specArr.map(function (item, i) {
          var pct = Math.round(item[1] / maxSpec * 100);
          return '<div class="bar-chart-row">' +
            '<span class="bar-chart-label">' + item[0] + '</span>' +
            '<div class="bar-chart-track"><div class="bar-chart-fill" style="width:' + pct + '%;background:' + barColors[i % barColors.length] + '"></div></div>' +
            '<span class="bar-chart-value">' + item[1] + '</span></div>';
        }).join('');
      }
    }

    // Pipeline chart
    var pipeCounts = { applied: 0, screening: 0, verifying: 0, verified: 0 };
    applicants.forEach(function (a) {
      if (pipeCounts[a.pipeline_status] !== undefined) pipeCounts[a.pipeline_status]++;
    });
    var pipeTotal = applicants.length || 1;
    var pipeColors = { applied: 'var(--primary)', screening: 'var(--secondary)', verifying: 'var(--accent-amber)', verified: 'var(--accent-cyan)' };

    var pipeChart = document.getElementById('pipeline-chart');
    if (pipeChart) {
      pipeChart.innerHTML = Object.entries(pipeCounts).map(function (item) {
        var pct = Math.round(item[1] / pipeTotal * 100);
        return '<div class="bar-chart-row">' +
          '<span class="bar-chart-label" style="text-transform:capitalize;">' + item[0] + '</span>' +
          '<div class="bar-chart-track"><div class="bar-chart-fill" style="width:' + pct + '%;background:' + (pipeColors[item[0]] || 'var(--primary)') + '"></div></div>' +
          '<span class="bar-chart-value">' + item[1] + ' (' + pct + '%)</span></div>';
      }).join('');
    }

    // Campaign table
    var tbody = document.getElementById('campaign-tbody');
    if (tbody) {
      if (campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No campaigns yet.</td></tr>';
      } else {
        tbody.innerHTML = campaigns.map(function (c) {
          var cMatches = matches.filter(function (m) { return m.campaign_id === c.id; });
          var sent = cMatches.filter(function (m) { return m.email_status === 'sent'; }).length;
          var responded = cMatches.filter(function (m) { return m.response !== null; }).length;
          var rate = sent > 0 ? Math.round(responded / sent * 100) : 0;
          return '<tr>' +
            '<td style="font-weight:600;color:var(--text-primary);">' + (c.title || 'Untitled') + '</td>' +
            '<td><span class="tag">' + (c.destination_country || '-') + '</span></td>' +
            '<td>' + (c.matched_count || cMatches.length) + '</td>' +
            '<td>' + sent + '</td>' +
            '<td>' + responded + '</td>' +
            '<td><span class="badge ' + (rate > 50 ? 'badge-primary' : rate > 20 ? 'badge-warning' : 'badge-error') + '">' + rate + '%</span></td>' +
            '</tr>';
        }).join('');
      }
    }
  }
})();
