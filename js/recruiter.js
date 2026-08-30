/* ============================================
   GLOBALHIRE@ELAB — Recruiter Portal
   Assigned candidates, pipeline, assessments, notes
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var currentUser = null;
  var currentProfile = null;
  var allAssigned = [];
  var noteApplicantIds = new Set();
  var myCandidatesLoaded = false;

  // ── Document type labels ──
  var DOC_LABELS = {
    license: 'Professional License',
    degree: 'Degree / Certificate',
    passport: 'Passport',
    cv: 'CV / Resume',
    passport_photo: 'Passport Photo',
    police_report: 'Police Character Report',
    travel_insurance: 'Travel Insurance'
  };

  // ── Recruiter-submitted candidate document types (recruiter_submission_documents) ──
  var SUBMISSION_DOC_TYPES = [
    { key: 'cv', label: 'CV / Resume' },
    { key: 'license', label: 'Medical / Professional Licence' },
    { key: 'dataflow', label: 'DataFlow Report' },
    { key: 'passport', label: 'Passport' },
    { key: 'fellowship', label: 'Fellowship / Specialty Certificate' }
  ];
  var SUBMISSION_DOC_LABELS = {};
  SUBMISSION_DOC_TYPES.forEach(function (t) { SUBMISSION_DOC_LABELS[t.key] = t.label; });

  // ── Unified recruitment pipeline (all markets) ──
  // Phase-level stepper built from GHE.PHASES so recruiters see the same master
  // pipeline as the admin dashboard — the per-market stage maps are gone.
  var PIPELINE_PHASE_DESC = {
    lead: 'Leads and applications being collected',
    qualification: 'Screening, qualification and shortlisting',
    employer: 'Presented to employer, interviews underway',
    offer: 'Offer extended and accepted',
    deployment: 'Pre-employment through to starting work',
    revenue: 'Commission due, invoicing and payment'
  };

  // ── XSS escape ──
  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  // ── Derive stage step (0-indexed) from doc status ──
  // Returns: 0 = no docs, 1 = pending/rejected/in-review, 2 = all verified
  function getDocStage(docs) {
    if (!docs || docs.length === 0) return 0;
    var rejected = docs.filter(function (d) { return d.status === 'rejected'; }).length;
    var pending = docs.filter(function (d) { return d.status === 'pending' || d.status === 'in_review'; }).length;
    var verified = docs.filter(function (d) { return d.status === 'verified'; }).length;
    if (rejected > 0) return 1;
    if (pending > 0) return 1;
    if (verified > 0 && pending === 0 && rejected === 0) return 2;
    return 0;
  }

  // ── Returns { label, bg, color } for a stage badge ──
  function getStageBadge(docs) {
    var step = getDocStage(docs);
    if (step === 0) return { label: 'Awaiting Docs', bg: 'rgba(148,163,184,0.12)', color: '#64748B' };
    var rejected = docs.filter(function (d) { return d.status === 'rejected'; }).length;
    if (rejected > 0) return { label: 'Docs Need Attention', bg: 'rgba(230,57,70,0.1)', color: '#E63946' };
    var pending = docs.filter(function (d) { return d.status === 'pending' || d.status === 'in_review'; }).length;
    if (pending > 0) return { label: 'Docs Under Review', bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' };
    return { label: 'Docs Verified \u2713', bg: 'rgba(46,196,182,0.1)', color: '#2EC4B6' };
  }

  // ── Recruiter-submitted candidate admin_status → badge ──
  var RSC_STATUS_BADGE = {
    submitted:    { label: 'Submitted',      bg: 'rgba(148,163,184,0.12)', color: '#64748B' },
    under_review: { label: 'Under Review',   bg: 'rgba(72,202,228,0.1)',   color: '#48CAE4' },
    shortlisted:  { label: 'Shortlisted',    bg: 'rgba(244,162,97,0.1)',   color: '#F4A261' },
    placed:       { label: 'Placed ✓', bg: 'rgba(46,196,182,0.1)',   color: '#2EC4B6' },
    rejected:     { label: 'Not Selected',   bg: 'rgba(230,57,70,0.1)',    color: '#E63946' }
  };
  function getAdminStatusBadge(status) {
    return RSC_STATUS_BADGE[status] || RSC_STATUS_BADGE.submitted;
  }

  // ── Parse [ASSESSMENT: X] prefix from note text ──
  function parseAssessment(noteText) {
    var m = String(noteText || '').match(/^\[ASSESSMENT:\s*(.+?)\]\n\n([\s\S]*)$/);
    if (m) return { rec: m[1].trim(), text: m[2] };
    return { rec: null, text: noteText };
  }

  // ── Color for assessment recommendation ──
  function getAssessmentColor(rec) {
    if (!rec) return null;
    var r = rec.toLowerCase();
    if (r.includes('suitable for position')) return { bg: 'rgba(46,196,182,0.1)', color: '#2EC4B6' };
    if (r.includes('needs more documentation')) return { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' };
    if (r.includes('further assessment')) return { bg: 'rgba(72,202,228,0.1)', color: '#48CAE4' };
    if (r.includes('not suitable')) return { bg: 'rgba(230,57,70,0.1)', color: '#E63946' };
    return { bg: 'rgba(148,163,184,0.12)', color: '#64748B' };
  }

  // ── Init ──
  window.addEventListener('gh:auth-ready', async function (e) {
    currentProfile = e.detail.profile;
    currentUser = e.detail.session.user;
    initSidebar();

    if (!currentProfile.recruiter_approved) {
      document.getElementById('screen-pending').style.display = 'block';
      return;
    }

    document.getElementById('screen-portal').style.display = 'block';
    initTabs();
    initPanel();
    initAddCandidatePanel();
    initCandidateDocsModal();
    await loadCandidates();
    await loadNotes();
    bindSearch();
  });

  function initSidebar() {
    var nameEl = document.getElementById('rec-name');
    var orgEl = document.getElementById('rec-org');
    var avatarEl = document.getElementById('rec-avatar');
    if (nameEl) nameEl.textContent = currentProfile.full_name || currentUser.email;
    if (orgEl) orgEl.textContent = currentProfile.organization_name || 'Recruiter';
    if (avatarEl) {
      avatarEl.textContent = currentProfile.avatar_initials || 'RR';
      var colors = GHE.avatarColors[currentProfile.avatar_color_index || 0];
      avatarEl.style.background = colors[0];
      avatarEl.style.color = colors[1];
    }
    var signout = document.getElementById('rec-signout');
    if (signout) signout.addEventListener('click', function (e) { e.preventDefault(); GHAuth.signOut(); });
  }

  function initTabs() {
    var pageTitles = { 'tab-candidates': 'Assigned Candidates', 'tab-mycandidates': 'My Candidates', 'tab-pipeline': 'Pipeline View', 'tab-notes': 'My Assessments', 'tab-messages': 'Messages' };
    document.querySelectorAll('.sb-nav-item[data-tab]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var tabId = item.dataset.tab;
        document.querySelectorAll('.sb-nav-item').forEach(function (n) { n.classList.remove('active'); });
        item.classList.add('active');
        document.querySelectorAll('.rec-tab').forEach(function (t) {
          t.classList.toggle('active', t.id === tabId);
        });
        var titleEl = document.getElementById('topbar-title');
        if (titleEl) titleEl.textContent = pageTitles[tabId] || 'Portal';

        if (tabId === 'tab-mycandidates' && !myCandidatesLoaded) {
          myCandidatesLoaded = true;
          loadMyCandidates();
        }
      });
    });
  }

  // ── Load assigned candidates ──
  async function loadCandidates() {
    var grid = document.getElementById('candidates-grid');

    // Get assignments for this recruiter
    var { data: assignments } = await ghFrom('recruiter_assignments')
      .select('applicant_id')
      .eq('recruiter_id', currentUser.id);

    if (!assignments || assignments.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:var(--space-12);color:var(--text-tertiary);grid-column:1/-1;">No candidates assigned yet. The eLab team will assign candidates to you once available.</div>';
      // Zero out KPIs
      setKpis(0, 0, 0);
      return;
    }

    var applicantIds = assignments.map(function (a) { return a.applicant_id; });

    // Fetch profiles
    var { data: profiles } = await ghFrom('profiles')
      .select('id, full_name, specialty, country_of_origin, years_of_experience, avatar_initials, avatar_color_index, preferred_destinations, phone, license_number, pipeline_stage, pipeline_exit_status, pipeline_exit_reason')
      .in('id', applicantIds);

    // Fetch documents summary
    var { data: docs } = await ghFrom('documents')
      .select('applicant_id, doc_type, status')
      .in('applicant_id', applicantIds);

    // Fetch recruiter notes to know which candidates have been reviewed
    var { data: noteRows } = await ghFrom('recruiter_notes')
      .select('applicant_id')
      .eq('recruiter_id', currentUser.id);

    noteApplicantIds = new Set((noteRows || []).map(function (r) { return r.applicant_id; }));

    allAssigned = (profiles || []).map(function (p) {
      return Object.assign({}, p, {
        docs: (docs || []).filter(function (d) { return d.applicant_id === p.id; })
      });
    });

    // Update sidebar count badge
    var countEl = document.getElementById('assigned-count');
    if (countEl) { countEl.textContent = allAssigned.length; countEl.style.display = ''; }

    // Compute KPIs
    var total = allAssigned.length;
    var docsComplete = allAssigned.filter(function (p) { return getDocStage(p.docs) >= 2; }).length;
    var needsReview = allAssigned.filter(function (p) { return !noteApplicantIds.has(p.id); }).length;
    setKpis(total, docsComplete, needsReview);

    renderCandidates(allAssigned);
    renderPipeline();
  }

  function setKpis(total, docsComplete, needsReview) {
    var t = document.getElementById('kpi-total');
    var d = document.getElementById('kpi-docs-complete');
    var n = document.getElementById('kpi-needs-review');
    if (t) t.textContent = total;
    if (d) d.textContent = docsComplete;
    if (n) n.textContent = needsReview;
  }

  function renderCandidates(list) {
    var grid = document.getElementById('candidates-grid');
    if (list.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);grid-column:1/-1;">No candidates match your search.</div>';
      return;
    }

    grid.innerHTML = list.map(function (p) {
      var colors = GHE.avatarColors[p.avatar_color_index || 0];
      var badge = getStageBadge(p.docs);
      var needsReview = !noteApplicantIds.has(p.id);

      var verified = p.docs.filter(function (d) { return d.status === 'verified'; }).length;
      var pending = p.docs.filter(function (d) { return d.status === 'pending' || d.status === 'in_review'; }).length;
      var rejected = p.docs.filter(function (d) { return d.status === 'rejected'; }).length;

      var chips = '';
      if (verified) chips += '<span class="doc-chip doc-chip-v">' + verified + ' verified</span>';
      if (pending)  chips += '<span class="doc-chip doc-chip-p">' + pending + ' pending</span>';
      if (rejected) chips += '<span class="doc-chip doc-chip-r">' + rejected + ' needs attention</span>';
      if (!p.docs.length) chips += '<span class="doc-chip doc-chip-e">No docs yet</span>';

      var dests = (p.preferred_destinations || []).slice(0, 3).map(function (d) {
        return '<span class="dest-tag">' + esc(d) + '</span>';
      }).join('');

      // Accent bar color based on stage
      var accentGrad = rejected > 0
        ? 'linear-gradient(90deg,#E63946,#ff6b6b)'
        : (pending > 0 ? 'linear-gradient(90deg,#F4A261,#ffd166)' : (verified > 0 && !pending && !rejected ? 'linear-gradient(90deg,#2EC4B6,#48CAE4)' : 'linear-gradient(90deg,var(--primary),var(--primary-light))'));

      var footerHtml = '<div class="cand-footer">' +
        (needsReview
          ? '<span class="review-needed"><span class="review-dot"></span>Awaiting review</span>'
          : '<span class="assessed-ok"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Assessed</span>') +
        '<span style="font-size:11px;color:var(--text-tertiary);">' + esc(p.country_of_origin || '') + '</span>' +
        '</div>';

      return '<div class="cand-card" data-id="' + esc(p.id) + '">' +
        '<div class="cand-card-accent" style="background:' + accentGrad + '"></div>' +
        '<div class="cand-card-body">' +
          '<div class="cand-header">' +
            '<div class="cand-avatar" style="background:' + colors[0] + ';color:' + colors[1] + '">' + esc(p.avatar_initials || '??') + '</div>' +
            '<div class="cand-info">' +
              '<div class="cand-name">' + esc(p.full_name || 'Unnamed') + '</div>' +
              '<div class="cand-specialty">' + esc(p.specialty || 'No specialty') + '</div>' +
            '</div>' +
            '<span class="stage-pill" style="background:' + badge.bg + ';color:' + badge.color + ';align-self:flex-start;">' +
              '<span class="stage-dot" style="background:' + badge.color + '"></span>' + esc(badge.label) +
            '</span>' +
          '</div>' +
          (dests ? '<div class="cand-dests">' + dests + '</div>' : '') +
          '<div class="cand-docs">' + chips + '</div>' +
          footerHtml +
        '</div>' +
      '</div>';
    }).join('');

    var countEl = document.getElementById('candidates-count');
    if (countEl) countEl.textContent = list.length + ' candidate' + (list.length !== 1 ? 's' : '');

    // Bind card clicks
    grid.querySelectorAll('.cand-card').forEach(function (card) {
      card.addEventListener('click', function () {
        openCandidatePanel(card.dataset.id);
      });
    });
  }

  // ── Pipeline board ──
  function renderPipeline() {
    var board = document.getElementById('pipeline-board');
    if (!board) return;

    // Group candidates by doc stage
    var groups = [
      {
        label: 'Awaiting Documentation',
        color: '#64748B',
        bg: 'rgba(148,163,184,0.08)',
        dotBg: 'rgba(148,163,184,0.2)',
        candidates: allAssigned.filter(function (p) { return getDocStage(p.docs) === 0; })
      },
      {
        label: 'Documents Under Review',
        color: '#F59E0B',
        bg: 'rgba(245,158,11,0.05)',
        dotBg: 'rgba(245,158,11,0.15)',
        candidates: allAssigned.filter(function (p) {
          if (getDocStage(p.docs) !== 1) return false;
          var rejected = p.docs.filter(function (d) { return d.status === 'rejected'; }).length;
          return rejected === 0;
        })
      },
      {
        label: 'Docs Need Attention',
        color: '#E63946',
        bg: 'rgba(230,57,70,0.05)',
        dotBg: 'rgba(230,57,70,0.15)',
        candidates: allAssigned.filter(function (p) {
          if (getDocStage(p.docs) !== 1) return false;
          var rejected = p.docs.filter(function (d) { return d.status === 'rejected'; }).length;
          return rejected > 0;
        })
      },
      {
        label: 'Docs Verified \u2014 DataFlow / Licensing',
        color: '#2EC4B6',
        bg: 'rgba(46,196,182,0.05)',
        dotBg: 'rgba(46,196,182,0.15)',
        candidates: allAssigned.filter(function (p) { return getDocStage(p.docs) >= 2; })
      }
    ];

    var html = '';
    groups.forEach(function (group) {
      html += '<div class="pipeline-col">';
      html += '<div class="pipeline-col-header">';
      html += '<span class="pipeline-col-title"><span class="col-dot" style="background:' + group.color + '"></span><span style="color:' + group.color + '">' + esc(group.label) + '</span></span>';
      html += '<span class="pipeline-col-count">' + group.candidates.length + '</span>';
      html += '</div>';
      html += '<div class="pipeline-col-body">';
      if (group.candidates.length === 0) {
        html += '<div class="pipeline-empty">No candidates here</div>';
      } else {
        group.candidates.forEach(function (p) {
          var colors = GHE.avatarColors[p.avatar_color_index || 0];
          html += '<div class="pipeline-mini" data-id="' + esc(p.id) + '">';
          html += '<div class="pipeline-mini-av" style="background:' + colors[0] + ';color:' + colors[1] + '">' + esc(p.avatar_initials || '??') + '</div>';
          html += '<div class="pipeline-mini-info">';
          html += '<div class="pipeline-mini-name">' + esc(p.full_name || 'Unnamed') + '</div>';
          html += '<div class="pipeline-mini-spec">' + esc(p.specialty || '—') + '</div>';
          html += '</div></div>';
        });
      }
      html += '</div></div>';
    });

    board.innerHTML = html;

    board.querySelectorAll('.pipeline-mini').forEach(function (card) {
      card.addEventListener('click', function () { openCandidatePanel(card.dataset.id); });
    });
  }

  // ── Search ──
  function bindSearch() {
    var input = document.getElementById('candidate-search');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      if (!q) { renderCandidates(allAssigned); return; }
      renderCandidates(allAssigned.filter(function (p) {
        return (p.full_name + ' ' + p.specialty + ' ' + (p.country_of_origin || '')).toLowerCase().includes(q);
      }));
    });
  }

  // ── Detail Panel ──
  var panelEl, overlayEl, panelBodyEl;

  function initPanel() {
    panelEl = document.getElementById('detail-panel');
    overlayEl = document.getElementById('detail-overlay');
    panelBodyEl = document.getElementById('panel-body');
    document.getElementById('panel-close').addEventListener('click', closePanel);
    overlayEl.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  }

  function openPanel() {
    panelEl.style.display = 'flex';
    overlayEl.style.display = 'block';
    requestAnimationFrame(function () {
      panelEl.style.transform = 'translateX(0)';
      overlayEl.style.opacity = '1';
    });
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panelEl.style.transform = 'translateX(100%)';
    overlayEl.style.opacity = '0';
    document.body.style.overflow = '';
    setTimeout(function () {
      panelEl.style.display = 'none';
      overlayEl.style.display = 'none';
    }, 300);
  }

  async function openCandidatePanel(candidateId) {
    var heroEl = document.getElementById('panel-hero');
    if (heroEl) heroEl.innerHTML = '<div style="padding:var(--space-6);"><div class="spinner" style="margin:0 auto;"></div></div>';
    panelBodyEl.innerHTML = '';
    openPanel();

    var candidate = allAssigned.find(function (p) { return p.id === candidateId; });
    if (!candidate) {
      panelBodyEl.innerHTML = '<p style="color:var(--error);padding:var(--space-4);">Candidate not found.</p>';
      return;
    }

    // Fetch full documents list
    var { data: docs } = await ghFrom('documents')
      .select('*').eq('applicant_id', candidateId).order('uploaded_at', { ascending: false });
    docs = docs || [];

    // Fetch recruiter notes for this candidate
    var { data: notes } = await ghFrom('recruiter_notes')
      .select('id, note, created_at').eq('applicant_id', candidateId).eq('recruiter_id', currentUser.id)
      .order('created_at', { ascending: false });
    notes = notes || [];

    var colors = GHE.avatarColors[candidate.avatar_color_index || 0];
    var badge = getStageBadge(candidate.docs || docs);

    // ── Panel Hero ──
    var heroHtml = '<div class="panel-hero">';
    heroHtml += '<div class="panel-hero-row">';
    heroHtml += '<div class="panel-avatar-lg" style="background:' + colors[0] + ';color:' + colors[1] + '">' + esc(candidate.avatar_initials || '??') + '</div>';
    heroHtml += '<div style="flex:1;min-width:0;">';
    heroHtml += '<div class="panel-name">' + esc(candidate.full_name || 'Unnamed') + '</div>';
    heroHtml += '<div class="panel-specialty">' + esc(candidate.specialty || 'No specialty') + (candidate.country_of_origin ? ' &nbsp;·&nbsp; ' + esc(candidate.country_of_origin) : '') + '</div>';
    heroHtml += '</div></div>';
    heroHtml += '<div style="margin-top:var(--space-4);display:flex;align-items:center;gap:var(--space-3);">';
    heroHtml += '<span class="stage-pill" style="background:' + badge.bg + ';color:' + badge.color + '"><span class="stage-dot" style="background:' + badge.color + '"></span>' + esc(badge.label) + '</span>';
    if (candidate.years_of_experience != null) heroHtml += '<span style="font-size:11px;color:var(--text-tertiary);">' + candidate.years_of_experience + ' yrs exp</span>';
    heroHtml += '</div>';
    heroHtml += '</div>';
    if (heroEl) heroEl.innerHTML = heroHtml;

    var html = '';

    // ── Section: Info grid ──
    var fields = [
      { label: 'Country', value: candidate.country_of_origin },
      { label: 'Experience', value: candidate.years_of_experience != null ? candidate.years_of_experience + ' yrs' : null },
      { label: 'Phone', value: candidate.phone },
      { label: 'License No.', value: candidate.license_number },
    ];
    html += '<div><div class="panel-section-title">Profile</div>';
    html += '<div class="info-grid">';
    fields.forEach(function (f) {
      html += '<div class="info-cell"><div class="info-cell-label">' + esc(f.label) + '</div><div class="info-cell-value">' + esc(f.value || '—') + '</div></div>';
    });
    html += '</div></div>';

    // ── Section: Preferred destinations ──
    if (candidate.preferred_destinations && candidate.preferred_destinations.length > 0) {
      html += '<div>';
      html += '<div class="panel-section-title">Target Destinations</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">';
      candidate.preferred_destinations.forEach(function (d) { html += '<span class="dest-tag">' + esc(d) + '</span>'; });
      html += '</div></div>';
    }

    // ── Section: Recruitment Pipeline ──
    // Unified phase stepper (GHE.PHASES) — same pipeline as the admin dashboard.
    var pipeline = GHE.PHASES.map(function (ph, i) {
      return { id: ph.key, label: ph.label, desc: PIPELINE_PHASE_DESC[ph.key] || '', icon: String(i + 1) };
    });
    var pipelineTitle = 'Recruitment Path';
    var pipelineSubtitle = 'Unified pipeline across all markets';

    // Current phase = the candidate's stored pipeline_stage → phase (GHE.phaseOf)
    var currentPipelineStep = 0;
    if (candidate.pipeline_stage) {
      var phase = GHE.phaseOf(candidate.pipeline_stage);
      var phaseIdx = pipeline.findIndex(function (s) { return s.id === phase; });
      if (phaseIdx >= 0) currentPipelineStep = phaseIdx;
    }

    html += '<div>';
    html += '<div class="panel-section-title">' + esc(pipelineTitle) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:var(--space-4);">' + esc(pipelineSubtitle) + '</div>';
    if (candidate.pipeline_exit_status) {
      html += '<div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4);">' +
        GHE.exitBadge(candidate.pipeline_exit_status) +
        (candidate.pipeline_exit_reason ? '<span style="font-size:11px;color:var(--text-tertiary);">' + esc(candidate.pipeline_exit_reason) + '</span>' : '') +
      '</div>';
    }
    html += '<div class="pipeline-stepper">';

    pipeline.forEach(function (step, idx) {
      var isComplete = idx < currentPipelineStep;
      var isCurrent = idx === currentPipelineStep;

      var stepClass = 'pipeline-step' + (isComplete ? ' step-done' : (isCurrent ? ' step-current' : ''));
      var dotClass = 'step-dot ' + (isComplete ? 'step-dot-done' : (isCurrent ? 'step-dot-current' : 'step-dot-pending'));
      var labelClass = 'step-label' + ((!isComplete && !isCurrent) ? ' step-label-pending' : '');

      html += '<div class="' + stepClass + '">';
      html += '<div class="step-dot-wrap"><div class="' + dotClass + '">';
      if (isComplete) html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      else html += esc(step.icon);
      html += '</div></div>';
      html += '<div class="step-content">';
      html += '<div class="' + labelClass + '">' + esc(step.label);
      if (isCurrent) html += ' <span style="font-size:10px;font-weight:700;color:var(--primary);background:rgba(0,119,182,0.1);padding:1px 7px;border-radius:20px;">Active</span>';
      html += '</div>';
      html += '<div class="step-desc">' + esc(step.desc) + '</div>';
      html += '</div></div>';
    });

    html += '</div></div>';

    // ── Section: Documents ──
    html += '<div>';
    html += '<div class="panel-section-title">Documents (' + docs.length + ')</div>';
    if (docs.length === 0) {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No documents uploaded yet.</p>';
    } else {
      var statusMap = {
        pending:   { c: '#F4A261', bg: 'rgba(244,162,97,0.1)',  l: 'Pending' },
        in_review: { c: '#48CAE4', bg: 'rgba(72,202,228,0.1)',  l: 'In Review' },
        verified:  { c: '#2EC4B6', bg: 'rgba(46,196,182,0.1)',  l: 'Verified' },
        rejected:  { c: '#E63946', bg: 'rgba(230,57,70,0.1)',   l: 'Rejected' }
      };
      docs.forEach(function (d) {
        var st = statusMap[d.status] || statusMap.pending;
        var label = DOC_LABELS[d.doc_type] || d.doc_type || 'Document';
        html += '<div class="doc-row">';
        html += '<div class="doc-row-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + st.c + '" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + esc(label) + '</div>';
        html += '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(d.file_name || '') + '</div>';
        html += '</div>';
        html += '<span class="doc-status-badge" style="background:' + st.bg + ';color:' + st.c + ';border:1px solid ' + st.c + '30;">' + st.l + '</span>';
        if (d.file_path) html += '<button class="btn-view-doc btn-dl" data-path="' + esc(d.file_path) + '" data-cand="' + esc(candidateId) + '">View</button>';
        html += '</div>';
      });
    }
    html += '</div>';

    // ── Section: Assessment ──
    html += '<div>';
    html += '<div class="panel-section-title">Your Assessment</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:var(--space-4);">Private — shared only with the eLab team.</div>';

    var recOptions = [
      { key: 'Suitable for Position',     icon: '✓', sel: 'sel-green' },
      { key: 'Needs More Documentation',  icon: '📋', sel: 'sel-amber' },
      { key: 'Further Assessment Required', icon: '🔍', sel: 'sel-blue' },
      { key: 'Not Suitable at This Time', icon: '✗', sel: 'sel-red' },
    ];
    html += '<div class="rec-grid">';
    recOptions.forEach(function (opt) {
      html += '<div class="rec-tile" data-rec="' + esc(opt.key) + '" data-sel="' + esc(opt.sel) + '">';
      html += '<div class="rec-tile-icon">' + opt.icon + '</div>';
      html += '<div class="rec-tile-label">' + esc(opt.key) + '</div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<textarea class="rec-textarea" id="note-input" rows="4" placeholder="Add detailed notes about this candidate…"></textarea>';
    html += '<button class="btn-save-assess" id="btn-add-note" data-cid="' + esc(candidateId) + '">';
    html += '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    html += 'Save Assessment</button>';
    html += '</div>';

    // ── Section: Previous Assessments ──
    html += '<div>';
    html += '<div class="panel-section-title">Previous Assessments</div>';
    if (notes.length === 0) {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No assessments yet.</p>';
    } else {
      notes.forEach(function (n) {
        var parsed = parseAssessment(n.note);
        var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        html += '<div class="prev-note">';
        if (parsed.rec) {
          var ac = getAssessmentColor(parsed.rec);
          html += '<span class="assess-badge" style="background:' + ac.bg + ';color:' + ac.color + '">' + esc(parsed.rec) + '</span>';
        }
        if (parsed.text) html += '<div style="font-size:var(--text-sm);color:var(--text-primary);white-space:pre-wrap;line-height:1.6;">' + esc(parsed.text) + '</div>';
        html += '<div class="prev-note-date">' + esc(dateStr) + '</div>';
        html += '</div>';
      });
    }
    html += '</div>';

    panelBodyEl.innerHTML = html;

    // ── Bind recommendation tile selection ──
    var selectedRec = null;
    panelBodyEl.querySelectorAll('.rec-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        panelBodyEl.querySelectorAll('.rec-tile').forEach(function (t) {
          t.classList.remove('sel-green', 'sel-amber', 'sel-blue', 'sel-red');
        });
        tile.classList.add(tile.dataset.sel);
        selectedRec = tile.dataset.rec;
      });
    });

    // ── Bind document view buttons ──
    panelBodyEl.querySelectorAll('.btn-dl').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = '...';
        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/recruiter-get-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ file_path: btn.dataset.path, applicant_id: btn.dataset.cand })
          });
          var result = await resp.json();
          if (result.url) { window.open(result.url, '_blank'); }
          else { alert('Could not open document: ' + (result.error || 'Unknown error')); }
        } catch (err) {
          alert('Could not open document.');
        } finally {
          btn.disabled = false;
          btn.textContent = 'View';
        }
      });
    });

    // ── Bind save assessment / note ──
    var noteBtn = document.getElementById('btn-add-note');
    var noteInput = document.getElementById('note-input');
    if (noteBtn) {
      noteBtn.addEventListener('click', async function () {
        var noteText = noteInput && noteInput.value.trim();
        if (!noteText) { alert('Please write a note before saving.'); return; }

        // Prepend assessment tag if a recommendation was selected
        var finalNote = noteText;
        if (selectedRec) {
          finalNote = '[ASSESSMENT: ' + selectedRec + ']\n\n' + noteText;
        }

        noteBtn.disabled = true;
        noteBtn.textContent = 'Saving...';

        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/manage-recruiter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: 'add_note', applicant_id: candidateId, note: finalNote })
          });
          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Failed');

          // Mark candidate as reviewed
          noteApplicantIds.add(candidateId);

          // Refresh KPIs
          var needsReviewCount = allAssigned.filter(function (p) { return !noteApplicantIds.has(p.id); }).length;
          var docsCompleteCount = allAssigned.filter(function (p) { return getDocStage(p.docs) >= 2; }).length;
          setKpis(allAssigned.length, docsCompleteCount, needsReviewCount);

          // Re-open panel to show fresh notes
          await openCandidatePanel(candidateId);
        } catch (err) {
          alert('Failed to save assessment: ' + err.message);
          noteBtn.disabled = false;
          noteBtn.textContent = 'Save Assessment';
        }
      });
    }
  }

  // ── Load all notes (My Notes tab) ──
  async function loadNotes() {
    var list = document.getElementById('notes-list');

    var { data: notes } = await ghFrom('recruiter_notes')
      .select('id, applicant_id, note, created_at')
      .eq('recruiter_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (!notes || notes.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:var(--space-12);color:var(--text-tertiary);">No assessments yet. Add notes while viewing a candidate\'s profile.</div>';
      return;
    }

    var notesHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:var(--space-4);">';
    notes.forEach(function (n) {
      var candidate = allAssigned.find(function (p) { return p.id === n.applicant_id; });
      var candColors = candidate ? GHE.avatarColors[candidate.avatar_color_index || 0] : GHE.avatarColors[0];
      var initials = candidate ? (candidate.avatar_initials || '??') : '??';
      var name = candidate ? esc(candidate.full_name) : 'Unknown candidate';
      var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      var parsed = parseAssessment(n.note);

      notesHtml += '<div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-xl);padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-3);">';
      // Candidate header
      notesHtml += '<div style="display:flex;align-items:center;gap:var(--space-3);">';
      notesHtml += '<div style="width:36px;height:36px;border-radius:var(--radius-md);background:' + candColors[0] + ';color:' + candColors[1] + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">' + esc(initials) + '</div>';
      notesHtml += '<div style="flex:1;min-width:0;"><div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">' + name + '</div>';
      notesHtml += '<div style="font-size:11px;color:var(--text-tertiary);">' + dateStr + '</div></div>';
      if (parsed.rec) {
        var ac = getAssessmentColor(parsed.rec);
        notesHtml += '<span class="assess-badge" style="background:' + ac.bg + ';color:' + ac.color + '">' + esc(parsed.rec) + '</span>';
      }
      notesHtml += '</div>';
      if (parsed.text) notesHtml += '<div style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;">' + esc(parsed.text) + '</div>';
      notesHtml += '</div>';
    });
    notesHtml += '</div>';
    list.innerHTML = notesHtml;
  }

  // ── Load recruiter-submitted candidates (My Candidates tab) ──
  async function loadMyCandidates() {
    var grid = document.getElementById('my-candidates-grid');
    if (!grid) return;

    var { data: submissions, error } = await ghFrom('recruiter_submitted_candidates')
      .select('*')
      .eq('recruiter_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      grid.innerHTML = '<div style="text-align:center;padding:var(--space-12);color:var(--error);grid-column:1/-1;">Could not load your candidates. Please try again.</div>';
      return;
    }

    var list = submissions || [];
    var docsBySubmission = {};
    var ids = list.map(function (c) { return c.id; });
    if (ids.length) {
      var { data: docs } = await ghFrom('recruiter_submission_documents')
        .select('submission_id, doc_type, file_name, status')
        .in('submission_id', ids);
      (docs || []).forEach(function (d) {
        (docsBySubmission[d.submission_id] = docsBySubmission[d.submission_id] || []).push(d);
      });
    }

    renderMyCandidates(list, docsBySubmission);
  }

  function renderMyCandidates(list, docsBySubmission) {
    var grid = document.getElementById('my-candidates-grid');
    var countEl = document.getElementById('my-candidates-count');
    if (countEl) countEl.textContent = list.length ? (list.length + ' candidate' + (list.length !== 1 ? 's' : '')) : '';
    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:var(--space-16);color:var(--text-tertiary);grid-column:1/-1;">You haven\'t added any candidates yet.</div>';
      return;
    }

    docsBySubmission = docsBySubmission || {};

    grid.innerHTML = list.map(function (c) {
      var badge = getAdminStatusBadge(c.admin_status);
      var specLine = [c.profession, c.specialty].filter(Boolean).join(' — ');
      var noteHtml = c.admin_note
        ? '<div class="mycand-note"><span class="mycand-note-label">eLab Feedback</span>' + esc(c.admin_note) + '</div>'
        : '';

      var docs = docsBySubmission[c.id] || [];
      var docsHtml;
      if (docs.length) {
        docsHtml = '<div class="mycand-docs-row">' + docs.map(function (d) {
          var chipClass = d.status === 'verified' ? 'doc-chip-v' : (d.status === 'rejected' ? 'doc-chip-r' : 'doc-chip-p');
          var label = SUBMISSION_DOC_LABELS[d.doc_type] || d.doc_type || 'Document';
          return '<span class="doc-chip ' + chipClass + '" title="' + esc(d.file_name || '') + '">' + esc(label) + '</span>';
        }).join('') + '</div>';
      } else {
        docsHtml = '<div class="mycand-docs-row"><span class="doc-chip doc-chip-e">No documents yet</span></div>';
      }

      return '<div class="cand-card" data-id="' + esc(c.id) + '" style="cursor:default;">' +
        '<div class="cand-card-accent"></div>' +
        '<div class="cand-card-body">' +
          '<div class="cand-header">' +
            '<div class="cand-info">' +
              '<div class="cand-name">' + esc(c.full_name || 'Unnamed') + '</div>' +
              '<div class="cand-specialty">' + esc(specLine || 'No specialty listed') + '</div>' +
            '</div>' +
            '<span class="stage-pill" style="background:' + badge.bg + ';color:' + badge.color + ';align-self:flex-start;">' +
              '<span class="stage-dot" style="background:' + badge.color + '"></span>' + esc(badge.label) +
            '</span>' +
          '</div>' +
          noteHtml +
          docsHtml +
          '<button type="button" class="btn-add-docs" data-add-docs="' + esc(c.id) + '">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            (docs.length ? 'Add More Documents' : 'Add Documents') +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    grid.querySelectorAll('[data-add-docs]').forEach(function (btn) {
      btn.addEventListener('click', function () { openCandidateDocs(btn.dataset.addDocs); });
    });
  }

  // ── Add Candidate Modal ──
  var acOverlayEl, acModalEl;
  var AC_FIELD_IDS = ['ac-full-name', 'ac-email', 'ac-phone', 'ac-specialty', 'ac-experience',
    'ac-current-country', 'ac-target-countries', 'ac-passport', 'ac-license', 'ac-notes'];

  function initAddCandidatePanel() {
    acOverlayEl = document.getElementById('ac-overlay');
    acModalEl = document.getElementById('ac-modal');
    if (!acOverlayEl || !acModalEl) return;

    var addBtn = document.getElementById('btn-add-candidate');
    if (addBtn) addBtn.addEventListener('click', openAddCandidate);

    var closeBtn = document.getElementById('ac-close');
    var cancelBtn = document.getElementById('ac-cancel');
    if (closeBtn) closeBtn.addEventListener('click', closeAddCandidatePanel);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAddCandidatePanel);
    acOverlayEl.addEventListener('click', closeAddCandidatePanel);

    var submitBtn = document.getElementById('ac-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', submitCandidate);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && acModalEl.style.display === 'flex') closeAddCandidatePanel();
    });
  }

  function openAddCandidate() {
    if (!acModalEl || !acOverlayEl) return;
    clearAddCandidateForm();
    acOverlayEl.style.display = 'block';
    acModalEl.style.display = 'flex';
    requestAnimationFrame(function () {
      acOverlayEl.style.opacity = '1';
      acModalEl.style.opacity = '1';
      acModalEl.style.transform = 'translate(-50%,-50%)';
    });
    document.body.style.overflow = 'hidden';
  }

  function closeAddCandidatePanel() {
    if (!acModalEl || !acOverlayEl) return;
    acOverlayEl.style.opacity = '0';
    acModalEl.style.opacity = '0';
    acModalEl.style.transform = 'translate(-50%,-48%)';
    document.body.style.overflow = '';
    setTimeout(function () {
      acModalEl.style.display = 'none';
      acOverlayEl.style.display = 'none';
    }, 250);
  }

  function clearAddCandidateForm() {
    AC_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var prof = document.getElementById('ac-profession');
    if (prof) prof.value = '';
    showAddCandidateError('');
  }

  function showAddCandidateError(msg) {
    var el = document.getElementById('ac-error');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = msg;
    el.style.display = 'flex';
  }

  // ── Candidate Documents Modal (recruiter_submission_documents) ──
  var adOverlayEl, adModalEl;
  var adSubmissionId = null;
  var adSelectedFiles = {};
  var adExistingDocs = [];

  function initCandidateDocsModal() {
    adOverlayEl = document.getElementById('ad-overlay');
    adModalEl = document.getElementById('ad-modal');
    if (!adOverlayEl || !adModalEl) return;

    var closeBtn = document.getElementById('ad-close');
    var cancelBtn = document.getElementById('ad-cancel');
    if (closeBtn) closeBtn.addEventListener('click', closeCandidateDocs);
    if (cancelBtn) cancelBtn.addEventListener('click', closeCandidateDocs);
    adOverlayEl.addEventListener('click', closeCandidateDocs);

    var submitBtn = document.getElementById('ad-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', uploadCandidateDocs);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && adModalEl.style.display === 'flex') closeCandidateDocs();
    });
  }

  // Opened for a submission id right after a successful Add Candidate insert,
  // and also from the "Add Documents" button on a My Candidates card.
  async function openCandidateDocs(submissionId) {
    if (!adModalEl || !adOverlayEl || !submissionId) return;

    adSubmissionId = submissionId;
    adSelectedFiles = {};
    adExistingDocs = [];
    showDocsError('');
    renderDocFileGrid();

    var existingEl = document.getElementById('ad-existing');
    if (existingEl) existingEl.innerHTML = '<div style="text-align:center;padding:var(--space-4) 0;color:var(--text-tertiary);font-size:var(--text-sm);"><div class="spinner" style="margin:0 auto var(--space-2);"></div>Loading existing documents…</div>';

    adOverlayEl.style.display = 'block';
    adModalEl.style.display = 'flex';
    requestAnimationFrame(function () {
      adOverlayEl.style.opacity = '1';
      adModalEl.style.opacity = '1';
      adModalEl.style.transform = 'translate(-50%,-50%)';
    });
    document.body.style.overflow = 'hidden';

    var { data: docs } = await ghFrom('recruiter_submission_documents')
      .select('id, doc_type, file_name, status, created_at')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false });
    adExistingDocs = docs || [];
    renderExistingDocs();
  }

  function closeCandidateDocs() {
    if (!adModalEl || !adOverlayEl) return;
    adOverlayEl.style.opacity = '0';
    adModalEl.style.opacity = '0';
    adModalEl.style.transform = 'translate(-50%,-48%)';
    document.body.style.overflow = '';
    setTimeout(function () {
      adModalEl.style.display = 'none';
      adOverlayEl.style.display = 'none';
    }, 250);

    // Refresh the My Candidates cards so any newly-uploaded docs show up.
    if (myCandidatesLoaded) loadMyCandidates();
  }

  function showDocsError(msg) {
    var el = document.getElementById('ad-error');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = msg;
    el.style.display = 'flex';
  }

  function renderExistingDocs() {
    var el = document.getElementById('ad-existing');
    if (!el) return;
    if (!adExistingDocs.length) { el.innerHTML = ''; return; }

    var statusMap = {
      pending:   { c: '#F4A261', bg: 'rgba(244,162,97,0.1)',  l: 'Pending' },
      in_review: { c: '#48CAE4', bg: 'rgba(72,202,228,0.1)',  l: 'In Review' },
      verified:  { c: '#2EC4B6', bg: 'rgba(46,196,182,0.1)',  l: 'Verified' },
      rejected:  { c: '#E63946', bg: 'rgba(230,57,70,0.1)',   l: 'Rejected' }
    };

    var html = '<div class="panel-section-title">Already Uploaded</div>';
    adExistingDocs.forEach(function (d) {
      var st = statusMap[d.status] || statusMap.pending;
      var label = SUBMISSION_DOC_LABELS[d.doc_type] || d.doc_type || 'Document';
      html += '<div class="doc-row">';
      html += '<div class="doc-row-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + st.c + '" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + esc(label) + '</div>';
      html += '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(d.file_name || '') + '</div>';
      html += '</div>';
      html += '<span class="doc-status-badge" style="background:' + st.bg + ';color:' + st.c + ';">' + esc(st.l) + '</span>';
      html += '</div>';
    });
    el.innerHTML = html;
  }

  function renderDocFileGrid() {
    var grid = document.getElementById('ad-file-grid');
    if (!grid) return;
    grid.innerHTML = SUBMISSION_DOC_TYPES.map(buildDocFileDrop).join('');
    bindDocFileGridEvents();
  }

  function buildDocFileDrop(f) {
    var file = adSelectedFiles[f.key];
    if (file) {
      return '<div>' +
        '<label class="dc-file-label">' + esc(f.label) + '</label>' +
        '<div class="dc-file-selected">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
          '<span class="fname">' + esc(file.name) + '</span>' +
          '<button type="button" class="remove-btn" data-remove-doc="' + esc(f.key) + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }
    return '<div>' +
      '<label class="dc-file-label">' + esc(f.label) + '</label>' +
      '<div class="dc-file-zone" data-drop-doc="' + esc(f.key) + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 4px;color:var(--text-tertiary);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
        '<div class="drop-text">Drop or <span class="browse">browse</span></div>' +
        '<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none" data-input-doc="' + esc(f.key) + '">' +
      '</div>' +
    '</div>';
  }

  function bindDocFileGridEvents() {
    var grid = document.getElementById('ad-file-grid');
    if (!grid) return;

    grid.querySelectorAll('[data-drop-doc]').forEach(function (zone) {
      var key = zone.dataset.dropDoc;
      zone.addEventListener('click', function () {
        var input = grid.querySelector('[data-input-doc="' + key + '"]');
        if (input) input.click();
      });
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', function () {
        zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) {
          adSelectedFiles[key] = e.dataTransfer.files[0];
          renderDocFileGrid();
        }
      });
    });

    grid.querySelectorAll('[data-input-doc]').forEach(function (input) {
      input.addEventListener('change', function (e) {
        if (e.target.files[0]) {
          adSelectedFiles[input.dataset.inputDoc] = e.target.files[0];
          renderDocFileGrid();
        }
      });
    });

    grid.querySelectorAll('[data-remove-doc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delete adSelectedFiles[btn.dataset.removeDoc];
        renderDocFileGrid();
      });
    });
  }

  // ── Upload each selected file to storage, then insert its DB row ──
  async function uploadCandidateDoc(docType, file, submissionId) {
    var ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    var path = 'recruiter-clients/' + currentUser.id + '/' + submissionId + '/' + docType + '-' + Date.now() + '.' + ext;

    var uploadResult = await sb.storage.from('gh-applicant-documents').upload(path, file, { contentType: file.type });
    if (uploadResult.error) throw uploadResult.error;

    var { error: insertError } = await ghFrom('recruiter_submission_documents').insert({
      submission_id: submissionId,
      recruiter_id: currentUser.id,
      doc_type: docType,
      file_name: file.name,
      file_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      status: 'pending'
    });
    if (insertError) throw insertError;
  }

  async function uploadCandidateDocs() {
    showDocsError('');
    var keys = Object.keys(adSelectedFiles);
    if (!keys.length) { showDocsError('Choose at least one file to upload.'); return; }
    if (!adSubmissionId) { showDocsError('Missing candidate reference — please close and try again.'); return; }

    var submitBtn = document.getElementById('ad-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading…'; }

    var failures = [];
    for (var i = 0; i < keys.length; i++) {
      var docType = keys[i];
      try {
        await uploadCandidateDoc(docType, adSelectedFiles[docType], adSubmissionId);
      } catch (err) {
        console.warn('Upload failed for ' + docType + ':', err);
        failures.push(docType);
      }
    }

    if (failures.length) {
      showDocsError('Some files could not be uploaded (' + failures.map(function (k) { return SUBMISSION_DOC_LABELS[k] || k; }).join(', ') + '). Please try again.');
      // Keep the failed files selected so the recruiter can retry; drop the succeeded ones.
      keys.forEach(function (k) { if (failures.indexOf(k) === -1) delete adSelectedFiles[k]; });
    } else {
      adSelectedFiles = {};
    }

    var { data: docs } = await ghFrom('recruiter_submission_documents')
      .select('id, doc_type, file_name, status, created_at')
      .eq('submission_id', adSubmissionId)
      .order('created_at', { ascending: false });
    adExistingDocs = docs || [];
    renderExistingDocs();
    renderDocFileGrid();

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Upload Documents'; }
  }

  async function submitCandidate() {
    showAddCandidateError('');

    var fullName = (document.getElementById('ac-full-name').value || '').trim();
    var profession = document.getElementById('ac-profession').value || '';

    if (!fullName) { showAddCandidateError('Full name is required.'); return; }
    if (!profession) { showAddCandidateError('Profession is required.'); return; }

    var email = (document.getElementById('ac-email').value || '').trim() || null;
    var phone = (document.getElementById('ac-phone').value || '').trim() || null;
    var specialty = (document.getElementById('ac-specialty').value || '').trim() || null;
    var expRaw = (document.getElementById('ac-experience').value || '').trim();
    var experienceYears = expRaw ? parseInt(expRaw, 10) : null;
    if (experienceYears != null && isNaN(experienceYears)) experienceYears = null;
    var currentCountry = (document.getElementById('ac-current-country').value || '').trim() || null;
    var targetRaw = (document.getElementById('ac-target-countries').value || '').trim();
    var targetCountries = targetRaw
      ? targetRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      : null;
    var passportNumber = (document.getElementById('ac-passport').value || '').trim() || null;
    var licenseNumber = (document.getElementById('ac-license').value || '').trim() || null;
    var notes = (document.getElementById('ac-notes').value || '').trim();

    var submitBtn = document.getElementById('ac-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

    try {
      var { data, error } = await ghFrom('recruiter_submitted_candidates').insert({
        recruiter_id: currentUser.id,
        full_name: fullName,
        email: email,
        phone: phone,
        profession: profession,
        specialty: specialty,
        experience_years: experienceYears,
        current_country: currentCountry,
        target_countries: targetCountries,
        passport_number: passportNumber,
        license_number: licenseNumber,
        profile_data: { notes: notes || null }
      }).select().single();

      if (error) throw error;

      // Success — hand off to the (not-yet-built) document-upload step.
      openCandidateDocs(data.id);

      closeAddCandidatePanel();
      myCandidatesLoaded = true;
      await loadMyCandidates();
    } catch (err) {
      showAddCandidateError('Could not add candidate: ' + (err.message || 'Unknown error'));
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Candidate'; }
    }
  }

})();
