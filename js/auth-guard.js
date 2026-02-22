/* ============================================
   GLOBALHIRE@ELAB — Auth Guard
   Route protection based on auth state + role
   ============================================ */

'use strict';

(function () {
  const requiredRole = document.body.dataset.authRole; // 'admin' | 'applicant' | undefined

  async function guard() {
    const session = await GHAuth.getSession();

    // No session → login
    if (!session) {
      window.location.replace('login.html');
      return;
    }

    const profile = await GHAuth.getProfile();

    if (!profile) {
      // Profile might not exist yet (race condition) — wait briefly
      await new Promise(r => setTimeout(r, 1000));
      const retryProfile = await GHAuth.getProfile();
      if (!retryProfile) {
        window.location.replace('login.html');
        return;
      }
      dispatchReady(retryProfile, session);
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
  }

  function dispatchReady(profile, session) {
    document.body.classList.add('auth-ready');
    window.dispatchEvent(new CustomEvent('gh:auth-ready', {
      detail: { profile, session }
    }));
  }

  // Run guard on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guard);
  } else {
    guard();
  }
})();
