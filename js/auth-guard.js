/* ============================================
   GLOBALHIRE@ELAB — Auth Guard
   Route protection based on auth state + role
   ============================================ */

(function () {
  var requiredRole = document.body.dataset.authRole;

  async function guard() {
    var sb = window.ghSupabase;
    if (!sb) { console.error('Auth guard: Supabase not ready'); return; }

    // Check session
    var sessionResult;
    try {
      sessionResult = await sb.auth.getSession();
    } catch (e) {
      console.error('Auth guard: getSession failed', e);
      window.location.replace('login.html');
      return;
    }

    var session = sessionResult.data ? sessionResult.data.session : null;

    // No session at all → must log in
    if (!session) {
      window.location.replace('login.html');
      return;
    }

    // We have a session. Try to get the profile.
    var profile = null;
    try {
      var r = await ghFrom('profiles').select('*').eq('id', session.user.id).single();
      profile = r.data;
    } catch (e) {
      console.warn('Auth guard: profile fetch threw', e);
    }

    // If no profile, retry once after a short delay (trigger may still be running)
    if (!profile) {
      await new Promise(function(resolve) { setTimeout(resolve, 2000); });
      try {
        var r2 = await ghFrom('profiles').select('*').eq('id', session.user.id).single();
        profile = r2.data;
      } catch (e) {
        console.warn('Auth guard: profile retry threw', e);
      }
    }

    // If STILL no profile, don't redirect to login (session is valid).
    // Just use fallback data so the page works.
    if (!profile) {
      profile = {
        role: 'applicant',
        full_name: session.user.user_metadata && session.user.user_metadata.full_name
          ? session.user.user_metadata.full_name
          : session.user.email,
        avatar_initials: '??',
        avatar_color_index: 0
      };
    }

    // Role check — only redirect if role doesn't match
    if (requiredRole && profile.role !== requiredRole) {
      if (profile.role === 'admin') {
        window.location.replace('dashboard.html');
      } else if (profile.role === 'recruiter') {
        window.location.replace('recruiter.html');
      } else {
        window.location.replace('portal.html');
      }
      return;
    }

    // Partner-agency members must not sit on an applicant-only page.
    //
    // The role check above CANNOT catch this: a partner's profiles.role is
    // 'applicant', because the role CHECK allows only applicant/admin/recruiter —
    // partner identity lives in an mp_agency_members row, never in a role. So a
    // partner satisfies data-auth-role="applicant" and the applicant portal renders
    // for them. Pages that opt in with data-partner-redirect send them to the
    // partner surface instead.
    var partnerRedirect = document.body.dataset.partnerRedirect;
    if (partnerRedirect && profile.role === 'applicant') {
      try {
        var m = await ghFrom('mp_agency_members')
          .select('agency_id')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .limit(1);
        if (m && m.data && m.data.length) {
          window.location.replace(partnerRedirect);
          return;
        }
      } catch (e) {
        // Fail open: a transient lookup failure must not lock a genuine applicant
        // out of their own portal.
        console.warn('Auth guard: agency membership check failed', e);
      }
    }

    // All good — dispatch event
    document.body.classList.add('auth-ready');
    window.dispatchEvent(new CustomEvent('gh:auth-ready', {
      detail: { profile: profile, session: session }
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guard);
  } else {
    guard();
  }
})();
