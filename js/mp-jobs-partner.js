/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: partner job board
   Loaded after js/mp-core.js on BOTH partners-jobs.html (list) and
   partners-job.html (detail) — one script, branching on which page's
   root element is present in the DOM (mirrors the single-script-per-page
   pattern used elsewhere, but this page pair shares one file per the task
   brief).

   Reads: public.gh_mp_jobs (via MP.mpFrom('jobs')). No writes — Nomination
   is Chunk 2C and does not exist yet; this page does not stub it.

   Contract notes honoured here (see js/mp-core.js):
   - MP.init() is not re-entrant → called EXACTLY once per page load.
   - MP.status === 'error' → requireAgency() returns false WITHOUT navigating,
     so this page renders its own error state (message + retry + sign-in
     link), matching js/mp-messages-partner.js / js/mp-dashboard.js.
   - No requireVerified() gate: an agency must be able to browse the job
     board at every status, including pending_verification — it should be
     able to see what it is applying to work on. RLS itself agrees: policy
     mp_jobs_partner_open_select (schema-v42-mp-jobs.sql) is
     `status = 'open' AND EXISTS (my_agency_ids())` — no verified check.
   - Client-side status='open' filtering on the query is added anyway for
     honesty, but is NOT the security boundary — RLS already restricts a
     partner to open jobs; a client filter here could never be relied on.
   - No Nominate button (real or disabled — Chunk 2C) and no "N of your
     candidates match" badge (needs mp_match_scores from S5, which does not
     exist). Neither is stubbed.

   Escaping (see js/mp-core.js MP.esc / MP.escAttr / MP.safeHref contract
   comment):
   - job.title, job.employer_name, job.city, job.destination_country,
     job.specialty, job.subspecialty, job.seniority_level, job.facility_type,
     job.gender_pref, job.salary_display/currency, job.placement_fee_currency,
     and every string inside benefits[]/required_licences[]/required_exams[]/
     nationality_prefs[]/language_reqs[] are all free text rendered as
     element TEXT content → MP.esc().
   - job.contract_type/status are server-enum-constrained (CHECK on
     globalhire.mp_jobs) but still run through MP.esc() before use as TEXT
     content, for defense in depth (matches js/mp-jobs-admin.js).
   - job.positions_count, placement_fee_amount, partner_split_pct,
     min_experience_years, age_min/age_max are numeric but still passed
     through MP.esc() after String() coercion — MP.esc(0) returns '', so
     every numeric is coerced to String() first (matches js/mp-dashboard.js
     note on this exact pitfall).
   - job.id lands in the job-card → detail-page href
     ("partners-job.html?id=" + id). That is BOTH an attribute value (needs
     MP.escAttr() so the id can't break out of the href="..." quotes) AND a
     URL (needs MP.safeHref() so the id can't smuggle a javascript:/data:
     scheme into the link) — job.id is a server-generated UUID today, but
     the href is built the same way any untrusted-origin value would be,
     per the house rule that any href built from data needs both helpers.
   - job.employer_name is masked to NULL by the gh_mp_jobs view itself
     (schema-v42-mp-jobs.sql) when employer_confidential is true and the
     caller isn't admin — the real value never reaches this script. We
     render "Employer confidential" whenever employer_name is null/empty,
     full stop; we do not also branch on employer_confidential, because the
     view is the only place allowed to decide "confidential" — inferring
     anything beyond "it was masked" client-side would let the two
     disagree.
   ============================================ */
(function () {
  var MP = window.MP;
  function esc(s) { return MP.esc(s); }
  function escAttr(s) { return MP.escAttr(s); }
  function safeHref(s) { return MP.safeHref(s); }

  var listEl = document.getElementById('mp-job-list');
  var detailEl = document.getElementById('mp-job-detail');
  var isListPage = !!listEl;
  var isDetailPage = !!detailEl;
  if (!isListPage && !isDetailPage) return;

  var bodyEl = document.getElementById(isListPage ? 'mp-jobs-body' : 'mp-job-detail-body');
  var errEl = document.getElementById('mp-error');

  function renderError() {
    if (bodyEl) bodyEl.hidden = true;
    if (!errEl) return;
    errEl.hidden = false;
    errEl.innerHTML =
      '<div class="mp-card">' +
      '<h2>We couldn’t load the job board</h2>' +
      '<p>' + esc(MP.lastError) + '</p>' +
      '<p><button type="button" class="mp-btn" id="mp-retry">Retry</button>' +
      '<a class="mp-link" href="login.html">Sign in again</a></p>' +
      '</div>';
    var b = document.getElementById('mp-retry');
    // A Retry control reloads the page — MP.init() is not re-entrant, so it
    // must never be called a second time in the same page load.
    if (b) b.onclick = function () { window.location.reload(); };
  }

  // ── Formatting helpers (no markup — plain strings the caller escapes) ──
  var CONTRACT_LABELS = { permanent: 'Permanent', locum: 'Locum', temporary: 'Temporary' };
  function contractLabel(v) { return CONTRACT_LABELS[v] || v; }

  function fmtNum(n) { return Number(n).toLocaleString(); }

  function salaryText(j) {
    if (j.salary_display) return j.salary_display;
    if (j.salary_min != null && j.salary_max != null) {
      return (j.salary_currency ? j.salary_currency + ' ' : '') + fmtNum(j.salary_min) + '–' + fmtNum(j.salary_max);
    }
    if (j.salary_min != null) return (j.salary_currency ? j.salary_currency + ' ' : '') + fmtNum(j.salary_min) + '+';
    if (j.salary_max != null) return (j.salary_currency ? j.salary_currency + ' ' : '') + 'up to ' + fmtNum(j.salary_max);
    return '';
  }

  // employer_name is NULL on the wire for a confidential job — the view did
  // that, not us. Render the literal fallback whenever it's null/empty;
  // never an empty field, and never a second guess based on
  // employer_confidential.
  function employerText(j) { return j.employer_name ? j.employer_name : 'Employer confidential'; }

  function pillsHtml(values) {
    return values.map(function (v) { return '<span class="mp-pill">' + esc(v) + '</span>'; }).join('');
  }

  function tagListHtml(values) {
    return '<div class="mp-tag-list">' + values.map(function (v) { return '<span class="mp-tag">' + esc(v) + '</span>'; }).join('') + '</div>';
  }

  function defItemHtml(label, valueHtml) {
    return '<div class="mp-def-item"><div class="mp-def-label">' + esc(label) + '</div><div class="mp-def-value">' + valueHtml + '</div></div>';
  }

  function feeItemHtml(label, valueText) {
    return '<div class="mp-fee-item"><div class="mp-fee-label">' + esc(label) + '</div><div class="mp-fee-value">' + esc(valueText) + '</div></div>';
  }

  // Builds the href for a job card's link to its detail page. job.id is a
  // server-generated UUID, but the href is still run through BOTH helpers
  // per the house rule: MP.escAttr() so it can't break the href="..."
  // attribute boundary, MP.safeHref() so it can't smuggle a dangerous URI
  // scheme (safeHref alone would leave the attribute quotes unescaped;
  // escAttr alone would leave a javascript:/data: scheme untouched).
  function jobHref(id) {
    return escAttr(safeHref('partners-job.html?id=' + id));
  }

  // ════════════════════════ LIST PAGE ════════════════════════
  var allJobs = [];
  var FILTERS = [
    { id: 'specialty', field: 'specialty' },
    { id: 'country', field: 'destination_country' },
    { id: 'city', field: 'city' },
    { id: 'seniority', field: 'seniority_level' },
    { id: 'contract', field: 'contract_type' }
  ];

  function populateFilterOptions() {
    FILTERS.forEach(function (f) {
      var sel = document.getElementById('mp-f-' + f.id);
      if (!sel) return;
      var seen = {};
      var values = [];
      allJobs.forEach(function (j) {
        var v = j[f.field];
        if (v && !seen[v]) { seen[v] = true; values.push(v); }
      });
      values.sort(function (a, b) { return String(a).localeCompare(String(b)); });
      var current = sel.value;
      while (sel.options.length > 1) sel.remove(1); // keep the "All …" option at index 0
      values.forEach(function (v) {
        var opt = document.createElement('option');
        // Property assignment, not string interpolation into markup — this
        // is inherently safe regardless of content (never parsed as HTML),
        // matching the edit-drawer pattern in js/mp-jobs-admin.js.
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });
      if (values.indexOf(current) !== -1) sel.value = current;
    });
  }

  function activeFilters() {
    var out = {};
    FILTERS.forEach(function (f) {
      var sel = document.getElementById('mp-f-' + f.id);
      if (sel && sel.value) out[f.field] = sel.value;
    });
    return out;
  }

  function applyFilters(jobs) {
    var f = activeFilters();
    var keys = Object.keys(f);
    if (!keys.length) return jobs;
    return jobs.filter(function (j) {
      return keys.every(function (k) { return j[k] === f[k]; });
    });
  }

  function renderJobCard(j) {
    var location = [j.city, j.destination_country].filter(Boolean).join(', ');
    var meta = [];
    if (j.specialty) meta.push(j.specialty);
    if (j.seniority_level) meta.push(j.seniority_level);
    if (j.contract_type) meta.push(contractLabel(j.contract_type));
    if (location) meta.push(location);
    if (j.positions_count > 1) meta.push(String(j.positions_count) + ' positions');
    var salary = salaryText(j);
    var employer = employerText(j);
    return '<a class="mp-job-card" href="' + jobHref(j.id) + '">' +
      '<div class="mp-job-card-top">' +
      '<div><h3>' + esc(j.title) + '</h3>' +
      '<p class="mp-job-employer' + (j.employer_name ? '' : ' confidential') + '">' + esc(employer) + '</p></div>' +
      (salary ? '<div class="mp-job-salary">' + esc(salary) + '</div>' : '') +
      '</div>' +
      '<div class="mp-job-meta">' + pillsHtml(meta) + '</div>' +
      '</a>';
  }

  function renderList() {
    var filtered = applyFilters(allJobs);
    var countEl = document.getElementById('mp-job-count');
    if (countEl) countEl.textContent = String(filtered.length) + (filtered.length === 1 ? ' open job' : ' open jobs');
    listEl.innerHTML = filtered.length
      ? filtered.map(renderJobCard).join('')
      : '<div class="mp-empty">No open jobs match these filters right now.</div>';
  }

  async function loadJobs() {
    // RLS (globalhire.mp_jobs policy mp_jobs_partner_open_select) already
    // restricts a partner to status='open' rows — this .eq('status','open')
    // is honest client-side filtering, not something correctness relies on.
    var r = await MP.mpFrom('jobs').select('*').eq('status', 'open').order('published_at', { ascending: false });
    if (r.error) {
      listEl.innerHTML = '<div class="mp-empty">' + esc(r.error.message) + '</div>';
      return;
    }
    allJobs = r.data || [];
    populateFilterOptions();
    renderList();
  }

  function initListPage() {
    FILTERS.forEach(function (f) {
      var sel = document.getElementById('mp-f-' + f.id);
      if (sel) sel.addEventListener('change', renderList);
    });
    var clearBtn = document.getElementById('mp-f-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        FILTERS.forEach(function (f) {
          var sel = document.getElementById('mp-f-' + f.id);
          if (sel) sel.value = '';
        });
        renderList();
      });
    }
    loadJobs();
  }

  // ════════════════════════ DETAIL PAGE ════════════════════════
  function renderDetail(j) {
    var location = [j.city, j.destination_country].filter(Boolean).join(', ');
    var employer = employerText(j);
    var meta = [];
    if (j.specialty) meta.push(j.specialty);
    if (j.subspecialty) meta.push(j.subspecialty);
    if (j.seniority_level) meta.push(j.seniority_level);
    if (j.contract_type) meta.push(contractLabel(j.contract_type));
    if (j.facility_type) meta.push(j.facility_type);
    if (location) meta.push(location);
    var salary = salaryText(j);

    var feeGrid =
      feeItemHtml('Placement fee', j.placement_fee_amount != null
        ? (j.placement_fee_currency ? j.placement_fee_currency + ' ' : '') + fmtNum(j.placement_fee_amount)
        : 'Not specified') +
      feeItemHtml('Partner split', j.partner_split_pct != null ? fmtNum(j.partner_split_pct) + '%' : 'Not specified') +
      feeItemHtml('Positions open', String(j.positions_count == null ? 1 : j.positions_count)) +
      feeItemHtml('Closes', j.closes_at ? String(j.closes_at).slice(0, 10) : 'Open-ended');

    var reqItems = [];
    if (j.min_experience_years != null) reqItems.push(defItemHtml('Minimum experience', esc(String(j.min_experience_years) + ' years')));
    if (j.gender_pref) reqItems.push(defItemHtml('Gender preference', esc(j.gender_pref)));
    if (j.age_min != null || j.age_max != null) {
      var ageParts = [j.age_min, j.age_max].filter(function (v) { return v != null; }).map(function (v) { return String(v); });
      reqItems.push(defItemHtml('Age range', esc(ageParts.join('–'))));
    }
    if (j.required_licences && j.required_licences.length) reqItems.push(defItemHtml('Required licences', tagListHtml(j.required_licences)));
    if (j.required_exams && j.required_exams.length) reqItems.push(defItemHtml('Required exams', tagListHtml(j.required_exams)));
    if (j.nationality_prefs && j.nationality_prefs.length) reqItems.push(defItemHtml('Nationality preference', tagListHtml(j.nationality_prefs)));
    if (j.language_reqs && j.language_reqs.length) reqItems.push(defItemHtml('Languages', tagListHtml(j.language_reqs)));
    if (j.benefits && j.benefits.length) reqItems.push(defItemHtml('Benefits', tagListHtml(j.benefits)));

    var html =
      '<div class="mp-job-head">' +
      '<h1>' + esc(j.title) + '</h1>' +
      '<p class="mp-job-employer' + (j.employer_name ? '' : ' confidential') + '">' + esc(employer) + '</p>' +
      '<div class="mp-job-meta">' + pillsHtml(meta) + '</div>' +
      (salary ? '<p style="margin-top:var(--space-3);font-weight:700;color:var(--primary-light);">' + esc(salary) + '</p>' : '') +
      '</div>' +
      '<div class="mp-card"><h2>Fee &amp; split</h2><div class="mp-fee-grid">' + feeGrid + '</div></div>';

    if (reqItems.length) {
      html += '<div class="mp-card"><h2>Requirements</h2><div class="mp-def-list">' + reqItems.join('') + '</div></div>';
    }

    if (j.jd_text) {
      // Free text, rendered as element TEXT content → esc(). CSS
      // white-space:pre-wrap (see partners-job.html) preserves the
      // author's line breaks without needing raw <br> markup.
      html += '<div class="mp-card"><h2>Full description</h2><div class="mp-jd-text">' + esc(j.jd_text) + '</div></div>';
    }

    detailEl.innerHTML = html;
  }

  function renderNotFound() {
    detailEl.innerHTML = '<div class="mp-empty">This job isn’t open, or the link is no longer valid.</div>';
  }

  async function initDetailPage() {
    var id = new URLSearchParams(location.search).get('id');
    if (!id) { renderNotFound(); return; }
    // RLS already restricts this SELECT to status='open' rows the caller's
    // agency is allowed to see; .eq('status','open') here is honest
    // client-side filtering, not the security boundary.
    var r = await MP.mpFrom('jobs').select('*').eq('id', id).eq('status', 'open').maybeSingle();
    if (r.error) {
      detailEl.innerHTML = '<div class="mp-empty">' + esc(r.error.message) + '</div>';
      return;
    }
    if (!r.data) { renderNotFound(); return; }
    renderDetail(r.data);
  }

  (async function () {
    await MP.init();
    if (MP.status === 'error') { renderError(); return; }
    // No requireVerified() here on purpose: an agency must be able to
    // browse the job board at every status, including pending_verification —
    // it should be able to see what it is applying to work on. RLS agrees
    // (mp_jobs_partner_open_select has no verified check).
    if (!MP.requireAgency({ to: 'partners-signup.html' })) return;
    if (isListPage) initListPage();
    else initDetailPage();
  })();
})();
