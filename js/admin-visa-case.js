/* GLOBALHIRE@ELAB — Admin per-case actions */
(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';
  var FN_BASE = SUPABASE_URL + '/functions/v1';

  function authHeader() {
    var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    return t ? 'Bearer ' + t : null;
  }

  function caseId() { return new URLSearchParams(location.search).get('id'); }

  async function rest(path) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader(), 'Accept-Profile': 'globalhire' },
    });
    if (!r.ok) throw new Error('rest fail');
    return r.json();
  }

  async function callAction(action, extra) {
    var resp = await fetch(FN_BASE + '/visa-admin-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(Object.assign({ action: action, case_id: caseId() }, extra || {})),
    });
    if (!resp.ok) throw new Error(action + ' failed: ' + (await resp.text()));
    return resp.json();
  }

  async function callSubmitPartner() {
    var resp = await fetch(FN_BASE + '/submit-to-partner', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader() },
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
    document.getElementById('admin-case-title').textContent = c.visa_type.replace(/_/g,' ') + ' · ' + c.status.replace(/_/g,' ');
    document.getElementById('admin-case-meta').textContent  = 'Case ' + c.id + ' · candidate ' + c.candidate_id;
    renderDocs(docs);
    document.getElementById('admin-events').innerHTML = events.map(function (e) {
      return '<div class="visa-timeline__item"><strong>' + e.event_type + '</strong> <time>' + new Date(e.created_at).toLocaleString() + '</time></div>';
    }).join('');
  }

  function init() {
    if (!authHeader() || !caseId()) { location.href = 'admin-visas.html'; return; }

    document.getElementById('btn-submit-partner')   .addEventListener('click', function () { if (confirm('Submit to partner?'))         callSubmitPartner().then(load); });
    document.getElementById('btn-request-revision') .addEventListener('click', function () { var r = prompt('Revision reason for candidate?'); if (r) callAction('request_revision', { reason: r }).then(load); });
    document.getElementById('btn-mark-issued')      .addEventListener('click', function () { if (confirm('Mark this case as issued?'))   callAction('mark_issued').then(load); });
    document.getElementById('btn-reject-intake')    .addEventListener('click', function () { var r = prompt('Rejection reason (will refund $50)?'); if (r) callAction('reject_intake', { reason: r }).then(load); });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
