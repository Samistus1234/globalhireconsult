/* ============================================
   GLOBALHIRE@ELAB — Admin: Recruiter Submissions
   List of candidates submitted by recruiters for
   admin review, tagged by source recruiter.
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var adminProfile = null;
  var currentUser = null;
  var allSubmissions = [];
  var recruiterMap = {};   // recruiter_id -> profile { full_name, organization_name }

  // Same doc type labels the recruiter-facing upload UI uses (js/recruiter.js),
  // duplicated here so the admin review panel renders friendly labels too.
  var SUBMISSION_DOC_LABELS = {
    cv: 'CV / Resume',
    license: 'Medical / Professional Licence',
    dataflow: 'DataFlow Report',
    passport: 'Passport',
    fellowship: 'Fellowship / Specialty Certificate'
  };

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    currentUser = e.detail.session.user;
    updateAdminUI();
    await loadSubmissions();
    bindFilters();
    initReviewPanel();
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

  // ── Review panel (Task A6) ──
  var reviewPanelEl, reviewPanelContentEl;
  var activeSubmissionId = null;

  function initReviewPanel() {
    reviewPanelEl = document.getElementById('review-panel');
    reviewPanelContentEl = document.getElementById('review-panel-content');
    if (!reviewPanelEl) return;

    var closeBtn = document.getElementById('review-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', closeReviewPanel);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && reviewPanelEl.style.display === 'block') closeReviewPanel();
    });
  }

  function openReviewPanelShell() {
    if (!reviewPanelEl) return;
    reviewPanelEl.style.display = 'block';
    requestAnimationFrame(function () { reviewPanelEl.style.transform = 'translateX(0)'; });
  }

  function closeReviewPanel() {
    if (!reviewPanelEl) return;
    reviewPanelEl.style.transform = 'translateX(100%)';
    setTimeout(function () {
      if (reviewPanelEl.style.transform === 'translateX(100%)') reviewPanelEl.style.display = 'none';
    }, 300);
    activeSubmissionId = null;
  }

  // Open the review detail panel: candidate fields + documents (signed
  // download links) + a status/note editor that writes admin_status,
  // admin_note, reviewed_by, reviewed_at.
  async function openSubmissionReview(submissionId) {
    activeSubmissionId = submissionId;
    if (!reviewPanelContentEl) initReviewPanel();
    if (!reviewPanelContentEl) return;

    reviewPanelContentEl.innerHTML = '<div style="text-align:center;padding:var(--space-12);"><div class="spinner" style="margin:0 auto;"></div><p style="color:var(--text-tertiary);margin-top:var(--space-4);">Loading submission...</p></div>';
    openReviewPanelShell();

    var [subRes, docsRes] = await Promise.all([
      ghFrom('recruiter_submitted_candidates').select('*').eq('id', submissionId).single(),
      ghFrom('recruiter_submission_documents').select('*').eq('submission_id', submissionId).order('created_at', { ascending: false })
    ]);

    if (subRes.error || !subRes.data) {
      reviewPanelContentEl.innerHTML = '<p style="color:var(--error);padding:var(--space-4);">Failed to load submission: ' + esc(subRes.error ? subRes.error.message : 'Not found') + '</p>';
      return;
    }

    var submission = subRes.data;
    var docs = docsRes.data || [];
    lastDocsBySubmission[submissionId] = docs;
    renderReviewPanel(submission, docs);
  }

  function renderReviewPanel(submission, docs) {
    var rec = recruiterMap[submission.recruiter_id];
    var recruiterLabel = rec
      ? esc(rec.full_name) + (rec.organization_name ? ' &middot; ' + esc(rec.organization_name) : '')
      : 'Unknown recruiter';

    var html = '';

    // Header
    html += '<div style="margin-bottom:var(--space-6);">';
    html += '<div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">' + esc(submission.full_name || 'Unnamed') + '</div>';
    html += '<div style="font-size:var(--text-sm);color:var(--text-tertiary);margin-top:var(--space-1);">Submitted by ' + recruiterLabel + '</div>';
    html += '</div>';

    // Candidate fields
    var fields = [
      ['Email', submission.email],
      ['Phone', submission.phone],
      ['Profession', submission.profession],
      ['Specialty', submission.specialty],
      ['Experience (years)', submission.experience_years != null ? String(submission.experience_years) : null],
      ['Current Country', submission.current_country],
      ['Target Countries', Array.isArray(submission.target_countries) ? submission.target_countries.join(', ') : null],
      ['Passport Number', submission.passport_number],
      ['License Number', submission.license_number]
    ];

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-6);">';
    fields.forEach(function (f) {
      html += '<div>' +
        '<div class="rs-field-label">' + esc(f[0]) + '</div>' +
        '<div style="font-size:var(--text-sm);color:var(--text-primary);">' + (f[1] ? esc(f[1]) : '<span style="color:var(--text-tertiary);">&mdash;</span>') + '</div>' +
      '</div>';
    });
    html += '</div>';

    if (submission.profile_data && submission.profile_data.notes) {
      html += '<div style="margin-bottom:var(--space-6);">';
      html += '<div class="rs-field-label">Recruiter Notes</div>';
      html += '<div style="font-size:var(--text-sm);color:var(--text-primary);white-space:pre-wrap;">' + esc(submission.profile_data.notes) + '</div>';
      html += '</div>';
    }

    // Documents
    html += '<div style="margin-bottom:var(--space-6);">';
    html += '<div class="rs-field-label" style="margin-bottom:var(--space-2);">Documents</div>';
    if (docs.length === 0) {
      html += '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">No documents uploaded yet.</div>';
    } else {
      docs.forEach(function (d) {
        var label = SUBMISSION_DOC_LABELS[d.doc_type] || d.doc_type || 'Document';
        html += '<div class="rs-doc-row">' +
          '<div>' +
            '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + esc(label) + '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(d.file_name || '') + '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-ghost btn-sm btn-dl-submission-doc" data-path="' + esc(d.file_path) + '">Download</button>' +
        '</div>';
      });
    }
    html += '</div>';

    // Status + note editor
    html += '<div style="margin-bottom:var(--space-4);">';
    html += '<div class="rs-field-label">Status</div>';
    html += '<select id="review-status-select" class="rs-review-select">';
    ['submitted', 'under_review', 'shortlisted', 'placed', 'rejected'].forEach(function (s) {
      var info = STATUS_INFO[s];
      html += '<option value="' + s + '"' + (submission.admin_status === s ? ' selected' : '') + '>' + esc(info.label) + '</option>';
    });
    html += '</select>';
    html += '</div>';

    html += '<div style="margin-bottom:var(--space-4);">';
    html += '<div class="rs-field-label">Admin Note</div>';
    html += '<textarea id="review-note-textarea" class="rs-review-textarea" rows="4" placeholder="Feedback visible to the recruiter...">' + esc(submission.admin_note || '') + '</textarea>';
    html += '</div>';

    html += '<div id="review-save-error" style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--space-3);display:none;"></div>';

    html += '<button type="button" id="review-save-btn" class="btn btn-primary" style="width:100%;">Save Changes</button>';

    if (submission.reviewed_at) {
      // reviewed_by is an admin id (recruiterMap only holds recruiter profiles),
      // so we can only confidently name the reviewer when it's the current admin.
      var reviewerName = (submission.reviewed_by === currentUser.id) ? (adminProfile.full_name || 'you') : null;
      html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:var(--space-3);text-align:center;">Last reviewed ' +
        esc(new Date(submission.reviewed_at).toLocaleString('en-GB')) +
        (reviewerName ? ' by ' + esc(reviewerName) : '') + '</div>';
    }

    reviewPanelContentEl.innerHTML = html;

    // Bind document download buttons — generate a fresh 1hr signed URL on click
    // (admins can read this bucket via the gh_admins_read_all_files storage policy).
    reviewPanelContentEl.querySelectorAll('.btn-dl-submission-doc').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var { data, error } = await sb.storage.from('gh-applicant-documents').createSignedUrl(btn.dataset.path, 3600);
        if (data && data.signedUrl) {
          window.open(data.signedUrl, '_blank');
        } else {
          alert('Could not generate download link.');
        }
      });
    });

    // Bind Save
    var saveBtn = document.getElementById('review-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var status = document.getElementById('review-status-select').value;
        var note = document.getElementById('review-note-textarea').value.trim();
        updateSubmission(submission.id, status, note, saveBtn);
      });
    }
  }

  // Persist admin review: admin_status, admin_note, reviewed_by, reviewed_at.
  // Recruiters cannot write these columns (trg_gh_rsc_review_guard blocks them);
  // the admin write here is exempted by that same trigger's globalhire.is_admin() check.
  async function updateSubmission(id, status, note, saveBtn) {
    var errorEl = document.getElementById('review-save-error');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    var { data, error } = await ghFrom('recruiter_submitted_candidates').update({
      admin_status: status,
      admin_note: note || null,
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', id).select().single();

    if (error) {
      console.error('Failed to update submission:', error);
      if (errorEl) { errorEl.textContent = 'Could not save: ' + error.message; errorEl.style.display = 'block'; }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
      return;
    }

    // Update local cache so the table/KPIs reflect the change without a refetch.
    var idx = allSubmissions.findIndex(function (s) { return s.id === id; });
    if (idx !== -1) allSubmissions[idx] = data;

    updateKPIs();
    applyFilters();

    // TODO(A7): notify the recruiter (and/or candidate) of the status change.
    notifyRecruiterStatus(data);

    if (saveBtn) { saveBtn.textContent = 'Saved'; }
    setTimeout(function () {
      if (activeSubmissionId === id) renderReviewPanel(data, docsCacheFor(id));
    }, 700);
  }

  // Small helper so the post-save re-render can show updated reviewed_at/reviewer
  // without re-fetching documents (they don't change on a status/note save).
  var lastDocsBySubmission = {};
  function docsCacheFor(id) { return lastDocsBySubmission[id] || []; }

  // Email the submitting recruiter that their candidate's status changed. The
  // in-portal half of the loop already works (the recruiter's "My Candidates"
  // list reads admin_status/admin_note live) — this is the second, async
  // channel so the recruiter doesn't have to keep polling the portal.
  //
  // Fire-and-forget: a failed/slow email must never block or roll back the
  // admin's status save, which has already succeeded by the time this runs.
  function notifyRecruiterStatus(submission) {
    if (!submission || !submission.recruiter_id) return;
    var rec = recruiterMap[submission.recruiter_id];
    sb.functions.invoke('notify-recruiter-status', {
      body: {
        submission_id: submission.id,
        recruiter_id: submission.recruiter_id,
        recruiter_name: rec ? rec.full_name : undefined,
        candidate_name: submission.full_name,
        admin_status: submission.admin_status,
        admin_note: submission.admin_note
      }
    }).catch(function (err) {
      console.warn('notify-recruiter-status invoke failed (non-blocking):', err);
    });
  }

  // Exposed for other admin pages / future tasks to hook into.
  window.openSubmissionReview = openSubmissionReview;

})();
