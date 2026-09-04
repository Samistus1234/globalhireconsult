/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: dashboard (post-login landing)
   Loaded after js/supabase-client.js and js/mp-core.js on partners-dashboard.html.

   Chunk 1 scope — deliberately minimal: resolve the agency, show verification
   status, and either point unverified agencies at the onboarding profile or
   show a placeholder grid of the coming sections for verified ones.

   Contract notes honoured here (see mp-core.js):
   - MP.init() is not re-entrant and does not reset MP.lastError → called EXACTLY
     once per page load.
   - MP.status === 'error' → requireAgency() returns false WITHOUT navigating, so
     this page renders its own error state (message + retry + sign-in link).
   - MP.esc(0)/esc(false) return '' → nothing numeric/boolean is passed through
     esc() here without a String() coercion first.
   ============================================ */

(function () {
  var main = document.getElementById('mp-dash-main');
  if (!main) return;

  function renderError() {
    var host = document.getElementById('mp-error');
    if (main) main.hidden = true;
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

  function renderDashboard() {
    var a = window.MP.agency;

    if (window.MP.status !== 'verified') {
      main.innerHTML =
        '<div class="mp-card"><h2>' + window.MP.esc(a ? a.name : 'Your agency') + '</h2>' +
        '<p>Status: <strong>' + window.MP.esc(window.MP.status) + '</strong></p>' +
        '<p>' + (window.MP.status === 'pending_verification'
          ? 'Your agency is under review. Complete your partnership profile while you wait.'
          : window.MP.esc((a && a.verification_note) || 'Contact support.')) + '</p>' +
        '<a class="mp-btn" href="partners-onboarding.html">Open partnership profile</a></div>';
      return;
    }

    main.innerHTML =
      '<div class="mp-card"><h2>Welcome, ' + window.MP.esc(a.name) + '</h2>' +
      '<p>Your agency is verified. The marketplace sections below open as they ship.</p></div>' +
      '<div class="mp-grid">' +
      ['Jobs', 'Candidates', 'Nominations', 'Messages', 'Billing'].map(function (s) {
        return '<div class="mp-tile mp-tile--soon"><h3>' + window.MP.esc(s) + '</h3><span>Coming soon</span></div>';
      }).join('') +
      '</div>';
  }

  (async function () {
    await window.MP.init();

    if (window.MP.status === 'error') { renderError(); return; }
    if (!window.MP.requireAgency({ to: 'partners-signup.html' })) return;

    renderDashboard();
  })();
})();
