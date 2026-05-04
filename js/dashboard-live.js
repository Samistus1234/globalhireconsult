/* ============================================
   GLOBALHIRE@ELAB — Dashboard Live Data
   Fetches real applicant/document data for admin
   Loaded after dashboard.js on dashboard.html
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  let adminProfile = null;

  window.addEventListener('gh:auth-ready', async (e) => {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadLiveData();
    subscribeRealtime();
  });

  function updateAdminUI() {
    const nameEl = document.getElementById('admin-user-name');
    const roleEl = document.getElementById('admin-user-role');
    const avatarEl = document.getElementById('admin-user-avatar');
    if (nameEl) nameEl.textContent = adminProfile.full_name || 'Admin';
    if (roleEl) roleEl.textContent = 'Platform Admin';
    if (avatarEl) {
      avatarEl.textContent = adminProfile.avatar_initials || 'A';
      var colors = GHE.avatarColors[adminProfile.avatar_color_index || 0];
      avatarEl.style.background = colors[0];
      avatarEl.style.color = colors[1];
    }

    // Sign out button
    document.getElementById('admin-signout')?.addEventListener('click', (e) => {
      e.preventDefault();
      GHAuth.signOut();
    });
  }

  async function loadLiveData() {
    await Promise.all([
      loadKPIs(),
      loadRecentApplicants(),
      loadVerificationQueue(),
      loadPipelineCounts(),
      loadCampaignBadge(),
      loadInbox()
    ]);
  }

  // ── KPI Cards ──
  async function loadKPIs() {
    const { data: applicants } = await ghFrom('admin_applicant_overview').select('id, pipeline_status');
    const { data: pendingDocs } = await ghFrom('documents').select('id').eq('status', 'pending');

    const totalApplicants = applicants ? applicants.length : 0;
    const pendingCount = pendingDocs ? pendingDocs.length : 0;

    const kpiPipeline = document.getElementById('kpi-pipeline');
    const kpiPending = document.getElementById('kpi-pending');
    if (kpiPipeline) kpiPipeline.textContent = totalApplicants.toLocaleString();
    if (kpiPending) kpiPending.textContent = pendingCount.toLocaleString();
  }

  // ── Recent Applicants ──
  async function loadRecentApplicants() {
    const tbody = document.getElementById('applicant-tbody');
    if (!tbody) return;

    const { data, error } = await ghFrom('admin_applicant_overview')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">
          No applicants yet. They will appear here once they sign up.
        </td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(a => {
      var colors = GHE.avatarColors[a.avatar_color_index || 0];
      const statusMap = {
        applied: { badge: 'badge-info', label: 'Applied' },
        screening: { badge: 'badge-warning', label: 'Screening' },
        verifying: { badge: 'badge-secondary', label: 'Verifying' },
        verified: { badge: 'badge-primary', label: 'Verified' }
      };
      const st = statusMap[a.pipeline_status] || statusMap.applied;

      // Availability status badge
      const availStatus = a.availability_status || 'active';
      const availMap = {
        active: { badge: 'badge-primary', label: 'Active' },
        paused: { badge: 'badge-warning', label: 'Paused' },
        closed: { badge: 'badge-error', label: 'Closed' }
      };
      const av = availMap[availStatus] || availMap.active;

      // Show reactivate button for paused/closed
      const actionHtml = availStatus !== 'active'
        ? `<button class="btn btn-primary btn-sm btn-reactivate" data-id="${a.id}">Reactivate</button>`
        : `<button class="btn btn-ghost btn-sm">Review</button>`;

      const appliedDate = a.created_at
        ? new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        : '-';

      return `
        <tr>
          <td>
            <div class="applicant-row">
              <div class="avatar avatar-sm" style="background:${colors[0]};color:${colors[1]}">${a.avatar_initials || '??'}</div>
              <div class="applicant-info">
                <div class="applicant-name">${a.full_name || 'Unnamed'}</div>
                <div class="applicant-detail">${a.email || ''}</div>
              </div>
            </div>
          </td>
          <td>${a.specialty || '-'}</td>
          <td><span class="tag">${a.country_of_origin || '-'}</span></td>
          <td>${a.total_docs}/4 docs</td>
          <td><span class="badge ${st.badge} badge-dot">${st.label}</span></td>
          <td><span class="badge ${av.badge} badge-dot">${av.label}</span></td>
          <td style="white-space:nowrap;color:var(--text-secondary);font-size:13px;">${appliedDate}</td>
          <td>${actionHtml}</td>
        </tr>`;
    }).join('');

    // Bind reactivate buttons
    tbody.querySelectorAll('.btn-reactivate').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
        const { error } = await ghFrom('profiles')
          .update({
            availability_status: 'active',
            availability_changed_at: new Date().toISOString(),
            deactivation_reason: null
          })
          .eq('id', btn.dataset.id);

        if (error) {
          alert('Failed to reactivate: ' + error.message);
          btn.disabled = false;
          btn.textContent = 'Reactivate';
          return;
        }
        await loadRecentApplicants();
      });
    });
  }

  // ── Verification Queue ──
  async function loadVerificationQueue() {
    const queue = document.getElementById('verif-queue');
    if (!queue) return;

    const { data: docs, error } = await ghFrom('documents')
      .select('id, doc_type, file_name, status, applicant_id')
      .in('status', ['pending', 'in_review'])
      .order('uploaded_at', { ascending: false })
      .limit(10);

    if (error || !docs || docs.length === 0) {
      queue.innerHTML = `
        <div style="padding:var(--space-8);text-align:center;color:var(--text-tertiary);">
          No documents pending verification.
        </div>`;
      const badge = document.getElementById('verif-count-badge');
      if (badge) badge.textContent = '0 pending';
      return;
    }

    // Get applicant names
    const applicantIds = [...new Set(docs.map(d => d.applicant_id))];
    const { data: profiles } = await ghFrom('profiles')
      .select('id, full_name')
      .in('id', applicantIds);

    const nameMap = {};
    if (profiles) profiles.forEach(p => { nameMap[p.id] = p.full_name; });

    const docTypeLabels = {
      license: 'Professional License',
      degree: 'Degree Certificate',
      passport: 'Passport Copy',
      cv: 'CV / Resume'
    };

    queue.innerHTML = docs.map(d => `
      <div class="verif-item" data-doc-id="${d.id}">
        <div class="status-dot ${d.status === 'in_review' ? 'status-dot-active' : 'status-dot-pending'}"></div>
        <div class="verif-info">
          <div class="verif-name">${nameMap[d.applicant_id] || 'Unknown'}</div>
          <div class="verif-detail">${docTypeLabels[d.doc_type] || d.doc_type}</div>
        </div>
        <div class="verif-actions">
          ${d.status === 'pending' ? `
            <button class="btn btn-sm btn-primary btn-verify" data-id="${d.id}">Verify</button>
            <button class="btn btn-sm btn-ghost btn-reject" data-id="${d.id}" style="color:var(--error)">Reject</button>
          ` : `
            <span class="badge badge-info">In Review</span>
          `}
        </div>
      </div>
    `).join('');

    const badge = document.getElementById('verif-count-badge');
    if (badge) badge.textContent = docs.length + ' pending';

    // Bind verify/reject buttons
    queue.querySelectorAll('.btn-verify').forEach(btn => {
      btn.addEventListener('click', () => updateDocStatus(btn.dataset.id, 'verified'));
    });
    queue.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => updateDocStatus(btn.dataset.id, 'rejected'));
    });
  }

  async function updateDocStatus(docId, newStatus) {
    const { error } = await ghFrom('documents')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() })
      .eq('id', docId);

    if (error) {
      alert('Failed to update: ' + error.message);
      return;
    }

    await loadVerificationQueue();
    await loadKPIs();
    await loadRecentApplicants();
  }

  // ── Pipeline counts ──
  async function loadPipelineCounts() {
    const { data } = await ghFrom('admin_applicant_overview').select('pipeline_status');
    if (!data) return;

    const counts = { applied: 0, screening: 0, verifying: 0, verified: 0 };
    data.forEach(a => {
      if (counts[a.pipeline_status] !== undefined) counts[a.pipeline_status]++;
    });

    const stageEls = document.querySelectorAll('.pipeline-stage[data-stage]');
    stageEls.forEach(el => {
      const stage = el.dataset.stage;
      const countEl = el.querySelector('.stage-count');
      if (countEl && counts[stage] !== undefined) {
        countEl.textContent = counts[stage];
      }
    });
  }

  // ── Campaign badge count ──
  async function loadCampaignBadge() {
    var badge = document.getElementById('campaigns-badge');
    if (!badge) return;
    var { data } = await ghFrom('campaigns')
      .select('id')
      .in('status', ['matching', 'review', 'sending', 'active']);
    var count = data ? data.length : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }

  // ── Applicant Inbox ──
  async function loadInbox() {
    var listEl = document.getElementById('inbox-list');
    var badgeEl = document.getElementById('inbox-count-badge');
    if (!listEl) return;

    // gh_inbox view joins messages + profiles, filtered to inbound only
    var { data: inbound, error: err } = await sb
      .from('gh_inbox')
      .select('applicant_id, subject, body, sent_at, full_name, avatar_initials, avatar_color_index')
      .order('sent_at', { ascending: false })
      .limit(20);

    if (err) console.error('Inbox error:', err);
    inbound = inbound || [];

    if (badgeEl) {
      badgeEl.textContent = inbound.length;
      badgeEl.style.display = inbound.length > 0 ? '' : 'none';
    }

    if (inbound.length === 0) {
      listEl.innerHTML = '<div style="padding:var(--space-6);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm);">No applicant messages yet.</div>';
      return;
    }

    var esc = function(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

    try {
      listEl.innerHTML = inbound.map(function(m) {
        var ci = m.avatar_color_index || 0;
        var colorArr = (typeof GHE !== 'undefined' && GHE.avatarColors && GHE.avatarColors[ci]) ? GHE.avatarColors[ci] : ['#0077B6', '#fff'];
        var timeStr = m.sent_at ? new Date(m.sent_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
        var preview = (m.body || '').substring(0, 100) + ((m.body || '').length > 100 ? '...' : '');

        return '<a href="candidates.html?open=' + m.applicant_id + '" style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.06);text-decoration:none;cursor:pointer;" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'\'">' +
          '<div class="avatar avatar-sm" style="background:' + colorArr[0] + ';color:' + colorArr[1] + ';flex-shrink:0;margin-top:2px;">' + esc(m.avatar_initials || '??') + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px;">' +
              '<span style="font-size:14px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(m.full_name) + '</span>' +
              '<span style="font-size:10px;color:var(--text-tertiary);white-space:nowrap;flex-shrink:0;">' + timeStr + '</span>' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(preview) + '</div>' +
          '</div>' +
        '</a>';
      }).join('');
    } catch (renderErr) {
      console.error('Inbox render error:', renderErr);
      listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">Error rendering inbox: ' + renderErr.message + '</div>';
    }
  }

  // ── Realtime subscription ──
  function subscribeRealtime() {
    sb.channel('gh-admin-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'globalhire',
        table: 'profiles'
      }, () => {
        loadRecentApplicants();
        loadKPIs();
        loadPipelineCounts();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'globalhire',
        table: 'documents'
      }, () => {
        loadVerificationQueue();
        loadKPIs();
      })
      .subscribe();
  }
})();
