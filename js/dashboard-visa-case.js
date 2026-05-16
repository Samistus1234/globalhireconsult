/* GLOBALHIRE@ELAB — Visa case detail */
(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';

  function authHeader() {
    var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    return t ? 'Bearer ' + t : null;
  }

  function caseId() {
    return new URLSearchParams(location.search).get('id');
  }

  async function rest(path) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader(), 'Accept-Profile': 'globalhire' },
    });
    if (!r.ok) throw new Error('fetch ' + path + ' failed');
    return r.json();
  }

  async function init() {
    if (!authHeader() || !caseId()) { location.href = 'dashboard-visas.html'; return; }
    var id = caseId();

    var [cases, docs, invoices, events] = await Promise.all([
      rest('visa_cases?id=eq.' + id + '&select=*'),
      rest('visa_case_documents?case_id=eq.' + id + '&select=*'),
      rest('visa_invoices?case_id=eq.' + id + '&select=*'),
      rest('visa_case_events?case_id=eq.' + id + '&select=*&order=created_at.asc'),
    ]);
    if (!cases.length) { location.href = 'dashboard-visas.html'; return; }

    var c = cases[0];
    document.getElementById('case-title').textContent = (c.visa_type.replace('_',' ')) + ' visa';
    document.getElementById('case-subtitle').textContent = 'Started ' + new Date(c.created_at).toLocaleDateString();
    document.getElementById('case-status-pill').textContent = c.status.replace(/_/g, ' ');

    // Timeline (immutable events)
    document.getElementById('case-timeline').innerHTML = events.length
      ? events.map(function (e) { return '<div style="padding: var(--space-2) 0; border-bottom: 1px solid rgba(255,255,255,.06);"><strong>' + e.event_type + '</strong> · ' + new Date(e.created_at).toLocaleString() + '</div>'; }).join('')
      : '<p style="color: var(--text-secondary);">No events yet.</p>';

    // Documents
    document.getElementById('case-documents').innerHTML = docs.length
      ? docs.map(function (d) { return '<div style="padding: var(--space-2) 0;"><strong>' + d.doc_kind.replace(/_/g,' ') + '</strong> — ' + d.review_status + '</div>'; }).join('')
      : '<p style="color: var(--text-secondary);">No documents uploaded.</p>';

    // Invoices
    document.getElementById('case-invoices').innerHTML = invoices.length
      ? invoices.map(function (i) { return '<div style="padding: var(--space-2) 0;"><strong>$' + i.amount_usd + '</strong> ' + i.kind + ' — ' + i.status + ' (' + (i.provider || '—') + ')</div>'; }).join('')
      : '<p style="color: var(--text-secondary);">No invoices yet.</p>';

    // Next action
    var nextAction = {
      deposit_pending:    'Awaiting your $50 deposit.',
      intake_in_review:   'Our intake team is reviewing your documents — usually within 24 hours.',
      docs_revision:      'Please re-upload the document we flagged.',
      submitted_to_partner: 'Submitted to our MoFA-licensed partner.',
      partner_processing: 'Being processed by Saudi authorities.',
      approved:           'Approved — pay the balance to receive your visa PDF.',
      issued:             'Visa issued — download below.',
      rejected_intake:    'We were unable to proceed. Your $50 deposit has been refunded.',
      rejected_partner:   'The Saudi authorities did not approve this application. We have refunded the balance.',
      refunded:           'Refunded.',
      stale:              'Please upload missing documents to proceed.',
      on_hold:            'On hold.',
    }[c.status];
    if (nextAction) document.getElementById('case-next-action').textContent = nextAction;

    if (c.visa_pdf_path) {
      var link = document.getElementById('case-pdf-link');
      link.hidden = false;
      link.href = SUPABASE_URL + '/storage/v1/object/sign/visa-documents/' + c.visa_pdf_path;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
