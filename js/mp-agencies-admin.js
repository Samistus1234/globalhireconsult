/* ============================================
   GLOBALHIRE@ELAB — Partner Agencies Admin
   Verification queue: list, review drawer, verify/reject/suspend
   ============================================ */

(function () {
  var adminProfile = null;
  var listEl = document.getElementById('mp-ag-list');
  var drawer = document.getElementById('mp-ag-drawer');
  var filter = document.getElementById('mp-ag-filter');
  if (!listEl || !drawer || !filter) return;

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str == null ? '' : str)));
    return d.innerHTML;
  }

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    filter.addEventListener('change', load);
    listEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.mp-ag-open');
      if (btn) openDrawer(btn.getAttribute('data-id'));
    });
    await load();
  });

  function updateAdminUI() {
    var nameEl = document.getElementById('admin-user-name');
    var roleEl = document.getElementById('admin-user-role');
    var avatarEl = document.getElementById('admin-user-avatar');
    if (nameEl) nameEl.textContent = adminProfile.full_name || 'Admin';
    if (roleEl) roleEl.textContent = 'Platform Admin';
    if (avatarEl) {
      avatarEl.textContent = adminProfile.avatar_initials || 'A';
      var colors = GHE.avatarColors[adminProfile.avatar_color_index || 0];
      avatarEl.style.background = colors[0];
      avatarEl.style.color = colors[1];
    }
    var signOutBtn = document.getElementById('admin-signout');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', function (e) { e.preventDefault(); GHAuth.signOut(); });
    }
  }

  async function callVerify(agencyId, action, note) {
    var sb = window.ghSupabase;
    try {
      var s = await sb.auth.getSession();
      var token = (s.data && s.data.session) ? s.data.session.access_token : null;
      var res = await fetch(SUPABASE_URL + '/functions/v1/mp-agency-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': sb.supabaseKey || '',
          'Authorization': 'Bearer ' + (token || sb.supabaseKey || '')
        },
        body: JSON.stringify({ agency_id: agencyId, action: action, note: note })
      });
      var out = await res.json().catch(function () { return {}; });
      return res.ok ? out : { error: (out && out.error) || ('HTTP ' + res.status) };
    } catch (e) {
      // Mirrors MP.callFn's "never rejects" contract — a cold-start non-JSON body,
      // a worker-boot 502, or a lapsed session between gh:auth-ready and the click
      // must resolve to an error object, never an unhandled rejection that leaves
      // the drawer reading "Working…" forever.
      return { error: (e && e.message) || String(e) };
    }
  }

  function renderTable(rows) {
    var head = '<thead><tr><th>Agency</th><th>Country</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>';
    if (!rows.length) {
      return '<div class="panel"><div class="panel-body-flush"><table class="recruiter-table">' + head +
        '<tbody><tr><td colspan="5" style="text-align:center;padding:var(--space-10);color:var(--text-tertiary);">No agencies match this filter.</td></tr></tbody></table></div></div>';
    }
    var body = rows.map(function (a) {
      var created = a.created_at ? String(a.created_at).slice(0, 10) : '—';
      return '<tr data-id="' + esc(a.id) + '">' +
        '<td>' + esc(a.name) + '</td>' +
        '<td>' + esc(a.country || '—') + '</td>' +
        '<td>' + esc(a.status) + '</td>' +
        '<td>' + esc(created) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm mp-ag-open" data-id="' + esc(a.id) + '">Review</button></td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="panel-body-flush"><table class="recruiter-table">' + head + '<tbody>' + body + '</tbody></table></div></div>';
  }

  async function load() {
    var qy = ghFrom('mp_agencies').select('*').order('created_at', { ascending: false });
    if (filter.value !== 'all') qy = qy.eq('status', filter.value);
    var r = await qy;
    if (r.error) {
      listEl.innerHTML = '<div class="panel" style="padding:var(--space-6);color:#EF4444;">Error: ' + esc(r.error.message) + '</div>';
      return;
    }
    listEl.innerHTML = renderTable(r.data || []);
  }

  async function signedLink(path) {
    if (!path) return '';
    var sb = window.ghSupabase;
    var s = await sb.storage.from('gh-applicant-documents').createSignedUrl(path, 600);
    return (s.data && s.data.signedUrl) ? '<a href="' + esc(s.data.signedUrl) + '" target="_blank" rel="noopener">Open</a>' : '';
  }

  async function openDrawer(id) {
    var r = await ghFrom('mp_agencies').select('*').eq('id', id).single();
    var a = r.data;
    if (!a) return;

    var mc = await ghFrom('mp_agency_members').select('id', { count: 'exact', head: true }).eq('agency_id', id);
    var memberCount = mc.count || 0;

    var licenceLink = await signedLink(a.licence_file_path);
    var profileLink = await signedLink(a.company_profile_path);
    var founded = (a.year_founded !== null && a.year_founded !== undefined) ? String(a.year_founded) : '—';

    drawer.hidden = false;
    drawer.innerHTML =
      '<div class="panel" style="padding:var(--space-6);margin-top:var(--space-4);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);">' +
      '<div style="font-size:var(--text-xl);font-weight:800;color:var(--text-primary);">' + esc(a.name) + '</div>' +
      '<button class="btn btn-ghost btn-sm" id="mp-ag-drawer-close">✕</button>' +
      '</div>' +
      '<p><strong>Location:</strong> ' + esc(a.city || '—') + ', ' + esc(a.country || '—') + '</p>' +
      '<p><strong>Founded:</strong> ' + esc(founded) + '</p>' +
      '<p><strong>Website:</strong> ' + esc(a.website || '—') + '</p>' +
      '<p><strong>Owner:</strong> ' + esc(a.owner_name || '—') + '</p>' +
      '<p><strong>Members:</strong> ' + esc(String(memberCount)) + '</p>' +
      '<p><strong>Services:</strong> ' + esc((a.services || []).join(', ') || '—') + '</p>' +
      '<p><strong>Cooperation areas:</strong> ' + esc((a.cooperation_areas || []).join(', ') || '—') + '</p>' +
      '<p><strong>Licence document:</strong> ' + (licenceLink || '—') + '</p>' +
      '<p><strong>Company profile:</strong> ' + (profileLink || '—') + '</p>' +
      (a.verification_note ? '<p><strong>Verification note:</strong> ' + esc(a.verification_note) + '</p>' : '') +
      '<div class="mp-ag-actions" style="display:flex;gap:var(--space-3);margin-top:var(--space-5);">' +
      '<button class="btn btn-primary btn-sm" data-act="verify">Verify</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="reject">Reject</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="suspend">Suspend</button>' +
      '</div>' +
      '<p id="mp-ag-drawer-msg" style="margin-top:var(--space-3);color:var(--text-tertiary);font-size:var(--text-sm);"></p>' +
      '</div>';

    var closeBtn = document.getElementById('mp-ag-drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { drawer.hidden = true; drawer.innerHTML = ''; });
    }

    drawer.querySelectorAll('.mp-ag-actions button').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var action = btn.getAttribute('data-act');
        var note;
        if (action === 'verify') {
          note = undefined;
        } else {
          note = window.prompt((action === 'reject' ? 'Reject' : 'Suspend') + ' — note for the agency (required):');
          if (note === null) return; // cancelled
          note = note.trim();
          if (!note) { window.alert('A note is required to ' + action + ' this agency.'); return; }
        }
        var msgEl = document.getElementById('mp-ag-drawer-msg');
        if (msgEl) msgEl.textContent = 'Working…';
        var out = await callVerify(id, action, note);
        if (!msgEl) return;
        if (out && out.success) {
          msgEl.textContent = 'Done: ' + out.status;
          await load();
        } else {
          msgEl.textContent = 'Error: ' + esc((out && out.error) ? out.error : 'unknown error');
        }
      });
    });
  }
})();
