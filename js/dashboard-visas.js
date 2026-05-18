/* ============================================
   GLOBALHIRE@ELAB — Dashboard visa cases
   Reads via PostgREST (RLS scopes to candidate).
   ============================================ */

(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';

  var STATUS_LABEL = {
    deposit_pending:        ['Awaiting payment',   'warning'],
    intake_in_review:       ['Document review',    'success'],
    docs_revision:          ['Action needed',      'warning'],
    submitted_to_partner:   ['Submitted',          'success'],
    partner_processing:     ['At MoFA',            'neutral'],
    approved:               ['Approved — pay balance', 'success'],
    issued:                 ['Visa issued',        'success'],
    rejected_intake:        ['Refunded — ineligible', 'neutral'],
    rejected_partner:       ['Rejected',           'error'],
    refunded:               ['Refunded',           'neutral'],
    stale:                  ['Awaiting your action', 'warning'],
    on_hold:                ['On hold',            'neutral'],
  };

  var VISA_LABEL = {
    tourist: 'Tourist eVisa', umrah: 'Umrah', hajj: 'Hajj',
    family_visit: 'Family Visit', family_residence: 'Family Residence',
    business: 'Business Visit', work_iqama: 'Work & Iqama',
    premium_residency: 'Premium Residency', investor_misa: 'Investor (MISA)',
    transit: 'Transit', domestic_worker: 'Domestic Worker',
  };

  function authHeader() {
    var token = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    return token ? 'Bearer ' + token : null;
  }

  async function fetchCases() {
    var resp = await fetch(SUPABASE_URL + '/rest/v1/visa_cases?select=id,visa_type,status,estimated_total_usd,created_at,current_state_changed_at&order=created_at.desc', {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: authHeader(),
        'Accept-Profile': 'globalhire',
      },
    });
    if (!resp.ok) throw new Error('fetch cases failed');
    return resp.json();
  }

  function renderCases(cases) {
    var list = document.getElementById('visa-cases-list');
    var empty = document.getElementById('visa-cases-empty');
    if (!cases.length) { empty.hidden = false; return; }
    empty.hidden = true;
    list.innerHTML = cases.map(function (c) {
      var label = STATUS_LABEL[c.status] || [c.status, 'neutral'];
      var pillClass = ({success:'success', warning:'warning', error:'error', neutral:'neutral'})[label[1]] || 'neutral';
      return (
        '<a class="visa-case-card" href="dashboard-visa-case.html?id=' + c.id + '">' +
          '<span class="visa-case-card__title">' + (VISA_LABEL[c.visa_type] || c.visa_type) + '</span>' +
          '<span class="visa-case-card__meta">' +
            '<span class="visa-pill visa-pill--' + pillClass + '">' + label[0] + '</span>' +
            '<time>' + new Date(c.created_at).toLocaleDateString() + '</time>' +
          '</span>' +
        '</a>'
      );
    }).join('');
  }

  function init() {
    if (!authHeader()) {
      location.href = 'login.html?return=' + encodeURIComponent(location.pathname);
      return;
    }
    fetchCases()
      .then(renderCases)
      .catch(function () { document.getElementById('visa-cases-list').innerHTML = '<p>Could not load cases.</p>'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
