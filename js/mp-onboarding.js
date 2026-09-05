/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: onboarding / partnership profile + team
   Loaded after js/supabase-client.js and js/mp-core.js on partners-onboarding.html.

   This is where unverified agencies live. Editable at any status.
   Handles ?invite=<token>: if signed in, accept the invite BEFORE MP.init().

   Contract notes honoured here (see mp-core.js):
   - MP.init() is not re-entrant and does not reset MP.lastError → called EXACTLY once
     per page load; the invite-accept success path does a full reload so the next load
     runs init once against fresh membership.
   - MP.status === 'error' → guards return false WITHOUT navigating, so this page renders
     its own error state (message + retry + sign-in link).
   - MP.esc(0)/esc(false) return '' → year_founded is written to .value directly, never
     through esc().
   ============================================ */

(function () {
  var banner = document.getElementById('mp-status-banner');
  var form = document.getElementById('mp-profile-form');
  var team = document.getElementById('mp-team');
  if (!form) return;

  function q(name) { return form.querySelector('[name="' + name + '"]'); }

  function checks(name) {
    return Array.prototype.map.call(
      form.querySelectorAll('input[name="' + name + '"]:checked'),
      function (i) { return i.value; }
    );
  }
  function setChecks(name, vals) {
    (vals || []).forEach(function (v) {
      var el = form.querySelector('input[name="' + name + '"][value="' + v + '"]');
      if (el) el.checked = true;
    });
  }

  function renderError() {
    var host = document.getElementById('mp-error');
    var body = document.getElementById('mp-onboarding-body');
    if (body) body.hidden = true;
    if (!host) return;
    host.hidden = false;
    host.innerHTML =
      '<div class="mp-card">' +
      '<h2>We couldn’t load your account</h2>' +
      '<p>' + window.MP.esc(window.MP.lastError) + '</p>' +
      '<p><button type="button" class="mp-btn" id="mp-retry">Retry</button>' +
      '<a class="mp-link" href="login.html">Sign in again</a></p>' +
      '</div>';
    var b = document.getElementById('mp-retry');
    if (b) b.onclick = function () { window.location.reload(); };
  }

  // ?invite=<token> failed (400 expired / 403 wrong email / 409 already belongs elsewhere).
  // The visitor most commonly has NO existing membership at this point — the normal state
  // for a first-time invitee — so we must render this BEFORE the requireAgency() guard ever
  // runs, or it silently bounces them to partners-signup.html with no explanation, inviting
  // a duplicate-agency signup (the exact outcome the invite flow exists to avoid).
  function renderInviteError(msg) {
    var host = document.getElementById('mp-error');
    var body = document.getElementById('mp-onboarding-body');
    if (body) body.hidden = true;
    if (!host) return;
    host.hidden = false;
    host.innerHTML =
      '<div class="mp-card">' +
      '<h2>This invite could not be accepted</h2>' +
      '<p>' + window.MP.esc(msg) + '</p>' +
      '<p><a class="mp-btn" href="login.html">Sign in</a>' +
      '<a class="mp-link" href="partners-signup.html">Register a new agency instead</a></p>' +
      '</div>';
  }

  function renderBanner() {
    if (!banner) return;
    var s = window.MP.status;
    var note = (window.MP.agency && window.MP.agency.verification_note) || '';
    var map = {
      pending_verification: 'Your agency is under review. We’ll email you when it’s verified. You can complete your profile now.',
      verified: 'Your agency is verified.',
      suspended: 'Your agency is suspended. ' + note,
      rejected: 'Your agency application was not approved. ' + note,
      no_agency: 'No agency found for your account.'
    };
    banner.textContent = map[s] || '';
    if (s === 'verified') {
      var a = document.createElement('a');
      a.href = 'partners-dashboard.html';
      a.textContent = ' Go to dashboard →';
      banner.appendChild(a);
    }
  }

  function fillForm() {
    var a = window.MP.agency;
    if (!a) return;
    ['name', 'country', 'city', 'address', 'website', 'owner_name'].forEach(function (k) {
      if (q(k)) q(k).value = a[k] || '';
    });
    if (q('year_founded')) q('year_founded').value = a.year_founded || '';
    setChecks('services', a.services);
    setChecks('cooperation_areas', a.cooperation_areas);
  }

  async function uploadIfAny(inputName, purpose) {
    var el = form.querySelector('input[name="' + inputName + '"]');
    if (!el || !el.files || !el.files[0]) return null;
    var file = el.files[0];
    var ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    // Path shape is enforced by storage RLS: marketplace/agency/<agency_id>/<purpose>/...
    var path = 'marketplace/agency/' + window.MP.membership.agency_id + '/' + purpose + '/' + purpose + '-' + Date.now() + '.' + ext;
    var up = await window.ghSupabase.storage.from('gh-applicant-documents').upload(path, file, { upsert: true });
    if (up.error) { throw up.error; }
    return path;
  }

  async function saveProfile(e) {
    e.preventDefault();
    var status = document.getElementById('mp-profile-msg');
    status.textContent = 'Saving…';
    try {
      var patch = {
        name: q('name').value.trim(),
        country: q('country').value.trim() || null,
        city: q('city').value.trim() || null,
        address: q('address').value.trim() || null,
        website: q('website').value.trim() || null,
        year_founded: q('year_founded').value ? parseInt(q('year_founded').value, 10) : null,
        owner_name: q('owner_name').value.trim() || null,
        services: checks('services'),
        cooperation_areas: checks('cooperation_areas'),
        updated_at: new Date().toISOString()
      };
      var lic = await uploadIfAny('licence_file', 'licence');
      var prof = await uploadIfAny('company_profile_file', 'company-profile');
      if (lic) patch.licence_file_path = lic;
      if (prof) patch.company_profile_path = prof;

      var r = await window.MP.mpFrom('agencies').update(patch).eq('id', window.MP.membership.agency_id);
      if (r.error) {
        status.textContent = 'Save failed: ' + r.error.message;
        return;
      }
      status.textContent = 'Saved.';
      // Keep MP.agency current WITHOUT a second MP.init() (init is not re-entrant).
      if (window.MP.agency) {
        Object.keys(patch).forEach(function (k) { window.MP.agency[k] = patch[k]; });
      }
    } catch (err) {
      status.textContent = 'Save failed: ' + (err && err.message ? err.message : String(err));
    }
  }

  async function renderTeam() {
    if (!team) return;
    if (['owner', 'admin'].indexOf(window.MP.membership.role) < 0) { team.hidden = true; return; }
    team.hidden = false;

    var list = document.getElementById('mp-team-list');
    var r = await window.MP.mpFrom('agency_members')
      .select('user_id, role, status')
      .eq('agency_id', window.MP.membership.agency_id);
    list.innerHTML = (r.data || []).map(function (m) {
      return '<tr><td>' + window.MP.esc(m.user_id) + '</td><td>' + window.MP.esc(m.role) + '</td><td>' + window.MP.esc(m.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">Just you so far.</td></tr>';

    var inviteForm = document.getElementById('mp-invite-form');
    inviteForm.onsubmit = async function (e) {
      e.preventDefault();
      var im = document.getElementById('mp-invite-msg');
      im.textContent = 'Sending…';
      var fd = new FormData(inviteForm);
      var res = await window.MP.callFn('mp-agency-invite', { email: fd.get('email'), role: fd.get('role') });
      im.textContent = res.ok
        ? 'Invite sent.'
        : ((res.data && res.data.error) || (res.status === 0 ? 'Network error — please try again.' : 'Invite failed.'));
      if (res.ok) {
        inviteForm.reset();
        renderTeam();
      }
    };
  }

  (async function () {
    var inviteError = null;

    // ?invite=<token>: accept BEFORE init() when the visitor already has a session.
    var token = new URLSearchParams(location.search).get('invite');

    // No ?invite= in this URL — check for one stashed before a signed-out redirect to
    // login.html (see below). login.html has no ?next= support, so this sessionStorage
    // fallback is what actually gets the visitor back to their invite once signed in.
    if (!token) {
      try {
        var pending = sessionStorage.getItem('mp_pending_invite');
        if (pending) {
          sessionStorage.removeItem('mp_pending_invite');
          token = pending;
        }
      } catch (e) { /* sessionStorage unavailable — same as having no pending invite */ }
    }

    if (token) {
      var sess = await window.ghSupabase.auth.getSession();
      if (!(sess && sess.data && sess.data.session)) {
        // Signed-out is the NORMAL state for a first-time invitee — the requireAgency()
        // guard further down would otherwise bounce them to a bare login.html and
        // silently discard the token, forcing a duplicate-agency signup after login.
        // Stash it and send them to sign in with a return path instead.
        try { sessionStorage.setItem('mp_pending_invite', token); } catch (e) {}
        window.location.href = 'login.html?next=' +
          encodeURIComponent('partners-onboarding.html?invite=' + token);
        return;
      }
      var ar = await window.MP.callFn('mp-agency-invite-accept', { token: token });
      if (ar.ok) {
        // Full reload without the token → the next page load runs MP.init() exactly once
        // against the freshly-created membership.
        location.search = '';
        return;
      }
      // 409 "you already belong to another agency" / 403 "this invite was issued to a
      // different email" / 400 "invite expired" — surface the server's message.
      inviteError = (ar.data && ar.data.error) ||
        (ar.status === 0 ? 'Network error — the invite could not be accepted.' : 'Invite could not be accepted.');
    }

    await window.MP.init();

    // An invite failure takes over the page outright — render it and stop BEFORE the guard
    // (requireAgency) is evaluated at all, so a no-membership visitor is never silently
    // redirected to partners-signup.html without knowing why their invite didn't work.
    if (inviteError) { renderInviteError(inviteError); return; }

    if (window.MP.status === 'error') { renderError(); return; }
    if (!window.MP.requireAgency({ to: 'partners-signup.html' })) return;

    renderBanner();
    fillForm();
    renderTeam();
    form.addEventListener('submit', saveProfile);
  })();
})();
