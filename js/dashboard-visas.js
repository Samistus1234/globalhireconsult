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
    deposit_pending:        ['Awaiting payment',   '#F4A261'],
    intake_in_review:       ['Document review',    '#48CAE4'],
    docs_revision:          ['Action needed',      '#F4A261'],
    submitted_to_partner:   ['Submitted',          '#48CAE4'],
    partner_processing:     ['At MoFA',            '#48CAE4'],
    approved:               ['Approved — pay balance', '#2EC4B6'],
    issued:                 ['Visa issued',        '#2EC4B6'],
    rejected_intake:        ['Refunded — ineligible', '#8DA2BE'],
    rejected_partner:       ['Rejected',           '#E63946'],
    refunded:               ['Refunded',           '#8DA2BE'],
    stale:                  ['Awaiting your action', '#F4A261'],
    on_hold:                ['On hold',            '#8DA2BE'],
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
      var label = STATUS_LABEL[c.status] || [c.status, '#8DA2BE'];
      return (
        '<a class="visa-catalog-card" href="dashboard-visa-case.html?id=' + c.id + '">' +
          '<h3>' + (VISA_LABEL[c.visa_type] || c.visa_type) + '</h3>' +
          '<div class="price">' + (c.estimated_total_usd ? '$' + c.estimated_total_usd : '—') + '</div>' +
          '<div class="meta">' +
            '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:' + label[1] + '20; color:' + label[1] + ';">' + label[0] + '</span>' +
            '<span style="float:right;">' + new Date(c.created_at).toLocaleDateString() + '</span>' +
          '</div>' +
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
