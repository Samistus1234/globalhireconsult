/* ============================================
   GLOBALHIRE@ELAB — Placements Page
   Full placement lifecycle management
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var adminProfile = null;
  var allPlacements = [];
  var filteredPlacements = [];
  var interestedMatches = [];
  var currentPlacementId = null;
  var currentPlacement = null;

  // Aligned with GHE.PIPELINE deployment + revenue stages (see core.js / schema-v25-pipeline.sql).
  // Legacy keys (visa_processing/contract/onboarding/active/completed) are mapped for display of
  // pre-migration rows and activity-log entries; live rows carry the unified keys.
  var STAGES = ['offer_extended','offer_accepted','pre_employment','placement_confirmed','started_employment','commission_due','invoiced','paid_closed','terminated'];
  var STAGE_LABELS = {
    offer_extended: 'Offer Extended', offer_accepted: 'Offer Accepted',
    pre_employment: 'Pre-Employment', placement_confirmed: 'Placement Confirmed',
    started_employment: 'Started Employment', commission_due: 'Commission Due',
    invoiced: 'Invoiced', paid_closed: 'Paid & Closed', terminated: 'Terminated',
    // Legacy keys → unified labels (pre-migration rows)
    visa_processing: 'Pre-Employment', contract: 'Placement Confirmed',
    onboarding: 'Started Employment', active: 'Commission Due',
    completed: 'Paid & Closed'
  };
  var VISA_LABELS = {
    not_started: 'Not Started', documents_submitted: 'Docs Submitted',
    in_review: 'In Review', approved: 'Approved',
    denied: 'Denied', not_required: 'Not Required'
  };
  var CONTRACT_LABELS = {
    not_started: 'Not Started', draft: 'Draft', sent: 'Sent',
    signed: 'Signed', countersigned: 'Countersigned'
  };
  var CATEGORY_LABELS = {
    pre_departure: 'Pre-Departure', arrival: 'Arrival',
    documentation: 'Documentation', orientation: 'Orientation', general: 'General'
  };

  var activeStageFilter = '';

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadData();
    bindFilters();
    bindModalEvents();
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

  // ── Data Loading ──
  async function loadData() {
    var [placementsRes, matchesRes] = await Promise.all([
      ghFrom('placements').select('*').order('created_at', { ascending: false }),
      ghFrom('campaign_matches').select('*, profiles:applicant_id(id, full_name, avatar_initials, avatar_color_index), campaigns:campaign_id(id, title, destination_country)')
        .eq('response', 'interested')
        .is('placement_created', null)
        .order('responded_at', { ascending: false })
    ]);

    allPlacements = placementsRes.data || [];

    // Filter out matches that already have placements
    var placedMatchIds = new Set(allPlacements.map(function(p) { return p.match_id; }));
    interestedMatches = (matchesRes.data || []).filter(function(m) {
      return !placedMatchIds.has(m.id);
    });

    // Populate country filter
    var countries = [...new Set(allPlacements.map(function(p) { return p.destination_country; }).filter(Boolean))].sort();
    var countrySelect = document.getElementById('filter-country');
    if (countrySelect) {
      var current = countrySelect.value;
      countrySelect.innerHTML = '<option value="">All Countries</option>' +
        countries.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
      countrySelect.value = current;
    }

    applyFilters();
    renderPipeline();
    renderInterestedTable();
    updateKPIs();
  }

  // ── KPIs ──
  function updateKPIs() {
    var stageOf = function(s) { return STAGE_LABELS[s] ? s : 'offer_extended'; }; // legacy rows still count
    var active = allPlacements.filter(function(p) { return stageOf(p.stage) === 'started_employment'; }).length;
    var pipeline = allPlacements.filter(function(p) { return ['offer_extended','offer_accepted','pre_employment','placement_confirmed'].indexOf(stageOf(p.stage)) >= 0; }).length;
    var visa = allPlacements.filter(function(p) { return p.visa_status === 'documents_submitted' || p.visa_status === 'in_review'; }).length;
    var completed = allPlacements.filter(function(p) { return stageOf(p.stage) === 'paid_closed'; }).length;

    setText('kpi-active', active);
    setText('kpi-pipeline', pipeline);
    setText('kpi-visa', visa);
    setText('kpi-completed', completed);
  }

  // ── Pipeline Bar ──
  function renderPipeline() {
    var bar = document.getElementById('pipeline-bar');
    if (!bar) return;

    var counts = {};
    STAGES.forEach(function(s) { counts[s] = 0; });
    allPlacements.forEach(function(p) { if (counts[p.stage] !== undefined) counts[p.stage]++; });

    bar.innerHTML = STAGES.map(function(s) {
      var isActive = activeStageFilter === s;
      return '<div class="pipeline-tile' + (isActive ? ' active' : '') + '" data-stage="' + s + '">' +
        '<div class="tile-count">' + counts[s] + '</div>' +
        '<div class="tile-label">' + STAGE_LABELS[s] + '</div>' +
        '</div>';
    }).join('');

    bar.querySelectorAll('.pipeline-tile').forEach(function(tile) {
      tile.addEventListener('click', function() {
        var stage = tile.dataset.stage;
        if (activeStageFilter === stage) {
          activeStageFilter = '';
          document.getElementById('filter-stage').value = '';
        } else {
          activeStageFilter = stage;
          document.getElementById('filter-stage').value = stage;
        }
        applyFilters();
        renderPipeline();
      });
    });
  }

  // ── Filters ──
  function applyFilters() {
    var search = (document.getElementById('filter-search')?.value || '').toLowerCase();
    var stage = document.getElementById('filter-stage')?.value || activeStageFilter || '';
    var country = document.getElementById('filter-country')?.value || '';

    filteredPlacements = allPlacements.filter(function(p) {
      if (stage && p.stage !== stage) return false;
      if (country && p.destination_country !== country) return false;
      if (search) {
        var haystack = ((p.applicant_name || '') + ' ' + (p.campaign_title || '') + ' ' + (p.destination_country || '') + ' ' + (p.employer_name || '') + ' ' + (p.position_title || '')).toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });

    renderPlacementsTable();
  }

  function bindFilters() {
    var searchEl = document.getElementById('filter-search');
    var stageEl = document.getElementById('filter-stage');
    var countryEl = document.getElementById('filter-country');
    var resetEl = document.getElementById('filter-reset');

    if (searchEl) searchEl.addEventListener('input', function() { applyFilters(); });
    if (stageEl) stageEl.addEventListener('change', function() {
      activeStageFilter = stageEl.value;
      applyFilters();
      renderPipeline();
    });
    if (countryEl) countryEl.addEventListener('change', function() { applyFilters(); });
    if (resetEl) resetEl.addEventListener('click', function() {
      if (searchEl) searchEl.value = '';
      if (stageEl) stageEl.value = '';
      if (countryEl) countryEl.value = '';
      activeStageFilter = '';
      applyFilters();
      renderPipeline();
    });
  }

  // ── Main Placements Table ──
  function renderPlacementsTable() {
    var tbody = document.getElementById('placements-tbody');
    var countEl = document.getElementById('placements-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = filteredPlacements.length + ' placements';

    if (filteredPlacements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No placements found. Create placements from interested responses below.</td></tr>';
      return;
    }

    tbody.innerHTML = filteredPlacements.map(function(p) {
      var colors = GHE.avatarColors[p.avatar_color_index || 0];
      var startDate = p.start_date ? new Date(p.start_date).toLocaleDateString() : '-';
      var visaBadge = '<span class="badge badge-neutral badge-dot">' + (VISA_LABELS[p.visa_status] || p.visa_status) + '</span>';
      if (p.visa_status === 'approved') visaBadge = '<span class="badge badge-primary badge-dot">' + VISA_LABELS.approved + '</span>';
      else if (p.visa_status === 'denied') visaBadge = '<span class="badge badge-error badge-dot">' + VISA_LABELS.denied + '</span>';
      else if (p.visa_status === 'in_review') visaBadge = '<span class="badge badge-warning badge-dot">' + VISA_LABELS.in_review + '</span>';

      var contractBadge = '<span class="badge badge-neutral badge-dot">' + (CONTRACT_LABELS[p.contract_status] || p.contract_status) + '</span>';
      if (p.contract_status === 'countersigned') contractBadge = '<span class="badge badge-primary badge-dot">Countersigned</span>';
      else if (p.contract_status === 'signed') contractBadge = '<span class="badge badge-info badge-dot">Signed</span>';

      return '<tr class="clickable-row" data-id="' + p.id + '">' +
        '<td><div class="applicant-row"><div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (p.avatar_initials || '??') + '</div><div class="applicant-info"><div class="applicant-name">' + escapeHtml(p.applicant_name || 'Unknown') + '</div></div></div></td>' +
        '<td>' + escapeHtml(p.campaign_title || '-') + '</td>' +
        '<td>' + escapeHtml(p.destination_country || '-') + '</td>' +
        '<td><span class="stage-badge stage-' + p.stage + '">' + STAGE_LABELS[p.stage] + '</span></td>' +
        '<td>' + visaBadge + '</td>' +
        '<td>' + contractBadge + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + startDate + '</td>' +
        '<td><div class="action-btn-group"><button class="btn btn-ghost btn-xs btn-open-modal" data-id="' + p.id + '">View</button></div></td>' +
        '</tr>';
    }).join('');

    // Bind row clicks
    tbody.querySelectorAll('.clickable-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        openPlacementModal(row.dataset.id);
      });
    });
    tbody.querySelectorAll('.btn-open-modal').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openPlacementModal(btn.dataset.id);
      });
    });
  }

  // ── Interested Responses Table ──
  function renderInterestedTable() {
    var tbody = document.getElementById('interested-tbody');
    var countEl = document.getElementById('interested-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = interestedMatches.length + ' unplaced';

    if (interestedMatches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No unplaced interested responses. Interested matches will appear here after campaign outreach.</td></tr>';
      return;
    }

    tbody.innerHTML = interestedMatches.map(function(m) {
      var profile = m.profiles || {};
      var campaign = m.campaigns || {};
      var colors = GHE.avatarColors[profile.avatar_color_index || 0];
      var date = m.responded_at ? new Date(m.responded_at).toLocaleDateString() : '-';

      return '<tr>' +
        '<td><div class="applicant-row"><div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + (profile.avatar_initials || '??') + '</div><div class="applicant-info"><div class="applicant-name">' + escapeHtml(profile.full_name || 'Unknown') + '</div></div></div></td>' +
        '<td>' + escapeHtml(campaign.title || '-') + '</td>' +
        '<td>' + escapeHtml(campaign.destination_country || '-') + '</td>' +
        '<td style="font-family:var(--font-mono);font-weight:600;">' + (m.match_score || 0) + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:var(--text-xs);">' + date + '</td>' +
        '<td><button class="btn btn-primary btn-sm btn-create-placement" data-match-id="' + m.id + '" data-applicant-id="' + (profile.id || m.applicant_id) + '" data-campaign-id="' + (campaign.id || m.campaign_id) + '" data-country="' + escapeHtml(campaign.destination_country || '') + '" data-title="' + escapeHtml(campaign.title || '') + '">Create Placement</button></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.btn-create-placement').forEach(function(btn) {
      btn.addEventListener('click', function() { createPlacement(btn); });
    });
  }

  // ── Create Placement ──
  async function createPlacement(btn) {
    var matchId = btn.dataset.matchId;
    var applicantId = btn.dataset.applicantId;
    var campaignId = btn.dataset.campaignId;
    var country = btn.dataset.country;
    var title = btn.dataset.title;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    var { data, error } = await ghFrom('placements')
      .insert({
        match_id: matchId,
        applicant_id: applicantId,
        campaign_id: campaignId,
        destination_country: country,
        position_title: title,
        stage: 'offer_extended',
        created_by: adminProfile.id
      })
      .select('id')
      .single();

    if (error) {
      alert('Failed to create placement: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Create Placement';
      return;
    }

    // Log activity
    await logActivity(data.id, 'created', null, 'offer_extended', { campaign_id: campaignId });

    await loadData();
  }

  // ── Modal ──
  function bindModalEvents() {
    var overlay = document.getElementById('placement-modal-overlay');
    var closeBtn = document.getElementById('modal-close');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });

    // Modal tabs
    document.querySelectorAll('#placement-modal-overlay .modal-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('#placement-modal-overlay .modal-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('#placement-modal-overlay .tab-content').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // Advance stage
    document.getElementById('btn-advance')?.addEventListener('click', advanceStage);

    // Terminate
    document.getElementById('btn-terminate')?.addEventListener('click', terminatePlacement);

    // Visa form
    document.getElementById('visa-form')?.addEventListener('submit', function(e) {
      e.preventDefault();
      updateVisa();
    });

    // Contract status change
    document.getElementById('contract-status-select')?.addEventListener('change', updateContractStatus);

    // Contract dropzone
    var dropzone = document.getElementById('contract-dropzone');
    var fileInput = document.getElementById('contract-file-input');
    if (dropzone) {
      dropzone.addEventListener('click', function() { fileInput?.click(); });
      dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
      dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) uploadContract(e.dataTransfer.files[0]);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function() {
        if (fileInput.files[0]) uploadContract(fileInput.files[0]);
        fileInput.value = '';
      });
    }

    // Checklist form
    document.getElementById('checklist-form')?.addEventListener('submit', function(e) {
      e.preventDefault();
      addChecklistItem();
    });
  }

  async function openPlacementModal(placementId) {
    currentPlacementId = placementId;
    currentPlacement = allPlacements.find(function(p) { return p.id === placementId; });
    if (!currentPlacement) return;

    var overlay = document.getElementById('placement-modal-overlay');
    overlay?.classList.add('active');

    document.getElementById('modal-title').textContent = (currentPlacement.applicant_name || 'Placement') + ' — ' + (currentPlacement.position_title || currentPlacement.campaign_title || '');
    document.getElementById('modal-placement-id').textContent = 'ID: ' + placementId.substring(0, 8);

    // Reset to overview tab
    document.querySelectorAll('#placement-modal-overlay .modal-tab').forEach(function(t, i) { t.classList.toggle('active', i === 0); });
    document.querySelectorAll('#placement-modal-overlay .tab-content').forEach(function(t, i) { t.classList.toggle('active', i === 0); });

    // Show/hide terminate and advance buttons
    var advBtn = document.getElementById('btn-advance');
    var termBtn = document.getElementById('btn-terminate');
    var isTerminal = currentPlacement.stage === 'completed' || currentPlacement.stage === 'terminated';
    if (advBtn) advBtn.style.display = isTerminal ? 'none' : '';
    if (termBtn) termBtn.style.display = isTerminal ? 'none' : '';

    renderOverviewTab();
    renderVisaTab();
    renderContractTab();
    renderOnboardingTab();
    renderActivityTab();
  }

  function closeModal() {
    var overlay = document.getElementById('placement-modal-overlay');
    overlay?.classList.remove('active');
    currentPlacementId = null;
    currentPlacement = null;
  }

  // ── Overview Tab ──
  function renderOverviewTab() {
    var p = currentPlacement;
    var grid = document.getElementById('overview-grid');
    if (!grid) return;

    var items = [
      { label: 'Applicant', value: p.applicant_name || '-' },
      { label: 'Campaign', value: p.campaign_title || '-' },
      { label: 'Destination', value: p.destination_country || '-' },
      { label: 'Employer', value: p.employer_name || '-' },
      { label: 'Position', value: p.position_title || '-' },
      { label: 'Salary', value: p.salary_display || '-' },
      { label: 'Match Score', value: p.match_score ? p.match_score + '%' : '-' },
      { label: 'Start Date', value: p.start_date ? new Date(p.start_date).toLocaleDateString() : '-' },
      { label: 'End Date', value: p.end_date ? new Date(p.end_date).toLocaleDateString() : '-' },
      { label: 'Duration', value: p.expected_duration_months ? p.expected_duration_months + ' months' : '-' },
      { label: 'Created', value: p.created_at ? new Date(p.created_at).toLocaleDateString() : '-' },
      { label: 'Updated', value: p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-' }
    ];

    grid.innerHTML = items.map(function(i) {
      return '<div class="info-item"><span class="info-label">' + i.label + '</span><span class="info-value">' + escapeHtml(i.value) + '</span></div>';
    }).join('');

    var stageBadge = document.getElementById('overview-stage-badge');
    if (stageBadge) {
      stageBadge.innerHTML = '<span class="stage-badge stage-' + p.stage + '">' + STAGE_LABELS[p.stage] + '</span>';
    }

    // Revenue block — surfaces the candidate's master-pipeline revenue fields
    // (placement_fee / invoice / paid live on profiles, decoupled from the placement row).
    var revenueEl = document.getElementById('overview-revenue');
    if (revenueEl) {
      var revItems = [
        { label: 'Fee', value: p.placement_fee != null ? (p.fee_currency || 'USD') + ' ' + Number(p.placement_fee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null },
        { label: 'Invoice', value: p.invoice_number || null },
        { label: 'Invoiced', value: p.invoiced_at ? new Date(p.invoiced_at).toLocaleDateString() : null },
        { label: 'Paid', value: p.paid_at ? new Date(p.paid_at).toLocaleDateString() : null }
      ].filter(function(i) { return i.value; });
      var revGrid = document.getElementById('overview-revenue-grid');
      if (revGrid) {
        revGrid.innerHTML = revItems.map(function(i) {
          return '<div class="info-item"><span class="info-label">' + i.label + '</span><span class="info-value">' + escapeHtml(i.value) + '</span></div>';
        }).join('');
      }
      revenueEl.hidden = revItems.length === 0;
    }

    // Offer Summary editor — recruiter-entered offer terms, shown to the candidate in the portal
    var summaryInput = document.getElementById('offer-summary-input');
    if (summaryInput) {
      summaryInput.value = p.offer_summary || '';
    }
    var savedEl = document.getElementById('offer-summary-saved');
    var saveBtn = document.getElementById('offer-summary-save');
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener('click', async function () {
        var value = summaryInput ? summaryInput.value.trim() : '';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        if (savedEl) savedEl.textContent = '';
        var { error } = await ghFrom('placements')
          .update({ offer_summary: value || null, updated_at: new Date().toISOString() })
          .eq('id', p.id);
        if (error) {
          alert('Failed to save offer summary: ' + error.message);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Offer Summary';
          return;
        }
        await logActivity(p.id, 'note_added', null, 'Offer summary updated');
        p.offer_summary = value || null;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Offer Summary';
        if (savedEl) {
          savedEl.textContent = '✓ Saved';
          setTimeout(function () { savedEl.textContent = ''; }, 2500);
        }
      });
    }
  }

  // ── Visa Tab ──
  function renderVisaTab() {
    var p = currentPlacement;

    // Visa tracker
    var visaStages = ['not_started','documents_submitted','in_review','approved'];
    var visaIdx = visaStages.indexOf(p.visa_status);
    if (p.visa_status === 'denied') visaIdx = -2;
    if (p.visa_status === 'not_required') visaIdx = visaStages.length;

    var tracker = document.getElementById('visa-tracker');
    if (tracker) {
      tracker.innerHTML = visaStages.map(function(s, i) {
        var cls = '';
        if (p.visa_status === 'denied' && i >= visaStages.indexOf('in_review')) cls = 'denied';
        else if (i < visaIdx) cls = 'completed';
        else if (i === visaIdx) cls = 'active';
        return '<div class="visa-step ' + cls + '"><div class="visa-dot"></div><span class="visa-step-label">' + VISA_LABELS[s] + '</span></div>';
      }).join('<div class="visa-line' + (visaIdx > 0 ? ' completed' : '') + '"></div>');

      if (p.visa_status === 'not_required') {
        tracker.innerHTML = '<div style="text-align:center;padding:var(--space-4);color:var(--primary);font-weight:600;">Visa Not Required</div>';
      }
    }

    // Form values
    var sel = document.getElementById('visa-status-select');
    if (sel) sel.value = p.visa_status || 'not_started';
    var typeInput = document.getElementById('visa-type-input');
    if (typeInput) typeInput.value = p.visa_type || '';
    var appDate = document.getElementById('visa-app-date');
    if (appDate) appDate.value = p.visa_application_date || '';
    var apprDate = document.getElementById('visa-approval-date');
    if (apprDate) apprDate.value = p.visa_approval_date || '';
    var notes = document.getElementById('visa-notes');
    if (notes) notes.value = p.visa_notes || '';
  }

  async function updateVisa() {
    var p = currentPlacement;
    var updates = {
      visa_status: document.getElementById('visa-status-select').value,
      visa_type: document.getElementById('visa-type-input').value.trim() || null,
      visa_application_date: document.getElementById('visa-app-date').value || null,
      visa_approval_date: document.getElementById('visa-approval-date').value || null,
      visa_notes: document.getElementById('visa-notes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    var oldStatus = p.visa_status;
    var { error } = await ghFrom('placements').update(updates).eq('id', p.id);

    if (error) { alert('Failed to update visa: ' + error.message); return; }

    if (oldStatus !== updates.visa_status) {
      await logActivity(p.id, 'visa_updated', oldStatus, updates.visa_status);
    }

    // Update local data
    Object.assign(p, updates);
    renderVisaTab();
    renderPlacementsTable();
    updateKPIs();
  }

  // ── Contract Tab ──
  async function renderContractTab() {
    var p = currentPlacement;

    // Contract status
    var statusDisplay = document.getElementById('contract-status-display');
    var statusSelect = document.getElementById('contract-status-select');
    if (statusDisplay) statusDisplay.innerHTML = '<span class="badge badge-neutral badge-dot">' + (CONTRACT_LABELS[p.contract_status] || p.contract_status) + '</span>';
    if (statusSelect) statusSelect.value = p.contract_status || 'not_started';

    // Load contracts
    var { data: contracts } = await ghFrom('placement_contracts')
      .select('*')
      .eq('placement_id', p.id)
      .order('uploaded_at', { ascending: false });

    var list = document.getElementById('contract-list');
    if (!list) return;

    if (!contracts || contracts.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:var(--space-4);color:var(--text-tertiary);font-size:var(--text-sm);">No contracts uploaded yet.</div>';
      return;
    }

    list.innerHTML = contracts.map(function(c) {
      var typeLabel = { employment: 'Employment', offer_letter: 'Offer Letter', addendum: 'Addendum', nda: 'NDA', other: 'Other' }[c.contract_type] || c.contract_type;
      var size = c.file_size_bytes ? formatBytes(c.file_size_bytes) : '';
      var date = c.uploaded_at ? new Date(c.uploaded_at).toLocaleDateString() : '';

      return '<div class="contract-item">' +
        '<div class="contract-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>' +
        '<div class="contract-info"><div class="contract-name">' + escapeHtml(c.file_name) + '</div><div class="contract-meta">' + typeLabel + ' &middot; v' + c.version + ' &middot; ' + size + ' &middot; ' + date + '</div></div>' +
        '<span class="badge badge-info badge-dot" style="flex-shrink:0">' + typeLabel + '</span>' +
        '</div>';
    }).join('');
  }

  async function updateContractStatus() {
    var p = currentPlacement;
    var newStatus = document.getElementById('contract-status-select').value;
    var oldStatus = p.contract_status;
    if (newStatus === oldStatus) return;

    var updates = { contract_status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'sent') updates.contract_sent_at = new Date().toISOString();
    if (newStatus === 'signed') updates.contract_signed_at = new Date().toISOString();

    var { error } = await ghFrom('placements').update(updates).eq('id', p.id);
    if (error) { alert('Failed to update: ' + error.message); return; }

    await logActivity(p.id, 'contract_status_changed', oldStatus, newStatus);
    Object.assign(p, updates);
    renderContractTab();
    renderPlacementsTable();
  }

  async function uploadContract(file) {
    var p = currentPlacement;
    var maxSize = 20 * 1024 * 1024;
    var allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];

    if (file.size > maxSize) { alert('File too large. Maximum 20MB.'); return; }
    if (!allowedTypes.includes(file.type)) { alert('Invalid file type. PDF, DOC, DOCX, JPEG, PNG only.'); return; }

    var dropzone = document.getElementById('contract-dropzone');
    if (dropzone) dropzone.innerHTML = '<span class="spinner-inline"></span> Uploading...';

    var ext = file.name.split('.').pop();
    var filePath = p.id + '/' + Date.now() + '.' + ext;

    var { error: storageErr } = await sb.storage.from('gh-placement-contracts').upload(filePath, file, { upsert: true });
    if (storageErr) {
      alert('Upload failed: ' + storageErr.message);
      resetDropzone();
      return;
    }

    // Count existing contracts for version
    var { count } = await ghFrom('placement_contracts').select('id', { count: 'exact', head: true }).eq('placement_id', p.id);

    var { error: dbErr } = await ghFrom('placement_contracts').insert({
      placement_id: p.id,
      file_name: file.name,
      file_path: filePath,
      file_size_bytes: file.size,
      mime_type: file.type,
      version: (count || 0) + 1,
      uploaded_by: adminProfile.id
    });

    if (dbErr) { alert('Failed to save record: ' + dbErr.message); }
    else { await logActivity(p.id, 'contract_uploaded', null, file.name, { file_size: file.size }); }

    resetDropzone();
    renderContractTab();
  }

  function resetDropzone() {
    var dropzone = document.getElementById('contract-dropzone');
    if (dropzone) {
      dropzone.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
        '<p>Drop contract file or <span class="link">browse</span></p>' +
        '<span class="hint">PDF, DOC, DOCX, JPEG, PNG up to 20MB</span>';
    }
  }

  // ── Onboarding Tab ──
  async function renderOnboardingTab() {
    var p = currentPlacement;

    var { data: items } = await ghFrom('placement_checklist')
      .select('*')
      .eq('placement_id', p.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    var container = document.getElementById('checklist-container');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-4);color:var(--text-tertiary);font-size:var(--text-sm);">No checklist items yet. Add items below.</div>';
      return;
    }

    // Group by category
    var groups = {};
    items.forEach(function(item) {
      var cat = item.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    var categoryOrder = ['pre_departure','arrival','documentation','orientation','general'];
    container.innerHTML = categoryOrder.filter(function(c) { return groups[c]; }).map(function(cat) {
      return '<div class="onboarding-category">' +
        '<div class="onboarding-category-title">' + (CATEGORY_LABELS[cat] || cat) + '</div>' +
        '<div class="onboarding-checklist">' +
        groups[cat].map(function(item) {
          var completedClass = item.is_completed ? ' completed' : '';
          var checkIcon = item.is_completed ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m5 12 5 5L20 7"/></svg>' : '';
          var dueStr = item.due_date ? new Date(item.due_date).toLocaleDateString() : '';
          return '<div class="onboarding-item' + completedClass + '">' +
            '<button class="check-toggle" data-item-id="' + item.id + '" data-completed="' + item.is_completed + '">' + checkIcon + '</button>' +
            '<span class="item-text">' + escapeHtml(item.title) + '</span>' +
            (dueStr ? '<span class="item-due">' + dueStr + '</span>' : '') +
            '</div>';
        }).join('') +
        '</div></div>';
    }).join('');

    // Bind toggle
    container.querySelectorAll('.check-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        toggleChecklistItem(btn.dataset.itemId, btn.dataset.completed === 'true');
      });
    });
  }

  async function addChecklistItem() {
    var p = currentPlacement;
    var title = document.getElementById('checklist-title').value.trim();
    var category = document.getElementById('checklist-category').value;
    var dueDate = document.getElementById('checklist-due-date').value || null;

    if (!title) return;

    var { error } = await ghFrom('placement_checklist').insert({
      placement_id: p.id,
      title: title,
      category: category,
      due_date: dueDate
    });

    if (error) { alert('Failed to add item: ' + error.message); return; }

    await logActivity(p.id, 'checklist_item_added', null, title, { category: category });

    document.getElementById('checklist-title').value = '';
    document.getElementById('checklist-due-date').value = '';
    renderOnboardingTab();
  }

  async function toggleChecklistItem(itemId, isCurrentlyCompleted) {
    var updates = {};
    if (isCurrentlyCompleted) {
      updates.is_completed = false;
      updates.completed_at = null;
      updates.completed_by = null;
    } else {
      updates.is_completed = true;
      updates.completed_at = new Date().toISOString();
      updates.completed_by = adminProfile.id;
    }

    var { error } = await ghFrom('placement_checklist').update(updates).eq('id', itemId);
    if (error) { alert('Failed to update: ' + error.message); return; }

    if (!isCurrentlyCompleted) {
      await logActivity(currentPlacementId, 'checklist_item_completed', null, itemId);
    }

    renderOnboardingTab();
  }

  // ── Activity Log Tab ──
  async function renderActivityTab() {
    var timeline = document.getElementById('activity-timeline');
    if (!timeline || !currentPlacementId) return;

    var { data: activities } = await ghFrom('placement_activities')
      .select('*')
      .eq('placement_id', currentPlacementId)
      .order('created_at', { ascending: false });

    if (!activities || activities.length === 0) {
      timeline.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-tertiary);">No activity recorded yet.</div>';
      return;
    }

    timeline.innerHTML = activities.map(function(a) {
      var dotClass = 'dot-status';
      if (a.event_type === 'visa_updated') dotClass = 'dot-registry';
      else if (a.event_type === 'contract_uploaded' || a.event_type === 'contract_status_changed') dotClass = 'dot-analysis';
      else if (a.event_type === 'checklist_item_added' || a.event_type === 'checklist_item_completed') dotClass = 'dot-note';
      else if (a.event_type === 'terminated') dotClass = 'dot-status';

      var actionLabel = {
        created: 'Placement created',
        stage_changed: 'Stage changed',
        visa_updated: 'Visa updated',
        contract_uploaded: 'Contract uploaded',
        contract_status_changed: 'Contract status changed',
        checklist_item_added: 'Checklist item added',
        checklist_item_completed: 'Checklist item completed',
        note_added: 'Note added',
        terminated: 'Placement terminated',
        completed: 'Placement completed'
      }[a.event_type] || a.event_type;

      var body = '';
      if (a.old_value && a.new_value) body = (STAGE_LABELS[a.old_value] || a.old_value) + ' &rarr; ' + (STAGE_LABELS[a.new_value] || a.new_value);
      else if (a.new_value) body = a.new_value;

      var time = a.created_at ? new Date(a.created_at).toLocaleString() : '';

      return '<div class="audit-entry">' +
        '<div class="audit-entry-dot ' + dotClass + '"></div>' +
        '<div class="audit-entry-header"><span class="audit-entry-action">' + actionLabel + '</span><span class="audit-entry-method">' + a.event_type + '</span></div>' +
        (body ? '<div class="audit-entry-body">' + body + '</div>' : '') +
        '<div class="audit-entry-time">' + time + '</div>' +
        '</div>';
    }).join('');
  }

  // ── Advance Stage ──
  async function advanceStage() {
    var p = currentPlacement;
    var advanceable = ['offer_extended','offer_accepted','pre_employment','placement_confirmed','started_employment','commission_due','invoiced','paid_closed'];
    var idx = advanceable.indexOf(p.stage);
    if (idx < 0 || idx >= advanceable.length - 1) return; // terminal (paid_closed/terminated) or unknown

    var nextStage = advanceable[idx + 1];
    var updates = { stage: nextStage, updated_at: new Date().toISOString() };
    if (nextStage === 'started_employment' && !p.start_date) {
      updates.start_date = new Date().toISOString().split('T')[0]; // set start date when employment starts
    }

    var { error } = await ghFrom('placements').update(updates).eq('id', p.id);
    if (error) { alert('Failed: ' + error.message); return; }
    await logActivity(p.id, 'stage_changed', p.stage, nextStage);
    Object.assign(p, updates);

    await loadData();
    openPlacementModal(p.id);
  }

  // ── Terminate ──
  async function terminatePlacement() {
    var p = currentPlacement;
    var reason = prompt('Reason for termination:');
    if (reason === null) return;

    var updates = {
      stage: 'terminated',
      termination_reason: reason || null,
      terminated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    var { error } = await ghFrom('placements').update(updates).eq('id', p.id);
    if (error) { alert('Failed: ' + error.message); return; }

    await logActivity(p.id, 'terminated', p.stage, 'terminated', { reason: reason });
    Object.assign(p, updates);

    await loadData();
    openPlacementModal(p.id);
  }

  // ── Log Activity ──
  async function logActivity(placementId, eventType, oldValue, newValue, details) {
    await ghFrom('placement_activities').insert({
      placement_id: placementId,
      event_type: eventType,
      old_value: oldValue || null,
      new_value: newValue || null,
      details: details || {},
      actor_id: adminProfile.id
    });
    // Track in eLab Command Centre
    if (window.ElabTracker) {
      var category = (eventType === 'stage_changed' || eventType === 'completed' || eventType === 'terminated') ? 'high_value' : 'medium_value';
      ElabTracker.track('gh_placement_' + eventType, category, {
        placement_id: placementId, old_value: oldValue, new_value: newValue, platform: 'globalhire'
      });
    }
  }

  // ── Helpers ──
  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
})();
