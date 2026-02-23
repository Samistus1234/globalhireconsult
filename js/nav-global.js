/* ============================================
   GLOBALHIRE@ELAB — Global Navigation v2
   Handles auth state, dropdowns, mobile menu
   ============================================ */

(function() {
  'use strict';

  /* ── Build Navigation HTML ── */
  function buildGlobalNav(activePage) {
    var nav = document.createElement('nav');
    nav.className = 'gnav';
    nav.setAttribute('role', 'navigation');
    nav.innerHTML =
      '<div class="gnav-inner">' +
        '<a href="index.html" class="gnav-logo">' +
          '<div class="logo-icon">G</div>' +
          '<span>Global<span class="accent">Hire</span></span>' +
          '<span class="sub">@eLab</span>' +
        '</a>' +
        '<div class="gnav-links">' +
          '<a href="explore.html"' + (activePage === 'explore' ? ' class="active"' : '') + '>Explore</a>' +
          '<a href="jobs.html"' + (activePage === 'careers' ? ' class="active"' : '') + '>Careers</a>' +
          '<a href="guides.html"' + (activePage === 'guides' ? ' class="active"' : '') + '>Guides</a>' +
          '<a href="licensing.html"' + (activePage === 'licensing' ? ' class="active"' : '') + '>Licensing</a>' +
          '<a href="events.html"' + (activePage === 'events' ? ' class="active"' : '') + '>Events</a>' +
        '</div>' +
        '<div class="gnav-actions" id="gnav-actions">' +
          '<!-- Filled by auth state -->' +
        '</div>' +
        '<button class="gnav-mobile-toggle" id="gnav-mobile-toggle" aria-label="Menu">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>';
    return nav;
  }

  /* ── Build Footer HTML ── */
  function buildGlobalFooter() {
    var footer = document.createElement('footer');
    footer.className = 'gfooter';
    footer.innerHTML =
      '<div class="container">' +
        '<div class="gfooter-grid">' +
          '<div class="gfooter-brand">' +
            '<div class="gnav-logo" style="margin-bottom:var(--space-2);">' +
              '<div class="logo-icon">G</div>' +
              '<span>Global<span class="accent">Hire</span></span>' +
              '<span class="sub">@eLab</span>' +
            '</div>' +
            '<p>Intelligent healthcare recruitment platform connecting professionals with opportunities across 47 countries. A subsidiary of eLab Solutions International LLC.</p>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Platform</h5>' +
            '<ul>' +
              '<li><a href="jobs.html">Browse Careers</a></li>' +
              '<li><a href="licensing.html">Licensing</a></li>' +
              '<li><a href="guides.html">Resource Guides</a></li>' +
              '<li><a href="events.html">Events</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>For Talent</h5>' +
            '<ul>' +
              '<li><a href="signup.html">Create Account</a></li>' +
              '<li><a href="explore.html">Explore</a></li>' +
              '<li><a href="portal.html">My Portal</a></li>' +
              '<li><a href="guides.html">Country Guides</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Company</h5>' +
            '<ul>' +
              '<li><a href="#">About eLab</a></li>' +
              '<li><a href="#">Partners</a></li>' +
              '<li><a href="#">Press</a></li>' +
              '<li><a href="#">Contact</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Legal</h5>' +
            '<ul>' +
              '<li><a href="#">Privacy Policy</a></li>' +
              '<li><a href="#">Terms of Service</a></li>' +
              '<li><a href="#">Cookie Policy</a></li>' +
              '<li><a href="#">Compliance</a></li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="gfooter-bottom">' +
          '<span>&copy; 2026 Global Hire Consortium. A subsidiary of eLab Solutions International LLC. All rights reserved.</span>' +
          '<div class="gfooter-social">' +
            '<a href="#" aria-label="LinkedIn"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>' +
            '<a href="#" aria-label="Twitter"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>' +
            '<a href="#" aria-label="GitHub"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a>' +
          '</div>' +
        '</div>' +
      '</div>';
    return footer;
  }

  /* ── Build Mobile Menu ── */
  function buildMobileMenu(activePage, isLoggedIn) {
    var menu = document.createElement('div');
    menu.className = 'gnav-mobile-menu';
    menu.id = 'gnav-mobile-menu';
    menu.innerHTML =
      '<div class="mobile-links">' +
        '<a href="explore.html"' + (activePage === 'explore' ? ' class="active"' : '') + '>Explore</a>' +
        '<a href="jobs.html"' + (activePage === 'careers' ? ' class="active"' : '') + '>Careers</a>' +
        '<a href="guides.html"' + (activePage === 'guides' ? ' class="active"' : '') + '>Guides</a>' +
        '<a href="licensing.html"' + (activePage === 'licensing' ? ' class="active"' : '') + '>Licensing</a>' +
        '<a href="events.html"' + (activePage === 'events' ? ' class="active"' : '') + '>Events</a>' +
      '</div>' +
      '<div class="mobile-actions">' +
        (isLoggedIn ?
          '<a href="portal.html" class="btn btn-primary" style="text-align:center">My Portal</a>' +
          '<a href="#" class="btn btn-ghost" style="text-align:center" id="mobile-signout">Sign Out</a>' :
          '<a href="login.html" class="btn btn-ghost" style="text-align:center">Sign In</a>' +
          '<a href="signup.html" class="btn btn-primary" style="text-align:center">Get Started</a>'
        ) +
      '</div>';
    return menu;
  }

  /* ── Set Auth-Dependent Actions ── */
  function setNavActions(actionsEl, isLoggedIn, userName, userEmail) {
    if (isLoggedIn) {
      var initials = (userName || 'U').split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().substring(0, 2);
      actionsEl.innerHTML =
        '<a href="portal.html" class="btn btn-ghost btn-sm hide-mobile">My Portal</a>' +
        '<div class="gnav-user" id="gnav-user">' +
          '<div class="avatar">' + initials + '</div>' +
          '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>' +
          '<div class="gnav-dropdown" id="gnav-dropdown">' +
            '<div class="gnav-dropdown-header">' +
              '<div class="name">' + (userName || 'User') + '</div>' +
              '<div class="email">' + (userEmail || '') + '</div>' +
            '</div>' +
            '<a href="portal.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>My Dashboard</a>' +
            '<a href="portal.html#profile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>My Profile</a>' +
            '<a href="portal.html#documents"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>My Documents</a>' +
            '<div class="divider"></div>' +
            '<a href="#" class="danger" id="gnav-signout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign Out</a>' +
          '</div>' +
        '</div>';
    } else {
      actionsEl.innerHTML =
        '<a href="login.html" class="btn btn-ghost btn-sm hide-mobile">Sign In</a>' +
        '<a href="signup.html" class="btn btn-primary btn-sm hide-mobile">Get Started</a>';
    }
  }

  /* ── Init Global Nav ── */
  window.GHNav = {
    init: function(activePage) {
      var placeholder = document.getElementById('gnav-placeholder');
      if (!placeholder) return;

      // Insert navigation
      var nav = buildGlobalNav(activePage || '');
      placeholder.parentNode.insertBefore(nav, placeholder);
      placeholder.remove();

      // Insert footer
      var footerPlaceholder = document.getElementById('gfooter-placeholder');
      if (footerPlaceholder) {
        var footer = buildGlobalFooter();
        footerPlaceholder.parentNode.insertBefore(footer, footerPlaceholder);
        footerPlaceholder.remove();
      }

      // Sticky nav on scroll
      var ticking = false;
      window.addEventListener('scroll', function() {
        if (!ticking) {
          requestAnimationFrame(function() {
            nav.classList.toggle('scrolled', window.scrollY > 50);
            ticking = false;
          });
          ticking = true;
        }
      });
      nav.classList.toggle('scrolled', window.scrollY > 50);

      // Check auth state
      var actionsEl = document.getElementById('gnav-actions');
      if (window.ghSupabase) {
        window.ghSupabase.auth.getSession().then(function(result) {
          var session = result.data.session;
          if (session) {
            // Get profile
            var userName = session.user.user_metadata && session.user.user_metadata.full_name || session.user.email.split('@')[0];
            var userEmail = session.user.email;
            setNavActions(actionsEl, true, userName, userEmail);
            setupMobileMenu(activePage, true);
            bindDropdown();
            bindSignout();
          } else {
            setNavActions(actionsEl, false);
            setupMobileMenu(activePage, false);
          }
        }).catch(function() {
          setNavActions(actionsEl, false);
          setupMobileMenu(activePage, false);
        });
      } else {
        setNavActions(actionsEl, false);
        setupMobileMenu(activePage, false);
      }

      // Mobile toggle
      var toggle = document.getElementById('gnav-mobile-toggle');
      if (toggle) {
        toggle.addEventListener('click', function() {
          toggle.classList.toggle('active');
          var menu = document.getElementById('gnav-mobile-menu');
          if (menu) menu.classList.toggle('open');
        });
      }
    }
  };

  function setupMobileMenu(activePage, isLoggedIn) {
    var existing = document.getElementById('gnav-mobile-menu');
    if (existing) existing.remove();
    var menu = buildMobileMenu(activePage, isLoggedIn);
    document.body.appendChild(menu);

    if (isLoggedIn) {
      var signoutBtn = document.getElementById('mobile-signout');
      if (signoutBtn) {
        signoutBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (window.ghSupabase) {
            window.ghSupabase.auth.signOut().then(function() {
              window.location.href = 'index.html';
            });
          }
        });
      }
    }
  }

  function bindDropdown() {
    var userEl = document.getElementById('gnav-user');
    var dropdown = document.getElementById('gnav-dropdown');
    if (!userEl || !dropdown) return;

    userEl.addEventListener('click', function(e) {
      e.stopPropagation();
      userEl.classList.toggle('open');
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', function() {
      userEl.classList.remove('open');
      dropdown.classList.remove('open');
    });

    dropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  function bindSignout() {
    var signoutBtn = document.getElementById('gnav-signout');
    if (!signoutBtn) return;
    signoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (window.ghSupabase) {
        window.ghSupabase.auth.signOut().then(function() {
          window.location.href = 'index.html';
        });
      }
    });
  }
})();
