/* ============================================
   GLOBALHIRE@ELAB — Admin: Recruiter Submissions
   List of candidates submitted by recruiters for
   admin review, tagged by source recruiter.
   ============================================ */

(function () {
  var adminProfile = null;
  var allSubmissions = [];
  var recruiterMap = {};   // recruiter_id -> profile { full_name, organization_name }

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadSubmissions();
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
    var signoutBtn = document.getElementById('admin-signout');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        GHAuth.signOut();
      });
    }
  }

  // ── Load all submissions + recruiter names (admin RLS returns all rows) ──
  async function loadSubmissions() {
    var tbody = document.getElementById('submissions-tbody');

    var [subsRes, recruitersRes] = await Promise.all([
      ghFrom('recruiter_submitted_candidates').select('*').order('created_at', { ascending: false }),
      ghFrom('profiles').select('id, full_name, organization_name').eq('role', 'recruiter')
    ]);

    if (subsRes.error) {
      console.error('Failed to load recruiter submissions:', subsRes.error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-10);color:var(--error);">Failed to load submissions. Please refresh.</td></tr>';
      }
      return;
    }

    allSubmissions = subsRes.data || [];

    recruiterMap = {};
    (recruitersRes.data || []).forEach(function (r) {
      recruiterMap[r.id] = r;
    });

    populateRecruiterFilter();
    updateKPIs();
    applyFilters();
  }

  // ── Populate recruiter dropdown from recruiters who have submissions ──
  function populateRecruiterFilter() {
    var select = document.getElementById('filter-recruiter');
    if (!select) return;

    var seen = {};
    var options = [];
    allSubmissions.forEach(function (s) {
      if (s.recruiter_id && !seen[s.recruiter_id]) {
        seen[s.recruiter_id] = true;
        var rec = recruiterMap[s.recruiter_id];
        options.push({ id: s.recruiter_id, label: rec ? rec.full_name : 'Unknown recruiter' });
      }
    });
    options.sort(function (a, b) { return (a.label || '').localeCompare(b.label || ''); });

    var current = select.value;
    select.innerHTML = '<option value="">All Recruiters</option>';
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      select.appendChild(opt);
    });
    select.value = current;
  }

  // ── KPIs ──
  function updateKPIs() {
    var total = allSubmissions.length;
    var pending = 0, shortlisted = 0, placed = 0;
    allSubmissions.forEach(function (s) {
      if (s.admin_status === 'submitted' || s.admin_status === 'under_review') pending++;
      if (s.admin_status === 'shortlisted') shortlisted++;
      if (s.admin_status === 'placed') placed++;
    });
    var kpiTotal = document.getElementById('kpi-total');
    var kpiPending = document.getElementById('kpi-pending');
    var kpiShortlisted = document.getElementById('kpi-shortlisted');
    var kpiPlaced = document.getElementById('kpi-placed');
    if (kpiTotal) kpiTotal.textContent = total.toLocaleString();
    if (kpiPending) kpiPending.textContent = pending.toLocaleString();
    if (kpiShortlisted) kpiShortlisted.textContent = shortlisted.toLocaleString();
    if (kpiPlaced) kpiPlaced.textContent = placed.toLocaleString();
  }

  // ── Filters ──
  function bindFilters() {
    var search = document.getElementById('rs-search');
    var recruiterSelect = document.getElementById('filter-recruiter');
    var statusSelect = document.getElementById('filter-admin-status');

    if (search) search.addEventListener('input', GHE.debounce(applyFilters, 200));
    if (recruiterSelect) recruiterSelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
  }

  function applyFilters() {
    var q = (document.getElementById('rs-search')?.value || '').toLowerCase().trim();
    var recruiterVal = document.getElementById('filter-recruiter')?.value || '';
    var statusVal = document.getElementById('filter-admin-status')?.value || '';

    var filtered = allSubmissions.filter(function (s) {
      if (recruiterVal && s.recruiter_id !== recruiterVal) return false;
      if (statusVal && s.admin_status !== statusVal) return false;
      if (q) {
        var haystack = [
          s.full_name || '',
          s.email || '',
          s.profession || '',
          s.specialty || ''
        ].join(' ').toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      return true;
    });

    renderTable(filtered);

    var badge = document.getElementById('results-count');
    if (badge) badge.textContent = filtered.length + ' result' + (filtered.length !== 1 ? 's' : '');
  }

  // ── admin_status badge ──
  var STATUS_INFO = {
    submitted:     { label: 'Submitted',     color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
    under_review:  { label: 'Under Review',  color: '#D4A84B', bg: 'rgba(212,168,75,0.12)' },
    shortlisted:   { label: 'Shortlisted',   color: '#0096C7', bg: 'rgba(0,150,199,0.12)' },
    placed:        { label: 'Placed',        color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
    rejected:      { label: 'Rejected',      color: '#DC2626', bg: 'rgba(220,38,38,0.12)' }
  };

  function statusBadge(status) {
    var info = STATUS_INFO[status] || STATUS_INFO.submitted;
    return '<span class="rs-status-badge" style="color:' + info.color + ';background:' + info.bg + ';">' + esc(info.label) + '</span>';
  }

  // ── Render table ──
  function renderTable(list) {
    var tbody = document.getElementById('submissions-tbody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-10);color:var(--text-tertiary);">No recruiter submissions match the current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (s) {
      var rec = recruiterMap[s.recruiter_id];
      var recruiterLabel = rec
        ? esc(rec.full_name) + (rec.organization_name ? ' <span style="color:var(--text-tertiary);font-size:11px;">&middot; ' + esc(rec.organization_name) + '</span>' : '')
        : '<span style="color:var(--text-tertiary);">Unknown recruiter</span>';

      var professionLine = esc(s.profession || '-') + (s.specialty ? ' <span style="color:var(--text-tertiary);">&middot; ' + esc(s.specialty) + '</span>' : '');

      var submittedDate = s.created_at
        ? new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '-';

      return '<tr>' +
        '<td>' +
          '<div style="font-weight:600;color:var(--text-primary);">' + esc(s.full_name || 'Unnamed') + '</div>' +
          '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(s.email || '') + '</div>' +
        '</td>' +
        '<td>' + professionLine + '</td>' +
        '<td>' + recruiterLabel + '</td>' +
        '<td>' + statusBadge(s.admin_status) + '</td>' +
        '<td style="white-space:nowrap;color:var(--text-secondary);">' + submittedDate + '</td>' +
        '<td><button class="btn btn-ghost btn-sm btn-review-submission" data-id="' + esc(s.id) + '">Review</button></td>' +
      '</tr>';
    }).join('');

    // Bind Review buttons (detail panel + status editing is Task A6 — this is a stub seam).
    tbody.querySelectorAll('.btn-review-submission').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openSubmissionReview(btn.dataset.id);
      });
    });
  }

  // ── TODO(A6): open the review detail panel (view full profile_data,
  // edit admin_status/admin_note, promote to a real profiles row). For
  // now this is a stub seam so Task A5 stays list-only per the brief. ──
  function openSubmissionReview(submissionId) {
    console.log('openSubmissionReview stub — submission id:', submissionId, '(full review UI is Task A6)');
    alert('Review panel coming soon (Task A6). Submission id: ' + submissionId);
  }

  // Exposed for A6 to hook into without re-deriving the seam.
  window.openSubmissionReview = openSubmissionReview;

})();
