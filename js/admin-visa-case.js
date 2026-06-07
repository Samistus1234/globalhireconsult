/* GLOBALHIRE@ELAB — Admin per-case actions */
(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';
  var FN_BASE = SUPABASE_URL + '/functions/v1';

  var VISA_LABEL = {
    tourist: 'Tourist eVisa', umrah: 'Umrah', hajj: 'Hajj', family_visit: 'Family Visit',
    family_residence: 'Family Residence', business: 'Business Visit', work_iqama: 'Work & Iqama',
    premium_residency: 'Premium Residency', investor_misa: 'Investor (MISA)', transit: 'Transit',
    domestic_worker: 'Domestic Worker',
  };
  var STATUS_LABEL = {
    lead: 'Lead', eligibility_passed: 'Eligibility passed', deposit_pending: 'Awaiting deposit',
    intake_in_review: 'Documents in review', docs_revision: 'Revision requested',
    submitted_to_partner: 'Submitted to MoFA', partner_processing: 'Processing', approved: 'Approved — balance due',
    issued: 'Visa issued', rejected_intake: 'Rejected (refunded)', rejected_partner: 'Rejected by partner',
    refunded: 'Refunded', on_hold: 'On hold', stale: 'Awaiting applicant',
  };

  // Transient feedback banner under the header (created on demand)
  function flash(msg, kind) {
    var el = document.getElementById('admin-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'admin-flash';
      el.style.cssText = 'margin:0.75rem 0;padding:0.6rem 0.9rem;border-radius:8px;font-size:0.9rem;font-weight:600;';
      var meta = document.getElementById('admin-case-meta');
      if (meta && meta.parentNode) meta.parentNode.insertBefore(el, meta.nextSibling);
    }
    el.style.background = kind === 'error' ? '#fde8e8' : '#e7f6ec';
    el.style.color = kind === 'error' ? '#9b1c1c' : '#0a6b34';
    el.textContent = msg;
  }

  async function authHeader() {
    var session = (window.GHAuth ? await GHAuth.getSession() : null);
    return session ? 'Bearer ' + session.access_token : null;
  }

  function caseId() { return new URLSearchParams(location.search).get('id'); }

  async function rest(path) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPABASE_ANON, Authorization: await authHeader(), 'Accept-Profile': 'globalhire' },
    });
    if (!r.ok) throw new Error('rest fail');
    return r.json();
  }

  async function callAction(action, extra) {
    var resp = await fetch(FN_BASE + '/visa-admin-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify(Object.assign({ action: action, case_id: caseId() }, extra || {})),
    });
    if (!resp.ok) throw new Error(action + ' failed: ' + (await resp.text()));
    return resp.json();
  }

  async function callSubmitPartner() {
    var resp = await fetch(FN_BASE + '/submit-to-partner', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ case_id: caseId() }),
    });
    if (!resp.ok) throw new Error('submit-to-partner failed: ' + (await resp.text()));
    return resp.json();
  }

  function renderDocs(docs) {
    document.getElementById('admin-docs').innerHTML = docs.length
      ? '<table style="width:100%; border-collapse: collapse;">' +
        docs.map(function (d) {
          return '<tr style="border-bottom: 1px solid rgba(255,255,255,.06);">' +
            '<td style="padding:6px;"><strong>' + d.doc_kind + '</strong></td>' +
            '<td>' + d.review_status + '</td>' +
            '<td>' +
              '<button data-action="accept_doc" data-doc-id="' + d.id + '" class="mock-button" style="margin-right:6px;">Accept</button>' +
              '<button data-action="reject_doc" data-doc-id="' + d.id + '" class="mock-button">Reject</button>' +
            '</td>' +
          '</tr>';
        }).join('') + '</table>'
      : '<p>No documents.</p>';

    document.querySelectorAll('#admin-docs button[data-action]').forEach(function (b) {
      b.addEventListener('click', function () {
        var reason = b.dataset.action === 'reject_doc' ? prompt('Reason?') : null;
        callAction(b.dataset.action, { doc_id: b.dataset.docId, reason: reason }).then(load);
      });
    });
  }

  async function load() {
    var [cases, docs, events] = await Promise.all([
      rest('visa_cases?id=eq.' + caseId() + '&select=*'),
      rest('visa_case_documents?case_id=eq.' + caseId() + '&select=*'),
      rest('visa_case_events?case_id=eq.' + caseId() + '&select=*&order=created_at.asc'),
    ]);
    if (!cases.length) { location.href = 'admin-visas.html'; return; }
    var c = cases[0];
    var prof = ((await rest('profiles?id=eq.' + c.candidate_id + '&select=full_name,email,phone').catch(function(){ return []; }))[0]) || {};
    var visaLabel = VISA_LABEL[c.visa_type] || (c.visa_type || '').replace(/_/g, ' ');
    var statusLabel = STATUS_LABEL[c.status] || (c.status || '').replace(/_/g, ' ');
    document.getElementById('admin-case-title').innerHTML =
      visaLabel + ' <span style="font-size:0.55em;font-weight:600;vertical-align:middle;padding:0.25em 0.7em;border-radius:999px;background:var(--sand,#efe9dd);color:var(--espresso,#3a2e1f);">' + statusLabel + '</span>';
    document.getElementById('admin-case-meta').textContent =
      (prof.full_name || 'Applicant') + (prof.email ? ' · ' + prof.email : '') + (prof.phone ? ' · ' + prof.phone : '') +
      ' · Ref ' + String(c.id).slice(0, 8).toUpperCase();
    renderDocs(docs);
    document.getElementById('admin-events').innerHTML = events.map(function (e) {
      return '<div class="visa-timeline__item"><strong>' + e.event_type + '</strong> <time>' + new Date(e.created_at).toLocaleString() + '</time></div>';
    }).join('');
  }

  async function init() {
    if (!(await authHeader()) || !caseId()) { location.href = 'admin-visas.html'; return; }

    function run(p, okMsg) {
      flash('Working…');
      return p.then(function () { return load(); })
        .then(function () { flash(okMsg); })
        .catch(function (e) { flash('Failed: ' + (e && e.message ? e.message : e), 'error'); });
    }

    document.getElementById('btn-submit-partner')   .addEventListener('click', function () { if (confirm('Submit to MoFA partner?'))      run(callSubmitPartner(), '✓ Submitted to MoFA partner — applicant emailed.'); });
    document.getElementById('btn-request-revision') .addEventListener('click', function () { var r = prompt('Revision reason for candidate?'); if (r) run(callAction('request_revision', { reason: r }), '✓ Revision requested — applicant emailed.'); });
    document.getElementById('btn-mark-issued')      .addEventListener('click', function () { if (confirm('Mark this case as issued?'))   run(callAction('mark_issued'), '✓ Marked issued — applicant emailed.'); });
    document.getElementById('btn-reject-intake')    .addEventListener('click', function () { var r = prompt('Rejection reason (will refund $50)?'); if (r) run(callAction('reject_intake', { reason: r }), '✓ Rejected & $50 deposit refunded — applicant emailed.'); });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
