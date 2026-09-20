/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: admin job board
   Loaded after js/mp-core.js on admin-mp-jobs.html.

   Reads: public.gh_mp_jobs (via MP.mpFrom('jobs')).
   Writes: supabase/functions/mp-job-write (via MP.callFn) — admin-only,
   server sets posted_by/published_at, rejects unparseable numerics with a
   400 naming the field (see mp-job-write's parseNum()).

   Admins have NO agency membership: MP.init() resolves MP.status to
   'no_agency' for staff (same as every other admin mp-*-admin.js page —
   see js/mp-messages-admin.js). Do NOT call MP.requireAgency()/
   requireVerified() here — they would redirect staff to the partner
   signup flow. The real gate is js/auth-guard.js via
   <body data-auth-role="admin">. MP.mpFrom() needs no membership and is
   safe to call once MP.init() has resolved MP.user.

   Escaping (see js/mp-core.js MP.esc / MP.escAttr / MP.safeHref contract
   comment) — the LIST TABLE is built as one innerHTML string (matches the
   house pattern in js/mp-agencies-admin.js renderTable()):
   - job.title, job.employer_name, job.destination_country, job.city,
     job.specialty are all staff-entered free text rendered as element
     TEXT content → MP.esc().
   - job.id lands in a data-* ATTRIBUTE value on the row/buttons →
     MP.escAttr().
   - job.status is server-enum-constrained (CHECK on globalhire.mp_jobs)
     but is still run through MP.esc() for defense in depth before it's
     used as TEXT content and as a CSS class-name suffix (never as raw
     HTML) — a class-name lookup keyed off it is safelisted against a
     fixed lookup table, never built by concatenating the raw value into
     a selector or attribute.

   The CREATE/EDIT DRAWER takes a different, stricter approach: the drawer
   shell (labels, empty inputs, selects with hardcoded <option> markup) is
   injected once as a static string with NO interpolated job data at all.
   Every job value (title, employer_name, jd_text, city, ... — all of
   spec §6.1's free-text fields) is then written into the form via direct
   DOM property assignment (`el.value = job.title || ''`, `el.checked =
   !!job.employer_confidential`). Property assignment never parses its
   argument as markup, so this is safe regardless of content and needs no
   escaping helper at all — it sidesteps the attribute-escaping question
   that a `value="..."` string-interpolation approach would raise for
   every one of these fields. The one exception is the drawer heading,
   which uses `.textContent` (also inherently safe, no HTML parsing).
   ============================================ */
(function () {
  var listEl = document.getElementById('mp-job-list');
  var drawer = document.getElementById('mp-job-drawer');
  var filter = document.getElementById('mp-job-filter');
  var newBtn = document.getElementById('mp-job-new');
  if (!listEl || !drawer || !filter || !newBtn) return;

  var adminProfile = null;

  // Fields the admin form (and the quick publish/pause/close actions) may
  // send to mp-job-write. Mirrors supabase/functions/mp-job-write/index.ts
  // JobFields exactly, minus id/posted_by/published_at/created_at/updated_at
  // (server-managed — see that function's field-by-field validateJobBody()).
  var JOB_FIELDS = [
    'title', 'employer_name', 'employer_confidential', 'destination_country', 'city',
    'specialty', 'subspecialty', 'seniority_level', 'contract_type', 'facility_type',
    'positions_count', 'salary_min', 'salary_max', 'salary_currency', 'salary_display',
    'benefits', 'jd_text', 'status', 'placement_fee_amount', 'placement_fee_currency',
    'partner_split_pct', 'source', 'origin_campaign_id', 'min_experience_years',
    'required_licences', 'required_exams', 'nationality_prefs', 'gender_pref',
    'age_min', 'age_max', 'language_reqs', 'extra_criteria', 'closes_at'
  ];

  function esc(s) { return window.MP.esc(s); }
  function escAttr(s) { return window.MP.escAttr(s); }

  // Picks the writable job fields off a full gh_mp_jobs row, so a quick
  // status change (publish/pause/close) or an edit-drawer save resends the
  // COMPLETE row rather than a partial one. mp-job-write's upsert sets
  // every column validateJobBody() returns — a field left out of the
  // request body would come back as null in the value object and
  // OVERWRITE the stored value, not leave it untouched. This is why quick
  // actions can't just POST {id, status}.
  function pickJobFields(job) {
    var out = {};
    JOB_FIELDS.forEach(function (k) { out[k] = job[k]; });
    return out;
  }

  function statusClass(status) {
    var map = {
      open: 'job-status-open', draft: 'job-status-draft', paused: 'job-status-paused',
      filled: 'job-status-filled', closed: 'job-status-closed'
    };
    return map[status] || 'job-status-draft';
  }

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await window.MP.init(); // resolves MP.user; MP.status stays 'no_agency' for admins — expected, not an error.
    filter.addEventListener('change', load);
    newBtn.addEventListener('click', function () { openDrawer(null); });
    listEl.addEventListener('click', onListClick);
    await load();
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
    var signOutBtn = document.getElementById('admin-signout');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', function (ev) { ev.preventDefault(); GHAuth.signOut(); });
    }
  }

  function actionButtons(job) {
    var btns = ['<button type="button" class="btn btn-ghost btn-sm mp-job-edit" data-id="' + escAttr(job.id) + '">Edit</button>'];
    if (job.status === 'draft' || job.status === 'paused') {
      btns.push('<button type="button" class="btn btn-primary btn-sm mp-job-status" data-id="' + escAttr(job.id) + '" data-status="open">Publish</button>');
    }
    if (job.status === 'open') {
      btns.push('<button type="button" class="btn btn-ghost btn-sm mp-job-status" data-id="' + escAttr(job.id) + '" data-status="paused">Pause</button>');
    }
    if (job.status === 'open' || job.status === 'paused' || job.status === 'filled') {
      btns.push('<button type="button" class="btn btn-ghost btn-sm mp-job-status" data-id="' + escAttr(job.id) + '" data-status="closed">Close</button>');
    }
    return '<div class="job-actions">' + btns.join('') + '</div>';
  }

  function renderTable(rows) {
    var head = '<thead><tr><th>Title</th><th>Employer</th><th>Location</th><th>Specialty</th><th>Status</th><th>Positions</th><th>Updated</th><th>Actions</th></tr></thead>';
    if (!rows.length) {
      return '<div class="panel"><div class="panel-body-flush"><table class="job-table">' + head +
        '<tbody><tr><td colspan="8" style="text-align:center;padding:var(--space-10);color:var(--text-tertiary);">No jobs match this filter.</td></tr></tbody></table></div></div>';
    }
    var body = rows.map(function (j) {
      var updated = j.updated_at ? String(j.updated_at).slice(0, 10) : '—';
      var location = [j.city, j.destination_country].filter(Boolean).join(', ') || '—';
      // j.title / j.employer_name / j.city / j.destination_country / j.specialty are all
      // staff-entered free text rendered here as element TEXT content → esc().
      // j.id lands in data-* ATTRIBUTE values on the row and every action button → escAttr().
      var employerCell = j.employer_name ? esc(j.employer_name) : '—';
      if (j.employer_confidential) employerCell += '<span class="job-confidential-tag">confidential</span>';
      return '<tr data-id="' + escAttr(j.id) + '">' +
        '<td>' + esc(j.title) + '</td>' +
        '<td>' + employerCell + '</td>' +
        '<td>' + esc(location) + '</td>' +
        '<td>' + esc(j.specialty || '—') + '</td>' +
        '<td><span class="job-status-pill ' + statusClass(j.status) + '">' + esc(j.status) + '</span></td>' +
        '<td>' + esc(String(j.positions_count == null ? 1 : j.positions_count)) + '</td>' +
        '<td>' + esc(updated) + '</td>' +
        '<td>' + actionButtons(j) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="panel-body-flush"><table class="job-table">' + head + '<tbody>' + body + '</tbody></table></div></div>';
  }

  async function load() {
    var qy = window.MP.mpFrom('jobs').select('*').order('updated_at', { ascending: false });
    if (filter.value !== 'all') qy = qy.eq('status', filter.value);
    var r = await qy;
    if (r.error) {
      listEl.innerHTML = '<div class="panel" style="padding:var(--space-6);color:#EF4444;">Error: ' + esc(r.error.message) + '</div>';
      return;
    }
    listEl.innerHTML = renderTable(r.data || []);
  }

  async function onListClick(ev) {
    var editBtn = ev.target.closest('.mp-job-edit');
    if (editBtn) { openDrawer(editBtn.getAttribute('data-id')); return; }
    var statusBtn = ev.target.closest('.mp-job-status');
    if (statusBtn) {
      var id = statusBtn.getAttribute('data-id');
      var newStatus = statusBtn.getAttribute('data-status');
      statusBtn.disabled = true;
      var r = await window.MP.mpFrom('jobs').select('*').eq('id', id).single();
      if (r.error || !r.data) {
        window.alert('Could not load the job: ' + (r.error ? r.error.message : 'not found'));
        statusBtn.disabled = false;
        return;
      }
      var payload = pickJobFields(r.data);
      payload.id = id;
      payload.status = newStatus;
      var out = await window.MP.callFn('mp-job-write', payload);
      statusBtn.disabled = false;
      if (!out.ok) {
        // Surface the exact 400 text (e.g. "salary_min must be a number") — never a generic
        // "failed" message. A quick status change resends the whole row (see pickJobFields()
        // above), so a stale/invalid value on a field the admin never touched today can still
        // block the status change, and the admin needs to know WHICH field to fix.
        window.alert((out.data && out.data.error) ? out.data.error : ('Failed — HTTP ' + out.status));
        return;
      }
      await load();
    }
  }

  // ── Create/edit drawer ──────────────────────────────────────────────
  function drawerShell() {
    return '' +
      '<div class="panel">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);">' +
      '<div id="mp-job-drawer-title" style="font-size:var(--text-xl);font-weight:800;color:var(--text-primary);">New Job</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="mp-job-drawer-close">✕</button>' +
      '</div>' +
      '<form class="mp-job-form" id="mp-job-form">' +
        '<input type="hidden" id="jf-id">' +
        '<input type="hidden" id="jf-source" value="internal">' +
        '<input type="hidden" id="jf-origin_campaign_id">' +

        '<fieldset><legend>Role</legend>' +
          '<div class="form-row"><div class="form-group full-width"><label>Job title *</label><input class="form-input" id="jf-title" required></div></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Employer name</label><input class="form-input" id="jf-employer_name"></div>' +
            '<div class="mp-job-checkbox-row"><input type="checkbox" id="jf-employer_confidential"><label for="jf-employer_confidential">Employer confidential (hidden from partners)</label></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Country</label><input class="form-input" id="jf-destination_country"></div>' +
            '<div class="form-group"><label>City</label><input class="form-input" id="jf-city"></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Specialty</label><input class="form-input" id="jf-specialty"></div>' +
            '<div class="form-group"><label>Subspecialty</label><input class="form-input" id="jf-subspecialty"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Seniority level</label><input class="form-input" id="jf-seniority_level" placeholder="e.g. Consultant"></div>' +
            '<div class="form-group"><label>Facility type</label><input class="form-input" id="jf-facility_type" placeholder="e.g. Tertiary hospital"></div>' +
            '<div class="form-group"><label>Contract type</label><select class="form-input" id="jf-contract_type">' +
              '<option value="">—</option><option value="permanent">Permanent</option><option value="locum">Locum</option><option value="temporary">Temporary</option>' +
            '</select></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Positions</label><input class="form-input" type="number" min="1" step="1" id="jf-positions_count" value="1"></div>' +
            '<div class="form-group"><label>Min. experience (years)</label><input class="form-input" type="number" min="0" step="1" id="jf-min_experience_years"></div>' +
            '<div class="form-group"><label>Closes</label><input class="form-input" type="date" id="jf-closes_at"></div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>Compensation</legend>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Salary min</label><input class="form-input" type="number" step="any" id="jf-salary_min"></div>' +
            '<div class="form-group"><label>Salary max</label><input class="form-input" type="number" step="any" id="jf-salary_max"></div>' +
            '<div class="form-group"><label>Salary currency</label><input class="form-input" id="jf-salary_currency" placeholder="e.g. USD"></div>' +
          '</div>' +
          '<div class="form-row"><div class="form-group full-width"><label>Salary display (overrides the range above if set)</label><input class="form-input" id="jf-salary_display" placeholder="e.g. Negotiable, DOE"></div></div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Placement fee amount</label><input class="form-input" type="number" step="any" id="jf-placement_fee_amount"></div>' +
            '<div class="form-group"><label>Placement fee currency</label><input class="form-input" id="jf-placement_fee_currency" placeholder="e.g. USD"></div>' +
            '<div class="form-group"><label>Partner split %</label><input class="form-input" type="number" min="0" max="100" step="any" id="jf-partner_split_pct" value="50"></div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>Candidate criteria</legend>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Required licences (comma-separated)</label><input class="form-input" id="jf-required_licences" placeholder="e.g. DataFlow, SCFHS"></div>' +
            '<div class="form-group"><label>Required exams (comma-separated)</label><input class="form-input" id="jf-required_exams" placeholder="e.g. Prometric, OET"></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Nationality preferences (comma-separated)</label><input class="form-input" id="jf-nationality_prefs"></div>' +
            '<div class="form-group"><label>Language requirements (comma-separated)</label><input class="form-input" id="jf-language_reqs"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Gender preference</label><select class="form-input" id="jf-gender_pref">' +
              '<option value="">Any</option><option value="male">Male</option><option value="female">Female</option>' +
            '</select></div>' +
            '<div class="form-group"><label>Age min</label><input class="form-input" type="number" min="0" step="1" id="jf-age_min"></div>' +
            '<div class="form-group"><label>Age max</label><input class="form-input" type="number" min="0" step="1" id="jf-age_max"></div>' +
          '</div>' +
          '<div class="form-row"><div class="form-group full-width"><label>Benefits (comma-separated)</label><input class="form-input" id="jf-benefits" placeholder="e.g. Housing, Flights, Medical"></div></div>' +
        '</fieldset>' +

        '<fieldset><legend>Publishing</legend>' +
          '<div class="form-row"><div class="form-group full-width"><label>Job description</label><textarea class="form-input" id="jf-jd_text" style="min-height:110px;resize:vertical;font-family:inherit;"></textarea></div></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Status</label><select class="form-input" id="jf-status">' +
              '<option value="draft">Draft</option><option value="open">Open</option><option value="paused">Paused</option>' +
              '<option value="filled">Filled</option><option value="closed">Closed</option>' +
            '</select></div>' +
          '</div>' +
        '</fieldset>' +

        '<div style="display:flex;align-items:center;gap:var(--space-3);">' +
          '<button type="submit" class="btn btn-primary btn-sm" id="mp-job-save">Save job</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="mp-job-cancel">Cancel</button>' +
        '</div>' +
        '<div id="mp-job-form-msg" role="status" aria-live="polite"></div>' +
      '</form>' +
      '</div>';
  }

  // splits a comma-separated free-text field into an array, dropping blanks —
  // matches mp-job-write's strArray()/CHECK-free text[] columns.
  function splitList(str) {
    return String(str || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function joinList(arr) { return Array.isArray(arr) ? arr.join(', ') : ''; }

  // Populates the (already-injected, static) form with a job's values via
  // direct DOM property assignment — never string interpolation — so every
  // one of these free-text fields (title, employer_name, jd_text, city, ...)
  // needs no HTML-escaping helper at all. See file-header comment.
  function fillForm(job) {
    job = job || {};
    document.getElementById('jf-id').value = job.id || '';
    document.getElementById('jf-source').value = job.source || 'internal';
    document.getElementById('jf-origin_campaign_id').value = job.origin_campaign_id || '';
    document.getElementById('jf-title').value = job.title || '';
    document.getElementById('jf-employer_name').value = job.employer_name || '';
    document.getElementById('jf-employer_confidential').checked = !!job.employer_confidential;
    document.getElementById('jf-destination_country').value = job.destination_country || '';
    document.getElementById('jf-city').value = job.city || '';
    document.getElementById('jf-specialty').value = job.specialty || '';
    document.getElementById('jf-subspecialty').value = job.subspecialty || '';
    document.getElementById('jf-seniority_level').value = job.seniority_level || '';
    document.getElementById('jf-facility_type').value = job.facility_type || '';
    document.getElementById('jf-contract_type').value = job.contract_type || '';
    document.getElementById('jf-positions_count').value = job.positions_count == null ? 1 : job.positions_count;
    document.getElementById('jf-min_experience_years').value = job.min_experience_years == null ? '' : job.min_experience_years;
    document.getElementById('jf-closes_at').value = job.closes_at ? String(job.closes_at).slice(0, 10) : '';
    document.getElementById('jf-salary_min').value = job.salary_min == null ? '' : job.salary_min;
    document.getElementById('jf-salary_max').value = job.salary_max == null ? '' : job.salary_max;
    document.getElementById('jf-salary_currency').value = job.salary_currency || '';
    document.getElementById('jf-salary_display').value = job.salary_display || '';
    document.getElementById('jf-placement_fee_amount').value = job.placement_fee_amount == null ? '' : job.placement_fee_amount;
    document.getElementById('jf-placement_fee_currency').value = job.placement_fee_currency || '';
    document.getElementById('jf-partner_split_pct').value = job.partner_split_pct == null ? 50 : job.partner_split_pct;
    document.getElementById('jf-required_licences').value = joinList(job.required_licences);
    document.getElementById('jf-required_exams').value = joinList(job.required_exams);
    document.getElementById('jf-nationality_prefs').value = joinList(job.nationality_prefs);
    document.getElementById('jf-language_reqs').value = joinList(job.language_reqs);
    document.getElementById('jf-gender_pref').value = job.gender_pref || '';
    document.getElementById('jf-age_min').value = job.age_min == null ? '' : job.age_min;
    document.getElementById('jf-age_max').value = job.age_max == null ? '' : job.age_max;
    document.getElementById('jf-benefits').value = joinList(job.benefits);
    document.getElementById('jf-jd_text').value = job.jd_text || '';
    document.getElementById('jf-status').value = job.status || 'draft';
  }

  function readForm() {
    return {
      id: document.getElementById('jf-id').value || undefined,
      source: document.getElementById('jf-source').value || 'internal',
      origin_campaign_id: document.getElementById('jf-origin_campaign_id').value || null,
      title: document.getElementById('jf-title').value.trim(),
      employer_name: document.getElementById('jf-employer_name').value.trim() || null,
      employer_confidential: document.getElementById('jf-employer_confidential').checked,
      destination_country: document.getElementById('jf-destination_country').value.trim() || null,
      city: document.getElementById('jf-city').value.trim() || null,
      specialty: document.getElementById('jf-specialty').value.trim() || null,
      subspecialty: document.getElementById('jf-subspecialty').value.trim() || null,
      seniority_level: document.getElementById('jf-seniority_level').value.trim() || null,
      facility_type: document.getElementById('jf-facility_type').value.trim() || null,
      contract_type: document.getElementById('jf-contract_type').value || null,
      positions_count: document.getElementById('jf-positions_count').value,
      min_experience_years: document.getElementById('jf-min_experience_years').value,
      closes_at: document.getElementById('jf-closes_at').value || null,
      salary_min: document.getElementById('jf-salary_min').value,
      salary_max: document.getElementById('jf-salary_max').value,
      salary_currency: document.getElementById('jf-salary_currency').value.trim() || null,
      salary_display: document.getElementById('jf-salary_display').value.trim() || null,
      placement_fee_amount: document.getElementById('jf-placement_fee_amount').value,
      placement_fee_currency: document.getElementById('jf-placement_fee_currency').value.trim() || null,
      partner_split_pct: document.getElementById('jf-partner_split_pct').value,
      required_licences: splitList(document.getElementById('jf-required_licences').value),
      required_exams: splitList(document.getElementById('jf-required_exams').value),
      nationality_prefs: splitList(document.getElementById('jf-nationality_prefs').value),
      language_reqs: splitList(document.getElementById('jf-language_reqs').value),
      gender_pref: document.getElementById('jf-gender_pref').value || null,
      age_min: document.getElementById('jf-age_min').value,
      age_max: document.getElementById('jf-age_max').value,
      benefits: splitList(document.getElementById('jf-benefits').value),
      jd_text: document.getElementById('jf-jd_text').value.trim() || null,
      status: document.getElementById('jf-status').value,
      extra_criteria: {}
    };
  }

  async function openDrawer(id) {
    drawer.hidden = false;
    drawer.innerHTML = drawerShell();

    document.getElementById('mp-job-drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('mp-job-cancel').addEventListener('click', closeDrawer);

    var job = null;
    if (id) {
      var r = await window.MP.mpFrom('jobs').select('*').eq('id', id).single();
      if (r.error || !r.data) {
        window.alert('Could not load the job: ' + (r.error ? r.error.message : 'not found'));
        closeDrawer();
        return;
      }
      job = r.data;
    }
    // .textContent — inherently safe regardless of content, no escaping helper needed.
    document.getElementById('mp-job-drawer-title').textContent = job ? ('Edit: ' + (job.title || '')) : 'New Job';
    fillForm(job);

    var form = document.getElementById('mp-job-form');
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var statusEl = document.getElementById('mp-job-form-msg');
      var saveBtn = document.getElementById('mp-job-save');
      statusEl.className = '';
      statusEl.textContent = 'Saving…';
      saveBtn.disabled = true;
      var out = await window.MP.callFn('mp-job-write', readForm());
      saveBtn.disabled = false;
      if (!out.ok) {
        // Show the edge function's exact 400 text (e.g. "salary_min must be a number"),
        // never a generic "Save failed" — a typed-but-unsaved value must stay visible.
        statusEl.className = 'is-error';
        statusEl.textContent = (out.data && out.data.error) ? out.data.error : ('Save failed — HTTP ' + out.status);
        return;
      }
      statusEl.textContent = 'Saved.';
      await load();
      closeDrawer();
    });
    form.addEventListener('invalid', function (ev) {
      var statusEl = document.getElementById('mp-job-form-msg');
      if (statusEl && ev.target) {
        statusEl.className = 'is-error';
        statusEl.textContent = 'Not saved — ' + ev.target.validationMessage;
      }
    }, true);
  }

  function closeDrawer() {
    drawer.hidden = true;
    drawer.innerHTML = '';
  }
})();
