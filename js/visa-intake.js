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

        // Step 3: redirect to payment
        window.location.href = created.payment_url;
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again or message us on WhatsApp.');
        btn.disabled = false; btn.textContent = 'Pay $50 & start case';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
