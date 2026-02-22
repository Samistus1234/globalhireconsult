/* ============================================
   GLOBALHIRE@ELAB — Auth Guard
   Route protection based on auth state + role
   ============================================ */

(function () {
  var requiredRole = document.body.dataset.authRole; // 'admin' | 'applicant' | undefined

  async function guard() {
    try {
      var session = await GHAuth.getSession();

      // No session → login
      if (!session) {
        window.location.replace('login.html');
        return;
      }

      var profile = await GHAuth.getProfile();

      if (!profile) {
        // Profile might not exist yet (race condition after signup) — wait and retry
        await new Promise(function(r) { setTimeout(r, 2000); });
        profile = await GHAuth.getProfile();
      }

      if (!profile) {
        // Still no profile — dispatch with minimal data so the page still works
        console.warn('Auth guard: No profile found, dispatching with session only');
        dispatchReady({ role: 'applicant', full_name: session.user.email }, session);
        return;
      }

      // Role check
      if (requiredRole && profile.role !== requiredRole) {
        if (profile.role === 'admin') {
          window.location.replace('dashboard.html');
        } else {
          window.location.replace('portal.html');
        }
        return;
      }

      dispatchReady(profile, session);

    } catch (err) {
      console.error('Auth guard error:', err);
      // Don't redirect to login on error — dispatch with whatever we have
      try {
        var sb = window.ghSupabase;
        var r = await sb.auth.getSession();
        if (r.data.session) {
          dispatchReady(
            { role: 'applicant', full_name: r.data.session.user.email },
            r.data.session
          );
          return;
        }
      } catch (e) { /* ignore */ }
      window.location.replace('login.html');
    }
  }

  function dispatchReady(profile, session) {
    document.body.classList.add('auth-ready');
    window.dispatchEvent(new CustomEvent('gh:auth-ready', {
      detail: { profile: profile, session: session }
    }));
  }

  // Run guard on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guard);
  } else {
    guard();
  }
})();
