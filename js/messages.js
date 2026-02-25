/* ============================================
   GLOBALHIRE@ELAB — Messages Page
   Communication hub: outreach dashboard +
   campaign activity log
   ============================================ */

(function () {
  var adminProfile = null;
  var allMatches = [];
  var allCampaigns = [];
  var filteredMatches = [];
  var currentPage = 1;
  var pageSize = 20;

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadAllData();
    bindFilters();
  });

  // ── Admin sidebar UI ──
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

  // ── Load all data in parallel ──
  async function loadAllData() {
    var [matchesRes, campaignsRes] = await Promise.all([
      ghFrom('campaign_matches').select('*').order('email_sent_at', { ascending: false }),
      ghFrom('campaigns').select('id,title')
    ]);

    allMatches = matchesRes.data || [];
    allCampaigns = campaignsRes.data || [];

    populateCampaignFilter();
    applyFilters();
    loadActivity();
  }

  // ── Populate campaign dropdown ──
  function populateCampaignFilter() {
    var select = document.getElementById('filter-campaign');
    if (!select) return;

    select.innerHTML = '<option value="">All Campaigns</option>';
    allCampaigns.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.title || 'Campaign ' + c.id;
      select.appendChild(opt);
    });
  }

  // ── Bind filter controls ──
  function bindFilters() {
    var searchInput = document.getElementById('outreach-search');
    var campaignSelect = document.getElementById('filter-campaign');
    var statusSelect = document.getElementById('filter-email-status');
    var responseSelect = document.getElementById('filter-response');

    if (searchInput) {
      searchInput.addEventListener('input', GHE.debounce(function () {
        currentPage = 1;
        applyFilters();
      }, 250));
    }

    [campaignSelect, statusSelect, responseSelect].forEach(function (el) {
      if (el) {
        el.addEventListener('change', function () {
          currentPage = 1;
          applyFilters();
        });
      }
    });
  }

  // ── Apply filters ──
  function applyFilters() {
    var searchVal = (document.getElementById('outreach-search')?.value || '').toLowerCase().trim();
    var campaignVal = document.getElementById('filter-campaign')?.value || '';
    var statusVal = document.getElementById('filter-email-status')?.value || '';
    var responseVal = document.getElementById('filter-response')?.value || '';

    filteredMatches = allMatches.filter(function (m) {
      // Search by applicant name
      if (searchVal) {
        var name = (m.applicant_name || m.full_name || '').toLowerCase();
        if (name.indexOf(searchVal) === -1) return false;
      }

      // Campaign filter
      if (campaignVal && String(m.campaign_id) !== campaignVal) return false;

      // Email status filter
      if (statusVal && m.email_status !== statusVal) return false;

      // Response filter
      if (responseVal) {
        if (responseVal === 'no_response') {
          if (m.response) return false;
        } else {
          if (m.response !== responseVal) return false;
        }
      }

      return true;
    });

    updateKPIs();
    renderTable();
    renderPagination();

    var badge = document.getElementById('results-count');
    if (badge) badge.textContent = filteredMatches.length + ' result' + (filteredMatches.length !== 1 ? 's' : '');
  }

  // ── Update KPI cards ──
  function updateKPIs() {
    var sent = 0;
    var failed = 0;
    var responded = 0;

    allMatches.forEach(function (m) {
      if (m.email_status === 'sent') sent++;
      if (m.email_status === 'failed' || m.email_status === 'bounced') failed++;
      if (m.response) responded++;
    });

    var rate = sent > 0 ? Math.round((responded / sent) * 100) : 0;

    var kpiSent = document.getElementById('kpi-sent');
    var kpiFailed = document.getElementById('kpi-failed');
    var kpiResponded = document.getElementById('kpi-responded');
    var kpiRate = document.getElementById('kpi-rate');

    if (kpiSent) kpiSent.textContent = sent.toLocaleString();
    if (kpiFailed) kpiFailed.textContent = failed.toLocaleString();
    if (kpiResponded) kpiResponded.textContent = responded.toLocaleString();
    if (kpiRate) kpiRate.innerHTML = rate + '<span style="font-size:var(--text-xl);color:var(--accent-cyan)">%</span>';

    var subSent = document.getElementById('kpi-sent-sub');
    var subFailed = document.getElementById('kpi-failed-sub');
    var subResponded = document.getElementById('kpi-responded-sub');
    var subRate = document.getElementById('kpi-rate-sub');

    if (subSent) subSent.textContent = 'Emails delivered successfully';
    if (subFailed) subFailed.textContent = failed === 0 ? 'No failures' : 'May need attention';
    if (subResponded) subResponded.textContent = responded === 0 ? 'No responses yet' : responded + ' applicant' + (responded !== 1 ? 's' : '') + ' replied';
    if (subRate) subRate.textContent = sent === 0 ? 'No emails sent yet' : 'Of ' + sent + ' sent emails';
  }

  // ── Render table rows ──
  function renderTable() {
    var tbody = document.getElementById('outreach-tbody');
    if (!tbody) return;

    var startIdx = (currentPage - 1) * pageSize;
    var pageData = filteredMatches.slice(startIdx, startIdx + pageSize);

    if (pageData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No outreach records match the current filters.</td></tr>';
      return;
    }

    // Build a campaign lookup
    var campaignMap = {};
    allCampaigns.forEach(function (c) {
      campaignMap[c.id] = c.title || 'Campaign ' + c.id;
    });

    tbody.innerHTML = pageData.map(function (m) {
      // Applicant name
      var name = escapeHtml(m.applicant_name || m.full_name || 'Unknown');

      // Campaign title
      var campaign = escapeHtml(campaignMap[m.campaign_id] || '-');

      // Match score
      var matchPct = m.match_score != null ? Math.round(m.match_score) + '%' : '-';

      // Email status badge
      var statusBadge = getEmailStatusBadge(m.email_status);

      // Sent timestamp
      var sentAt = m.email_sent_at ? new Date(m.email_sent_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

      // Response badge
      var responseBadge = getResponseBadge(m.response);

      // Response timestamp
      var respondedAt = m.responded_at ? new Date(m.responded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

      return '<tr>' +
        '<td style="color:var(--text-primary);font-weight:500;">' + name + '</td>' +
        '<td>' + campaign + '</td>' +
        '<td><span class="mono" style="font-size:var(--text-sm);">' + matchPct + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td><span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--text-tertiary);">' + sentAt + '</span></td>' +
        '<td>' + responseBadge + '</td>' +
        '<td><span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--text-tertiary);">' + respondedAt + '</span></td>' +
      '</tr>';
    }).join('');
  }

  // ── Email status badge helper ──
  function getEmailStatusBadge(status) {
    var map = {
      sent: { cls: 'badge-primary', label: 'Sent' },
      failed: { cls: 'badge-error', label: 'Failed' },
      bounced: { cls: 'badge-error', label: 'Bounced' },
      skipped: { cls: 'badge-warning', label: 'Skipped' },
      pending: { cls: 'badge-neutral', label: 'Pending' }
    };
    var s = map[status] || { cls: 'badge-neutral', label: status || 'Unknown' };
    return '<span class="badge ' + s.cls + ' badge-dot">' + s.label + '</span>';
  }

  // ── Response badge helper ──
  function getResponseBadge(response) {
    if (!response) return '<span class="badge badge-neutral">No Response</span>';
    var map = {
      interested: { cls: 'badge-primary', label: 'Interested' },
      declined: { cls: 'badge-error', label: 'Declined' },
      maybe_later: { cls: 'badge-warning', label: 'Maybe Later' }
    };
    var r = map[response] || { cls: 'badge-info', label: response };
    return '<span class="badge ' + r.cls + ' badge-dot">' + r.label + '</span>';
  }

  // ── Render pagination ──
  function renderPagination() {
    var container = document.getElementById('pagination-controls');
    if (!container) return;

    var totalPages = Math.ceil(filteredMatches.length / pageSize);

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    var html = '';

    // Previous button
    html += '<button class="pagination-btn" data-page="prev"' + (currentPage === 1 ? ' disabled' : '') + '>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>' +
    '</button>';

    // Page numbers
    var pages = buildPageNumbers(currentPage, totalPages, 7);
    pages.forEach(function (p) {
      if (p === '...') {
        html += '<span class="pagination-info">...</span>';
      } else {
        html += '<button class="pagination-btn' + (p === currentPage ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
      }
    });

    // Info
    var startItem = (currentPage - 1) * pageSize + 1;
    var endItem = Math.min(currentPage * pageSize, filteredMatches.length);
    html += '<span class="pagination-info">' + startItem + '-' + endItem + ' of ' + filteredMatches.length + '</span>';

    // Next button
    html += '<button class="pagination-btn" data-page="next"' + (currentPage === totalPages ? ' disabled' : '') + '>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>' +
    '</button>';

    container.innerHTML = html;

    // Bind page clicks
    container.querySelectorAll('.pagination-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = btn.dataset.page;
        if (page === 'prev') {
          if (currentPage > 1) currentPage--;
        } else if (page === 'next') {
          if (currentPage < totalPages) currentPage++;
        } else {
          currentPage = parseInt(page, 10);
        }
        renderTable();
        renderPagination();
        document.querySelector('.panel-body-flush')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ── Build smart page number array ──
  function buildPageNumbers(current, total, maxButtons) {
    if (total <= maxButtons) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }

    var pages = [];
    var half = Math.floor((maxButtons - 2) / 2);

    pages.push(1);

    var rangeStart = Math.max(2, current - half);
    var rangeEnd = Math.min(total - 1, current + half);

    if (current - half <= 2) {
      rangeEnd = Math.min(total - 1, maxButtons - 2);
    }
    if (current + half >= total - 1) {
      rangeStart = Math.max(2, total - maxButtons + 3);
    }

    if (rangeStart > 2) pages.push('...');

    for (var j = rangeStart; j <= rangeEnd; j++) {
      pages.push(j);
    }

    if (rangeEnd < total - 1) pages.push('...');

    pages.push(total);

    return pages;
  }

  // ── Activity timeline (kept from original) ──
  async function loadActivity() {
    var { data: logs } = await ghFrom('campaign_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

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

  // ── HTML escape utility ──
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

})();
