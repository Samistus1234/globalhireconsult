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
  // Map of applicant_id → 'outbound' | 'inbound' (direction of last message)
  let lastMessageDir = {};
  // List of approved recruiters for assignment
  let approvedRecruiters = [];

  window.addEventListener('gh:auth-ready', async (e) => {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadAllCandidates();
    bindFilters();

    // Auto-open candidate if ?open= param is present
    var params = new URLSearchParams(window.location.search);
    var openId = params.get('open');
    if (openId) {
      history.replaceState(null, '', window.location.pathname);
      openCandidatePanel(openId);
    }
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:var(--space-8);color:var(--error);">Failed to load candidates. Please refresh.</td></tr>';
      }
      return;
    }

    // Exclude recruiter accounts from the candidates list
    allApplicants = (data || []).filter(function (a) { return a.role !== 'recruiter'; });
    await Promise.all([loadLastMessages(), loadApprovedRecruiters()]);
    populateSpecialtyFilter();
    applyFilters();
  }

  // ── Load approved recruiters for assignment dropdown ──
  async function loadApprovedRecruiters() {
    var { data } = await ghFrom('profiles')
      .select('id, full_name, organization_name')
      .eq('role', 'recruiter')
      .eq('recruiter_approved', true);
    approvedRecruiters = data || [];
  }

  // ── Load last message direction per applicant ──
  async function loadLastMessages() {
    var { data } = await ghFrom('messages')
      .select('applicant_id, direction, sent_at')
      .order('sent_at', { ascending: false });

    lastMessageDir = {};
    if (data) {
      // First occurrence per applicant = most recent (already ordered desc)
      data.forEach(function (m) {
        if (!lastMessageDir[m.applicant_id]) {
          lastMessageDir[m.applicant_id] = m.direction;
        }
      });
    }
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
    var sourceSelect = document.getElementById('filter-source');

    if (searchInput) {
      searchInput.addEventListener('input', GHE.debounce(function () {
        currentPage = 1;
        applyFilters();
      }, 250));
    }

    [pipelineSelect, availabilitySelect, specialtySelect, sourceSelect].forEach(function (el) {
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
    var sourceVal = document.getElementById('filter-source')?.value || '';

    filteredApplicants = allApplicants.filter(function (a) {
      // Search: name, email, specialty, source
      if (searchVal) {
        var haystack = [
          a.full_name || '',
          a.email || '',
          a.specialty || '',
          a.country_of_origin || '',
          a.source || '',
          a.specialty_detail || ''
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

      // Source / campaign
      if (sourceVal) {
        if (sourceVal === 'direct-signup') {
          if (a.source) return false; // direct signup has no source tag
        } else {
          if (a.source !== sourceVal) return false;
        }
      }

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
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No candidates match the current filters.</td></tr>';
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

      // Awaiting reply indicator
      var lastDir = lastMessageDir[a.id];
      var awaitingBadge = lastDir === 'outbound'
        ? '<div style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;"><span style="width:7px;height:7px;border-radius:50%;background:#F59E0B;display:inline-block;animation:pulse-dot 1.5s infinite;"></span><span style="font-size:10px;color:#F59E0B;font-weight:600;letter-spacing:0.02em;">Awaiting Reply</span></div>'
        : (lastDir === 'inbound' ? '<div style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--success);display:inline-block;"></span><span style="font-size:10px;color:var(--success);font-weight:600;">Replied</span></div>' : '');

      // Source badge
      var sourceLabels = {
        'albania-work-visa': { label: 'Albania', color: '#E41E3F', bg: 'rgba(228,30,63,0.08)' },
        'saudi-ent-surgeon': { label: 'Saudi ENT', color: '#006C35', bg: 'rgba(0,108,53,0.08)' },
        'saudi-fast-track': { label: 'Saudi Fast Track', color: '#D4A84B', bg: 'rgba(212,168,75,0.1)' },
        'qatar-caregivers': { label: 'Qatar', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
      };
      var srcInfo = a.source ? sourceLabels[a.source] : null;
      var sourceBadge = srcInfo
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;color:' + srcInfo.color + ';background:' + srcInfo.bg + ';letter-spacing:0.03em;">' + srcInfo.label + '</span>'
        : '';

      // Actions
      var actionHtml = availStatus !== 'active'
        ? '<button class="btn btn-primary btn-sm btn-reactivate" data-id="' + a.id + '">Reactivate</button>'
        : '<button class="btn btn-ghost btn-sm btn-view" data-id="' + a.id + '">View</button>';

      return '<tr>' +
        '<td>' +
          '<div class="applicant-row">' +
            '<div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (a.avatar_initials || '??') + '</div>' +
            '<div class="applicant-info">' +
              '<div class="applicant-name">' + GHE.escapeHtml(a.full_name || 'Unnamed') + ' ' + sourceBadge + '</div>' +
              '<div class="applicant-detail">' + GHE.escapeHtml(a.email || '') + '</div>' +
              awaitingBadge +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + GHE.escapeHtml(a.specialty || '-') + '</td>' +
        '<td><span class="tag">' + GHE.escapeHtml(a.country_of_origin || '-') + '</span></td>' +
        '<td>' + GHE.escapeHtml((a.preferred_destinations || []).join(', ') || '-') + '</td>' +
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
        openCandidatePanel(btn.dataset.id);
      });
    });
  }

  // ── Candidate Detail Panel ──
  var panelEl = null;
  var overlayEl = null;
  var panelContentEl = null;

  function initPanel() {
    panelEl = document.getElementById('candidate-panel');
    overlayEl = document.getElementById('candidate-overlay');
    panelContentEl = document.getElementById('panel-content');
    var closeBtn = document.getElementById('panel-close');

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (overlayEl) overlayEl.addEventListener('click', closePanel);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });
  }

  function openPanel() {
    if (!panelEl) initPanel();
    panelEl.style.display = 'block';
    overlayEl.style.display = 'block';
    requestAnimationFrame(function () {
      panelEl.style.transform = 'translateX(0)';
      overlayEl.style.opacity = '1';
    });
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.style.transform = 'translateX(100%)';
    overlayEl.style.opacity = '0';
    document.body.style.overflow = '';
    setTimeout(function () {
      panelEl.style.display = 'none';
      overlayEl.style.display = 'none';
    }, 300);
  }

  var docTypeLabels = {
    license: 'Professional License',
    degree: 'Degree / Certificate',
    passport: 'Passport (Data Page)',
    cv: 'CV / Resume',
    passport_photo: 'Passport Photo',
    police_report: 'Police Character Report',
    travel_insurance: 'Travel Insurance'
  };

  async function openCandidatePanel(candidateId) {
    if (!panelContentEl) initPanel();
    panelContentEl.innerHTML = '<div style="text-align:center;padding:var(--space-12);"><div class="spinner" style="margin:0 auto;"></div><p style="color:var(--text-tertiary);margin-top:var(--space-4);">Loading candidate...</p></div>';
    openPanel();

    // Fetch profile
    var { data: profile, error: profileErr } = await ghFrom('profiles')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (profileErr || !profile) {
      panelContentEl.innerHTML = '<p style="color:var(--error);padding:var(--space-4);">Failed to load candidate: ' + (profileErr ? profileErr.message : 'Not found') + '</p>';
      return;
    }

    // Fetch documents
    var { data: docs, error: docsErr } = await ghFrom('documents')
      .select('*')
      .eq('applicant_id', candidateId)
      .order('uploaded_at', { ascending: false });

    docs = docs || [];

    // Fetch recruiter notes for this candidate
    var { data: recruiterNotes } = await ghFrom('recruiter_notes')
      .select('id, note, created_at, recruiter_id')
      .eq('applicant_id', candidateId)
      .order('created_at', { ascending: false });
    recruiterNotes = recruiterNotes || [];

    // Fetch message thread
    var { data: messages } = await ghFrom('messages')
      .select('id, direction, subject, body, sent_at')
      .eq('applicant_id', candidateId)
      .order('sent_at', { ascending: true });

    messages = messages || [];

    var colors = GHE.avatarColors[profile.avatar_color_index || 0];

    // Build profile section
    var html = '';

    // Header
    html += '<div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-6);">';
    html += '<div class="avatar avatar-lg" style="background:' + colors[0] + ';color:' + colors[1] + ';font-size:var(--text-xl);width:56px;height:56px;">' + (profile.avatar_initials || '??') + '</div>';
    html += '<div>';
    html += '<div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">' + GHE.escapeHtml(profile.full_name || 'Unnamed') + '</div>';
    html += '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">' + GHE.escapeHtml(profile.specialty || 'No specialty') + '</div>';
    html += '</div>';
    html += '</div>';

    // Info grid
    var fields = [
      { label: 'Phone', value: profile.phone },
      { label: 'Country', value: profile.country_of_origin },
      { label: 'Experience', value: profile.years_of_experience != null ? profile.years_of_experience + ' years' : null },
      { label: 'License No.', value: profile.license_number },
      { label: 'Specialty Detail', value: profile.specialty_detail },
      { label: 'Availability', value: profile.availability_status || 'active' },
      { label: 'Profile Complete', value: profile.profile_completed ? 'Yes' : 'No' },
      { label: 'Joined', value: profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-' },
    ];

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-6);">';
    fields.forEach(function (f) {
      html += '<div style="padding:var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">';
      html += '<div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">' + f.label + '</div>';
      html += '<div style="font-size:var(--text-sm);color:var(--text-primary);font-weight:500;">' + GHE.escapeHtml(f.value || '-') + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Preferred destinations
    if (profile.preferred_destinations && profile.preferred_destinations.length > 0) {
      html += '<div style="margin-bottom:var(--space-6);">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:var(--space-2);">Preferred Destinations</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">';
      profile.preferred_destinations.forEach(function (d) {
        html += '<span class="tag">' + GHE.escapeHtml(d) + '</span>';
      });
      html += '</div></div>';
    }

    // Documents section
    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);margin-top:var(--space-2);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-4);">Documents (' + docs.length + ')</div>';

    if (docs.length === 0) {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No documents uploaded yet.</p>';
    } else {
      docs.forEach(function (d) {
        var statusMap = {
          pending: { color: 'var(--warning)', label: 'Pending' },
          in_review: { color: 'var(--info)', label: 'In Review' },
          verified: { color: 'var(--success)', label: 'Verified' },
          rejected: { color: 'var(--error)', label: 'Rejected' }
        };
        var st = statusMap[d.status] || statusMap.pending;
        var uploaded = d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : '-';
        var size = d.file_size_bytes ? (d.file_size_bytes < 1024 * 1024 ? (d.file_size_bytes / 1024).toFixed(1) + ' KB' : (d.file_size_bytes / (1024 * 1024)).toFixed(1) + ' MB') : '-';
        var typeLabel = docTypeLabels[d.doc_type] || d.doc_type || 'Unknown';

        html += '<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-2);">';
        html += '<div style="width:36px;height:36px;border-radius:var(--radius-sm);background:var(--primary-muted);display:flex;align-items:center;justify-content:center;flex-shrink:0;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
        html += '</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + GHE.escapeHtml(typeLabel) + '</div>';
        html += '<div style="font-size:11px;color:var(--text-tertiary);">' + GHE.escapeHtml(d.file_name || '') + ' · ' + size + ' · ' + uploaded + '</div>';
        html += '</div>';
        html += '<span style="font-size:11px;font-weight:600;color:' + st.color + ';">' + st.label + '</span>';
        if (d.file_path) {
          html += '<button class="btn btn-ghost btn-sm btn-dl-doc" data-path="' + d.file_path + '" style="padding:var(--space-1) var(--space-2);font-size:11px;">Download</button>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    // WhatsApp quick contact
    if (profile.phone) {
      var waNumber = profile.phone.replace(/[^0-9]/g, '');
      html += '<div style="margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--border-subtle);">';
      html += '<a href="https://wa.me/' + waNumber + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="width:100%;justify-content:center;display:flex;align-items:center;gap:var(--space-2);">';
      html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
      html += 'WhatsApp ' + GHE.escapeHtml(profile.full_name || 'Candidate');
      html += '</a></div>';
    }

    // ── Assign to Recruiter ──
    // Fetch current assignments for this candidate
    var { data: currentAssignments } = await ghFrom('recruiter_assignments')
      .select('recruiter_id')
      .eq('applicant_id', candidateId);
    var assignedIds = (currentAssignments || []).map(function (a) { return a.recruiter_id; });

    html += '<div style="margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--border-subtle);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">Assign to Recruiter</div>';

    if (approvedRecruiters.length === 0) {
      html += '<p style="font-size:var(--text-sm);color:var(--text-tertiary);">No approved recruiters yet. Approve recruiters from the Recruiters page.</p>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:var(--space-2);" id="recruiter-assign-list">';
      approvedRecruiters.forEach(function (r) {
        var isAssigned = assignedIds.includes(r.id);
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-2) var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">';
        html += '<div>';
        html += '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + GHE.escapeHtml(r.full_name) + '</div>';
        html += '<div style="font-size:11px;color:var(--text-tertiary);">' + GHE.escapeHtml(r.organization_name || 'Recruiter') + '</div>';
        html += '</div>';
        if (isAssigned) {
          html += '<button class="btn btn-ghost btn-sm btn-unassign" data-rid="' + r.id + '" style="color:var(--error);font-size:11px;">Unassign</button>';
        } else {
          html += '<button class="btn btn-secondary btn-sm btn-assign" data-rid="' + r.id + '" style="font-size:11px;">Assign</button>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // ── Pipeline Stage (eLab sets, recruiter sees) ──
    var isSaudiCand = (profile.preferred_destinations || []).some(function (d) { return /saudi|ksa|riyadh|jeddah/i.test(d); });
    var stageOptions = isSaudiCand ? [
      { value: '',          label: '— Not set —' },
      { value: 'profile',   label: 'Profile & Documents' },
      { value: 'dataflow',  label: 'DataFlow Verification' },
      { value: 'mumaris',   label: 'Mumaris+ Registration' },
      { value: 'prometric', label: 'Prometric / ORA Evaluation' },
      { value: 'license',   label: 'License Issuance' },
      { value: 'visa',      label: 'Visa & Deployment' },
    ] : [
      { value: '',             label: '— Not set —' },
      { value: 'profile',      label: 'Profile & Documents' },
      { value: 'verification', label: 'Credential Verification' },
      { value: 'licensing',    label: 'Licensing / Exam' },
      { value: 'offer',        label: 'Job Offer' },
      { value: 'deployment',   label: 'Visa & Deployment' },
    ];
    html += '<div style="margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--border-subtle);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);">';
    html += '<div>';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);">Pipeline Stage</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">Set here — reflects on recruiter\'s dashboard automatically</div>';
    html += '</div>';
    html += '<span id="stage-save-status" style="font-size:11px;color:var(--success);display:none;font-weight:600;"></span>';
    html += '</div>';
    html += '<select id="pipeline-stage-select" style="width:100%;padding:var(--space-2) var(--space-3);font-size:var(--text-sm);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);">';
    stageOptions.forEach(function (opt) {
      var sel = (profile.pipeline_stage || '') === opt.value ? ' selected' : '';
      html += '<option value="' + GHE.escapeHtml(opt.value) + '"' + sel + '>' + GHE.escapeHtml(opt.label) + '</option>';
    });
    html += '</select>';
    html += '</div>';

    // ── Recruiter Notes ──
    html += '<div style="margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--border-subtle);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">Recruiter Notes';
    if (recruiterNotes.length > 0) html += ' <span style="font-size:12px;font-weight:500;color:var(--text-tertiary);">(' + recruiterNotes.length + ')</span>';
    html += '</div>';

    if (recruiterNotes.length === 0) {
      html += '<p style="font-size:var(--text-sm);color:var(--text-tertiary);">No recruiter notes yet.</p>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:var(--space-3);">';
      recruiterNotes.forEach(function (n) {
        var rec = approvedRecruiters.find(function(r){ return r.id === n.recruiter_id; });
        var recruiterName = rec ? (rec.full_name + (rec.organization_name ? ' · ' + rec.organization_name : '')) : 'Recruiter';
        var recruiterShortName = rec ? rec.full_name : 'the recruiter';
        var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '';
        html += '<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">';
        html += '<span style="font-size:11px;font-weight:700;color:#C2410C;text-transform:uppercase;letter-spacing:0.05em;">' + GHE.escapeHtml(recruiterName) + '</span>';
        html += '<div style="display:flex;align-items:center;gap:var(--space-3);">';
        html += '<span style="font-size:11px;color:var(--text-tertiary);">' + dateStr + '</span>';
        html += '<button class="btn-forward-note" data-note="' + GHE.escapeHtml(n.note) + '" data-recruiter="' + GHE.escapeHtml(recruiterShortName) + '" style="font-size:11px;font-weight:600;color:#0077B6;background:none;border:1px solid #BFDBFE;border-radius:var(--radius-sm);padding:2px 8px;cursor:pointer;">↪ Forward to Applicant</button>';
        html += '</div>';
        html += '</div>';
        html += '<div style="font-size:13px;color:var(--text-primary);line-height:1.55;margin-top:var(--space-1);">' + GHE.escapeHtml(n.note) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // ── Message Thread ──
    html += '<div style="margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--border-subtle);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-4);">Message Thread (' + messages.length + ')</div>';

    if (messages.length === 0) {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);margin-bottom:var(--space-2);">No messages yet. Send the first one below.</p>';
    } else {
      html += '<div id="msg-thread" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-4);">';
      messages.forEach(function (m) {
        var isOut = m.direction === 'outbound';
        var timeStr = m.sent_at ? new Date(m.sent_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
        var bubbleStyle = isOut
          ? 'background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px 12px 4px 12px;padding:var(--space-3) var(--space-4);align-self:flex-end;max-width:90%;'
          : 'background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px 12px 12px 4px;padding:var(--space-3) var(--space-4);align-self:flex-start;max-width:90%;';
        var senderLabel = isOut
          ? '<span style="font-size:10px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.05em;">Team</span>'
          : '<span style="font-size:10px;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.05em;">Applicant</span>';

        html += '<div style="' + bubbleStyle + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
        html += senderLabel;
        html += '<span style="font-size:10px;color:var(--text-tertiary);">' + timeStr + '</span>';
        html += '</div>';
        if (m.subject) {
          html += '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">' + GHE.escapeHtml(m.subject) + '</div>';
        }
        html += '<div style="font-size:13px;color:var(--text-primary);line-height:1.55;white-space:pre-wrap;">' + GHE.escapeHtml(m.body || '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // ── Smart Email Composer ──
    html += '<div style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--border-subtle);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);">Send Email</div>';
    html += '<button id="btn-auto-draft" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:var(--space-1);font-size:12px;">';
    html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
    html += 'Auto-Draft with AI</button>';
    html += '</div>';
    html += '<div id="draft-status" style="display:none;font-size:12px;color:var(--text-tertiary);margin-bottom:var(--space-3);padding:var(--space-2) var(--space-3);background:var(--bg-surface);border-radius:var(--radius-sm);border-left:3px solid var(--primary);"></div>';
    html += '<div>';
    html += '<input type="text" id="msg-subject" placeholder="Subject line..." style="width:100%;padding:var(--space-2) var(--space-3);font-size:var(--text-sm);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);margin-bottom:var(--space-3);box-sizing:border-box;">';
    html += '<textarea id="msg-body" rows="7" placeholder="Write your message here, or click Auto-Draft to generate one..." style="width:100%;padding:var(--space-3);font-size:var(--text-sm);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);resize:vertical;font-family:inherit;line-height:1.6;box-sizing:border-box;"></textarea>';
    html += '</div>';
    html += '<button id="btn-send-email" class="btn btn-primary" style="width:100%;justify-content:center;display:flex;align-items:center;gap:var(--space-2);margin-top:var(--space-3);">';
    html += '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    html += 'Send Email</button>';
    html += '</div>';

    panelContentEl.innerHTML = html;

    // Bind pipeline stage selector
    var stageSelect = document.getElementById('pipeline-stage-select');
    var stageSaveStatus = document.getElementById('stage-save-status');
    if (stageSelect) {
      stageSelect.addEventListener('change', async function () {
        var newStage = stageSelect.value || null;
        stageSelect.disabled = true;
        if (stageSaveStatus) { stageSaveStatus.textContent = 'Saving...'; stageSaveStatus.style.color = 'var(--text-tertiary)'; stageSaveStatus.style.display = ''; }
        var oldStage = stageSelect.dataset.prevValue || null;
        var { error } = await ghFrom('profiles').update({ pipeline_stage: newStage }).eq('id', candidateId);
        stageSelect.disabled = false;
        if (stageSaveStatus) {
          if (error) {
            stageSaveStatus.textContent = 'Error: ' + error.message;
            stageSaveStatus.style.color = 'var(--error)';
          } else {
            stageSaveStatus.textContent = 'Saved \u2713';
            stageSaveStatus.style.color = 'var(--success)';
            setTimeout(function () { stageSaveStatus.style.display = 'none'; }, 2500);
            stageSelect.dataset.prevValue = newStage;
            if (window.ElabTracker) ElabTracker.track('gh_candidate_stage_changed', 'high_value', { candidate_id: candidateId, old_stage: oldStage, new_stage: newStage, platform: 'globalhire' });
          }
          stageSaveStatus.style.display = '';
        }
      });
    }

    // Bind "Forward to Applicant" buttons on recruiter notes
    panelContentEl.querySelectorAll('.btn-forward-note').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var note = btn.dataset.note;
        var recruiter = btn.dataset.recruiter;
        var subjectEl = document.getElementById('msg-subject');
        var bodyEl = document.getElementById('msg-body');
        if (subjectEl) subjectEl.value = 'Update Regarding Your Application';
        if (bodyEl) bodyEl.value = 'Dear ' + (profile.full_name || 'Candidate') + ',\n\nWe have received the following feedback from ' + recruiter + ' regarding your application:\n\n"' + note + '"\n\nPlease feel free to reach out if you have any questions.\n\nBest regards,\nGlobalHire@eLab Team';
        // Scroll down to the email composer
        var sendSection = document.getElementById('msg-subject');
        if (sendSection) sendSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (subjectEl) subjectEl.focus();
      });
    });

    // Bind download buttons
    panelContentEl.querySelectorAll('.btn-dl-doc').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var { data, error } = await sb.storage.from('gh-applicant-documents').createSignedUrl(btn.dataset.path, 3600);
        if (data && data.signedUrl) {
          window.open(data.signedUrl, '_blank');
        } else {
          alert('Could not generate download link.');
        }
      });
    });

    // ── Assign / Unassign buttons ──
    panelContentEl.querySelectorAll('.btn-assign, .btn-unassign').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var isAssign = btn.classList.contains('btn-assign');
        var recruiterId = btn.dataset.rid;
        btn.disabled = true;
        btn.textContent = isAssign ? 'Assigning...' : 'Removing...';

        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/manage-recruiter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: isAssign ? 'assign' : 'unassign', recruiter_id: recruiterId, applicant_id: candidateId })
          });
          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Failed');

          // Toggle button state
          if (isAssign) {
            btn.className = 'btn btn-ghost btn-sm btn-unassign';
            btn.style.color = 'var(--error)';
            btn.style.fontSize = '11px';
            btn.textContent = 'Unassign';
          } else {
            btn.className = 'btn btn-secondary btn-sm btn-assign';
            btn.style.color = '';
            btn.style.fontSize = '11px';
            btn.textContent = 'Assign';
          }
          btn.disabled = false;

          // Re-bind this button
          btn.addEventListener('click', arguments.callee);
        } catch (err) {
          alert('Failed: ' + err.message);
          btn.disabled = false;
          btn.textContent = isAssign ? 'Assign' : 'Unassign';
        }
      });
    });

    // ── Auto-Draft button ──
    var autoDraftBtn = document.getElementById('btn-auto-draft');
    var draftStatusEl = document.getElementById('draft-status');
    var subjectInput = document.getElementById('msg-subject');
    var bodyTextarea = document.getElementById('msg-body');

    if (autoDraftBtn) {
      autoDraftBtn.addEventListener('click', async function () {
        autoDraftBtn.disabled = true;
        autoDraftBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Drafting...';

        if (draftStatusEl) {
          draftStatusEl.style.display = 'block';
          draftStatusEl.textContent = 'AI is reading the profile and documents...';
        }

        try {
          var session = await GHAuth.getSession();
          if (!session) throw new Error('Not authenticated');

          var resp = await fetch(SUPABASE_URL + '/functions/v1/draft-message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + session.access_token
            },
            body: JSON.stringify({ applicant_id: candidateId })
          });

          var result = await resp.json();

          if (!resp.ok || !result.success) {
            throw new Error(result.error || 'Draft failed');
          }

          if (subjectInput) subjectInput.value = result.subject || '';
          if (bodyTextarea) bodyTextarea.value = result.body || '';

          var ctx = result.context || {};
          var hint = 'Draft ready';
          if (ctx.missing_count > 0) hint += ' · ' + ctx.missing_count + ' document(s) missing';
          if (ctx.rejected_count > 0) hint += ' · ' + ctx.rejected_count + ' rejected';
          if (ctx.verified_count > 0) hint += ' · ' + ctx.verified_count + ' verified';

          if (draftStatusEl) draftStatusEl.textContent = hint;

        } catch (err) {
          if (draftStatusEl) {
            draftStatusEl.style.borderLeftColor = 'var(--error)';
            draftStatusEl.textContent = 'Draft failed: ' + (err.message || 'Unknown error');
          }
        }

        autoDraftBtn.disabled = false;
        autoDraftBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Auto-Draft with AI';
      });
    }

    // ── Send Email button ──
    var sendEmailBtn = document.getElementById('btn-send-email');
    if (sendEmailBtn) {
      sendEmailBtn.addEventListener('click', async function () {
        var subject = (subjectInput && subjectInput.value.trim()) || '';
        var body = (bodyTextarea && bodyTextarea.value.trim()) || '';

        if (!subject || !body) {
          alert('Please enter both a subject and message body before sending.');
          return;
        }

        sendEmailBtn.disabled = true;
        sendEmailBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Sending...';

        try {
          var session = await GHAuth.getSession();
          if (!session) throw new Error('Not authenticated');

          var resp = await fetch(SUPABASE_URL + '/functions/v1/notify-applicant', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + session.access_token
            },
            body: JSON.stringify({
              applicant_id: candidateId,
              type: 'custom',
              subject: subject,
              message: body
            })
          });

          var result = await resp.json();

          if (!resp.ok || !result.success) {
            throw new Error(result.error || 'Send failed');
          }

          // Success feedback
          sendEmailBtn.style.background = 'var(--success)';
          sendEmailBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Sent to ' + GHE.escapeHtml(result.sent_to || 'applicant');

          if (draftStatusEl) {
            draftStatusEl.style.borderLeftColor = 'var(--success)';
            draftStatusEl.textContent = 'Email delivered to ' + (result.sent_to || 'applicant');
          }

          // Reset form after 4s
          setTimeout(function () {
            sendEmailBtn.style.background = '';
            sendEmailBtn.disabled = false;
            sendEmailBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email';
          }, 4000);

        } catch (err) {
          alert('Failed to send: ' + (err.message || 'Unknown error'));
          sendEmailBtn.disabled = false;
          sendEmailBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email';
        }
      });
    }
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

  // ── Export: toggle menu ──
  var exportBtn = document.getElementById('btn-export');
  var exportMenu = document.getElementById('export-menu');
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', function () {
      exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function (e) {
      if (!document.getElementById('export-wrapper').contains(e.target)) {
        exportMenu.style.display = 'none';
      }
    });
  }

  // ── Export: CSV ──
  document.getElementById('export-csv')?.addEventListener('click', function () {
    exportMenu.style.display = 'none';
    var rows = [['Name', 'Email', 'Specialty', 'Origin', 'Destination', 'Experience', 'Docs', 'Pipeline', 'Availability', 'Source']];
    filteredApplicants.forEach(function (a) {
      rows.push([
        a.full_name || '',
        a.email || '',
        a.specialty || '',
        a.country_of_origin || '',
        (a.preferred_destinations || []).join('; '),
        a.years_of_experience != null ? a.years_of_experience + ' yrs' : '',
        (a.total_docs != null ? a.total_docs : 0) + ' docs',
        a.pipeline_status || '',
        a.availability_status || 'active',
        a.source || 'direct'
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'globalhire-candidates-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  });

  // ── Export: PDF ──
  document.getElementById('export-pdf')?.addEventListener('click', function () {
    exportMenu.style.display = 'none';
    var rows = filteredApplicants.map(function (a) {
      return [
        a.full_name || 'Unnamed',
        a.specialty || '-',
        a.country_of_origin || '-',
        (a.preferred_destinations || []).join(', ') || '-',
        a.years_of_experience != null ? a.years_of_experience + ' yrs' : '-',
        (a.total_docs != null ? a.total_docs : 0) + ' docs',
        a.pipeline_status || '-',
        a.source || 'direct'
      ];
    });

    var printWin = window.open('', '_blank');
    printWin.document.write('<!DOCTYPE html><html><head><title>GlobalHire Candidates Export</title>');
    printWin.document.write('<style>');
    printWin.document.write('body{font-family:Arial,sans-serif;margin:24px;color:#111;}');
    printWin.document.write('h1{font-size:18px;margin-bottom:4px;}');
    printWin.document.write('p.sub{font-size:12px;color:#666;margin-bottom:16px;}');
    printWin.document.write('table{width:100%;border-collapse:collapse;font-size:11px;}');
    printWin.document.write('th{background:#0077B6;color:#fff;padding:8px 10px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;}');
    printWin.document.write('td{padding:7px 10px;border-bottom:1px solid #e5e7eb;}');
    printWin.document.write('tr:nth-child(even){background:#f9fafb;}');
    printWin.document.write('@media print{body{margin:0;} @page{margin:12mm;}}');
    printWin.document.write('</style></head><body>');
    printWin.document.write('<h1>GlobalHire@eLab — Candidates Report</h1>');
    printWin.document.write('<p class="sub">Generated: ' + new Date().toLocaleString() + ' &bull; ' + rows.length + ' candidates</p>');
    printWin.document.write('<table><thead><tr><th>Name</th><th>Specialty</th><th>Origin</th><th>Destination</th><th>Exp</th><th>Docs</th><th>Pipeline</th><th>Source</th></tr></thead><tbody>');
    rows.forEach(function (r) {
      printWin.document.write('<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>');
    });
    printWin.document.write('</tbody></table></body></html>');
    printWin.document.close();
    setTimeout(function () { printWin.print(); }, 300);
  });

})();
