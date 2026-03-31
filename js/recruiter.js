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

  // ── Saudi Arabia recruitment pipeline stages ──
  var SAUDI_PIPELINE = [
    { id: 'profile', label: 'Profile & Documents', desc: 'Candidate profile complete, all required documents submitted', icon: '1' },
    { id: 'dataflow', label: 'DataFlow Verification', desc: 'Credential verification submitted to DataFlow (SCFHS requirement)', icon: '2' },
    { id: 'prometric', label: 'Prometric Exam', desc: 'Saudi Commission for Health Specialties licensing exam', icon: '3' },
    { id: 'sfhs_eval', label: 'SFHS/MOH Evaluation', desc: 'Saudi Food & Health Services / Ministry of Health licence evaluation', icon: '4' },
    { id: 'mumaris', label: 'Mumaris+ Registration', desc: 'Professional registration on the Mumaris+ platform (SCFHS portal)', icon: '5' },
    { id: 'visa', label: 'Visa & Deployment', desc: 'Job offer confirmed, visa processed, deployment scheduled', icon: '6' },
  ];

  // ── Generic recruitment pipeline stages ──
  var GENERIC_PIPELINE = [
    { id: 'profile', label: 'Profile & Documents', desc: 'Profile complete, documents submitted', icon: '1' },
    { id: 'verification', label: 'Credential Verification', desc: 'Documents and credentials under review', icon: '2' },
    { id: 'licensing', label: 'Licensing / Exam', desc: 'Local licensing requirements and assessments', icon: '3' },
    { id: 'offer', label: 'Job Offer', desc: 'Matched with position, offer extended', icon: '4' },
    { id: 'deployment', label: 'Visa & Deployment', desc: 'Visa processed and deployment confirmed', icon: '5' },
  ];

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

  // ── Is this candidate targeting Saudi Arabia? ──
  function isSaudi(candidate) {
    return (candidate.preferred_destinations || []).some(function (d) {
      return /saudi|ksa|riyadh|jeddah/i.test(d);
    });
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
    document.querySelectorAll('.sidebar-nav-item[data-tab]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var tabId = item.dataset.tab;
        document.querySelectorAll('.sidebar-nav-item').forEach(function (n) { n.classList.remove('active'); });
        item.classList.add('active');
        document.querySelectorAll('.recruiter-tab').forEach(function (t) {
          t.classList.toggle('active', t.id === tabId);
        });
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
      .select('id, full_name, specialty, country_of_origin, years_of_experience, avatar_initials, avatar_color_index, preferred_destinations, phone, license_number')
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

      var pills = '';
      if (verified) pills += '<span class="doc-pill doc-pill-verified">' + verified + ' verified</span>';
      if (pending) pills += '<span class="doc-pill doc-pill-pending">' + pending + ' pending</span>';
      if (rejected) pills += '<span class="doc-pill doc-pill-rejected">' + rejected + ' needs attention</span>';
      if (!p.docs.length) pills += '<span class="doc-pill" style="background:var(--bg-surface);color:var(--text-tertiary);">No docs yet</span>';

      var dests = (p.preferred_destinations || []).slice(0, 2).map(function (d) {
        return '<span class="tag" style="font-size:10px;">' + esc(d) + '</span>';
      }).join('');

      return '<div class="candidate-card" data-id="' + esc(p.id) + '">' +
        '<div class="candidate-card-header">' +
          '<div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + esc(p.avatar_initials || '??') + '</div>' +
          '<div class="candidate-card-info">' +
            '<div class="cname">' + esc(p.full_name || 'Unnamed') + '</div>' +
            '<div class="cspecialty">' + esc(p.specialty || 'No specialty') + ' \u00b7 ' + esc(p.country_of_origin || '\u2014') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);">' +
          '<span class="stage-badge" style="background:' + badge.bg + ';color:' + badge.color + '">' + esc(badge.label) + '</span>' +
          (needsReview ? '<span style="font-size:10px;font-weight:600;color:#F59E0B;">\u25cf Review needed</span>' : '') +
        '</div>' +
        (dests ? '<div style="display:flex;flex-wrap:wrap;gap:var(--space-1);margin-bottom:var(--space-3);">' + dests + '</div>' : '') +
        '<div class="doc-pills">' + pills + '</div>' +
      '</div>';
    }).join('');

    // Bind card clicks
    grid.querySelectorAll('.candidate-card').forEach(function (card) {
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
      html += '<div class="pipeline-column">';
      html += '<div class="pipeline-column-header" style="background:' + group.bg + ';border-bottom:1px solid var(--border-subtle);">';
      html += '<span style="width:8px;height:8px;border-radius:50%;background:' + group.color + ';display:inline-block;flex-shrink:0;"></span>';
      html += '<span style="color:' + group.color + '">' + esc(group.label) + '</span>';
      html += '<span style="margin-left:auto;font-size:11px;font-weight:700;color:var(--text-tertiary);">' + group.candidates.length + '</span>';
      html += '</div>';
      html += '<div class="pipeline-column-body">';
      if (group.candidates.length === 0) {
        html += '<div style="font-size:var(--text-sm);color:var(--text-tertiary);text-align:center;padding:var(--space-4) 0;">No candidates in this stage</div>';
      } else {
        group.candidates.forEach(function (p) {
          var colors = GHE.avatarColors[p.avatar_color_index || 0];
          var dests = (p.preferred_destinations || []).slice(0, 2).map(function (d) {
            return '<span class="tag" style="font-size:10px;">' + esc(d) + '</span>';
          }).join('');
          html += '<div class="pipeline-mini-card" data-id="' + esc(p.id) + '">';
          html += '<div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + ';flex-shrink:0;">' + esc(p.avatar_initials || '??') + '</div>';
          html += '<div style="flex:1;min-width:0;">';
          html += '<div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">' + esc(p.full_name || 'Unnamed') + '</div>';
          html += '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(p.specialty || '\u2014') + '</div>';
          if (dests) html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + dests + '</div>';
          html += '</div>';
          html += '</div>';
        });
      }
      html += '</div></div>';
    });

    board.innerHTML = html;

    // Bind mini-card clicks
    board.querySelectorAll('.pipeline-mini-card').forEach(function (card) {
      card.addEventListener('click', function () {
        openCandidatePanel(card.dataset.id);
      });
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
    panelEl.style.display = 'block';
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
    panelBodyEl.innerHTML = '<div style="text-align:center;padding:var(--space-10);"><div class="spinner" style="margin:0 auto;"></div></div>';
    openPanel();

    var candidate = allAssigned.find(function (p) { return p.id === candidateId; });
    if (!candidate) {
      panelBodyEl.innerHTML = '<p style="color:var(--error);padding:var(--space-4);">Candidate not found.</p>';
      return;
    }

    // Fetch full documents list
    var { data: docs } = await ghFrom('documents')
      .select('*')
      .eq('applicant_id', candidateId)
      .order('uploaded_at', { ascending: false });
    docs = docs || [];

    // Fetch recruiter notes for this candidate
    var { data: notes } = await ghFrom('recruiter_notes')
      .select('id, note, created_at')
      .eq('applicant_id', candidateId)
      .eq('recruiter_id', currentUser.id)
      .order('created_at', { ascending: false });
    notes = notes || [];

    var colors = GHE.avatarColors[candidate.avatar_color_index || 0];
    var html = '';

    // ── Section 1: Header ──
    html += '<div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-5);">';
    html += '<div class="avatar" style="width:52px;height:52px;font-size:var(--text-xl);background:' + colors[0] + ';color:' + colors[1] + ';flex-shrink:0;">' + esc(candidate.avatar_initials || '??') + '</div>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">' + esc(candidate.full_name || 'Unnamed') + '</div>';
    html += '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">' + esc(candidate.specialty || 'No specialty') + '</div>';
    html += '</div></div>';

    // ── Section 2: Info grid ──
    var fields = [
      { label: 'Country', value: candidate.country_of_origin },
      { label: 'Experience', value: candidate.years_of_experience != null ? candidate.years_of_experience + ' yrs' : null },
      { label: 'Phone', value: candidate.phone },
      { label: 'License No.', value: candidate.license_number },
    ];
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-5);">';
    fields.forEach(function (f) {
      html += '<div style="padding:var(--space-2) var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
      html += '<div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:2px;">' + esc(f.label) + '</div>';
      html += '<div style="font-size:var(--text-sm);color:var(--text-primary);font-weight:500;">' + esc(f.value || '\u2014') + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // ── Section 3: Preferred destinations ──
    if (candidate.preferred_destinations && candidate.preferred_destinations.length > 0) {
      html += '<div style="margin-bottom:var(--space-5);">';
      html += '<div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:var(--space-2);">Preferred Destinations</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">';
      candidate.preferred_destinations.forEach(function (d) { html += '<span class="tag">' + esc(d) + '</span>'; });
      html += '</div></div>';
    }

    // ── Section 4: Recruitment Pipeline ──
    var pipeline = isSaudi(candidate) ? SAUDI_PIPELINE : GENERIC_PIPELINE;
    var pipelineTitle = isSaudi(candidate) ? 'Saudi Arabia Recruitment Path' : 'Recruitment Path';
    var pipelineSubtitle = isSaudi(candidate)
      ? 'DataFlow \u2192 Prometric \u2192 SFHS Evaluation \u2192 Mumaris+ \u2192 Deployment'
      : 'Verification \u2192 Licensing \u2192 Job Offer \u2192 Deployment';

    // Infer current step from doc stage
    // docStage 0 = step 0 (profile), docStage 1 = step 1 (still on profile/docs), docStage 2 = step 1 complete, entering step 2
    var docStage = getDocStage(docs);
    var currentPipelineStep = docStage >= 2 ? 1 : 0; // 0-indexed; step 2+ require recruiter to advance manually

    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);margin-bottom:var(--space-5);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:2px;">' + esc(pipelineTitle) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:var(--space-4);">' + esc(pipelineSubtitle) + '</div>';
    html += '<div class="pipeline-stepper">';

    pipeline.forEach(function (step, idx) {
      var isComplete = idx < currentPipelineStep;
      var isCurrent = idx === currentPipelineStep;
      var isUpcoming = idx > currentPipelineStep;

      var dotBg, dotColor, stepBg;
      if (isComplete) {
        dotBg = 'var(--success)'; dotColor = '#fff'; stepBg = 'rgba(46,196,182,0.04)';
      } else if (isCurrent) {
        dotBg = 'var(--primary)'; dotColor = '#fff'; stepBg = 'var(--primary-muted)';
      } else {
        dotBg = 'var(--bg-surface)'; dotColor = 'var(--text-tertiary)'; stepBg = 'transparent';
      }

      var labelColor = isUpcoming ? 'var(--text-tertiary)' : 'var(--text-primary)';
      var borderStyle = isCurrent ? 'border:1px solid var(--primary);' : 'border:1px solid var(--border-subtle);';

      html += '<div class="pipeline-step" style="background:' + stepBg + ';' + borderStyle + '">';
      html += '<div class="pipeline-step-dot" style="background:' + dotBg + ';color:' + dotColor + ';border:' + (isUpcoming ? '2px solid var(--border-strong)' : '2px solid ' + dotBg) + ';">' + esc(step.icon) + '</div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:var(--text-sm);font-weight:700;color:' + labelColor + ';">' + esc(step.label) + '</div>';
      html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">' + esc(step.desc) + '</div>';
      html += '</div>';
      if (isComplete) {
        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" stroke-width="3" flex-shrink="0"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (isCurrent) {
        html += '<span style="font-size:10px;font-weight:700;color:var(--primary);white-space:nowrap;">In Progress</span>';
      } else {
        html += '<span style="font-size:10px;color:var(--text-tertiary);white-space:nowrap;">Upcoming</span>';
      }
      html += '</div>';
    });

    html += '</div></div>';

    // ── Section 5: Documents (read-only) ──
    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);margin-bottom:var(--space-5);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">Documents (' + docs.length + ')</div>';
    if (docs.length === 0) {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No documents uploaded yet.</p>';
    } else {
      var statusMap = {
        pending: { c: 'var(--warning)', l: 'Pending' },
        in_review: { c: 'var(--info)', l: 'In Review' },
        verified: { c: 'var(--success)', l: 'Verified' },
        rejected: { c: 'var(--error)', l: 'Rejected' }
      };
      docs.forEach(function (d) {
        var st = statusMap[d.status] || statusMap.pending;
        var label = DOC_LABELS[d.doc_type] || d.doc_type || 'Document';
        html += '<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-2);">';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + esc(label) + '</div>';
        html += '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(d.file_name || '') + '</div>';
        html += '</div>';
        html += '<span style="font-size:11px;font-weight:600;color:' + st.c + ';white-space:nowrap;">' + st.l + '</span>';
        if (d.file_path) {
          html += '<button class="btn btn-ghost btn-sm btn-dl" data-path="' + esc(d.file_path) + '" data-cand="' + esc(candidateId) + '" style="font-size:11px;padding:2px 8px;">View</button>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    // ── Section 6: Recruiter Feedback / Assessment ──
    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);margin-bottom:var(--space-5);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:2px;">Your Assessment</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:var(--space-4);">This assessment is private and shared with the eLab team only.</div>';

    // Recommendation grid
    html += '<div class="recommendation-grid" id="rec-grid">';
    var recOptions = [
      { key: 'Suitable for Position', icon: '\u2713' },
      { key: 'Needs More Documentation', icon: '\ud83d\udccb' },
      { key: 'Further Assessment Required', icon: '\ud83d\udd0d' },
      { key: 'Not Suitable at This Time', icon: '\u2717' },
    ];
    recOptions.forEach(function (opt) {
      html += '<div class="rec-option" data-rec="' + esc(opt.key) + '">' + opt.icon + ' ' + esc(opt.key) + '</div>';
    });
    html += '</div>';

    html += '<textarea id="note-input" rows="3" placeholder="Add detailed notes..." style="width:100%;padding:var(--space-3);font-size:var(--text-sm);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>';
    html += '<button id="btn-add-note" class="btn btn-secondary btn-sm" data-cid="' + esc(candidateId) + '" style="margin-top:var(--space-2);">Save Assessment</button>';
    html += '</div>';

    // ── Section 7: Previous Notes / Assessments ──
    if (notes.length > 0) {
      html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">';
      html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">Previous Assessments</div>';
      notes.forEach(function (n) {
        var parsed = parseAssessment(n.note);
        var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        html += '<div style="padding:var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-2);">';
        if (parsed.rec) {
          var ac = getAssessmentColor(parsed.rec);
          html += '<div style="margin-bottom:var(--space-2);">';
          html += '<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;background:' + ac.bg + ';color:' + ac.color + ';">' + esc(parsed.rec) + '</span>';
          html += '</div>';
        }
        if (parsed.text) {
          html += '<div style="font-size:var(--text-sm);color:var(--text-primary);white-space:pre-wrap;">' + esc(parsed.text) + '</div>';
        }
        html += '<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">' + esc(dateStr) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">';
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No assessments yet. Use the form above to add your first assessment.</p>';
      html += '</div>';
    }

    panelBodyEl.innerHTML = html;

    // ── Bind recommendation tile selection ──
    var selectedRec = null;
    panelBodyEl.querySelectorAll('.rec-option').forEach(function (tile) {
      tile.addEventListener('click', function () {
        panelBodyEl.querySelectorAll('.rec-option').forEach(function (t) { t.classList.remove('selected'); });
        tile.classList.add('selected');
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

    list.innerHTML = notes.map(function (n) {
      var candidate = allAssigned.find(function (p) { return p.id === n.applicant_id; });
      var name = candidate ? esc(candidate.full_name) : 'Unknown candidate';
      var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      var parsed = parseAssessment(n.note);

      var recBadge = '';
      if (parsed.rec) {
        var ac = getAssessmentColor(parsed.rec);
        recBadge = '<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;background:' + ac.bg + ';color:' + ac.color + ';margin-bottom:var(--space-2);">' + esc(parsed.rec) + '</span><br>';
      }

      return '<div style="padding:var(--space-4);background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);margin-bottom:var(--space-3);">' +
        '<div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:var(--space-2);">' + name + '</div>' +
        recBadge +
        (parsed.text ? '<div style="font-size:var(--text-sm);color:var(--text-primary);white-space:pre-wrap;">' + esc(parsed.text) + '</div>' : '') +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:var(--space-2);">' + dateStr + '</div>' +
        '</div>';
    }).join('');
  }

})();
