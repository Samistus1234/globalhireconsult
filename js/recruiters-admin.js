/* ============================================
   GLOBALHIRE@ELAB — Recruiters Admin Page
   Approve, create, manage recruiters
   ============================================ */

(function () {
  var adminProfile = null;
  var allRecruiters = [];

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadRecruiters();
    bindFilters();
    bindCreateModal();
    bindSuppressionSyncButton();
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
    document.getElementById('admin-signout')?.addEventListener('click', function (e) {
      e.preventDefault(); GHAuth.signOut();
    });
  }

  async function loadRecruiters() {
    var session = await GHAuth.getSession();
    var resp = await fetch(SUPABASE_URL + '/functions/v1/manage-recruiter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'list_recruiters' })
    });
    var result = await resp.json();
    allRecruiters = result.recruiters || [];
    updateKPIs();
    renderTable(allRecruiters);
  }

  function updateKPIs() {
    var total = allRecruiters.length;
    var pending = allRecruiters.filter(function (r) { return !r.recruiter_approved; }).length;
    var approved = allRecruiters.filter(function (r) { return r.recruiter_approved; }).length;
    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-pending').textContent = pending;
    document.getElementById('kpi-approved').textContent = approved;
  }

  function renderTable(list) {
    var tbody = document.getElementById('recruiters-tbody');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-10);color:var(--text-tertiary);">No recruiters yet. Invite hospitals and agencies to register at <strong>/recruiter-signup.html</strong></td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (r) {
      var colors = GHE.avatarColors[Math.abs(r.id.charCodeAt(0)) % GHE.avatarColors.length];
      var initials = (r.full_name || '??').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
      var joined = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      var statusHtml = r.recruiter_approved
        ? '<span class="status-approved">● Approved</span>'
        : '<span class="status-pending">● Pending Approval</span>';

      var resendBtn = '<button class="btn btn-ghost btn-sm btn-resend-welcome" data-id="' + r.id + '" data-name="' + esc(r.full_name) + '" style="font-size:11px;margin-left:var(--space-2);" title="Resend welcome email">✉ Resend</button>';
      var actions = r.recruiter_approved
        ? '<div style="display:flex;align-items:center;">' + resendBtn + '</div>'
        : '<div style="display:flex;align-items:center;gap:var(--space-2);"><button class="btn btn-primary btn-sm btn-approve" data-id="' + r.id + '" data-name="' + esc(r.full_name) + '">Approve</button>' + resendBtn + '</div>';

      var marketingOn = r.allow_direct_marketing !== false;
      var marketingBtn = '<button class="btn-marketing-toggle ' + (marketingOn ? 'marketing-on' : 'marketing-off') + '" data-id="' + r.id + '" data-name="' + esc(r.full_name) + '" data-current="' + (marketingOn ? 'true' : 'false') + '" title="Toggle direct marketing eligibility">' + (marketingOn ? 'On' : 'Off') + '</button>';

      return '<tr>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:var(--space-3);">' +
            '<div class="avatar avatar-sm" style="background:' + colors[0] + ';color:' + colors[1] + '">' + esc(initials) + '</div>' +
            '<div>' +
              '<div style="font-weight:600;color:var(--text-primary);">' + esc(r.full_name || 'Unnamed') + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + esc(r.organization_name || '—') + '</td>' +
        '<td>' + esc(r.country_of_origin || '—') + '</td>' +
        '<td>' + joined + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + marketingBtn + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');

    // Bind approve buttons
    tbody.querySelectorAll('.btn-approve').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var recruiterId = btn.dataset.id;
        var name = btn.dataset.name;
        if (!confirm('Approve ' + name + ' as a recruiter? They will be able to log in and view assigned candidates.')) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span>';

        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/manage-recruiter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: 'approve', recruiter_id: recruiterId })
          });
          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Failed');
          if (window.ElabTracker) ElabTracker.track('gh_recruiter_approved', 'high_value', { recruiter_id: recruiterId, recruiter_name: name, platform: 'globalhire' });
          await loadRecruiters();
        } catch (err) {
          alert('Failed to approve: ' + err.message);
          btn.disabled = false;
          btn.textContent = 'Approve';
        }
      });
    });

    // Bind resend welcome email buttons
    tbody.querySelectorAll('.btn-resend-welcome').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var recruiterId = btn.dataset.id;
        var name = btn.dataset.name;
        if (!confirm('Resend welcome email to ' + name + '?')) return;
        btn.disabled = true;
        btn.textContent = 'Sending...';
        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/manage-recruiter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: 'resend_welcome', recruiter_id: recruiterId })
          });
          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Failed');
          btn.textContent = 'Sent ✓';
          setTimeout(function () { btn.textContent = '✉ Resend'; btn.disabled = false; }, 3000);
        } catch (err) {
          alert('Failed to send: ' + err.message);
          btn.textContent = '✉ Resend';
          btn.disabled = false;
        }
      });
    });

    // Bind direct-marketing toggle buttons
    tbody.querySelectorAll('.btn-marketing-toggle').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var recruiterId = btn.dataset.id;
        var name = btn.dataset.name;
        var current = btn.dataset.current === 'true';
        var newVal = !current;

        if (!newVal) {
          if (!confirm("Exclude " + name + "'s candidates from all marketing campaigns?")) return;
        }

        btn.disabled = true;
        var prevText = btn.textContent;
        btn.textContent = '...';

        try {
          var { error } = await ghFrom('profiles').update({ allow_direct_marketing: newVal }).eq('id', recruiterId);
          if (error) throw new Error(error.message || 'Failed');
          triggerSuppressionSync(); // fire-and-forget: propagate to Command Centre email_contacts
          await loadRecruiters();
        } catch (err) {
          alert('Failed to update direct marketing setting: ' + err.message);
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
    });
  }

  // Fire-and-forget call to the cross-DB suppression bridge. Never blocks or
  // surfaces errors to the toggle flow — the manual "Sync suppression" button
  // is the retry path if this silently fails (network blip, cold start, etc).
  function triggerSuppressionSync() {
    GHAuth.getSession().then(function (session) {
      return fetch(SUPABASE_URL + '/functions/v1/sync-marketing-suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: '{}'
      });
    }).catch(function (err) {
      console.warn('sync-marketing-suppression trigger failed (non-blocking):', err);
    });
  }

  function bindSuppressionSyncButton() {
    var btn = document.getElementById('btn-sync-suppression');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      var prevText = btn.textContent;
      btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Syncing...';
      try {
        var session = await GHAuth.getSession();
        var resp = await fetch(SUPABASE_URL + '/functions/v1/sync-marketing-suppression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
          body: '{}'
        });
        var result = await resp.json();
        if (!resp.ok || result.error) throw new Error(result.error || 'Failed');
        alert('Suppression sync complete.\n\nOpt-out recruiters: ' + result.opt_out_recruiters +
          '\nOpt-out emails: ' + result.opt_out_emails +
          '\nFlagged in Command Centre: ' + result.cc_flagged +
          '\nCleared (re-included): ' + result.cc_cleared +
          (result.unresolved_profile_emails ? '\nUnresolved profile emails: ' + result.unresolved_profile_emails : ''));
      } catch (err) {
        alert('Suppression sync failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });
  }

  function bindFilters() {
    var search = document.getElementById('rec-search');
    var statusFilter = document.getElementById('filter-status');

    function applyFilters() {
      var q = (search?.value || '').toLowerCase().trim();
      var st = statusFilter?.value || '';
      var filtered = allRecruiters.filter(function (r) {
        if (q && !(r.full_name + ' ' + r.organization_name + ' ' + r.country_of_origin).toLowerCase().includes(q)) return false;
        if (st === 'pending' && r.recruiter_approved) return false;
        if (st === 'approved' && !r.recruiter_approved) return false;
        return true;
      });
      renderTable(filtered);
    }

    if (search) search.addEventListener('input', GHE.debounce(applyFilters, 200));
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
  }

  function bindCreateModal() {
    var modal = document.getElementById('create-modal');
    var openBtn = document.getElementById('btn-create-recruiter');
    var closeBtn = document.getElementById('modal-close');
    var cancelBtn = document.getElementById('modal-cancel');
    var form = document.getElementById('create-form');
    var alertEl = document.getElementById('modal-alert');
    var submitBtn = document.getElementById('create-submit');

    function openModal() { modal.classList.add('open'); }
    function closeModal() { modal.classList.remove('open'); form.reset(); alertEl.style.display = 'none'; }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        alertEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Creating...';

        try {
          var session = await GHAuth.getSession();
          var resp = await fetch(SUPABASE_URL + '/functions/v1/recruiter-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({
              full_name: document.getElementById('c-name').value.trim(),
              email: document.getElementById('c-email').value.trim(),
              password: document.getElementById('c-password').value,
              organization_name: document.getElementById('c-org').value.trim(),
              country: document.getElementById('c-country').value.trim(),
              phone: document.getElementById('c-phone').value.trim()
            })
          });
          var result = await resp.json();
          if (!resp.ok || !result.success) throw new Error(result.error || 'Failed');

          closeModal();
          await loadRecruiters();
        } catch (err) {
          alertEl.textContent = err.message || 'Failed to create account.';
          alertEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
        }
      });
    }
  }

})();
