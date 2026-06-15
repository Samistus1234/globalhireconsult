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
      wrap.style.marginBottom = 'var(--space-3)';
      wrap.innerHTML =
        '<label style="display:block; font-size:.875rem; margin-bottom:4px;">' + label + '</label>' +
        '<input type="file" name="' + kind + '" data-kind="' + kind + '" required accept=".jpg,.jpeg,.png,.webp,.pdf">';
      docList.appendChild(wrap);
    });

    // Estimate
    var est = ESTIMATES[visaType];
    $('#estimated-balance').textContent = '~$' + est.balance;
    $('#estimated-total').textContent   = '$' + est.total;

    // No on-site charge — the deposit invoice is emailed after submit (pay online or by transfer).
    $('#visa-pay-btn').textContent = 'Submit & email my invoice';
    $('#visa-pay-btn').disabled = false;

    $('#visa-intake-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = $('#visa-pay-btn');
      btn.disabled = true; btn.textContent = 'Creating case…';

      var f = e.target;
      var leadId = sessionStorage.getItem('gh_visa_lead_id');

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
          if (fi.files && fi.files[0]) {
            await uploadDoc(fi.files[0], candidateId, created.case_id, fi.dataset.kind);
          }
        }

        // Step 3: case created — the Command Centre emails the deposit invoice. Show confirmation.
        var main = document.querySelector('main.visa-main');
        if (main) {
          main.innerHTML =
            '<section class="visa-section visa-section--ivory" style="text-align:center;padding:4rem 1.5rem;">' +
              '<div style="max-width:560px;margin:0 auto;">' +
                '<div style="font-size:2.75rem;color:#16a34a;line-height:1;">&#10003;</div>' +
                '<h1 class="visa-h2" style="margin-top:0.75rem;">Your visa case is created</h1>' +
                '<p class="visa-lede" style="margin-top:1rem;">We’re emailing your <strong>deposit invoice</strong> now. Open it and pay online or by bank transfer — as soon as your deposit lands we begin processing.</p>' +
                '<p style="margin-top:1rem;opacity:.7;font-size:.9rem;">Check your inbox (and spam). Your $50 deposit is credited toward your visa total and refunded if you’re not eligible.</p>' +
                '<a class="visa-btn visa-btn--primary" style="margin-top:1.5rem;" href="dashboard-visas.html">Go to my dashboard &#8594;</a>' +
              '</div>' +
            '</section>';
          window.scrollTo(0, 0);
        }
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again or message us on WhatsApp.');
        btn.disabled = false; btn.textContent = 'Submit & email my invoice';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
