/* ============================================
   GLOBALHIRE@ELAB — Recruiter Portal
   Assigned candidates, read-only docs, notes
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var currentUser = null;
  var currentProfile = null;
  var allAssigned = [];

  var DOC_LABELS = {
    license: 'Professional License', degree: 'Degree / Certificate',
    passport: 'Passport', cv: 'CV / Resume',
    passport_photo: 'Passport Photo', police_report: 'Police Character Report',
    travel_insurance: 'Travel Insurance'
  };

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
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

    allAssigned = (profiles || []).map(function (p) {
      return Object.assign({}, p, {
        docs: (docs || []).filter(function (d) { return d.applicant_id === p.id; })
      });
    });

    // Update count badge
    var countEl = document.getElementById('assigned-count');
    if (countEl) { countEl.textContent = allAssigned.length; countEl.style.display = ''; }

    renderCandidates(allAssigned);
  }

  function renderCandidates(list) {
    var grid = document.getElementById('candidates-grid');
    if (list.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);grid-column:1/-1;">No candidates match your search.</div>';
      return;
    }

    grid.innerHTML = list.map(function (p) {
      var colors = GHE.avatarColors[p.avatar_color_index || 0];
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

      return '<div class="candidate-card" data-id="' + p.id + '">' +
        '<div class="candidate-card-header">' +
          '<div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + esc(p.avatar_initials || '??') + '</div>' +
          '<div class="candidate-card-info">' +
            '<div class="cname">' + esc(p.full_name || 'Unnamed') + '</div>' +
            '<div class="cspecialty">' + esc(p.specialty || 'No specialty') + ' · ' + esc(p.country_of_origin || '—') + '</div>' +
          '</div>' +
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

  // ── Search ──
  function bindSearch() {
    var input = document.getElementById('candidate-search');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      if (!q) { renderCandidates(allAssigned); return; }
      renderCandidates(allAssigned.filter(function (p) {
        return (p.full_name + ' ' + p.specialty + ' ' + p.country_of_origin).toLowerCase().includes(q);
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
    if (!candidate) { panelBodyEl.innerHTML = '<p style="color:var(--error);padding:var(--space-4);">Candidate not found.</p>'; return; }

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

    // Header
    html += '<div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-6);">';
    html += '<div class="avatar" style="width:52px;height:52px;font-size:var(--text-xl);background:' + colors[0] + ';color:' + colors[1] + '">' + esc(candidate.avatar_initials || '??') + '</div>';
    html += '<div><div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">' + esc(candidate.full_name || 'Unnamed') + '</div>';
    html += '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">' + esc(candidate.specialty || 'No specialty') + '</div></div>';
    html += '</div>';

    // Info grid
    var fields = [
      { label: 'Country', value: candidate.country_of_origin },
      { label: 'Experience', value: candidate.years_of_experience != null ? candidate.years_of_experience + ' yrs' : null },
      { label: 'Phone', value: candidate.phone },
      { label: 'License No.', value: candidate.license_number },
    ];
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-5);">';
    fields.forEach(function (f) {
      html += '<div style="padding:var(--space-2) var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">';
      html += '<div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:2px;">' + f.label + '</div>';
      html += '<div style="font-size:var(--text-sm);color:var(--text-primary);font-weight:500;">' + esc(f.value || '—') + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Preferred destinations
    if (candidate.preferred_destinations && candidate.preferred_destinations.length > 0) {
      html += '<div style="margin-bottom:var(--space-5);">';
      html += '<div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:var(--space-2);">Preferred Destinations</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">';
      candidate.preferred_destinations.forEach(function (d) { html += '<span class="tag">' + esc(d) + '</span>'; });
      html += '</div></div>';
    }

    // Documents (read-only)
    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);margin-bottom:var(--space-5);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">Documents (' + docs.length + ')</div>';
    if (docs.length === 0) {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No documents uploaded yet.</p>';
    } else {
      var statusMap = { pending: { c: 'var(--warning)', l: 'Pending' }, in_review: { c: 'var(--info)', l: 'In Review' }, verified: { c: 'var(--success)', l: 'Verified' }, rejected: { c: 'var(--error)', l: 'Rejected' } };
      docs.forEach(function (d) {
        var st = statusMap[d.status] || statusMap.pending;
        var label = DOC_LABELS[d.doc_type] || d.doc_type || 'Document';
        html += '<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-2);">';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">' + esc(label) + '</div>';
        html += '<div style="font-size:11px;color:var(--text-tertiary);">' + esc(d.file_name || '') + '</div>';
        html += '</div>';
        html += '<span style="font-size:11px;font-weight:600;color:' + st.c + ';">' + st.l + '</span>';
        if (d.file_path) {
          html += '<button class="btn btn-ghost btn-sm btn-dl" data-path="' + esc(d.file_path) + '" style="font-size:11px;padding:2px 8px;">View</button>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    // Notes
    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:var(--space-5);">';
    html += '<div style="font-size:var(--text-base);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">My Notes</div>';
    if (notes.length > 0) {
      notes.forEach(function (n) {
        var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        html += '<div style="padding:var(--space-3);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-2);">';
        html += '<div style="font-size:var(--text-sm);color:var(--text-primary);white-space:pre-wrap;">' + esc(n.note) + '</div>';
        html += '<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">' + dateStr + '</div>';
        html += '</div>';
      });
    } else {
      html += '<p style="color:var(--text-tertiary);font-size:var(--text-sm);margin-bottom:var(--space-3);">No notes yet.</p>';
    }

    // Add note form
    html += '<textarea id="note-input" rows="3" placeholder="Add a private note about this candidate..." style="width:100%;padding:var(--space-3);font-size:var(--text-sm);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);resize:vertical;font-family:inherit;box-sizing:border-box;margin-top:var(--space-2);"></textarea>';
    html += '<button id="btn-add-note" class="btn btn-secondary btn-sm" data-cid="' + candidateId + '" style="margin-top:var(--space-2);">Save Note</button>';
    html += '</div>';

    panelBodyEl.innerHTML = html;

    // Bind document view buttons
    panelBodyEl.querySelectorAll('.btn-dl').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var { data } = await sb.storage.from('gh-applicant-documents').createSignedUrl(btn.dataset.path, 3600);
        if (data && data.signedUrl) { window.open(data.signedUrl, '_blank'); }
        else { alert('Could not open document.'); }
      });
    });

    // Bind add note
    var noteBtn = document.getElementById('btn-add-note');
    var noteInput = document.getElementById('note-input');
    if (noteBtn) {
      noteBtn.addEventListener('click', async function () {
        var noteText = noteInput && noteInput.value.trim();
        if (!noteText) { alert('Please write a note first.'); return; }
        noteBtn.disabled = true;
        noteBtn.textContent = 'Saving...';

        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/manage-recruiter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: 'add_note', applicant_id: candidateId, note: noteText })
          });
          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Failed');

          // Re-open panel to refresh notes
          await openCandidatePanel(candidateId);
        } catch (err) {
          alert('Failed to save note: ' + err.message);
          noteBtn.disabled = false;
          noteBtn.textContent = 'Save Note';
        }
      });
    }
  }

  // ── Load all notes ──
  async function loadNotes() {
    var list = document.getElementById('notes-list');

    var { data: notes } = await ghFrom('recruiter_notes')
      .select('id, applicant_id, note, created_at')
      .eq('recruiter_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (!notes || notes.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:var(--space-12);color:var(--text-tertiary);">No notes yet. Add notes while viewing a candidate\'s profile.</div>';
      return;
    }

    list.innerHTML = notes.map(function (n) {
      var candidate = allAssigned.find(function (p) { return p.id === n.applicant_id; });
      var name = candidate ? esc(candidate.full_name) : 'Unknown candidate';
      var dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return '<div style="padding:var(--space-4);background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);margin-bottom:var(--space-3);">' +
        '<div style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:var(--space-2);">' + name + '</div>' +
        '<div style="font-size:var(--text-sm);color:var(--text-primary);white-space:pre-wrap;">' + esc(n.note) + '</div>' +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:var(--space-2);">' + dateStr + '</div>' +
        '</div>';
    }).join('');
  }

})();
