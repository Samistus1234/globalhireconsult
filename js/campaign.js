/* ============================================
   GLOBALHIRE@ELAB — Campaign Management JS
   Campaign CRUD, matching, outreach, detail view
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var SUPABASE_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
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

  // ── Sync featured listings as campaigns ──
  document.getElementById('btn-sync-listings')?.addEventListener('click', async () => {
    var syncBtn = document.getElementById('btn-sync-listings');
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin-icon"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/></svg> Syncing...';

    // Featured listings from jobs.js — define them here too
    var featuredListings = [
      {
        title: 'Elderly Caregiver',
        employer_name: 'Qatar Healthcare Employer',
        destination_country: 'Qatar',
        specialty: 'Elderly Care',
        positions: 3,
        salary_display: '2,500 QAR/month',
        min_experience: 2,
        visa_sponsored: true,
        description: 'Provide daily living assistance, medication reminders, mobility support, and companionship for elderly patients in Qatar.',
      },
      {
        title: 'Paediatric Caregiver',
        employer_name: 'Qatar Healthcare Employer',
        destination_country: 'Qatar',
        specialty: 'Paediatric Care',
        positions: 2,
        salary_display: '2,500 QAR/month',
        min_experience: 2,
        visa_sponsored: true,
        description: 'Provide child care, developmental support, feeding, bathing, health monitoring, and age-appropriate activities.',
      },
      {
        title: 'Work in Albania (Europe) — D Visa',
        employer_name: 'eLab Solutions International',
        destination_country: 'Albania',
        specialty: 'General / Multiple Roles',
        positions: 0,
        salary_display: '600–850 EUR/month',
        min_experience: 0,
        visa_sponsored: true,
        description: 'Work legally in Europe with a Type D working visa and residence permit. Earn in Euros, with accommodation and meals included.',
      },
      {
        title: 'Registered Nurse — 2-Year Contract',
        employer_name: 'Qatar Hospital',
        destination_country: 'Qatar',
        specialty: 'General Nursing',
        positions: 0,
        salary_display: '4,500 QAR/month',
        min_experience: 0,
        visa_sponsored: true,
        description: 'Nursing positions in Qatar with a 2-year contract. Salary of 4,500 QAR/month with accommodation, flight, and visa fully covered. Interviews starting in 1 week.',
      },
      {
        title: 'Registered Nurse — 5-Year Contract',
        employer_name: 'Qatar Hospital',
        destination_country: 'Qatar',
        specialty: 'General Nursing',
        positions: 0,
        salary_display: '4,400 QAR/month',
        min_experience: 0,
        visa_sponsored: true,
        description: 'Long-term nursing positions in Qatar with a 5-year contract. Salary of 4,400 QAR/month with accommodation, flight, and visa fully covered.',
      },
      {
        title: 'ENT Surgeon / Otorhinolaryngologist',
        employer_name: 'Private Hospital — Saudi Arabia',
        destination_country: 'Saudi Arabia',
        specialty: 'Otorhinolaryngology (ENT)',
        positions: 1,
        salary_display: 'Competitive Tax-Free',
        min_experience: 2,
        visa_sponsored: true,
        description: 'A leading private hospital in Saudi Arabia is recruiting an ENT Specialist. Must have DataFlow, Mumaris (SCFHS), and Prometric.',
      },
      {
        title: 'eLab Complete — Guaranteed Nursing Placement',
        employer_name: 'eLab Solutions International',
        destination_country: 'Qatar & Saudi Arabia',
        specialty: 'General Nursing',
        positions: 0,
        salary_display: 'Guaranteed Placement',
        min_experience: 0,
        visa_sponsored: true,
        description: 'End-to-end guaranteed nursing placement program. We handle everything from verification to deployment. Money-back guarantee.',
      },
    ];

    var synced = 0;
    var skipped = 0;

    for (var listing of featuredListings) {
      // Check if campaign with same title already exists
      var { data: existing } = await ghFrom('campaigns')
        .select('id')
        .eq('title', listing.title)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Insert as active campaign
      var { error } = await ghFrom('campaigns')
        .insert({
          title: listing.title,
          specialty: listing.specialty,
          destination_country: listing.destination_country,
          min_experience: listing.min_experience,
          positions: listing.positions || 1,
          salary_display: listing.salary_display,
          employer_name: listing.employer_name,
          visa_sponsored: listing.visa_sponsored,
          description: listing.description,
          status: 'active',
          created_by: currentSession.user.id,
          matched_count: 0,
          contacted_count: 0,
          interested_count: 0,
          declined_count: 0,
          maybe_later_count: 0,
        });

      if (error) {
        console.warn('Sync error for ' + listing.title + ':', error);
      } else {
        synced++;
      }
    }

    syncBtn.disabled = false;
    syncBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Sync Listings';

    alert('Sync complete! ' + synced + ' new campaigns created, ' + skipped + ' already existed.');
    await loadCampaigns();
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
        <td style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-ghost btn-sm btn-view-campaign" data-id="${c.id}">View</button>
          ${c.status !== 'draft' && c.status !== 'closed'
            ? `<button class="btn btn-ghost btn-sm btn-deactivate" data-id="${c.id}" style="color:var(--accent-coral);font-size:11px;">Deactivate</button>`
            : ''}
          ${c.status === 'closed'
            ? `<button class="btn btn-ghost btn-sm btn-reactivate" data-id="${c.id}" style="color:var(--success);font-size:11px;">Reactivate</button>`
            : ''}
        </td>
      </tr>
    `).join('');

    // Bind click handlers
    tbody.querySelectorAll('.title[data-id], .btn-view-campaign').forEach(el => {
      el.addEventListener('click', () => openCampaignDetail(el.dataset.id));
    });

    tbody.querySelectorAll('.btn-deactivate').forEach(el => {
      el.addEventListener('click', () => deactivateCampaign(el.dataset.id));
    });

    tbody.querySelectorAll('.btn-reactivate').forEach(el => {
      el.addEventListener('click', () => reactivateCampaign(el.dataset.id));
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
      actions.push(`<button class="btn btn-ghost btn-sm" id="btn-close-campaign" style="color:var(--accent-coral)">Deactivate</button>`);
    }

    if (c.status === 'closed') {
      actions.push(`<button class="btn btn-primary btn-sm" id="btn-reactivate-campaign">Reactivate</button>`);
    }

    // Notify applicants button — always available for non-draft campaigns
    if (c.status !== 'draft') {
      actions.push(`<button class="btn btn-secondary btn-sm" id="btn-notify-applicants" style="background:var(--accent-cyan);color:var(--bg-deep);border-color:var(--accent-cyan);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        Notify Applicants
      </button>`);
    }

    actionsEl.innerHTML = actions.join('');

    // Bind action buttons
    document.getElementById('btn-run-matching')?.addEventListener('click', () => runMatching(campaignId));
    document.getElementById('btn-send-outreach')?.addEventListener('click', () => sendOutreach(campaignId));
    document.getElementById('btn-close-campaign')?.addEventListener('click', () => deactivateCampaign(campaignId));
    document.getElementById('btn-reactivate-campaign')?.addEventListener('click', () => reactivateCampaign(campaignId));
    document.getElementById('btn-notify-applicants')?.addEventListener('click', () => showNotifyModal(campaignId, c));
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
      if (window.ElabTracker) ElabTracker.track('gh_campaign_created', 'high_value', { campaign_id: savedId, title: payload.title, platform: 'globalhire' });
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
    if (window.ElabTracker) ElabTracker.track('gh_campaign_closed', 'medium_value', { campaign_id: campaignId, platform: 'globalhire' });

    await loadCampaignDetail(campaignId);
    await loadActivityLog(campaignId);
  }

  // ── Deactivate Campaign (hide from public jobs page) ──
  async function deactivateCampaign(campaignId) {
    if (!confirm('Deactivate this campaign? It will be hidden from the public jobs page.')) return;

    await ghFrom('campaigns').update({ status: 'closed' }).eq('id', campaignId);
    await ghFrom('campaign_activity_log').insert({
      campaign_id: campaignId,
      event_type: 'closed',
      event_data: { reason: 'deactivated' },
      actor_id: currentSession.user.id
    });
    if (window.ElabTracker) ElabTracker.track('gh_campaign_deactivated', 'medium_value', { campaign_id: campaignId, platform: 'globalhire' });

    await loadCampaigns();
    if (currentCampaignId === campaignId) {
      await loadCampaignDetail(campaignId);
      await loadActivityLog(campaignId);
    }
  }

  // ── Reactivate Campaign (show on public jobs page again) ──
  async function reactivateCampaign(campaignId) {
    await ghFrom('campaigns').update({ status: 'active' }).eq('id', campaignId);
    await ghFrom('campaign_activity_log').insert({
      campaign_id: campaignId,
      event_type: 'reopened',
      actor_id: currentSession.user.id
    });
    if (window.ElabTracker) ElabTracker.track('gh_campaign_reopened', 'medium_value', { campaign_id: campaignId, platform: 'globalhire' });

    await loadCampaigns();
    if (currentCampaignId === campaignId) {
      await loadCampaignDetail(campaignId);
      await loadActivityLog(campaignId);
    }
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

  // ── Notify Applicants Modal ──
  async function showNotifyModal(campaignId, campaign) {
    // Remove existing modal if any
    var existing = document.getElementById('notify-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'notify-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-xl);width:100%;max-width:560px;max-height:90vh;overflow-y:auto;padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
          <h3 style="font-size:var(--text-lg);font-weight:700;color:var(--text-primary);margin:0;">Notify Applicants</h3>
          <button onclick="document.getElementById('notify-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:20px;">&times;</button>
        </div>
        <p style="color:var(--text-secondary);font-size:var(--text-sm);margin-bottom:var(--space-4);">
          Send an email about <strong style="color:var(--text-primary);">${escapeHtml(campaign.title)}</strong> to applicants in the system.
        </p>

        <div style="margin-bottom:var(--space-4);">
          <label style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);display:block;margin-bottom:var(--space-2);">Recipients</label>
          <select id="notify-target" style="width:100%;padding:var(--space-3);background:var(--bg-deep);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);">
            <option value="matched">Matched candidates only (from this campaign's matching results)</option>
            <option value="all">All applicants in the system</option>
            <option value="specialty">Applicants matching specialty: ${escapeHtml(campaign.specialty || 'any')}</option>
          </select>
        </div>

        <div style="margin-bottom:var(--space-4);">
          <label style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);display:block;margin-bottom:var(--space-2);">Email Subject</label>
          <input type="text" id="notify-subject" value="New Opportunity: ${escapeHtml(campaign.title)} — ${escapeHtml(campaign.destination_country || '')}"
            style="width:100%;padding:var(--space-3);background:var(--bg-deep);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);">
        </div>

        <div style="margin-bottom:var(--space-4);">
          <label style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);display:block;margin-bottom:var(--space-2);">Message</label>
          <textarea id="notify-message" rows="6" style="width:100%;padding:var(--space-3);background:var(--bg-deep);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);resize:vertical;">Dear Applicant,

We have an exciting new opportunity that matches your profile:

Position: ${campaign.title}
Destination: ${campaign.destination_country || 'TBD'}
Salary: ${campaign.salary_display || 'Competitive'}
${campaign.visa_sponsored ? 'Visa: Sponsored by employer' : ''}

Apply now at https://globalhire.elabsolution.org/jobs.html or reply to this email for more information.

Best regards,
eLab Solutions International
GlobalHire Recruitment Team</textarea>
        </div>

        <div id="notify-status" style="display:none;margin-bottom:var(--space-3);padding:var(--space-3);border-radius:var(--radius-md);font-size:var(--text-sm);"></div>

        <div style="display:flex;gap:var(--space-3);justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('notify-modal').remove()">Cancel</button>
          <button class="btn btn-primary btn-sm" id="btn-send-notify" onclick="CampaignNotify.send('${campaignId}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send Emails
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
  }

  // ── Send notification emails ──
  window.CampaignNotify = {
    send: async function(campaignId) {
      var btn = document.getElementById('btn-send-notify');
      var statusEl = document.getElementById('notify-status');
      var target = document.getElementById('notify-target').value;
      var subject = document.getElementById('notify-subject').value.trim();
      var message = document.getElementById('notify-message').value.trim();

      if (!subject || !message) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = 'var(--error)';
        statusEl.textContent = 'Please fill in both subject and message.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Sending...';
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(0,119,182,0.1)';
      statusEl.style.color = 'var(--primary)';

      try {
        // All targets use bulk-campaign-notify with custom subject/message
        statusEl.textContent = 'Sending emails to ' + (target === 'matched' ? 'matched candidates' : target === 'all' ? 'all applicants' : 'matching specialty') + '...';
        var { data: result, error } = await sb.functions.invoke('bulk-campaign-notify', {
          body: {
            campaign_id: campaignId,
            target: target,
            subject: subject,
            message: message,
          },
        });
        if (error) throw error;

        if (result && result.error) {
          throw new Error(result.error);
        }

        statusEl.style.background = 'rgba(46,196,182,0.1)';
        statusEl.style.color = 'var(--success)';
        var summary = 'Emails sent successfully!';
        if (result) {
          summary += '\n\nSent: ' + (result.sent || 0) + ' recipients';
          if (result.failed) summary += '\nFailed: ' + result.failed;
          if (result.total) summary += '\nTotal applicants found: ' + result.total;
        }
        statusEl.style.whiteSpace = 'pre-line';
        statusEl.textContent = summary;

        btn.textContent = 'Sent!';
        btn.style.background = 'var(--success)';
        btn.style.borderColor = 'var(--success)';
        // Don't auto-close — let user read the result and close manually

      } catch (err) {
        console.error('Notify error:', err);
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = 'var(--error)';
        statusEl.textContent = 'Failed: ' + (err.message || 'Unknown error') + '. Try the outreach system or WhatsApp instead.';
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    }
  };
})();
