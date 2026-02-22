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
      loadPipelineCounts()
    ]);
  }

  // ── KPI Cards ──
  async function loadKPIs() {
    const { data: applicants } = await sb.from('admin_applicant_overview').select('id, pipeline_status');
    const { data: pendingDocs } = await sb.from('documents').select('id').eq('status', 'pending');

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

    const { data, error } = await sb.from('admin_applicant_overview')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">
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
          <td><button class="btn btn-ghost btn-sm">Review</button></td>
        </tr>`;
    }).join('');
  }

  // ── Verification Queue ──
  async function loadVerificationQueue() {
    const queue = document.getElementById('verif-queue');
    if (!queue) return;

    const { data: docs, error } = await sb.from('documents')
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
    const { data: profiles } = await sb.from('profiles')
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
    const { error } = await sb.from('documents')
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
    const { data } = await sb.from('admin_applicant_overview').select('pipeline_status');
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
