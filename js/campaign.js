/* ============================================
   GLOBALHIRE@ELAB — Campaign Management JS
   Campaign CRUD, matching, outreach, detail view
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var SUPABASE_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  let adminProfile = null;
  let currentSession = null;
  let currentCampaignId = null;
  let currentFilter = 'all';

  window.addEventListener('gh:auth-ready', async (e) => {
    adminProfile = e.detail.profile;
    currentSession = e.detail.session;
    updateAdminUI();
    await loadCountries();
    await loadCampaigns();
    subscribeRealtime();
  });

  // ── Admin UI ──
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
    document.getElementById('admin-signout')?.addEventListener('click', (e) => {
      e.preventDefault();
      GHAuth.signOut();
    });
  }

  // ── View switching ──
  function showView(viewId) {
    document.querySelectorAll('.campaign-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');

    var titleEl = document.getElementById('page-title');
    var breadcrumb = document.getElementById('breadcrumb-page');
    var newBtn = document.getElementById('btn-new-campaign');

    if (viewId === 'view-list') {
      titleEl.textContent = 'Recruitment Campaigns';
      breadcrumb.textContent = 'Campaigns';
      newBtn.style.display = '';
    } else if (viewId === 'view-form') {
      titleEl.textContent = currentCampaignId ? 'Edit Campaign' : 'New Campaign';
      breadcrumb.textContent = currentCampaignId ? 'Edit' : 'New Campaign';
      newBtn.style.display = 'none';
    } else if (viewId === 'view-detail') {
      titleEl.textContent = 'Campaign Details';
      breadcrumb.textContent = 'Details';
      newBtn.style.display = 'none';
    }
  }

  // ── Navigation bindings ──
  document.getElementById('btn-new-campaign')?.addEventListener('click', () => {
    currentCampaignId = null;
    resetForm();
    document.getElementById('form-title').textContent = 'New Campaign';
    showView('view-form');
  });

  document.getElementById('btn-back-form')?.addEventListener('click', () => {
    showView('view-list');
  });

  document.getElementById('btn-back-detail')?.addEventListener('click', () => {
    showView('view-list');
  });

  // ── Filter tabs ──
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      loadCampaigns();
    });
  });

  // ── Load countries for dropdown ──
  async function loadCountries() {
    var select = document.getElementById('dest-country-select');
    if (!select) return;
    var { data } = await ghFrom('countries').select('name').order('name');
    if (data) {
      // Also add common destinations not in countries table
      var countryNames = data.map(c => c.name);
      var extras = ['Saudi Arabia', 'Qatar', 'Kuwait', 'UAE', 'Oman', 'Bahrain', 'United Kingdom', 'USA', 'Canada', 'Germany', 'Australia'];
      extras.forEach(name => {
        if (!countryNames.includes(name)) countryNames.push(name);
      });
      countryNames.sort();
      countryNames.forEach(name => {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    }
  }

  // ── Load campaigns list ──
  async function loadCampaigns() {
    var tbody = document.getElementById('campaign-tbody');
    if (!tbody) return;

    var query = ghFrom('campaigns').select('*').order('created_at', { ascending: false });

    if (currentFilter === 'draft') {
      query = query.eq('status', 'draft');
    } else if (currentFilter === 'active') {
      query = query.in('status', ['matching', 'review', 'sending', 'active']);
    } else if (currentFilter === 'closed') {
      query = query.eq('status', 'closed');
    }

    var { data, error } = await query;

    if (error || !data || data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <h3>No campaigns yet</h3>
            <p>Create your first campaign to start matching applicants with recruiter demands.</p>
          </div>
        </td></tr>`;
      return;
    }

    // Update nav badge
    var activeCampaigns = data.filter(c => ['matching', 'review', 'sending', 'active'].includes(c.status));
    var badge = document.getElementById('campaign-nav-badge');
    if (badge) {
      badge.textContent = activeCampaigns.length;
      badge.style.display = activeCampaigns.length > 0 ? '' : 'none';
    }

    tbody.innerHTML = data.map(c => `
      <tr>
        <td>
          <div class="campaign-title-cell">
            <span class="title" data-id="${c.id}">${c.title}</span>
            <span class="meta">${c.specialty} &middot; ${c.destination_country}</span>
          </div>
        </td>
        <td><span class="badge status-${c.status}">${formatStatus(c.status)}</span></td>
        <td>${c.matched_count || 0}</td>
        <td>${c.contacted_count || 0}</td>
        <td>${c.interested_count || 0}</td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary)">${formatDate(c.created_at)}</span></td>
        <td><button class="btn btn-ghost btn-sm btn-view-campaign" data-id="${c.id}">View</button></td>
      </tr>
    `).join('');

    // Bind click handlers
    tbody.querySelectorAll('.title[data-id], .btn-view-campaign').forEach(el => {
      el.addEventListener('click', () => openCampaignDetail(el.dataset.id));
    });
  }

  // ── Open campaign detail ──
  async function openCampaignDetail(campaignId) {
    currentCampaignId = campaignId;
    showView('view-detail');
    await loadCampaignDetail(campaignId);
    await loadMatches(campaignId);
    await loadActivityLog(campaignId);
  }

  // ── Load campaign detail ──
  async function loadCampaignDetail(campaignId) {
    var { data: c, error } = await ghFrom('campaigns').select('*').eq('id', campaignId).single();
    if (error || !c) return;

    document.getElementById('detail-title').textContent = c.title;

    // Tags
    var tagsEl = document.getElementById('detail-tags');
    tagsEl.innerHTML = `
      <span class="badge status-${c.status}">${formatStatus(c.status)}</span>
      <span class="badge badge-neutral">${c.specialty}</span>
      <span class="badge badge-neutral">${c.destination_country}</span>
      ${c.employer_name ? `<span class="badge badge-neutral">${c.employer_name}</span>` : ''}
      ${c.visa_sponsored ? '<span class="badge badge-primary badge-dot">Visa Sponsored</span>' : ''}
      ${c.salary_display ? `<span class="badge badge-neutral">${c.salary_display}</span>` : ''}
    `;

    // Metrics
    document.getElementById('metric-matched').textContent = c.matched_count || 0;
    document.getElementById('metric-contacted').textContent = c.contacted_count || 0;
    document.getElementById('metric-interested').textContent = c.interested_count || 0;
    document.getElementById('metric-declined').textContent = c.declined_count || 0;

    var noResponse = (c.contacted_count || 0) - (c.interested_count || 0) - (c.declined_count || 0) - (c.maybe_later_count || 0);
    document.getElementById('metric-noresponse').textContent = Math.max(0, noResponse);

    // Action buttons
    var actionsEl = document.getElementById('detail-actions');
    var actions = [];

    if (c.status === 'draft' || c.status === 'review') {
      actions.push(`<button class="btn btn-secondary btn-sm" id="btn-run-matching">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83"/></svg>
        Run Matching
      </button>`);
    }

    if (c.status === 'review' && (c.matched_count || 0) > 0) {
      actions.push(`<button class="btn btn-primary btn-sm" id="btn-send-outreach">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        Send Outreach Emails
      </button>`);
    }

    if (c.status !== 'closed' && c.status !== 'draft') {
      actions.push(`<button class="btn btn-ghost btn-sm" id="btn-close-campaign" style="color:var(--accent-coral)">Close Campaign</button>`);
    }

    actionsEl.innerHTML = actions.join('');

    // Bind action buttons
    document.getElementById('btn-run-matching')?.addEventListener('click', () => runMatching(campaignId));
    document.getElementById('btn-send-outreach')?.addEventListener('click', () => sendOutreach(campaignId));
    document.getElementById('btn-close-campaign')?.addEventListener('click', () => closeCampaign(campaignId));
  }

  // ── Load matches ──
  async function loadMatches(campaignId) {
    var tbody = document.getElementById('matches-tbody');
    if (!tbody) return;

    var { data: matches, error } = await ghFrom('campaign_matches')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('match_score', { ascending: false });

    var badge = document.getElementById('match-count-badge');
    if (badge) badge.textContent = (matches?.length || 0) + ' matches';

    if (error || !matches || matches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No matches yet. Click "Run Matching" to find applicants.</td></tr>';
      return;
    }

    tbody.innerHTML = matches.map(m => {
      var scoreClass = m.match_score >= 70 ? 'high' : m.match_score >= 40 ? 'medium' : 'low';
      var colors = GHE.avatarColors[m.avatar_color_index || 0];
      var responseLabel = m.response ? m.response.replace('_', ' ') : 'Awaiting';
      var responseClass = m.response ? 'response-' + m.response : 'response-none';

      return `
        <tr>
          <td>
            <div class="applicant-row">
              <div class="avatar avatar-sm" style="background:${colors[0]};color:${colors[1]}">${m.avatar_initials || '??'}</div>
              <div class="applicant-info">
                <div class="applicant-name">${m.full_name || 'Unnamed'}</div>
                <div class="applicant-detail">${m.country_of_origin || ''}</div>
              </div>
            </div>
          </td>
          <td>${m.specialty || '-'}</td>
          <td>${m.years_of_experience || 0} yrs</td>
          <td>
            <div class="match-score-bar">
              <div class="score-bar"><div class="score-bar-fill ${scoreClass}" style="width:${m.match_score}%"></div></div>
              <span class="score-value ${scoreClass}">${m.match_score}%</span>
            </div>
          </td>
          <td><span class="badge email-${m.email_status}">${m.email_status}</span></td>
          <td><span class="badge ${responseClass}">${responseLabel}</span></td>
        </tr>`;
    }).join('');
  }

  // ── Load activity log ──
  async function loadActivityLog(campaignId) {
    var logEl = document.getElementById('activity-log');
    if (!logEl) return;

    var { data: logs, error } = await ghFrom('campaign_activity_log')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !logs || logs.length === 0) {
      logEl.innerHTML = '<div style="padding:var(--space-8);text-align:center;color:var(--text-tertiary);">No activity yet</div>';
      return;
    }

    logEl.innerHTML = logs.map(log => {
      var text = formatLogEvent(log);
      return `
        <div class="log-item">
          <div class="log-dot ${log.event_type}"></div>
          <div class="log-content">
            <div class="log-text">${text}</div>
            <div class="log-time">${formatTimeAgo(log.created_at)}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Campaign form submit ──
  var form = document.getElementById('campaign-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCampaign(false);
  });

  document.getElementById('btn-save-match')?.addEventListener('click', async () => {
    await saveCampaign(true);
  });

  async function saveCampaign(runMatchAfter) {
    var form = document.getElementById('campaign-form');
    var msg = document.getElementById('form-message');
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    var payload = {
      title: form.title.value.trim(),
      specialty: form.specialty.value,
      destination_country: form.destination_country.value,
      min_experience: parseInt(form.min_experience.value) || 0,
      positions: parseInt(form.positions.value) || 1,
      salary_display: form.salary_display.value.trim(),
      employer_name: form.employer_name.value.trim(),
      visa_sponsored: form.visa_sponsored.value === 'true',
      description: form.description.value.trim(),
    };

    if (!payload.title || !payload.specialty || !payload.destination_country) {
      msg.textContent = 'Please fill in required fields (title, specialty, destination).';
      msg.style.color = 'var(--error)';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save Draft';
      return;
    }

    var result;
    if (currentCampaignId) {
      result = await ghFrom('campaigns').update(payload).eq('id', currentCampaignId).select().single();
    } else {
      payload.created_by = currentSession.user.id;
      payload.status = 'draft';
      result = await ghFrom('campaigns').insert(payload).select().single();
    }

    if (result.error) {
      msg.textContent = 'Error: ' + result.error.message;
      msg.style.color = 'var(--error)';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save Draft';
      return;
    }

    var savedId = result.data.id;

    // Log creation if new
    if (!currentCampaignId) {
      await ghFrom('campaign_activity_log').insert({
        campaign_id: savedId,
        event_type: 'created',
        event_data: { title: payload.title },
        actor_id: currentSession.user.id
      });
    }

    currentCampaignId = savedId;

    if (runMatchAfter) {
      btn.innerHTML = '<span class="spinner"></span> Running matching...';
      await runMatching(savedId);
      btn.disabled = false;
      btn.textContent = 'Save Draft';
      openCampaignDetail(savedId);
    } else {
      msg.textContent = 'Campaign saved!';
      msg.style.color = 'var(--success)';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save Draft';
      setTimeout(() => {
        showView('view-list');
        loadCampaigns();
        msg.style.display = 'none';
      }, 1000);
    }
  }

  // ── Run Matching ──
  async function runMatching(campaignId) {
    try {
      var resp = await fetch(SUPABASE_URL + '/functions/v1/gh-run-matching', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + currentSession.access_token,
          'apikey': sb.supabaseKey || ''
        },
        body: JSON.stringify({ campaign_id: campaignId })
      });
      var data = await resp.json();

      if (data.error) {
        alert('Matching failed: ' + data.error);
        return;
      }

      alert('Matching complete! ' + (data.matched_count || 0) + ' applicants matched.');
      await loadCampaignDetail(campaignId);
      await loadMatches(campaignId);
      await loadActivityLog(campaignId);
    } catch (err) {
      alert('Error running matching: ' + err.message);
    }
  }

  // ── Send Outreach ──
  async function sendOutreach(campaignId) {
    if (!confirm('Send outreach emails to all pending matched applicants?')) return;

    var btn = document.getElementById('btn-send-outreach');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Sending...';
    }

    try {
      var resp = await fetch(SUPABASE_URL + '/functions/v1/gh-send-outreach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + currentSession.access_token,
          'apikey': sb.supabaseKey || ''
        },
        body: JSON.stringify({ campaign_id: campaignId })
      });
      var data = await resp.json();

      if (data.error) {
        alert('Outreach failed: ' + data.error);
      } else {
        alert('Outreach complete! Sent: ' + data.sent + ', Failed: ' + data.failed);
      }

      await loadCampaignDetail(campaignId);
      await loadMatches(campaignId);
      await loadActivityLog(campaignId);
    } catch (err) {
      alert('Error sending outreach: ' + err.message);
    }
  }

  // ── Close Campaign ──
  async function closeCampaign(campaignId) {
    if (!confirm('Close this campaign? No more emails will be sent.')) return;

    await ghFrom('campaigns').update({ status: 'closed' }).eq('id', campaignId);
    await ghFrom('campaign_activity_log').insert({
      campaign_id: campaignId,
      event_type: 'closed',
      actor_id: currentSession.user.id
    });

    await loadCampaignDetail(campaignId);
    await loadActivityLog(campaignId);
  }

  // ── Reset form ──
  function resetForm() {
    var form = document.getElementById('campaign-form');
    if (form) form.reset();
    var msg = document.getElementById('form-message');
    if (msg) msg.style.display = 'none';
  }

  // ── Realtime subscription ──
  function subscribeRealtime() {
    sb.channel('gh-campaigns-live')
      .on('postgres_changes', {
        event: '*', schema: 'globalhire', table: 'campaigns'
      }, () => {
        loadCampaigns();
        if (currentCampaignId) loadCampaignDetail(currentCampaignId);
      })
      .on('postgres_changes', {
        event: '*', schema: 'globalhire', table: 'campaign_matches'
      }, () => {
        if (currentCampaignId) {
          loadMatches(currentCampaignId);
          loadCampaignDetail(currentCampaignId);
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'globalhire', table: 'campaign_activity_log'
      }, () => {
        if (currentCampaignId) loadActivityLog(currentCampaignId);
      })
      .subscribe();
  }

  // ── Helpers ──
  function formatStatus(status) {
    var labels = {
      draft: 'Draft', matching: 'Matching', review: 'In Review',
      sending: 'Sending', active: 'Active', closed: 'Closed'
    };
    return labels[status] || status;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  function formatLogEvent(log) {
    var d = log.event_data || {};
    switch (log.event_type) {
      case 'created':
        return '<strong>Campaign created</strong>: ' + (d.title || '');
      case 'matching_started':
        return '<strong>Matching started</strong> for ' + (d.specialty || '') + ' in ' + (d.destination || '');
      case 'matching_completed':
        return '<strong>Matching completed</strong>: <strong>' + (d.new_matches || 0) + ' new matches</strong> (' + (d.total_matches || 0) + ' total)';
      case 'emails_sending':
        return '<strong>Sending outreach emails</strong> to ' + (d.total || 0) + ' applicants';
      case 'emails_sent':
        return '<strong>Outreach complete</strong>: ' + (d.sent || 0) + ' sent, ' + (d.failed || 0) + ' failed';
      case 'response_received':
        return '<strong>' + (d.applicant_name || 'Applicant') + '</strong> responded: <strong>' + (d.response || '') + '</strong> (score: ' + (d.match_score || 0) + '%)';
      case 'status_changed':
        return 'Status changed to <strong>' + (d.new_status || '') + '</strong>';
      case 'closed':
        return '<strong>Campaign closed</strong>';
      case 'reopened':
        return '<strong>Campaign reopened</strong>';
      default:
        return '<strong>' + log.event_type + '</strong>';
    }
  }
})();
