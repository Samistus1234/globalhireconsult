/* ============================================
   GLOBALHIRE@ELAB — Candidates Page
   Full applicant list with search, filter,
   pagination, and management actions
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  let adminProfile = null;
  let allApplicants = [];
  let filteredApplicants = [];
  let currentPage = 1;
  const pageSize = 20;

  window.addEventListener('gh:auth-ready', async (e) => {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadAllCandidates();
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

    // Sign out
    var signoutBtn = document.getElementById('admin-signout');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        GHAuth.signOut();
      });
    }
  }

  // ── Load all candidates ──
  async function loadAllCandidates() {
    var { data, error } = await ghFrom('admin_applicant_overview')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load candidates:', error);
      var tbody = document.getElementById('candidates-tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);color:var(--error);">Failed to load candidates. Please refresh.</td></tr>';
      }
      return;
    }

    allApplicants = data || [];
    populateSpecialtyFilter();
    applyFilters();
  }

  // ── Populate specialty dropdown from data ──
  function populateSpecialtyFilter() {
    var select = document.getElementById('filter-specialty');
    if (!select) return;

    var specialties = {};
    allApplicants.forEach(function (a) {
      if (a.specialty) specialties[a.specialty] = true;
    });

    var sorted = Object.keys(specialties).sort();
    // Keep the "All Specialties" option, remove others
    select.innerHTML = '<option value="">All Specialties</option>';
    sorted.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    });
  }

  // ── Bind filter controls ──
  function bindFilters() {
    var searchInput = document.getElementById('candidates-search');
    var pipelineSelect = document.getElementById('filter-pipeline');
    var availabilitySelect = document.getElementById('filter-availability');
    var specialtySelect = document.getElementById('filter-specialty');

    if (searchInput) {
      searchInput.addEventListener('input', GHE.debounce(function () {
        currentPage = 1;
        applyFilters();
      }, 250));
    }

    [pipelineSelect, availabilitySelect, specialtySelect].forEach(function (el) {
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
    var searchVal = (document.getElementById('candidates-search')?.value || '').toLowerCase().trim();
    var pipelineVal = document.getElementById('filter-pipeline')?.value || '';
    var availVal = document.getElementById('filter-availability')?.value || '';
    var specVal = document.getElementById('filter-specialty')?.value || '';

    filteredApplicants = allApplicants.filter(function (a) {
      // Search: name, email, specialty
      if (searchVal) {
        var haystack = [
          a.full_name || '',
          a.email || '',
          a.specialty || '',
          a.country_of_origin || ''
        ].join(' ').toLowerCase();
        if (haystack.indexOf(searchVal) === -1) return false;
      }

      // Pipeline status
      if (pipelineVal && a.pipeline_status !== pipelineVal) return false;

      // Availability
      var avail = a.availability_status || 'active';
      if (availVal && avail !== availVal) return false;

      // Specialty
      if (specVal && a.specialty !== specVal) return false;

      return true;
    });

    updateKPIs();
    renderTable();
    renderPagination();

    // Results count badge
    var badge = document.getElementById('results-count');
    if (badge) badge.textContent = filteredApplicants.length + ' result' + (filteredApplicants.length !== 1 ? 's' : '');
  }

  // ── Update KPI cards ──
  function updateKPIs() {
    var total = allApplicants.length;
    var active = 0;
    var pausedClosed = 0;
    var verified = 0;

    allApplicants.forEach(function (a) {
      var avail = a.availability_status || 'active';
      if (avail === 'active') active++;
      if (avail === 'paused' || avail === 'closed') pausedClosed++;
      if (a.pipeline_status === 'verified') verified++;
    });

    var kpiTotal = document.getElementById('kpi-total');
    var kpiActive = document.getElementById('kpi-active');
    var kpiPaused = document.getElementById('kpi-paused');
    var kpiVerified = document.getElementById('kpi-verified');

    if (kpiTotal) kpiTotal.textContent = total.toLocaleString();
    if (kpiActive) kpiActive.textContent = active.toLocaleString();
    if (kpiPaused) kpiPaused.textContent = pausedClosed.toLocaleString();
    if (kpiVerified) kpiVerified.textContent = verified.toLocaleString();

    // Sub-labels
    var totalPct = total > 0 ? Math.round((active / total) * 100) : 0;
    var subTotal = document.getElementById('kpi-total-sub');
    var subActive = document.getElementById('kpi-active-sub');
    var subPaused = document.getElementById('kpi-paused-sub');
    var subVerified = document.getElementById('kpi-verified-sub');

    if (subTotal) subTotal.textContent = 'All registered applicants';
    if (subActive) subActive.textContent = totalPct + '% of total pipeline';
    if (subPaused) subPaused.textContent = pausedClosed === 0 ? 'None currently' : 'May need follow-up';
    if (subVerified) subVerified.textContent = verified === 0 ? 'None yet' : 'Ready for placement';
  }

  // ── Render table rows ──
  function renderTable() {
    var tbody = document.getElementById('candidates-tbody');
    if (!tbody) return;

    var startIdx = (currentPage - 1) * pageSize;
    var pageData = filteredApplicants.slice(startIdx, startIdx + pageSize);

    if (pageData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No candidates match the current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = pageData.map(function (a) {
      var colors = GHE.avatarColors[a.avatar_color_index || 0];

      // Pipeline badge
      var statusMap = {
        applied: { badge: 'badge-info', label: 'Applied' },
        screening: { badge: 'badge-warning', label: 'Screening' },
        verifying: { badge: 'badge-secondary', label: 'Verifying' },
        verified: { badge: 'badge-primary', label: 'Verified' }
      };
      var st = statusMap[a.pipeline_status] || statusMap.applied;

      // Availability badge
      var availStatus = a.availability_status || 'active';
      var availMap = {
        active: { badge: 'badge-primary', label: 'Active' },
        paused: { badge: 'badge-warning', label: 'Paused' },
        closed: { badge: 'badge-error', label: 'Closed' }
      };
      var av = availMap[availStatus] || availMap.active;

      // Experience
      var exp = a.years_experience != null ? a.years_experience + ' yrs' : '-';

      // Docs count
      var docs = (a.total_docs != null ? a.total_docs : 0) + '/4 docs';

      // Actions
      var actionHtml = availStatus !== 'active'
        ? '<button class="btn btn-primary btn-sm btn-reactivate" data-id="' + a.id + '">Reactivate</button>'
        : '<button class="btn btn-ghost btn-sm btn-view" data-id="' + a.id + '">View</button>';

      return '<tr>' +
        '<td>' +
          '<div class="applicant-row">' +
            '<div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (a.avatar_initials || '??') + '</div>' +
            '<div class="applicant-info">' +
              '<div class="applicant-name">' + GHE.escapeHtml(a.full_name || 'Unnamed') + '</div>' +
              '<div class="applicant-detail">' + GHE.escapeHtml(a.email || '') + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + GHE.escapeHtml(a.specialty || '-') + '</td>' +
        '<td><span class="tag">' + GHE.escapeHtml(a.country_of_origin || '-') + '</span></td>' +
        '<td>' + exp + '</td>' +
        '<td>' + docs + '</td>' +
        '<td><span class="badge ' + st.badge + ' badge-dot">' + st.label + '</span></td>' +
        '<td><span class="badge ' + av.badge + ' badge-dot">' + av.label + '</span></td>' +
        '<td>' + actionHtml + '</td>' +
      '</tr>';
    }).join('');

    // Bind reactivate buttons
    tbody.querySelectorAll('.btn-reactivate').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var applicantId = btn.dataset.id;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';

        var { error } = await ghFrom('profiles')
          .update({
            availability_status: 'active',
            availability_changed_at: new Date().toISOString(),
            deactivation_reason: null
          })
          .eq('id', applicantId);

        if (error) {
          alert('Failed to reactivate: ' + error.message);
          btn.disabled = false;
          btn.textContent = 'Reactivate';
          return;
        }

        // Reload data
        await loadAllCandidates();
      });
    });

    // Bind view buttons
    tbody.querySelectorAll('.btn-view').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // Future: navigate to candidate detail page
        // For now just log
        console.log('View candidate:', btn.dataset.id);
      });
    });
  }

  // ── Render pagination ──
  function renderPagination() {
    var container = document.getElementById('pagination-controls');
    if (!container) return;

    var totalPages = Math.ceil(filteredApplicants.length / pageSize);

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    var html = '';

    // Previous button
    html += '<button class="pagination-btn" data-page="prev"' + (currentPage === 1 ? ' disabled' : '') + '>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>' +
    '</button>';

    // Page numbers (show max 7 page buttons with ellipsis)
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
    var endItem = Math.min(currentPage * pageSize, filteredApplicants.length);
    html += '<span class="pagination-info">' + startItem + '-' + endItem + ' of ' + filteredApplicants.length + '</span>';

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
        // Scroll to top of table
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
    var half = Math.floor((maxButtons - 2) / 2); // space for first, last, and ellipses

    // Always show first page
    pages.push(1);

    var rangeStart = Math.max(2, current - half);
    var rangeEnd = Math.min(total - 1, current + half);

    // Adjust range if near edges
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

    // Always show last page
    pages.push(total);

    return pages;
  }

  // ── Utility: escape HTML (add to GHE if not present) ──
  if (typeof GHE !== 'undefined' && !GHE.escapeHtml) {
    GHE.escapeHtml = function (str) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    };
  }

})();
