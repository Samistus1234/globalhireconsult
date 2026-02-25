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
      await loadOpportunities();
    } catch (err) { console.error('Opportunities load error:', err); }
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
    // Completion checklist
    const checks = {
      profile: currentProfile.profile_completed,
      license: false, degree: false, passport: false, cv: false
    };

    const { data: docs } = await ghFrom('documents')
      .select('doc_type, status')
      .eq('applicant_id', currentUser.id);

    if (docs) {
      docs.forEach(d => { checks[d.doc_type] = true; });
    }

    const totalSteps = 5;
    const completedSteps = Object.values(checks).filter(Boolean).length;
    const pct = Math.round((completedSteps / totalSteps) * 100);

    // Update progress bar
    const progressFill = document.getElementById('completion-fill');
    const progressText = document.getElementById('completion-pct');
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressText) progressText.textContent = pct + '%';

    // Checklist items
    const checklistEl = document.getElementById('completion-checklist');
    if (checklistEl) {
      const items = [
        { key: 'profile', label: 'Complete your profile' },
        { key: 'license', label: 'Upload professional license' },
        { key: 'degree', label: 'Upload degree certificate' },
        { key: 'passport', label: 'Upload passport copy' },
        { key: 'cv', label: 'Upload CV / Resume' }
      ];
      checklistEl.innerHTML = items.map(i => `
        <div class="checklist-item ${checks[i.key] ? 'done' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            ${checks[i.key]
              ? '<path d="m5 12 5 5L20 7"/>'
              : '<circle cx="12" cy="12" r="10"/>'
            }
          </svg>
          <span>${i.label}</span>
        </div>
      `).join('');
    }

    // Pipeline status
    const stages = ['applied', 'screening', 'verifying', 'verified'];
    const stageLabels = ['Applied', 'Profile Complete', 'Documents Uploaded', 'Under Review'];
    let currentStage = 'applied';
    if (currentProfile.profile_completed && completedSteps >= 5) currentStage = 'verifying';
    else if (currentProfile.profile_completed) currentStage = 'screening';
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
      if (opp.response) {
        var respLabels = { interested: 'Interested', declined: 'Declined', maybe_later: 'Maybe Later' };
        var respColors = { interested: 'var(--primary)', declined: 'var(--accent-coral)', maybe_later: 'var(--accent-amber)' };
        responseHtml = '<span class="badge" style="background:' + respColors[opp.response] + '20;color:' + respColors[opp.response] + '">' + (respLabels[opp.response] || opp.response) + '</span>';
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
        </div>`;
    }).join('');

    // Bind response buttons
    listEl.querySelectorAll('.btn-opp-respond').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var matchId = btn.dataset.match;
        var response = btn.dataset.response;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';

        var { error } = await ghFrom('campaign_matches')
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

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
})();
