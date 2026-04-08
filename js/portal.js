/* ============================================
   GLOBALHIRE@ELAB — Applicant Portal JS
   Profile editing, document upload, status
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  let currentProfile = null;
  let currentUser = null;

  // Init tabs immediately so navigation works even before auth-ready
  initTabs();

  window.addEventListener('gh:auth-ready', async (e) => {
    currentProfile = e.detail.profile;
    currentUser = e.detail.session.user;
    initSidebar();
    try {
      await loadDashboard();
    } catch (err) { console.error('Dashboard load error:', err); }
    try {
      await loadProfile();
    } catch (err) { console.error('Profile load error:', err); }
    try {
      await loadDocuments();
    } catch (err) { console.error('Documents load error:', err); }
    try {
      await loadMyPlacements();
    } catch (err) { console.error('Placements load error:', err); }
    try {
      await loadOpportunities();
    } catch (err) { console.error('Opportunities load error:', err); }
    try {
      await loadMyApplications();
    } catch (err) { console.error('Applications load error:', err); }
    try {
      await loadSettings();
    } catch (err) { console.error('Settings load error:', err); }
    try {
      await loadMessages();
    } catch (err) { console.error('Messages load error:', err); }
    // Check for ?apply= param after everything is loaded
    try {
      await checkApplyParam();
    } catch (err) { console.error('Apply param check error:', err); }
  });

  // ── Sidebar nav ──
  function initSidebar() {
    // User info in sidebar
    const userNameEl = document.getElementById('portal-user-name');
    const userRoleEl = document.getElementById('portal-user-role');
    const userAvatarEl = document.getElementById('portal-user-avatar');
    if (userNameEl) userNameEl.textContent = currentProfile.full_name || currentUser.email;
    if (userRoleEl) userRoleEl.textContent = 'Healthcare Applicant';
    if (userAvatarEl) {
      userAvatarEl.textContent = currentProfile.avatar_initials || 'U';
      var colors = GHE.avatarColors[currentProfile.avatar_color_index || 0];
      userAvatarEl.style.background = colors[0];
      userAvatarEl.style.color = colors[1];
    }

    // Sign out
    document.getElementById('portal-signout')?.addEventListener('click', (e) => {
      e.preventDefault();
      GHAuth.signOut();
    });
  }

  // ── Tab switching ──
  function initTabs() {
    const navItems = document.querySelectorAll('.portal-nav-item[data-tab]');
    const tabs = document.querySelectorAll('.portal-tab');

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = item.dataset.tab;
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        tabs.forEach(t => {
          t.classList.toggle('active', t.id === tabId);
        });
      });
    });
  }

  // ── Dashboard tab ──
  async function loadDashboard() {
    const p = currentProfile;

    // ── Profile summary card ──
    const avatarEl = document.getElementById('dash-avatar');
    const nameEl = document.getElementById('dash-name');
    const emailEl = document.getElementById('dash-email');
    const detailsEl = document.getElementById('dash-profile-details');

    if (avatarEl) {
      const colors = (typeof GHE !== 'undefined' && GHE.avatarColors) ? GHE.avatarColors[p.avatar_color_index || 0] : ['var(--primary)', 'var(--bg-deep)'];
      avatarEl.style.background = colors[0];
      avatarEl.style.color = colors[1];
      avatarEl.textContent = p.avatar_initials || '??';
    }
    if (nameEl) nameEl.textContent = p.full_name || 'Unnamed';
    if (emailEl) emailEl.textContent = currentUser.email || '';

    if (detailsEl) {
      const fields = [
        { label: 'Specialty', value: p.specialty },
        { label: 'Country', value: p.country_of_origin },
        { label: 'Experience', value: p.years_of_experience != null ? p.years_of_experience + ' years' : null },
        { label: 'License', value: p.license_number },
        { label: 'Phone', value: p.phone },
        { label: 'Destinations', value: (p.preferred_destinations || []).join(', ') },
      ];
      detailsEl.innerHTML = fields.filter(f => f.value).map(f =>
        '<div style="font-size:var(--text-xs);"><span style="color:var(--text-tertiary);">' + f.label + ':</span> <span style="color:var(--text-primary);font-weight:600;">' + f.value + '</span></div>'
      ).join('') || '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">No profile details yet. <a href="#" onclick="switchToTab(\'tab-profile\');return false;" style="color:var(--primary);text-decoration:underline;">Complete your profile</a></div>';
    }

    // ── Fetch documents ──
    const { data: docs } = await ghFrom('documents')
      .select('doc_type, status, file_name')
      .eq('applicant_id', currentUser.id);

    const allDocs = docs || [];

    // ── Completion checklist ──
    const checks = {
      profile: p.profile_completed,
      license: false, degree: false, passport: false, cv: false
    };
    allDocs.forEach(d => { checks[d.doc_type] = true; });

    const totalSteps = 5;
    const completedSteps = Object.values(checks).filter(Boolean).length;
    const pct = Math.round((completedSteps / totalSteps) * 100);

    const progressFill = document.getElementById('completion-fill');
    const progressText = document.getElementById('completion-pct');
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressText) progressText.textContent = pct + '%';

    const checklistEl = document.getElementById('completion-checklist');
    if (checklistEl) {
      const items = [
        { key: 'profile', label: 'Complete your profile' },
        { key: 'license', label: 'Upload professional license' },
        { key: 'degree', label: 'Upload degree certificate' },
        { key: 'passport', label: 'Upload passport copy' },
        { key: 'cv', label: 'Upload CV / Resume' }
      ];
      const tabMap = { profile: 'tab-profile', license: 'tab-documents', degree: 'tab-documents', passport: 'tab-documents', cv: 'tab-documents' };
      checklistEl.innerHTML = items.map(i => `
        <div class="checklist-item ${checks[i.key] ? 'done' : ''}" data-goto="${tabMap[i.key] || ''}" style="cursor:pointer;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            ${checks[i.key] ? '<path d="m5 12 5 5L20 7"/>' : '<circle cx="12" cy="12" r="10"/>'}
          </svg>
          <span>${i.label}</span>
        </div>
      `).join('');
      checklistEl.querySelectorAll('.checklist-item[data-goto]').forEach(el => {
        el.addEventListener('click', function() { if (this.dataset.goto) switchToTab(this.dataset.goto); });
      });
    }

    // ── KPI counts ──
    const verifiedCount = allDocs.filter(d => d.status === 'verified').length;
    const pendingCount = allDocs.filter(d => d.status === 'pending' || d.status === 'in_review').length;

    const docsCountEl = document.getElementById('dash-docs-count');
    const verifiedCountEl = document.getElementById('dash-verified-count');
    const pendingCountEl = document.getElementById('dash-pending-count');
    const appsCountEl = document.getElementById('dash-apps-count');

    if (docsCountEl) docsCountEl.textContent = allDocs.length;
    if (verifiedCountEl) verifiedCountEl.textContent = verifiedCount;
    if (pendingCountEl) pendingCountEl.textContent = pendingCount;

    // Fetch application count
    const { count: appsCount } = await ghFrom('campaign_applications')
      .select('*', { count: 'exact', head: true })
      .eq('applicant_id', currentUser.id);
    if (appsCountEl) appsCountEl.textContent = appsCount || 0;

    // ── Documents overview list ──
    const docsListEl = document.getElementById('dash-docs-list');
    if (docsListEl) {
      const typeLabels = { license: 'Professional License', degree: 'Degree Certificate', passport: 'Passport', cv: 'CV / Resume', passport_photo: 'Passport Photo', police_report: 'Police Report', travel_insurance: 'Travel Insurance' };
      const statusStyles = { verified: { color: 'var(--success, #10b981)', label: 'Verified' }, pending: { color: 'var(--warning, #f59e0b)', label: 'Pending' }, in_review: { color: 'var(--accent-cyan, #0ea5e9)', label: 'In Review' }, rejected: { color: 'var(--error, #ef4444)', label: 'Needs Attention' } };

      if (allDocs.length === 0) {
        docsListEl.innerHTML = '<div style="text-align:center;padding:var(--space-4);color:var(--text-tertiary);font-size:var(--text-sm);">No documents uploaded yet. <a href="#" onclick="switchToTab(\'tab-documents\');return false;" style="color:var(--primary);text-decoration:underline;">Upload documents</a></div>';
      } else {
        docsListEl.innerHTML = allDocs.map(d => {
          const st = statusStyles[d.status] || statusStyles.pending;
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:center;gap:var(--space-3);">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
              '<div><div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + (typeLabels[d.doc_type] || d.doc_type) + '</div>' +
              '<div style="font-size:var(--text-xs);color:var(--text-tertiary);">' + (d.file_name || '') + '</div></div>' +
            '</div>' +
            '<span style="font-size:var(--text-xs);font-weight:700;color:' + st.color + ';">' + st.label + '</span>' +
          '</div>';
        }).join('');
      }
    }

    // ── Pipeline status ──
    const stages = ['applied', 'screening', 'verifying', 'verified'];
    const stageLabels = ['Applied', 'Profile Complete', 'Documents Uploaded', 'Under Review'];
    let currentStage = 'applied';
    if (p.profile_completed && completedSteps >= 5) currentStage = 'verifying';
    else if (p.profile_completed) currentStage = 'screening';
    const stageIdx = stages.indexOf(currentStage);

    const pipelineEl = document.getElementById('status-pipeline');
    if (pipelineEl) {
      pipelineEl.innerHTML = stages.map((s, i) => `
        <div class="pipeline-step ${i <= stageIdx ? 'active' : ''} ${i === stageIdx ? 'current' : ''}">
          <div class="pipeline-dot"></div>
          <span>${stageLabels[i]}</span>
        </div>
      `).join('<div class="pipeline-line"></div>');
    }
  }

  // ── Profile tab ──
  async function loadProfile() {
    const form = document.getElementById('profile-form');
    if (!form) return;

    // Fill form
    const fields = ['full_name', 'phone', 'specialty', 'country_of_origin', 'years_of_experience', 'license_number'];
    fields.forEach(f => {
      const el = form.querySelector(`[name="${f}"]`);
      if (el && currentProfile[f] !== null && currentProfile[f] !== undefined) {
        el.value = currentProfile[f];
      }
    });

    // Preferred destinations checkboxes
    if (currentProfile.preferred_destinations) {
      currentProfile.preferred_destinations.forEach(d => {
        const cb = form.querySelector(`.dest-checkbox[value="${d}"]`);
        if (cb) cb.checked = true;
      });
    }

    // Save handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const msg = document.getElementById('profile-message');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';

      const destinations = [];
      form.querySelectorAll('.dest-checkbox:checked').forEach(cb => destinations.push(cb.value));

      const updates = {
        full_name: form.full_name.value.trim(),
        phone: form.phone.value.trim(),
        specialty: form.specialty.value,
        country_of_origin: form.country_of_origin.value,
        years_of_experience: parseInt(form.years_of_experience.value) || 0,
        license_number: form.license_number.value.trim(),
        preferred_destinations: destinations,
        profile_completed: !!(form.specialty.value && form.country_of_origin.value && form.phone.value.trim())
      };

      // Update initials
      const nameParts = updates.full_name.split(' ');
      updates.avatar_initials = nameParts.map(w => w[0]).join('').toUpperCase().substring(0, 2);

      const { error } = await ghFrom('profiles')
        .update(updates)
        .eq('id', currentUser.id);

      msg.textContent = error ? error.message : 'Profile saved successfully!';
      msg.style.color = error ? 'var(--error)' : 'var(--success)';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save Profile';

      if (!error) {
        currentProfile = { ...currentProfile, ...updates };
        await loadDashboard();
        setTimeout(() => { msg.style.display = 'none'; }, 3000);
      }
    });
  }

  // ── Documents tab ──
  async function loadDocuments() {
    const grid = document.getElementById('docs-grid');
    if (!grid) return;

    const docTypes = [
      { type: 'license', label: 'Professional License', icon: 'shield' },
      { type: 'degree', label: 'Degree Certificate', icon: 'award' },
      { type: 'passport', label: 'Passport Copy', icon: 'globe' },
      { type: 'cv', label: 'CV / Resume', icon: 'file-text' }
    ];

    const { data: docs } = await ghFrom('documents')
      .select('*')
      .eq('applicant_id', currentUser.id);

    const docMap = {};
    if (docs) docs.forEach(d => { docMap[d.doc_type] = d; });

    grid.innerHTML = docTypes.map(dt => {
      const doc = docMap[dt.type];
      const icons = {
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
        award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
        globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
      };

      if (doc) {
        const statusClass = {
          pending: 'badge-warning', verified: 'badge-primary',
          rejected: 'badge-error', in_review: 'badge-info'
        }[doc.status] || 'badge-neutral';

        return `
          <div class="doc-card uploaded" data-type="${dt.type}">
            <div class="doc-card-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[dt.icon]}</svg>
              <h4>${dt.label}</h4>
            </div>
            <div class="doc-file-info">
              <span class="doc-filename">${doc.file_name}</span>
              <span class="doc-filesize">${formatBytes(doc.file_size_bytes)}</span>
            </div>
            <span class="badge ${statusClass} badge-dot">${doc.status.replace('_', ' ')}</span>
            ${doc.reviewer_notes ? `<p class="doc-notes">${doc.reviewer_notes}</p>` : ''}
            <div class="doc-actions">
              <button class="btn btn-ghost btn-sm btn-replace" data-type="${dt.type}" data-doc-id="${doc.id}" data-path="${doc.file_path}">Replace</button>
              <button class="btn btn-ghost btn-sm btn-remove" data-type="${dt.type}" data-doc-id="${doc.id}" data-path="${doc.file_path}" style="color:var(--error)">Remove</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="doc-card empty" data-type="${dt.type}">
          <div class="doc-card-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[dt.icon]}</svg>
            <h4>${dt.label}</h4>
          </div>
          <div class="doc-dropzone" data-type="${dt.type}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p>Drag & drop or <span class="link">browse</span></p>
            <span class="doc-hint">PDF, JPEG, PNG up to 10MB</span>
          </div>
          <input type="file" class="doc-file-input" data-type="${dt.type}" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden>
        </div>
      `;
    }).join('');

    // Bind upload events
    bindUploadHandlers();
  }

  function bindUploadHandlers() {
    // Click to upload
    document.querySelectorAll('.doc-dropzone').forEach(zone => {
      zone.addEventListener('click', () => {
        const input = zone.closest('.doc-card').querySelector('.doc-file-input');
        if (input) input.click();
      });

      // Drag & drop
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(zone.dataset.type, file);
      });
    });

    // File input change
    document.querySelectorAll('.doc-file-input').forEach(input => {
      input.addEventListener('change', () => {
        if (input.files[0]) uploadFile(input.dataset.type, input.files[0]);
      });
    });

    // Replace buttons
    document.querySelectorAll('.btn-replace').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.jpg,.jpeg,.png,.webp';
        input.addEventListener('change', async () => {
          if (!input.files[0]) return;
          await removeDocument(btn.dataset.docId, btn.dataset.path);
          await uploadFile(btn.dataset.type, input.files[0]);
        });
        input.click();
      });
    });

    // Remove buttons
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this document?')) return;
        await removeDocument(btn.dataset.docId, btn.dataset.path);
        await loadDocuments();
        await loadDashboard();
      });
    });
  }

  async function uploadFile(docType, file) {
    // Validate
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    if (file.size > maxSize) {
      alert('File is too large. Maximum size is 10MB.');
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload PDF, JPEG, PNG, or WEBP.');
      return;
    }

    // Show uploading state
    const card = document.querySelector(`.doc-card[data-type="${docType}"]`);
    if (card) {
      card.innerHTML = `
        <div class="doc-uploading">
          <div class="spinner-lg"></div>
          <p>Uploading ${file.name}...</p>
        </div>
      `;
    }

    const ext = file.name.split('.').pop();
    const filePath = `${currentUser.id}/${docType}/${Date.now()}.${ext}`;

    // Upload to storage
    const { error: storageError } = await sb.storage
      .from('gh-applicant-documents')
      .upload(filePath, file, { upsert: true });

    if (storageError) {
      alert('Upload failed: ' + storageError.message);
      await loadDocuments();
      return;
    }

    // Insert document record
    const { error: dbError } = await ghFrom('documents')
      .insert({
        applicant_id: currentUser.id,
        doc_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size_bytes: file.size,
        mime_type: file.type
      });

    if (dbError) {
      alert('Failed to save document record: ' + dbError.message);
    }

    await loadDocuments();
    await loadDashboard();
  }

  async function removeDocument(docId, filePath) {
    await sb.storage.from('gh-applicant-documents').remove([filePath]);
    await ghFrom('documents').delete().eq('id', docId);
  }

  // ── My Placements (loaded before opportunities) ──
  window._myPlacements = {};
  window._myChecklist = {};

  async function loadMyPlacements() {
    var { data: placements } = await ghFrom('gh_my_placements')
      .select('*')
      .eq('applicant_id', currentUser.id);

    if (placements) {
      placements.forEach(function(p) {
        if (p.match_id) window._myPlacements[p.match_id] = p;
      });
    }

    // Load checklist items for active/onboarding placements
    var activePlacements = (placements || []).filter(function(p) {
      return p.stage === 'onboarding' || p.stage === 'active';
    });

    if (activePlacements.length > 0) {
      var ids = activePlacements.map(function(p) { return p.id; });
      var { data: checklist } = await ghFrom('gh_placement_checklist')
        .select('*')
        .in('placement_id', ids)
        .order('sort_order', { ascending: true });

      if (checklist) {
        checklist.forEach(function(item) {
          if (!window._myChecklist[item.placement_id]) window._myChecklist[item.placement_id] = [];
          window._myChecklist[item.placement_id].push(item);
        });
      }
    }

    // Render active placement banner
    renderActivePlacementBanner(placements || []);
  }

  function renderActivePlacementBanner(placements) {
    var banner = document.getElementById('active-placement-banner');
    if (!banner) return;

    var activePlacement = placements.find(function(p) {
      return ['offer_extended','offer_accepted','visa_processing','contract','onboarding','active'].indexOf(p.stage) >= 0;
    });

    if (!activePlacement) {
      banner.style.display = 'none';
      return;
    }

    var p = activePlacement;
    banner.style.display = '';
    banner.innerHTML = '<div class="panel" style="margin-bottom:var(--space-5);border-color:var(--primary);border-width:2px;">' +
      '<div class="panel-header" style="background:var(--primary-muted);">' +
        '<span class="panel-title" style="color:var(--primary);">Active Placement</span>' +
        '<span class="stage-badge stage-' + p.stage + '">' + getStageLabel(p.stage) + '</span>' +
      '</div>' +
      '<div class="panel-body">' +
        '<div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-4);">' +
          '<div><strong>' + (p.position_title || p.campaign_title || 'Placement') + '</strong>' +
          '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">' + (p.employer_name ? p.employer_name + ' &middot; ' : '') + (p.destination_country || '') + '</div></div>' +
          (p.salary_display ? '<div style="margin-left:auto;font-family:var(--font-display);font-weight:700;color:var(--primary);">' + p.salary_display + '</div>' : '') +
        '</div>' +
        renderPlacementStatus(p) +
      '</div>' +
    '</div>';
  }

  function renderPlacementStatus(placement) {
    var p = placement;
    var stages = ['offer_extended','offer_accepted','visa_processing','contract','onboarding','active'];
    var stageLabels = ['Offer','Visa','Contract','Onboarding','Active','Complete'];
    var simplifiedMap = { offer_extended: 0, offer_accepted: 0, visa_processing: 1, contract: 2, onboarding: 3, active: 4, completed: 5 };
    var currentIdx = simplifiedMap[p.stage] !== undefined ? simplifiedMap[p.stage] : -1;

    var pipelineHtml = '<div style="display:flex;align-items:center;gap:0;margin-bottom:var(--space-3);">';
    stageLabels.forEach(function(label, i) {
      var cls = i < currentIdx ? 'completed' : i === currentIdx ? 'active' : '';
      pipelineHtml += '<div class="app-step ' + cls + '"><div class="app-dot"></div><span>' + label + '</span></div>';
      if (i < stageLabels.length - 1) {
        var lineCls = i < currentIdx ? 'completed' : i === currentIdx ? 'active' : '';
        pipelineHtml += '<div class="app-line ' + lineCls + '"></div>';
      }
    });
    pipelineHtml += '</div>';

    // Status labels
    var statusHtml = '<div style="display:flex;gap:var(--space-4);flex-wrap:wrap;font-size:var(--text-xs);color:var(--text-tertiary);">';
    if (p.visa_status && p.visa_status !== 'not_started') {
      var visaColor = p.visa_status === 'approved' ? 'var(--primary)' : p.visa_status === 'denied' ? 'var(--error)' : 'var(--accent-amber)';
      statusHtml += '<span>Visa: <strong style="color:' + visaColor + '">' + getVisaLabel(p.visa_status) + '</strong></span>';
    }
    if (p.contract_status && p.contract_status !== 'not_started') {
      statusHtml += '<span>Contract: <strong>' + getContractLabel(p.contract_status) + '</strong></span>';
    }
    if (p.start_date) {
      statusHtml += '<span>Start: <strong>' + new Date(p.start_date).toLocaleDateString() + '</strong></span>';
    }
    statusHtml += '</div>';

    // Onboarding progress bar
    var checklistHtml = '';
    if (p.stage === 'onboarding') {
      var items = window._myChecklist[p.id] || [];
      if (items.length > 0) {
        var done = items.filter(function(i) { return i.is_completed; }).length;
        var pct = Math.round((done / items.length) * 100);
        checklistHtml = '<div style="margin-top:var(--space-3);">' +
          '<div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;">' +
            '<span style="color:var(--text-tertiary);">Onboarding Progress</span>' +
            '<span style="color:var(--primary);font-weight:600;">' + pct + '%</span>' +
          '</div>' +
          '<div style="height:6px;background:var(--bg-elevated);border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:var(--primary);border-radius:3px;transition:width 0.3s;"></div>' +
          '</div>' +
        '</div>';
      }
    }

    return pipelineHtml + statusHtml + checklistHtml;
  }

  function getStageLabel(s) {
    var labels = { offer_extended:'Offer Extended', offer_accepted:'Offer Accepted', visa_processing:'Visa Processing', contract:'Contract', onboarding:'Onboarding', active:'Active', completed:'Completed', terminated:'Terminated' };
    return labels[s] || s;
  }

  function getVisaLabel(s) {
    var labels = { not_started:'Not Started', documents_submitted:'Docs Submitted', in_review:'In Review', approved:'Approved', denied:'Denied', not_required:'Not Required' };
    return labels[s] || s;
  }

  function getContractLabel(s) {
    var labels = { not_started:'Not Started', draft:'Draft', sent:'Sent', signed:'Signed', countersigned:'Countersigned' };
    return labels[s] || s;
  }

  // ── Opportunities tab ──
  async function loadOpportunities() {
    var listEl = document.getElementById('opportunities-list');
    if (!listEl) return;

    var { data: opps, error } = await ghFrom('my_opportunities')
      .select('*')
      .eq('applicant_id', currentUser.id)
      .order('match_score', { ascending: false });

    // Update badge
    var badge = document.getElementById('opportunities-badge');
    var countBadge = document.getElementById('opp-count-badge');
    var unresponded = opps ? opps.filter(o => !o.response).length : 0;

    if (badge) {
      badge.textContent = unresponded;
      badge.style.display = unresponded > 0 ? '' : 'none';
    }
    if (countBadge) {
      countBadge.textContent = (opps?.length || 0) + ' opportunities';
    }

    if (error || !opps || opps.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);"><p>No opportunities yet. When recruiters match your profile, opportunities will appear here.</p></div>';
      return;
    }

    listEl.innerHTML = opps.map(function(opp) {
      var scoreClass = opp.match_score >= 70 ? 'high' : opp.match_score >= 40 ? 'medium' : 'low';
      var scoreColor = opp.match_score >= 70 ? 'var(--primary)' : opp.match_score >= 40 ? 'var(--accent-amber)' : 'var(--accent-coral)';

      var responseHtml = '';
      var placementHtml = '';
      if (opp.response) {
        // Check if there's a placement for this match
        var matchPlacement = window._myPlacements[opp.match_id];
        if (matchPlacement && opp.response === 'interested') {
          responseHtml = '<span class="stage-badge stage-' + matchPlacement.stage + '">' + getStageLabel(matchPlacement.stage) + '</span>';
          placementHtml = '<div style="margin-top:var(--space-3);padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">' + renderPlacementStatus(matchPlacement) + '</div>';
        } else {
          var respLabels = { interested: 'Interested', declined: 'Declined', maybe_later: 'Maybe Later' };
          var respColors = { interested: 'var(--primary)', declined: 'var(--accent-coral)', maybe_later: 'var(--accent-amber)' };
          responseHtml = '<span class="badge" style="background:' + respColors[opp.response] + '20;color:' + respColors[opp.response] + '">' + (respLabels[opp.response] || opp.response) + '</span>';
        }
      } else {
        responseHtml = `
          <div style="display:flex;gap:var(--space-2);">
            <button class="btn btn-primary btn-sm btn-opp-respond" data-match="${opp.match_id}" data-response="interested">Interested</button>
            <button class="btn btn-ghost btn-sm btn-opp-respond" data-match="${opp.match_id}" data-response="declined" style="color:var(--text-tertiary)">Decline</button>
            <button class="btn btn-ghost btn-sm btn-opp-respond" data-match="${opp.match_id}" data-response="maybe_later" style="color:var(--accent-amber)">Maybe</button>
          </div>`;
      }

      return `
        <div class="application-item" style="margin-bottom:var(--space-4);">
          <div class="application-header">
            <div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:var(--primary-muted);border:2px solid ${scoreColor};flex-shrink:0;">
              <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${scoreColor}">${opp.match_score}%</span>
            </div>
            <div class="application-info" style="flex:1">
              <h4>${opp.title || 'Opportunity'}</h4>
              <span>${opp.employer_name || 'Employer'} &middot; ${opp.destination_country || ''} ${opp.visa_sponsored ? '&middot; Visa Sponsored' : ''}</span>
            </div>
            ${opp.salary_display ? '<div class="application-salary">' + opp.salary_display + '</div>' : ''}
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:var(--space-3);padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
            <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${opp.positions || ''} positions &middot; ${opp.specialty || ''}</span>
            ${responseHtml}
          </div>
          ${placementHtml}
        </div>`;
    }).join('');

    // Bind response buttons
    listEl.querySelectorAll('.btn-opp-respond').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var matchId = btn.dataset.match;
        var response = btn.dataset.response;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';

        var { error } = await ghFrom('campaign_matches_write')
          .update({ response: response, responded_at: new Date().toISOString() })
          .eq('id', matchId);

        if (error) {
          alert('Failed to respond: ' + error.message);
          btn.disabled = false;
          btn.textContent = btn.dataset.response === 'interested' ? 'Interested' : btn.dataset.response === 'declined' ? 'Decline' : 'Maybe';
          return;
        }

        await loadOpportunities();
      });
    });
  }

  // ── Account Settings tab ──
  async function loadSettings() {
    var statusBadge = document.getElementById('settings-status-badge');
    var reasonContainer = document.getElementById('settings-reason-container');
    var reasonField = document.getElementById('settings-reason');

    var currentStatus = currentProfile.availability_status || 'active';
    var currentReason = currentProfile.deactivation_reason || '';

    // Set badge
    var badgeColors = { active: 'badge-primary', paused: 'badge-warning', closed: 'badge-error' };
    var badgeLabels = { active: 'Active', paused: 'Paused', closed: 'Closed' };
    if (statusBadge) {
      statusBadge.className = 'badge badge-dot ' + (badgeColors[currentStatus] || 'badge-primary');
      statusBadge.textContent = badgeLabels[currentStatus] || 'Active';
    }

    // Set radio
    var radio = document.querySelector('input[name="availability_status"][value="' + currentStatus + '"]');
    if (radio) radio.checked = true;

    // Highlight selected option border
    updateAvailabilityOptionBorders();

    // Set reason
    if (reasonField) reasonField.value = currentReason;

    // Show reason field for paused/closed
    if (reasonContainer) {
      reasonContainer.style.display = (currentStatus === 'paused' || currentStatus === 'closed') ? '' : 'none';
    }

    // Bind radio changes
    document.querySelectorAll('input[name="availability_status"]').forEach(function(r) {
      r.addEventListener('change', function() {
        if (reasonContainer) {
          reasonContainer.style.display = (r.value === 'paused' || r.value === 'closed') ? '' : 'none';
        }
        updateAvailabilityOptionBorders();
      });
    });

    // Bind update button
    var btn = document.getElementById('btn-update-availability');
    if (btn) {
      btn.addEventListener('click', updateAvailability);
    }
  }

  function updateAvailabilityOptionBorders() {
    var radios = document.querySelectorAll('input[name="availability_status"]');
    var borderColors = { active: 'var(--primary)', paused: 'var(--accent-amber)', closed: 'var(--accent-coral)' };
    radios.forEach(function(r) {
      var label = r.closest('.availability-option');
      if (label) {
        label.style.borderColor = r.checked ? (borderColors[r.value] || 'var(--primary)') : 'var(--border-default)';
      }
    });
  }

  async function updateAvailability() {
    var btn = document.getElementById('btn-update-availability');
    var msg = document.getElementById('settings-message');
    var radio = document.querySelector('input[name="availability_status"]:checked');
    var reason = document.getElementById('settings-reason')?.value?.trim() || null;

    if (!radio) return;
    var newStatus = radio.value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating...';

    var updates = {
      availability_status: newStatus,
      availability_changed_at: new Date().toISOString()
    };

    if (newStatus === 'paused' || newStatus === 'closed') {
      updates.deactivation_reason = reason;
    } else {
      updates.deactivation_reason = null;
    }

    var { error } = await ghFrom('profiles')
      .update(updates)
      .eq('id', currentUser.id);

    btn.disabled = false;
    btn.textContent = 'Update Status';

    if (msg) {
      if (error) {
        msg.textContent = 'Failed to update: ' + error.message;
        msg.style.background = 'rgba(255,92,92,0.1)';
        msg.style.color = 'var(--accent-coral)';
      } else {
        var successMsgs = {
          active: 'You\'re now active and eligible for new opportunities!',
          paused: 'Your profile is paused. You won\'t receive new outreach.',
          closed: 'Your profile is closed. You\'ve been removed from outreach.'
        };
        msg.textContent = successMsgs[newStatus] || 'Status updated.';
        msg.style.background = 'rgba(0,232,157,0.1)';
        msg.style.color = 'var(--primary)';
      }
      msg.style.display = 'block';
      setTimeout(function() { msg.style.display = 'none'; }, 4000);
    }

    if (!error) {
      currentProfile = { ...currentProfile, ...updates };
      // Update badge
      var badgeColors = { active: 'badge-primary', paused: 'badge-warning', closed: 'badge-error' };
      var badgeLabels = { active: 'Active', paused: 'Paused', closed: 'Closed' };
      var statusBadge = document.getElementById('settings-status-badge');
      if (statusBadge) {
        statusBadge.className = 'badge badge-dot ' + (badgeColors[newStatus] || 'badge-primary');
        statusBadge.textContent = badgeLabels[newStatus] || 'Active';
      }
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ── Messages tab ──
  function escHtml(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  async function loadMessages() {
    var threadEl = document.getElementById('messages-thread');
    if (!threadEl) return;

    var { data: messages, error } = await ghFrom('messages')
      .select('id, direction, subject, body, sent_at')
      .eq('applicant_id', currentUser.id)
      .order('sent_at', { ascending: true });

    messages = messages || [];

    // Update badge
    var unread = messages.filter(function (m) { return m.direction === 'outbound'; }).length;
    var badge = document.getElementById('messages-badge');
    if (badge) {
      badge.textContent = messages.length;
      badge.style.display = messages.length > 0 ? '' : 'none';
    }

    if (messages.length === 0) {
      threadEl.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No messages yet. You can send us a message below and our team will respond.</div>';
    } else {

    threadEl.innerHTML = messages.map(function (m) {
      var isOut = m.direction === 'outbound';
      var timeStr = m.sent_at ? new Date(m.sent_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      var align = isOut ? 'flex-end' : 'flex-start';
      var bubbleBg = isOut ? 'background:#EFF6FF;border:1px solid #BFDBFE;' : 'background:var(--bg-surface);border:1px solid var(--border-subtle);';
      var radius = isOut ? 'border-radius:14px 14px 4px 14px;' : 'border-radius:14px 14px 14px 4px;';
      var label = isOut
        ? '<span style="font-size:10px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.05em;">Recruitment Team</span>'
        : '<span style="font-size:10px;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.05em;">You</span>';

      return '<div style="display:flex;justify-content:' + align + ';">' +
        '<div style="' + bubbleBg + radius + 'padding:12px 16px;max-width:85%;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:5px;">' +
            label +
            '<span style="font-size:10px;color:var(--text-tertiary);white-space:nowrap;">' + timeStr + '</span>' +
          '</div>' +
          (m.subject ? '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">' + escHtml(m.subject) + '</div>' : '') +
          '<div style="font-size:14px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;">' + escHtml(m.body) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Scroll to bottom
    threadEl.scrollTop = threadEl.scrollHeight;
    }

    // Bind reply button
    var sendBtn = document.getElementById('portal-reply-send');
    var bodyInput = document.getElementById('portal-reply-body');
    if (sendBtn && !sendBtn._bound) {
      sendBtn._bound = true;
      sendBtn.addEventListener('click', async function () {
        var body = (bodyInput && bodyInput.value.trim()) || '';
        if (!body) { alert('Please write a message before sending.'); return; }

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Sending...';

        try {
          var session = await GHAuth.getSession();
          if (!session) throw new Error('Not authenticated');

          var resp = await fetch(SUPABASE_URL + '/functions/v1/send-reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + session.access_token
            },
            body: JSON.stringify({ body: body })
          });

          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Send failed');

          if (bodyInput) bodyInput.value = '';
          sendBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Sent!';
          sendBtn.style.background = 'var(--success)';

          // Reload thread
          await loadMessages();

          setTimeout(function () {
            sendBtn.style.background = '';
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Reply';
            sendBtn._bound = false;
          }, 3000);

        } catch (err) {
          alert('Failed to send: ' + (err.message || 'Unknown error'));
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Reply';
        }
      });
    }
  }

  // ── Helper: switch to tab ──
  function switchToTab(tabId) {
    var navItems = document.querySelectorAll('.portal-nav-item[data-tab]');
    var tabs = document.querySelectorAll('.portal-tab');
    navItems.forEach(function(n) {
      n.classList.toggle('active', n.dataset.tab === tabId);
    });
    tabs.forEach(function(t) {
      t.classList.toggle('active', t.id === tabId);
    });
  }
  window.switchToTab = switchToTab;

  // ── Helper: show portal toast ──
  function showPortalToast(msg) {
    var toast = document.getElementById('portal-toast');
    var msgEl = document.getElementById('portal-toast-msg');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.style.display = 'none'; }, 4000);
  }

  // ── Helper: close apply modal ──
  function closeApplyModal() {
    var modal = document.getElementById('apply-modal-overlay');
    if (modal) modal.remove();
  }

  // ── Check ?apply= URL param ──
  async function checkApplyParam() {
    var params = new URLSearchParams(window.location.search);
    var campaignId = params.get('apply');
    if (!campaignId) return;

    // Clean URL immediately
    history.replaceState(null, '', window.location.pathname);

    // Check if already applied
    var { data: existing } = await ghFrom('my_applications')
      .select('id')
      .eq('applicant_id', currentUser.id)
      .eq('campaign_id', campaignId);

    if (existing && existing.length > 0) {
      showPortalToast('You have already applied to this position.');
      switchToTab('tab-applications');
      return;
    }

    // Fetch campaign details
    var { data: campaign, error } = await ghFrom('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      showPortalToast('This position is no longer available.');
      return;
    }

    showApplyModal(campaign);
  }

  // ── Application Modal ──
  function showApplyModal(campaign) {
    // Remove existing modal if any
    closeApplyModal();

    var initial = (campaign.employer_name || '?').charAt(0).toUpperCase();

    // Profile readiness
    var profileComplete = currentProfile.profile_completed;
    var hasDocs = false; // We check from dashboard checklist data
    var docsEl = document.querySelectorAll('.checklist-item.done');
    var totalDocs = docsEl ? docsEl.length : 0;

    var readinessHtml = '';
    if (!profileComplete) {
      readinessHtml = '<div style="background:rgba(255,176,32,0.1);border:1px solid var(--accent-amber);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);font-size:var(--text-sm);">' +
        '<div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<strong style="color:var(--accent-amber);">Profile Incomplete</strong>' +
        '</div>' +
        '<p style="color:var(--text-secondary);margin-bottom:var(--space-2);">Your profile is not yet complete. We recommend completing it before applying for the best chances.</p>' +
        '<button class="btn btn-ghost btn-sm" id="apply-modal-complete-profile" style="color:var(--accent-amber);border-color:var(--accent-amber);">Complete Profile</button>' +
      '</div>';
    }

    var overlay = document.createElement('div');
    overlay.id = 'apply-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:var(--space-4);';

    overlay.innerHTML =
      '<div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-xl);max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:var(--space-6);" id="apply-modal-card">' +
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-5);">' +
          '<div>' +
            '<h2 style="font-family:var(--font-display);font-size:var(--text-xl);font-weight:800;margin-bottom:var(--space-1);">Apply to Position</h2>' +
            '<p style="font-size:var(--text-sm);color:var(--text-tertiary);">Review the details and confirm your application.</p>' +
          '</div>' +
          '<button class="btn btn-icon btn-ghost" id="apply-modal-close" style="width:32px;height:32px;flex-shrink:0;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +

        // Campaign summary
        '<div style="background:var(--bg-elevated);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-4);">' +
          '<div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">' +
            '<div style="background:var(--primary-muted);color:var(--primary);width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0;">' + initial + '</div>' +
            '<div>' +
              '<h3 style="font-size:var(--text-base);font-weight:700;">' + escapeHtml(campaign.title) + '</h3>' +
              '<span style="font-size:var(--text-sm);color:var(--text-tertiary);">' + escapeHtml(campaign.employer_name || '') + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:var(--space-3);font-size:var(--text-xs);color:var(--text-tertiary);">' +
            (campaign.destination_country ? '<span>&#127758; ' + escapeHtml(campaign.destination_country) + '</span>' : '') +
            (campaign.salary_display ? '<span>&#128176; ' + escapeHtml(campaign.salary_display) + '</span>' : '') +
            (campaign.visa_sponsored ? '<span style="color:var(--primary);">&#9989; Visa Sponsored</span>' : '') +
            (campaign.specialty ? '<span>&#127973; ' + escapeHtml(campaign.specialty) + '</span>' : '') +
          '</div>' +
        '</div>' +

        // Readiness warning
        readinessHtml +

        // Cover note
        '<div style="margin-bottom:var(--space-4);">' +
          '<label style="font-size:var(--text-sm);font-weight:600;color:var(--text-secondary);display:block;margin-bottom:var(--space-2);">Cover Note (optional)</label>' +
          '<textarea id="apply-cover-note" class="form-input" rows="3" placeholder="Introduce yourself or add a note to the employer..." style="width:100%;resize:vertical;"></textarea>' +
        '</div>' +

        // Submit button
        '<button class="btn btn-primary" id="apply-modal-submit" style="width:100%;">' +
          'Confirm Application' +
        '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    // Bind events
    document.getElementById('apply-modal-close').addEventListener('click', closeApplyModal);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeApplyModal();
    });

    var completeBtn = document.getElementById('apply-modal-complete-profile');
    if (completeBtn) {
      completeBtn.addEventListener('click', function() {
        closeApplyModal();
        switchToTab('tab-profile');
      });
    }

    document.getElementById('apply-modal-submit').addEventListener('click', function() {
      submitApplication(campaign.id);
    });
  }

  // ── Submit Application ──
  async function submitApplication(campaignId) {
    var btn = document.getElementById('apply-modal-submit');
    var coverNote = (document.getElementById('apply-cover-note')?.value || '').trim();

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Submitting...';

    var insertData = {
      campaign_id: campaignId,
      applicant_id: currentUser.id
    };
    if (coverNote) insertData.cover_note = coverNote;

    var { error } = await ghFrom('campaign_applications')
      .insert(insertData);

    if (error) {
      // Handle duplicate (unique constraint violation)
      if (error.code === '23505') {
        closeApplyModal();
        showPortalToast('You have already applied to this position.');
        switchToTab('tab-applications');
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Confirm Application';
      showPortalToast('Failed to submit: ' + error.message);
      return;
    }

    closeApplyModal();
    showPortalToast('Application submitted successfully!');
    await loadMyApplications();
    switchToTab('tab-applications');
  }

  // ── Load My Applications ──
  async function loadMyApplications() {
    var listEl = document.getElementById('applications-list');
    if (!listEl) return;

    var { data: apps, error } = await ghFrom('my_applications')
      .select('*')
      .eq('applicant_id', currentUser.id)
      .order('applied_at', { ascending: false });

    // Update count badge
    var countBadge = document.getElementById('applications-count');
    var activeCount = apps ? apps.filter(function(a) {
      return a.status !== 'rejected' && a.status !== 'withdrawn';
    }).length : 0;

    if (countBadge) {
      countBadge.textContent = activeCount + ' active';
    }

    if (error || !apps || apps.length === 0) {
      listEl.innerHTML =
        '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="opacity:0.4;margin-bottom:var(--space-3);">' +
            '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>' +
          '</svg>' +
          '<p style="margin-bottom:var(--space-3);">No applications yet.</p>' +
          '<a href="jobs.html" class="btn btn-primary btn-sm">Browse Jobs</a>' +
        '</div>';
      return;
    }

    var stages = ['applied', 'screening', 'interview', 'offer', 'placed'];
    var stageLabels = ['Applied', 'Screening', 'Interview', 'Offer', 'Placed'];

    listEl.innerHTML = apps.map(function(app) {
      var initial = (app.employer_name || '?').charAt(0).toUpperCase();
      var appliedDate = new Date(app.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      var currentStageIdx = stages.indexOf(app.status);
      if (currentStageIdx === -1) currentStageIdx = 0; // fallback for rejected/withdrawn

      var isTerminal = app.status === 'rejected' || app.status === 'withdrawn';

      // Build pipeline
      var pipelineHtml = '<div class="application-pipeline">';
      stages.forEach(function(stage, i) {
        var cls = '';
        if (!isTerminal) {
          if (i < currentStageIdx) cls = 'completed';
          else if (i === currentStageIdx) cls = 'active';
        } else {
          if (i === 0) cls = 'completed'; // At least applied
        }
        pipelineHtml += '<div class="app-step ' + cls + '"><div class="app-dot"></div><span>' + stageLabels[i] + '</span></div>';
        if (i < stages.length - 1) {
          var lineCls = '';
          if (!isTerminal) {
            if (i < currentStageIdx) lineCls = 'completed';
            else if (i === currentStageIdx) lineCls = 'active';
          }
          pipelineHtml += '<div class="app-line ' + lineCls + '"></div>';
        }
      });
      pipelineHtml += '</div>';

      // Status badge for rejected/withdrawn
      var statusBadge = '';
      if (isTerminal) {
        var badgeColor = app.status === 'rejected' ? 'var(--accent-coral)' : 'var(--accent-amber)';
        var badgeLabel = app.status === 'rejected' ? 'Rejected' : 'Withdrawn';
        statusBadge = '<span style="font-size:var(--text-xs);padding:2px 8px;border-radius:var(--radius-sm);background:' + badgeColor + '20;color:' + badgeColor + ';font-weight:600;">' + badgeLabel + '</span>';
      }

      return '<div class="application-item">' +
        '<div class="application-header">' +
          '<div class="job-employer-logo" style="background:var(--primary-muted);color:var(--primary);width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">' + initial + '</div>' +
          '<div class="application-info">' +
            '<h4>' + escapeHtml(app.campaign_title || 'Position') + '</h4>' +
            '<span>' + escapeHtml(app.employer_name || '') + (app.destination_country ? ' &middot; ' + escapeHtml(app.destination_country) : '') + ' &middot; Applied ' + appliedDate + '</span>' +
          '</div>' +
          (app.salary_display ? '<div class="application-salary">' + escapeHtml(app.salary_display) + '</div>' : '') +
          statusBadge +
        '</div>' +
        pipelineHtml +
      '</div>';
    }).join('');
  }

  // ── HTML escape helper ──
  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
})();
