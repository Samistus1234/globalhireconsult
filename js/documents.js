/* ============================================
   GLOBALHIRE@ELAB — Documents Page
   All documents browser with search/filter
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
      profilesRes.data.forEach(function (p) { nameMap[p.id] = p; });
    }

    applyFilters();
  }

  function applyFilters() {
    var search = (document.getElementById('docs-search')?.value || '').toLowerCase();
    var type = document.getElementById('filter-type')?.value || 'all';
    var status = document.getElementById('filter-status')?.value || 'all';

    filteredDocs = allDocs.filter(function (d) {
      if (search) {
        var applicant = nameMap[d.applicant_id];
        var hay = ((applicant ? applicant.full_name : '') + ' ' + (d.file_name || '')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      if (type !== 'all' && d.doc_type !== type) return false;
      if (status !== 'all' && d.status !== status) return false;
      return true;
    });

    updateKPIs();
    renderTable();
  }

  function updateKPIs() {
    var total = allDocs.length;
    var verified = allDocs.filter(function (d) { return d.status === 'verified'; }).length;
    var pending = allDocs.filter(function (d) { return d.status === 'pending' || d.status === 'in_review'; }).length;
    var rejected = allDocs.filter(function (d) { return d.status === 'rejected'; }).length;

    var el1 = document.getElementById('kpi-total');
    var el2 = document.getElementById('kpi-verified');
    var el3 = document.getElementById('kpi-pending');
    var el4 = document.getElementById('kpi-rejected');
    if (el1) el1.textContent = total;
    if (el2) el2.textContent = verified;
    if (el3) el3.textContent = pending;
    if (el4) el4.textContent = rejected;

    var badge = document.getElementById('docs-count-badge');
    if (badge) badge.textContent = filteredDocs.length + ' documents';
  }

  function formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderTable() {
    var tbody = document.getElementById('docs-tbody');
    if (!tbody) return;

    if (filteredDocs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No documents found.</td></tr>';
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
      var reviewed = d.reviewed_at ? new Date(d.reviewed_at).toLocaleDateString() : '-';

      return '<tr>' +
        '<td><div class="applicant-row"><div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (applicant.avatar_initials || '??') + '</div><div class="applicant-info"><div class="applicant-name">' + (applicant.full_name || 'Unknown') + '</div></div></div></td>' +
        '<td>' + (docTypeLabels[d.doc_type] || d.doc_type || '-') + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (d.file_name || '-') + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + formatSize(d.file_size) + '</td>' +
        '<td><span class="badge ' + st.badge + ' badge-dot">' + st.label + '</span></td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + uploaded + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + reviewed + '</td>' +
        '<td>' + (d.file_path ? '<button class="btn btn-ghost btn-sm btn-download" data-path="' + d.file_path + '">Download</button>' : '-') + '</td>' +
        '</tr>';
    }).join('');

    // Bind download
    tbody.querySelectorAll('.btn-download').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var { data, error } = await sb.storage.from('gh-documents').createSignedUrl(btn.dataset.path, 3600);
        if (data && data.signedUrl) {
          window.open(data.signedUrl, '_blank');
        } else {
          alert('Could not generate download link.');
        }
      });
    });
  }

  function bindFilters() {
    var searchEl = document.getElementById('docs-search');
    if (searchEl) searchEl.addEventListener('input', GHE.debounce(function () { applyFilters(); }, 300));

    ['filter-type', 'filter-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { applyFilters(); });
    });
  }
})();
