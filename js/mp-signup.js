/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: agency self-registration
   Loaded after js/supabase-client.js and js/mp-core.js on partners-signup.html.
   Public page — no guard. On success: sign the new user in, redirect to onboarding.
   ============================================ */

(function () {
  var form = document.getElementById('mp-signup-form');
  var msg = document.getElementById('mp-signup-msg');
  var submit = document.getElementById('mp-signup-submit');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (submit) submit.disabled = true;
    msg.textContent = 'Creating your agency…';

    var f = new FormData(form);
    var body = {
      full_name: f.get('full_name'),
      email: f.get('email'),
      password: f.get('password'),
      agency_name: f.get('agency_name'),
      country: f.get('country') || undefined,
      city: f.get('city') || undefined,
      phone: f.get('phone') || undefined
    };

    // MP.callFn never rejects — a thrown fetch comes back as { ok:false, status:0, data:{error} }.
    var r = await window.MP.callFn('mp-agency-register', body);
    if (!r.ok) {
      msg.textContent = (r.data && r.data.error) ||
        (r.status === 0 ? 'Network error — please check your connection and try again.' : 'Registration failed.');
      if (submit) submit.disabled = false;
      return;
    }

    msg.textContent = 'Account created. Signing you in…';
    var si = await window.ghSupabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (si.error) { window.location.href = 'login.html'; return; }
    window.location.href = 'partners-onboarding.html';
  });
})();
