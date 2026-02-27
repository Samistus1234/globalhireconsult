/* ============================================
   GLOBALHIRE@ELAB — Verification Page
   Document verification with AI analysis,
   registry checks, consistency scoring,
   and full audit trail
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var adminProfile = null;
  var allDocs = [];
  var filteredDocs = [];
  var nameMap = {};
  var currentDocId = null;

  var docTypeLabels = {
    license: 'Professional License',
    degree: 'Degree Certificate',
    passport: 'Passport Copy',
    cv: 'CV / Resume'
  };

  // ── Init ──
  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadDocuments();
    bindFilters();
    bindModal();
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

  // ══════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════

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

  // ══════════════════════════════════════════
  // FILTERS
  // ══════════════════════════════════════════

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

    setText('kpi-pending', pending);
    setText('kpi-in-review', inReview);
    setText('kpi-verified-today', verifiedToday);
    setText('kpi-total-verified', verified);

    var badge = document.getElementById('verif-total-badge');
    if (badge) badge.textContent = filteredDocs.length + ' documents';
  }

  // ══════════════════════════════════════════
  // TABLE RENDERING
  // ══════════════════════════════════════════

  function renderTable() {
    var tbody = document.getElementById('verif-tbody');
    if (!tbody) return;

    if (filteredDocs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No documents found matching your filters.</td></tr>';
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

      // Score badges
      var authScore = renderScoreBadge(d.authenticity_score);
      var consScore = renderScoreBadge(d.consistency_score);

      // Action buttons
      var actions = '';
      if (d.status === 'pending' || d.status === 'in_review') {
        actions =
          '<button class="btn btn-xs btn-primary btn-verify" data-id="' + d.id + '" title="Verify">Verify</button>' +
          '<button class="btn btn-xs btn-ghost btn-reject" data-id="' + d.id + '" style="color:var(--error)" title="Reject">Reject</button>' +
          '<button class="btn btn-xs btn-ghost btn-analyze" data-id="' + d.id + '" title="AI Analysis" style="color:var(--secondary)">Analyze</button>';
      } else {
        actions = '<span style="font-size:var(--text-xs);color:var(--text-tertiary);">' + st.label + '</span>';
      }

      return '<tr class="clickable-row" data-doc-id="' + d.id + '">' +
        '<td><div class="applicant-row"><div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (applicant.avatar_initials || '??') + '</div><div class="applicant-info"><div class="applicant-name">' + (applicant.full_name || 'Unknown') + '</div></div></div></td>' +
        '<td>' + (docTypeLabels[d.doc_type] || d.doc_type || '-') + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + (d.file_name || '-') + '</td>' +
        '<td><span class="badge ' + st.badge + ' badge-dot">' + st.label + '</span></td>' +
        '<td>' + authScore + '</td>' +
        '<td>' + consScore + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + uploaded + '</td>' +
        '<td><div class="action-btn-group">' + actions + '</div></td>' +
        '</tr>';
    }).join('');

    // Bind action buttons (stop propagation so row click doesn't fire)
    tbody.querySelectorAll('.btn-verify').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateDocStatus(btn.dataset.id, 'verified');
      });
    });
    tbody.querySelectorAll('.btn-reject').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateDocStatus(btn.dataset.id, 'rejected');
      });
    });
    tbody.querySelectorAll('.btn-analyze').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        runAnalysis(btn.dataset.id);
      });
    });

    // Bind row clicks to open modal
    tbody.querySelectorAll('.clickable-row').forEach(function (row) {
      row.addEventListener('click', function () {
        openDocModal(row.dataset.docId);
      });
    });
  }

  function renderScoreBadge(score) {
    if (score === null || score === undefined) {
      return '<span class="score-badge score-none">--</span>';
    }
    var cls = score >= 80 ? 'score-high' : score >= 50 ? 'score-medium' : 'score-low';
    return '<span class="score-badge ' + cls + '">' + score + '</span>';
  }

  // ══════════════════════════════════════════
  // STATUS UPDATES (with audit logging)
  // ══════════════════════════════════════════

  async function updateDocStatus(docId, newStatus) {
    var doc = allDocs.find(function (d) { return d.id === docId; });
    var oldStatus = doc ? doc.status : null;

    var { error } = await ghFrom('documents')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        verified_by: adminProfile.id,
        verification_method: 'manual'
      })
      .eq('id', docId);

    if (error) {
      alert('Failed to update: ' + error.message);
      return;
    }

    // Log to audit trail
    await logAudit(docId, 'status_change', 'manual', {
      old_status: oldStatus,
      new_status: newStatus
    });

    await loadDocuments();

    // If modal is open for this doc, refresh it
    if (currentDocId === docId) {
      openDocModal(docId);
    }
  }

  // ══════════════════════════════════════════
  // AUDIT LOGGING
  // ══════════════════════════════════════════

  async function logAudit(docId, action, method, extraDetails) {
    var payload = {
      document_id: docId,
      admin_id: adminProfile.id,
      action: action,
      method: method || 'manual',
      details: extraDetails || {}
    };

    if (extraDetails && extraDetails.old_status !== undefined) {
      payload.old_status = extraDetails.old_status;
      payload.new_status = extraDetails.new_status;
    }

    var { error } = await ghFrom('verification_audit').insert(payload);
    if (error) console.error('Audit log error:', error);
  }

  // ══════════════════════════════════════════
  // AI ANALYSIS
  // ══════════════════════════════════════════

  async function runAnalysis(docId) {
    // Find the analyze button and show spinner
    var btn = document.querySelector('.btn-analyze[data-id="' + docId + '"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-inline"></span>';
    }

    // Also update modal button if open
    var modalBtn = document.getElementById('modal-run-analysis');
    if (modalBtn && currentDocId === docId) {
      modalBtn.disabled = true;
      modalBtn.innerHTML = '<span class="spinner-inline"></span> Analyzing...';
    }

    try {
      var session = await GHAuth.getSession();
      var resp = await fetch(SUPABASE_URL + '/functions/v1/analyze-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ document_id: docId })
      });

      var result = await resp.json();

      if (!resp.ok) {
        alert('Analysis failed: ' + (result.error || 'Unknown error'));
        return;
      }

      await loadDocuments();

      // If modal is open, refresh analysis tab
      if (currentDocId === docId) {
        var doc = allDocs.find(function (d) { return d.id === docId; });
        if (doc) renderAnalysisTab(doc);
      }
    } catch (err) {
      alert('Analysis error: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Analyze';
      }
      if (modalBtn && currentDocId === docId) {
        modalBtn.disabled = false;
        modalBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:var(--space-2);"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Run AI Analysis';
      }
    }
  }

  // ══════════════════════════════════════════
  // CONSISTENCY SCORING
  // ══════════════════════════════════════════

  async function runConsistencyCheck(docId) {
    var doc = allDocs.find(function (d) { return d.id === docId; });
    if (!doc) return;

    // Get all documents for this applicant
    var applicantDocs = allDocs.filter(function (d) {
      return d.applicant_id === doc.applicant_id;
    });

    if (applicantDocs.length < 2) {
      renderConsistencyResult(docId, {
        score: null,
        checks: [],
        message: 'Need at least 2 documents from this candidate to run consistency check.'
      });
      return;
    }

    var checks = [];
    var totalPoints = 0;
    var maxPoints = 0;

    // Gather extracted data from analysis_results across all analyzed docs
    var analyzedDocs = applicantDocs.filter(function (d) { return d.analysis_results; });

    if (analyzedDocs.length < 2) {
      renderConsistencyResult(docId, {
        score: null,
        checks: [],
        message: 'At least 2 documents need AI analysis before running consistency check. Run "Analyze" on more documents first.'
      });
      return;
    }

    // 1. Name consistency across documents
    var names = [];
    analyzedDocs.forEach(function (d) {
      var text = (d.analysis_results.extracted_text || '').toLowerCase();
      // Try to extract name-like patterns from first few lines
      var firstLines = text.split('\n').slice(0, 10).join(' ');
      names.push({ doc_type: d.doc_type, text: firstLines });
    });

    // Simple name word overlap check
    if (names.length >= 2) {
      var applicant = nameMap[doc.applicant_id];
      var expectedName = (applicant ? applicant.full_name : '').toLowerCase();
      var nameWords = expectedName.split(/\s+/).filter(function (w) { return w.length > 2; });

      var nameMatches = 0;
      analyzedDocs.forEach(function (d) {
        var text = (d.analysis_results.extracted_text || '').toLowerCase();
        var found = nameWords.filter(function (w) { return text.includes(w); });
        if (found.length >= Math.ceil(nameWords.length / 2)) nameMatches++;
      });

      maxPoints += 30;
      if (nameMatches === analyzedDocs.length) {
        totalPoints += 30;
        checks.push({ label: 'Name consistency', status: 'ok', detail: 'Name found in all ' + analyzedDocs.length + ' analyzed documents' });
      } else if (nameMatches > 0) {
        totalPoints += 15;
        checks.push({ label: 'Name consistency', status: 'warn', detail: 'Name found in ' + nameMatches + ' of ' + analyzedDocs.length + ' documents' });
      } else {
        checks.push({ label: 'Name consistency', status: 'fail', detail: 'Applicant name not found in any document text' });
      }
    }

    // 2. Document type coverage
    var types = {};
    applicantDocs.forEach(function (d) { types[d.doc_type] = true; });
    var typeCount = Object.keys(types).length;
    maxPoints += 20;
    if (typeCount >= 3) {
      totalPoints += 20;
      checks.push({ label: 'Document coverage', status: 'ok', detail: typeCount + ' document types submitted' });
    } else if (typeCount >= 2) {
      totalPoints += 10;
      checks.push({ label: 'Document coverage', status: 'warn', detail: 'Only ' + typeCount + ' document types (recommend 3+)' });
    } else {
      checks.push({ label: 'Document coverage', status: 'fail', detail: 'Only 1 document type submitted' });
    }

    // 3. Document type detection alignment
    maxPoints += 25;
    var typeAlignCount = 0;
    analyzedDocs.forEach(function (d) {
      if (d.analysis_results.doc_type_detected === d.doc_type) typeAlignCount++;
    });
    if (typeAlignCount === analyzedDocs.length) {
      totalPoints += 25;
      checks.push({ label: 'Type alignment', status: 'ok', detail: 'All documents match their claimed type' });
    } else if (typeAlignCount > 0) {
      totalPoints += 12;
      checks.push({ label: 'Type alignment', status: 'warn', detail: typeAlignCount + ' of ' + analyzedDocs.length + ' documents match claimed type' });
    } else {
      checks.push({ label: 'Type alignment', status: 'fail', detail: 'No documents match their claimed type' });
    }

    // 4. Authenticity score average
    var authScores = analyzedDocs.map(function (d) { return d.authenticity_score || 0; });
    var avgAuth = Math.round(authScores.reduce(function (a, b) { return a + b; }, 0) / authScores.length);
    maxPoints += 25;
    if (avgAuth >= 70) {
      totalPoints += 25;
      checks.push({ label: 'Avg authenticity', status: 'ok', detail: 'Average score: ' + avgAuth + '/100' });
    } else if (avgAuth >= 50) {
      totalPoints += 12;
      checks.push({ label: 'Avg authenticity', status: 'warn', detail: 'Average score: ' + avgAuth + '/100 (moderate)' });
    } else {
      checks.push({ label: 'Avg authenticity', status: 'fail', detail: 'Average score: ' + avgAuth + '/100 (low)' });
    }

    var consistencyScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

    // Save to document
    await ghFrom('documents')
      .update({ consistency_score: consistencyScore })
      .eq('id', docId);

    // Log audit
    await logAudit(docId, 'analysis_run', 'manual', {
      type: 'consistency_check',
      consistency_score: consistencyScore,
      checks_count: checks.length
    });

    await loadDocuments();

    renderConsistencyResult(docId, {
      score: consistencyScore,
      checks: checks,
      message: null
    });
  }

  function renderConsistencyResult(docId, result) {
    var container = document.getElementById('consistency-content');
    if (!container) return;

    if (result.message) {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);"><p>' + result.message + '</p></div>';
      return;
    }

    var scoreClass = result.score >= 80 ? 'high' : result.score >= 50 ? 'medium' : 'low';
    var scoreColor = result.score >= 80 ? 'var(--primary)' : result.score >= 50 ? 'var(--accent-amber)' : 'var(--error)';

    var html = '<div class="score-meter">' +
      '<div class="score-meter-bar"><div class="score-meter-fill ' + scoreClass + '" style="width:' + result.score + '%;"></div></div>' +
      '<div class="score-meter-value" style="color:' + scoreColor + '">' + result.score + '</div>' +
      '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-4);">';
    result.checks.forEach(function (c) {
      var icon = c.status === 'ok' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>' :
        c.status === 'warn' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>' :
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';

      html += '<div class="consistency-match match-' + c.status + '">' +
        '<span class="match-icon">' + icon + '</span>' +
        '<div><strong style="font-size:var(--text-sm);">' + c.label + '</strong><div style="font-size:var(--text-xs);color:var(--text-tertiary);">' + c.detail + '</div></div>' +
        '</div>';
    });
    html += '</div>';

    html += '<div style="margin-top:var(--space-4);text-align:center;"><button class="btn btn-ghost btn-sm" id="modal-run-consistency">Re-run Check</button></div>';

    container.innerHTML = html;

    // Rebind button
    document.getElementById('modal-run-consistency')?.addEventListener('click', function () {
      runConsistencyCheck(currentDocId);
    });
  }

  // ══════════════════════════════════════════
  // DOCUMENT DETAIL MODAL
  // ══════════════════════════════════════════

  function bindModal() {
    var overlay = document.getElementById('doc-modal-overlay');
    var closeBtn = document.getElementById('modal-close');

    // Close on X button
    closeBtn?.addEventListener('click', closeModal);

    // Close on overlay click (not modal body)
    overlay?.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay?.classList.contains('active')) closeModal();
    });

    // Tab switching
    document.querySelectorAll('.modal-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.modal-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // Modal footer buttons
    document.getElementById('modal-verify-btn')?.addEventListener('click', function () {
      if (currentDocId) updateDocStatus(currentDocId, 'verified');
    });
    document.getElementById('modal-reject-btn')?.addEventListener('click', function () {
      if (currentDocId) updateDocStatus(currentDocId, 'rejected');
    });

    // Analysis button in modal
    document.getElementById('modal-run-analysis')?.addEventListener('click', function () {
      if (currentDocId) runAnalysis(currentDocId);
    });

    // Consistency button in modal
    document.getElementById('modal-run-consistency')?.addEventListener('click', function () {
      if (currentDocId) runConsistencyCheck(currentDocId);
    });

    // Registry form
    document.getElementById('registry-form')?.addEventListener('submit', function (e) {
      e.preventDefault();
      if (currentDocId) saveRegistryCheck(currentDocId);
    });
  }

  async function openDocModal(docId) {
    currentDocId = docId;
    var doc = allDocs.find(function (d) { return d.id === docId; });
    if (!doc) return;

    var applicant = nameMap[doc.applicant_id] || {};
    var overlay = document.getElementById('doc-modal-overlay');

    // Set header
    setText('modal-title', (applicant.full_name || 'Unknown') + ' — ' + (docTypeLabels[doc.doc_type] || doc.doc_type));
    setText('modal-file-name', doc.file_name || '-');
    setText('modal-doc-type', docTypeLabels[doc.doc_type] || doc.doc_type);
    setText('modal-uploaded', doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : '-');
    setText('modal-doc-id', 'ID: ' + doc.id);

    // Status badge
    var statusMap = {
      pending: { badge: 'badge-warning', label: 'Pending' },
      in_review: { badge: 'badge-info', label: 'In Review' },
      verified: { badge: 'badge-primary', label: 'Verified' },
      rejected: { badge: 'badge-error', label: 'Rejected' }
    };
    var st = statusMap[doc.status] || statusMap.pending;
    var statusEl = document.getElementById('modal-status');
    if (statusEl) statusEl.innerHTML = '<span class="badge ' + st.badge + ' badge-dot">' + st.label + '</span>';

    // Show/hide footer buttons based on status
    var verifyBtn = document.getElementById('modal-verify-btn');
    var rejectBtn = document.getElementById('modal-reject-btn');
    var canAct = doc.status === 'pending' || doc.status === 'in_review';
    if (verifyBtn) verifyBtn.style.display = canAct ? '' : 'none';
    if (rejectBtn) rejectBtn.style.display = canAct ? '' : 'none';

    // Load document preview (signed URL)
    loadDocPreview(doc);

    // Load analysis tab
    renderAnalysisTab(doc);

    // Load registry tab
    loadRegistryChecks(docId);

    // Load consistency tab
    renderConsistencyTab(doc);

    // Load audit tab
    loadAuditHistory(docId);

    // Reset to first tab
    document.querySelectorAll('.modal-tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    document.querySelector('.modal-tab')?.classList.add('active');
    document.getElementById('tab-preview')?.classList.add('active');

    // Show modal
    overlay?.classList.add('active');
  }

  function closeModal() {
    currentDocId = null;
    document.getElementById('doc-modal-overlay')?.classList.remove('active');
    var iframe = document.getElementById('doc-preview-iframe');
    if (iframe) iframe.src = 'about:blank';
  }

  async function loadDocPreview(doc) {
    var iframe = document.getElementById('doc-preview-iframe');
    if (!iframe || !doc.file_path) return;

    var { data, error } = await sb.storage
      .from('gh-applicant-documents')
      .createSignedUrl(doc.file_path, 300);

    if (!error && data?.signedUrl) {
      iframe.src = data.signedUrl;
    } else {
      iframe.src = 'about:blank';
    }
  }

  // ══════════════════════════════════════════
  // ANALYSIS TAB RENDERING
  // ══════════════════════════════════════════

  function renderAnalysisTab(doc) {
    var container = document.getElementById('analysis-content');
    if (!container) return;

    if (!doc.analysis_results) {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">' +
        '<p style="margin-bottom:var(--space-3);">No analysis has been run on this document yet.</p>' +
        '<button class="btn btn-primary" id="modal-run-analysis">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:var(--space-2);"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        'Run AI Analysis</button></div>';
      document.getElementById('modal-run-analysis')?.addEventListener('click', function () {
        if (currentDocId) runAnalysis(currentDocId);
      });
      return;
    }

    var r = doc.analysis_results;
    var score = doc.authenticity_score || 0;
    var scoreClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    var scoreColor = score >= 80 ? 'var(--primary)' : score >= 50 ? 'var(--accent-amber)' : 'var(--error)';

    var html = '';

    // Score meter
    html += '<h3 style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-3);">Authenticity Score</h3>';
    html += '<div class="score-meter">' +
      '<div class="score-meter-bar"><div class="score-meter-fill ' + scoreClass + '" style="width:' + score + '%;"></div></div>' +
      '<div class="score-meter-value" style="color:' + scoreColor + '">' + score + '</div>' +
      '</div>';

    // Detected type
    html += '<div style="margin-bottom:var(--space-4);font-size:var(--text-sm);color:var(--text-secondary);">' +
      'Detected type: <strong>' + (r.doc_type_detected || 'unknown') + '</strong>' +
      ' &middot; Confidence: <strong>' + Math.round((r.confidence || 0) * 100) + '%</strong>' +
      '</div>';

    // Flags
    if (r.flags && r.flags.length > 0) {
      html += '<h3 style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-2);">Flags</h3>';
      html += '<ul class="flag-list">';
      r.flags.forEach(function (f) {
        var flagClass = f.toLowerCase().includes('not found') || f.toLowerCase().includes('unusual') || f.toLowerCase().includes('screenshot') ? 'flag-warning' : 'flag-success';
        html += '<li class="flag-item ' + flagClass + '">' +
          '<span class="flag-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>' +
          f + '</li>';
      });
      html += '</ul>';
    }

    // Extracted text
    if (r.extracted_text) {
      html += '<h3 style="font-size:var(--text-sm);font-weight:600;margin:var(--space-4) 0 var(--space-2);">Extracted Text</h3>';
      html += '<div class="extracted-text-box">' + escapeHtml(r.extracted_text) + '</div>';
    }

    // Re-run button
    html += '<div style="margin-top:var(--space-4);text-align:center;">' +
      '<button class="btn btn-ghost btn-sm" id="modal-run-analysis">Re-run Analysis</button></div>';

    container.innerHTML = html;

    document.getElementById('modal-run-analysis')?.addEventListener('click', function () {
      if (currentDocId) runAnalysis(currentDocId);
    });
  }

  // ══════════════════════════════════════════
  // REGISTRY CHECK TAB
  // ══════════════════════════════════════════

  async function loadRegistryChecks(docId) {
    var container = document.getElementById('registry-existing');
    if (!container) return;

    var { data, error } = await ghFrom('registry_checks')
      .select('*')
      .eq('document_id', docId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      container.innerHTML = '<p style="font-size:var(--text-sm);color:var(--text-tertiary);margin-bottom:var(--space-3);">No registry checks recorded yet.</p>';
      return;
    }

    var html = '<h3 style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-3);">Previous Checks</h3>';
    data.forEach(function (rc) {
      html += '<div class="registry-result">' +
        '<div style="flex:1;">' +
        '<div style="font-weight:600;font-size:var(--text-sm);">' + escapeHtml(rc.registry_name) + '</div>' +
        '<div style="font-size:var(--text-xs);color:var(--text-tertiary);font-family:var(--font-mono);">' +
        (rc.license_number || '-') + ' &middot; Checked: ' + (rc.verified_date || '-') +
        (rc.expiry_date ? ' &middot; Expires: ' + rc.expiry_date : '') +
        '</div>' +
        (rc.notes ? '<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">' + escapeHtml(rc.notes) + '</div>' : '') +
        '</div>' +
        '<span class="standing-badge standing-' + rc.standing + '">' + rc.standing + '</span>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  async function saveRegistryCheck(docId) {
    var regName = document.getElementById('reg-name')?.value?.trim();
    var license = document.getElementById('reg-license')?.value?.trim();
    var standing = document.getElementById('reg-standing')?.value;
    var expiry = document.getElementById('reg-expiry')?.value || null;
    var notes = document.getElementById('reg-notes')?.value?.trim() || null;

    if (!regName) {
      alert('Registry name is required.');
      return;
    }

    var { error } = await ghFrom('registry_checks').insert({
      document_id: docId,
      admin_id: adminProfile.id,
      registry_name: regName,
      license_number: license || null,
      standing: standing,
      expiry_date: expiry,
      notes: notes
    });

    if (error) {
      alert('Failed to save: ' + error.message);
      return;
    }

    // Log audit
    await logAudit(docId, 'registry_check', 'registry_manual', {
      registry_name: regName,
      standing: standing,
      license_number: license
    });

    // Update verification method if standing is active
    if (standing === 'active') {
      await ghFrom('documents')
        .update({ verification_method: 'registry_confirmed' })
        .eq('id', docId);
    }

    // Reset form
    document.getElementById('registry-form')?.reset();

    // Reload
    loadRegistryChecks(docId);
    await loadDocuments();
  }

  // ══════════════════════════════════════════
  // CONSISTENCY TAB
  // ══════════════════════════════════════════

  function renderConsistencyTab(doc) {
    var container = document.getElementById('consistency-content');
    if (!container) return;

    if (doc.consistency_score !== null && doc.consistency_score !== undefined) {
      // Show existing score, allow re-run
      runConsistencyCheck(doc.id);
    } else {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">' +
        '<p style="margin-bottom:var(--space-3);">Run consistency check to compare this candidate\'s documents.</p>' +
        '<button class="btn btn-primary" id="modal-run-consistency">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:var(--space-2);"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg>' +
        'Run Consistency Check</button></div>';

      document.getElementById('modal-run-consistency')?.addEventListener('click', function () {
        if (currentDocId) runConsistencyCheck(currentDocId);
      });
    }
  }

  // ══════════════════════════════════════════
  // AUDIT HISTORY TAB
  // ══════════════════════════════════════════

  async function loadAuditHistory(docId) {
    var container = document.getElementById('audit-content');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:var(--space-4);color:var(--text-tertiary);">Loading...</div>';

    var { data, error } = await ghFrom('verification_audit')
      .select('*')
      .eq('document_id', docId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No audit history for this document yet.</div>';
      return;
    }

    var html = '<div class="audit-timeline">';
    data.forEach(function (entry) {
      var dotClass = 'dot-note';
      var actionLabel = entry.action;
      if (entry.action === 'status_change') {
        dotClass = 'dot-status';
        actionLabel = 'Status changed: ' + (entry.old_status || '?') + ' → ' + (entry.new_status || '?');
      } else if (entry.action === 'analysis_run') {
        dotClass = 'dot-analysis';
        actionLabel = 'AI Analysis run';
        if (entry.details?.type === 'consistency_check') {
          actionLabel = 'Consistency check run';
        }
      } else if (entry.action === 'registry_check') {
        dotClass = 'dot-registry';
        actionLabel = 'Registry check: ' + (entry.details?.registry_name || '');
      } else if (entry.action === 'note_added') {
        actionLabel = 'Note added';
      }

      var time = entry.created_at ? new Date(entry.created_at).toLocaleString() : '-';

      var bodyHtml = '';
      if (entry.details) {
        if (entry.details.authenticity_score !== undefined) {
          bodyHtml += 'Score: ' + entry.details.authenticity_score + '/100';
        }
        if (entry.details.consistency_score !== undefined) {
          bodyHtml += 'Consistency: ' + entry.details.consistency_score + '/100';
        }
        if (entry.details.standing) {
          bodyHtml += 'Standing: ' + entry.details.standing;
        }
        if (entry.details.flags && entry.details.flags.length > 0) {
          bodyHtml += ' (' + entry.details.flags.length + ' flags)';
        }
      }

      html += '<div class="audit-entry">' +
        '<div class="audit-entry-dot ' + dotClass + '"></div>' +
        '<div class="audit-entry-header">' +
        '<span class="audit-entry-action">' + escapeHtml(actionLabel) + '</span>' +
        '<span class="audit-entry-method">' + (entry.method || 'manual') + '</span>' +
        '</div>' +
        (bodyHtml ? '<div class="audit-entry-body">' + escapeHtml(bodyHtml) + '</div>' : '') +
        '<div class="audit-entry-time">' + time + '</div>' +
        '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
  }

  // ══════════════════════════════════════════
  // FILTER BINDINGS
  // ══════════════════════════════════════════

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

  // ══════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
