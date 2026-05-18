/* ============================================
   GLOBALHIRE@ELAB — Visa wizard
   Two-step: outcome → eligibility → visa detail page.
   ============================================ */

(function () {
  'use strict';

  // Config — overridden by window.VISA_FN_BASE if set on the page
  // GlobalHire Supabase project ref (per js/supabase-client.js): evzhnsugmvtqgmvzwyix
  var FN_BASE = window.VISA_FN_BASE ||
    'https://' + (window.SUPABASE_REF || 'evzhnsugmvtqgmvzwyix') + '.functions.supabase.co';

  var OUTCOME_TO_PAGE = {
    'visit-saudi':     { v1: 'visa-tourist-evisa.html',     visaType: 'tourist' },
    'go-for-umrah':    { v1: 'visa-umrah.html',             visaType: 'umrah' },
    'bring-my-family': { v1: 'visa-family-visit.html',      visaType: 'family_visit' },
    'live-with-family':{ v1: 'visa-family-residence.html',  visaType: 'family_residence' },
    // v2/v3 outcomes — soft-deflect:
    'perform-hajj':       { comingSoon: true, label: 'Hajj' },
    'work-in-ksa':        { comingSoon: true, label: 'Work & Iqama' },
    'hire-a-helper':      { comingSoon: true, label: 'Domestic Worker' },
    'do-business':        { comingSoon: true, label: 'Business Visit (currently unavailable)' },
  };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function getUTM() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get('utm_source')   || undefined,
      utm_medium:   p.get('utm_medium')   || undefined,
      utm_campaign: p.get('utm_campaign') || undefined,
    };
  }

  function getSessionId() {
    var key = 'gh_visa_session';
    var sid = localStorage.getItem(key);
    if (!sid) {
      sid = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, sid);
    }
    return sid;
  }

  function postJSON(path, body) {
    return fetch(FN_BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function showComingSoon(outcomeMeta) {
    var msg = $('#wizard-deflection');
    if (!msg) return;
    msg.hidden = false;
    msg.innerHTML =
      '<p><strong>' + outcomeMeta.label + '</strong> visas are coming soon. ' +
      'Tap WhatsApp and our team will help you start now.</p>' +
      '<a class="visa-cta-primary" href="https://wa.me/9295419232">Chat on WhatsApp</a>';
  }

  function init() {
    var chips = $$('.visa-outcome-chip');
    if (!chips.length) return;

    chips.forEach(function (chip) {
      chip.setAttribute('role', 'button');
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.setAttribute('aria-selected', 'false'); });
        chip.setAttribute('aria-selected', 'true');

        var outcome = chip.getAttribute('data-outcome');
        var meta = OUTCOME_TO_PAGE[outcome];
        if (!meta) return;

        if (meta.comingSoon) {
          showComingSoon(meta);
          return;
        }

        // Submit the lead, then route
        postJSON('/submit-visa-eligibility', Object.assign({
          outcome: outcome,
          session_id: getSessionId(),
        }, getUTM())).then(function (resp) {
          if (resp && resp.lead_id) {
            sessionStorage.setItem('gh_visa_lead_id', resp.lead_id);
          }
          window.location.href = meta.v1 + '?outcome=' + encodeURIComponent(outcome);
        }).catch(function () {
          // Fail open — still navigate, server will create lead from the visa page if needed
          window.location.href = meta.v1 + '?outcome=' + encodeURIComponent(outcome);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
