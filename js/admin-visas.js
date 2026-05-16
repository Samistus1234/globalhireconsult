/* GLOBALHIRE@ELAB — Admin visa case queue */
(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';

  function authHeader() {
    var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    return t ? 'Bearer ' + t : null;
  }

  async function fetchCases(status, q) {
    var url = SUPABASE_URL + '/rest/v1/visa_cases?select=id,visa_type,status,candidate_id,created_at&order=created_at.desc&limit=200';
    if (status) url += '&status=eq.' + status;
    var resp = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader(), 'Accept-Profile': 'globalhire' },
    });
    if (!resp.ok) throw new Error('fetch failed');
    var rows = await resp.json();
    if (q) {
      var ql = q.toLowerCase();
      rows = rows.filter(function (r) { return r.id.toLowerCase().includes(ql); });
    }
    return rows;
  }

  function render(rows) {
    var list = document.getElementById('admin-cases-list');
    if (!rows.length) { list.innerHTML = '<p>No cases match the filters.</p>'; return; }
    list.innerHTML =
      '<table style="width:100%; border-collapse: collapse;">' +
        '<thead><tr style="text-align:left; border-bottom: 1px solid rgba(255,255,255,.15);">' +
          '<th style="padding:8px;">Case</th><th>Visa</th><th>Status</th><th>Started</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr style="border-bottom: 1px solid rgba(255,255,255,.06);">' +
            '<td style="padding:8px;"><a href="admin-visa-case.html?id=' + r.id + '" style="color: var(--primary-light);">' + r.id.slice(0,8) + '…</a></td>' +
            '<td>' + r.visa_type.replace(/_/g,' ') + '</td>' +
            '<td>' + r.status.replace(/_/g,' ') + '</td>' +
            '<td>' + new Date(r.created_at).toLocaleString() + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table>';
  }

  function refresh() {
    var status = document.getElementById('filter-status').value;
    var q = document.getElementById('filter-q').value;
    fetchCases(status, q).then(render).catch(function () {
      document.getElementById('admin-cases-list').innerHTML = '<p>Could not load cases (admin only).</p>';
    });
  }

  function init() {
    if (!authHeader()) { location.href = 'login.html?return=' + encodeURIComponent(location.pathname); return; }
    document.getElementById('filter-status').addEventListener('change', refresh);
    document.getElementById('filter-q').addEventListener('input', function () {
      clearTimeout(window._adminQT);
      window._adminQT = setTimeout(refresh, 250);
    });
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
