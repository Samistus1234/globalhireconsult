/* ============================================
   GLOBALHIRE@ELAB — Visa intake form
   Slug-driven; uploads to visa-documents bucket; posts to start-visa-case.
   ============================================ */

(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';
  var FN_BASE = SUPABASE_URL + '/functions/v1';

  var SLUG_TO_VISA_TYPE = {
    'tourist-evisa':     'tourist',
    'umrah':             'umrah',
    'family-visit':      'family_visit',
    'family-residence':  'family_residence',
  };

  var REQUIRED_DOCS = {
    tourist:          [['passport_bio', 'Passport bio page'], ['passport_photo', 'Passport photo']],
    umrah:            [['passport_bio', 'Passport bio page'], ['passport_photo', 'Passport photo']],
    family_visit:     [
      ['passport_bio',        'Visitor passport bio page'],
      ['passport_photo',      'Visitor photo'],
      ['sponsor_iqama',       "Sponsor's Iqama"],
      ['salary_certificate',  "Sponsor's salary certificate"],
      ['marriage_certificate','Marriage/birth certificate (proof of relationship)'],
    ],
    family_residence: [
      ['passport_bio',         'Dependent passport bio page'],
      ['passport_photo',       'Dependent photo'],
      ['sponsor_iqama',        "Sponsor's Iqama"],
      ['salary_certificate',   "Sponsor's salary certificate"],
      ['marriage_certificate', 'Marriage certificate (for spouse)'],
      ['birth_certificate',    'Birth certificate (for children)'],
    ],
  };

  var DEPOSIT_USD = 50;
  // Mirror the server: Paystack USD fee is 3.9% (no cap); gross up so ELAB nets the deposit.
  var PAYSTACK_FEE_RATE = 0.039;
  function chargedTodayUSD() { return Math.round((DEPOSIT_USD / (1 - PAYSTACK_FEE_RATE)) * 100) / 100; }
  function cardFeeUSD() { return Math.round((chargedTodayUSD() - DEPOSIT_USD) * 100) / 100; }

  var ESTIMATES = {
    tourist:          { total: 185, balance: 135 },
    umrah:            { total: 295, balance: 245 },
    family_visit:     { total: 543, balance: 493 },
    family_residence: { total: 283, balance: 233 },
  };

  // Lightweight Supabase client (PostgREST + Storage) without bringing the npm SDK
  async function authHeader() {
    var session = (window.GHAuth ? await GHAuth.getSession() : null);
    return session ? 'Bearer ' + session.access_token : null;
  }

  function getSlug() {
    var p = new URLSearchParams(location.search);
    return p.get('slug') || (location.pathname.replace('.html','').split('-').slice(1).join('-'));
  }

  function $(sel) { return document.querySelector(sel); }

  function showError(msg) {
    var box = $('#visa-start-error');
    box.hidden = false;
    box.textContent = msg;
  }

  async function uploadDoc(file, candidateId, caseId, kind) {
    var path = candidateId + '/' + caseId + '/' + kind + '/' + Date.now() + '-' + file.name;
    var resp = await fetch(SUPABASE_URL + '/storage/v1/object/visa-documents/' + path, {
      method: 'POST',
      headers: { Authorization: await authHeader(), 'content-type': file.type },
      body: file,
    });
    if (!resp.ok) throw new Error('upload failed: ' + (await resp.text()));
    // Record the doc row
    var dbResp = await fetch(SUPABASE_URL + '/rest/v1/visa_case_documents', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: await authHeader(),
        'content-type': 'application/json',
        'Accept-Profile': 'globalhire',
        'Content-Profile': 'globalhire',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ case_id: caseId, doc_kind: kind, storage_path: path }),
    });
    if (!dbResp.ok) throw new Error('doc record failed');
  }

  async function init() {
    if (!(await authHeader())) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\//,'').replace(/\.html$/,'') + location.search);
      return;
    }

    var slug = getSlug();
    var visaType = SLUG_TO_VISA_TYPE[slug];
    if (!visaType) {
      showError('Unknown visa type. Please go back to /visa and re-select.');
      return;
    }

    // Hide sponsor fieldset for tourist/umrah
    if (visaType === 'tourist' || visaType === 'umrah') {
      $('#sponsor-fieldset').style.display = 'none';
    }

    // Render doc upload inputs
    var docList = $('#doc-uploads');
    REQUIRED_DOCS[visaType].forEach(function (entry) {
      var kind = entry[0], label = entry[1];
      var wrap = document.createElement('div');
      wrap.className = 'v-file';
      wrap.innerHTML =
        '<label for="doc-' + kind + '">' + label + '</label>' +
        '<input id="doc-' + kind + '" type="file" multiple name="' + kind + '" data-kind="' + kind + '" data-label="' + label.replace(/"/g, '&quot;') + '" accept=".jpg,.jpeg,.png,.webp,.pdf">';
      docList.appendChild(wrap);
    });

    var NAMES = { tourist: 'Tourist eVisa', umrah: 'Umrah visa', family_visit: 'Family Visit visa', family_residence: 'Family Residence' };
    var title = $('#v-start-title');
    if (title) title.textContent = 'Start your ' + NAMES[visaType] + ' case.';

    // Price summary: the plan saved on the visa page if it matches, else the per-person estimate.
    var plan = null;
    try { plan = JSON.parse(localStorage.getItem('gh_visa_plan') || 'null'); } catch (e) {}
    if (plan && plan.slug === slug && plan.total) {
      var cur = plan.currency === 'NGN' ? '₦' : '$';
      var money = function (n) { return cur + Math.round(Number(n) || 0).toLocaleString('en-US'); };
      $('#v-sum-label').textContent = 'Your price, ' + (Number(plan.people) || 1) + ((Number(plan.people) || 1) === 1 ? ' person' : ' people');
      $('#estimated-total').textContent = money(plan.total);
      var lines = $('#v-sum-lines');
      lines.innerHTML = '';
      (plan.lines || []).forEach(function (l) {
        var row = document.createElement('div');
        row.className = 'v-line';
        var a = document.createElement('span'); a.textContent = String(l[0]);
        var b = document.createElement('span'); b.textContent = String(l[1]);
        row.appendChild(a); row.appendChild(b); lines.appendChild(row);
      });
      var dep = document.createElement('div');
      dep.className = 'v-line start';
      dep.innerHTML = '<span>You pay today to start</span><span>$' + DEPOSIT_USD + '</span>';
      lines.appendChild(dep);
    } else {
      var est = ESTIMATES[visaType];
      $('#v-sum-label').textContent = 'From, per person';
      $('#estimated-balance').textContent = '~$' + est.balance;
      $('#estimated-total').textContent   = '$' + est.total;
    }

    // No on-site charge — the deposit invoice is emailed after submit (pay online or by transfer).
    $('#visa-pay-btn').textContent = 'Submit and email my invoice';
    $('#visa-pay-btn').disabled = false;

    $('#visa-intake-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = $('#visa-pay-btn');
      btn.disabled = true; btn.textContent = 'Creating case…';

      var f = e.target;
      var leadId = sessionStorage.getItem('gh_visa_lead_id');

      var missing = Array.prototype.filter.call(f.querySelectorAll('input[type=file]'), function (fi) { return !(fi.files && fi.files.length); })
        .map(function (fi) { return fi.dataset.label; });
      if (missing.length) {
        showError('Please add: ' + missing.join(', ') + '.');
        $('#visa-start-error').scrollIntoView({ block: 'center' });
        btn.disabled = false; btn.textContent = 'Submit and email my invoice';
        return;
      }
      $('#visa-start-error').hidden = true;

      try {
        // Step 1: create the case
        var createResp = await fetch(FN_BASE + '/start-visa-case', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: await authHeader() },
          body: JSON.stringify({
            visa_type:            visaType,
            sponsor_iqama:        f.sponsor_iqama?.value || null,
            sponsor_name:         f.sponsor_name?.value || null,
            travel_dates:         { arrival: f.arrival.value || null, stay_days: f.stay_days.value ? Number(f.stay_days.value) : null },
            lead_id:              leadId,
            provider:             $('#provider-select').value,
          }),
        });
        if (!createResp.ok) throw new Error('case creation failed');
        var created = await createResp.json();

        // Step 2: upload docs
        btn.textContent = 'Uploading documents…';
        var candidateId = JSON.parse(atob((await authHeader()).split('.')[1])).sub;
        var fileInputs = f.querySelectorAll('input[type=file]');
        for (var i = 0; i < fileInputs.length; i++) {
          var fi = fileInputs[i];
          for (var j = 0; fi.files && j < fi.files.length; j++) {
            await uploadDoc(fi.files[j], candidateId, created.case_id, fi.dataset.kind);
          }
        }

        // Step 3: case created — the Command Centre emails the deposit invoice. Show confirmation.
        var main = document.querySelector('main.visa-main');
        if (main) {
          main.innerHTML =
            '<section class="v-hero" style="padding-bottom:96px">' +
              '<div class="v-wrap v-done">' +
                '<div class="tick" aria-hidden="true">&#10003;</div>' +
                '<h1 style="font-size:clamp(32px,5vw,48px)">Your visa case is open.</h1>' +
                '<p class="v-lede" style="margin-top:12px">We are emailing your $50 invoice now. Pay it online or by bank transfer, and we start as soon as it arrives.</p>' +
                '<p class="v-note">Check your inbox and spam folder. The $50 is credited to your visa total and refunded if you are not eligible.</p>' +
                '<div class="v-cta"><a class="btn btn-primary btn-lg" href="dashboard-visas.html">Track my case</a></div>' +
              '</div>' +
            '</section>';
          try { localStorage.removeItem('gh_visa_plan'); } catch (e2) {}
          window.scrollTo(0, 0);
        }
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again or message us on WhatsApp.');
        btn.disabled = false; btn.textContent = 'Submit and email my invoice';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
