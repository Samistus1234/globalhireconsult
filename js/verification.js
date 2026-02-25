/* ============================================
   GLOBALHIRE@ELAB — Verification Page
   Document verification queue with actions
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var adminProfile = null;
  var allDocs = [];
  var filteredDocs = [];
  var nameMap = {};

  var docTypeLabels = {
    license: 'Professional License',
    degree: 'Degree Certificate',
    passport: 'Passport Copy',
    cv: 'CV / Resume'
  };

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadDocuments();
    bindFilters();
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

  async function loadDocuments() {
    var [docsRes, profilesRes] = await Promise.all([
      ghFrom('documents').select('*').order('uploaded_at', { ascending: false }),
      ghFrom('profiles').select('id, full_name, avatar_initials, avatar_color_index').eq('role', 'applicant')
    ]);

    allDocs = docsRes.data || [];
    nameMap = {};
    if (profilesRes.data) {
      profilesRes.data.forEach(function (p) {
        nameMap[p.id] = p;
      });
    }

    applyFilters();
  }

  function applyFilters() {
    var search = (document.getElementById('verif-search')?.value || '').toLowerCase();
    var docType = document.getElementById('filter-doc-type')?.value || '';
    var status = document.getElementById('filter-status')?.value || '';

    filteredDocs = allDocs.filter(function (d) {
      if (search) {
        var applicant = nameMap[d.applicant_id];
        var hay = ((applicant ? applicant.full_name : '') + ' ' + (d.file_name || '') + ' ' + (d.doc_type || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      if (docType && d.doc_type !== docType) return false;
      if (status && d.status !== status) return false;
      return true;
    });

    updateKPIs();
    renderTable();
  }

  function updateKPIs() {
    var pending = allDocs.filter(function (d) { return d.status === 'pending'; }).length;
    var inReview = allDocs.filter(function (d) { return d.status === 'in_review'; }).length;
    var verified = allDocs.filter(function (d) { return d.status === 'verified'; }).length;

    var today = new Date().toISOString().split('T')[0];
    var verifiedToday = allDocs.filter(function (d) {
      return d.status === 'verified' && d.reviewed_at && d.reviewed_at.startsWith(today);
    }).length;

    var el1 = document.getElementById('kpi-pending');
    var el2 = document.getElementById('kpi-in-review');
    var el3 = document.getElementById('kpi-verified-today');
    var el4 = document.getElementById('kpi-total-verified');
    if (el1) el1.textContent = pending;
    if (el2) el2.textContent = inReview;
    if (el3) el3.textContent = verifiedToday;
    if (el4) el4.textContent = verified;

    var badge = document.getElementById('verif-total-badge');
    if (badge) badge.textContent = filteredDocs.length + ' documents';
  }

  function renderTable() {
    var tbody = document.getElementById('verif-tbody');
    if (!tbody) return;

    if (filteredDocs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No documents found matching your filters.</td></tr>';
      return;
    }

    tbody.innerHTML = filteredDocs.map(function (d) {
      var applicant = nameMap[d.applicant_id] || {};
      var colors = GHE.avatarColors[applicant.avatar_color_index || 0];

      var statusMap = {
        pending: { badge: 'badge-warning', label: 'Pending' },
        in_review: { badge: 'badge-info', label: 'In Review' },
        verified: { badge: 'badge-primary', label: 'Verified' },
        rejected: { badge: 'badge-error', label: 'Rejected' }
      };
      var st = statusMap[d.status] || statusMap.pending;

      var uploaded = d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : '-';

      var actions = '';
      if (d.status === 'pending' || d.status === 'in_review') {
        actions = '<button class="btn btn-sm btn-primary btn-verify" data-id="' + d.id + '">Verify</button>' +
          '<button class="btn btn-sm btn-ghost btn-reject" data-id="' + d.id + '" style="color:var(--error)">Reject</button>';
      } else {
        actions = '<span style="font-size:var(--text-xs);color:var(--text-tertiary);">' + st.label + '</span>';
      }

      return '<tr>' +
        '<td><div class="applicant-row"><div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (applicant.avatar_initials || '??') + '</div><div class="applicant-info"><div class="applicant-name">' + (applicant.full_name || 'Unknown') + '</div></div></div></td>' +
        '<td>' + (docTypeLabels[d.doc_type] || d.doc_type || '-') + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + (d.file_name || '-') + '</td>' +
        '<td><span class="badge ' + st.badge + ' badge-dot">' + st.label + '</span></td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + uploaded + '</td>' +
        '<td><div style="display:flex;gap:var(--space-2);">' + actions + '</div></td>' +
        '</tr>';
    }).join('');

    // Bind actions
    tbody.querySelectorAll('.btn-verify').forEach(function (btn) {
      btn.addEventListener('click', function () { updateDocStatus(btn.dataset.id, 'verified'); });
    });
    tbody.querySelectorAll('.btn-reject').forEach(function (btn) {
      btn.addEventListener('click', function () { updateDocStatus(btn.dataset.id, 'rejected'); });
    });
  }

  async function updateDocStatus(docId, newStatus) {
    var { error } = await ghFrom('documents')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() })
      .eq('id', docId);

    if (error) {
      alert('Failed to update: ' + error.message);
      return;
    }
    await loadDocuments();
  }

  function bindFilters() {
    var searchEl = document.getElementById('verif-search');
    if (searchEl) searchEl.addEventListener('input', GHE.debounce(function () { applyFilters(); }, 300));

    ['filter-doc-type', 'filter-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { applyFilters(); });
    });

    var resetBtn = document.getElementById('filter-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (document.getElementById('verif-search')) document.getElementById('verif-search').value = '';
        if (document.getElementById('filter-doc-type')) document.getElementById('filter-doc-type').value = '';
        if (document.getElementById('filter-status')) document.getElementById('filter-status').value = '';
        applyFilters();
      });
    }
  }
})();
