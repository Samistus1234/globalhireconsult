/* ============================================
   GLOBALHIRE@ELAB — Global Navigation v3
   Dropdown groups, auth state, mobile menu
   ============================================ */

(function() {
  'use strict';

  var chevronSVG = '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';

  /* ── Build Navigation HTML ── */
  function buildGlobalNav(activePage) {
    var nav = document.createElement('nav');
    nav.className = 'gnav';
    nav.setAttribute('role', 'navigation');
    nav.innerHTML =
      '<div class="gnav-inner">' +
        '<a href="index.html" class="gnav-logo" aria-label="GlobalHire Consult — home">' +
          '<img src="assets/brand/globalhire-logo.png" alt="GlobalHire Consult" class="gnav-logo-img">' +
        '</a>' +
        '<div class="gnav-links">' +

          /* For Professionals dropdown */
          '<div class="gnav-group" data-group="professionals">' +
            '<button class="gnav-group-trigger">For Professionals ' + chevronSVG + '</button>' +
            '<div class="gnav-group-menu">' +
              '<a href="for-candidates.html"' + isActive(activePage, 'for-candidates') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
                'For Candidates</a>' +
              '<a href="jobs.html"' + isActive(activePage, 'careers') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>' +
                'Browse Careers</a>' +
              '<a href="licensing.html"' + isActive(activePage, 'explore') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
                'Explore Countries</a>' +
              '<a href="licensing.html"' + isActive(activePage, 'licensing') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>' +
                'Licensing Pathways</a>' +
            '</div>' +
          '</div>' +

          /* For Employers dropdown */
          '<div class="gnav-group" data-group="employers">' +
            '<button class="gnav-group-trigger">For Employers ' + chevronSVG + '</button>' +
            '<div class="gnav-group-menu">' +
              '<a href="for-employers.html"' + isActive(activePage, 'for-employers') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M5 20V10l7-7 7 7v10"/><path d="M9 20v-6h6v6"/></svg>' +
                'For Employers</a>' +
              '<a href="contact.html"' + isActive(activePage, 'contact') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>' +
                'Post a Role</a>' +
            '</div>' +
          '</div>' +

          /* Platform dropdown */
          '<div class="gnav-group" data-group="platform">' +
            '<button class="gnav-group-trigger">Platform ' + chevronSVG + '</button>' +
            '<div class="gnav-group-menu">' +
              '<a href="platform.html"' + isActive(activePage, 'platform') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
                'Platform Overview</a>' +
              '<a href="guides.html"' + isActive(activePage, 'guides') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
                'Resource Guides</a>' +
              '<a href="events.html"' + isActive(activePage, 'events') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
                'Events</a>' +
              '<a href="compliance.html"' + isActive(activePage, 'compliance') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
                'Compliance &amp; Trust</a>' +
            '</div>' +
          '</div>' +

          /* About dropdown */
          '<div class="gnav-group" data-group="about">' +
            '<button class="gnav-group-trigger">About ' + chevronSVG + '</button>' +
            '<div class="gnav-group-menu">' +
              '<a href="about.html"' + isActive(activePage, 'about') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
                'About GlobalHire</a>' +
              '<a href="faq.html"' + isActive(activePage, 'faq') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>' +
                'FAQ</a>' +
              '<a href="contact.html"' + isActive(activePage, 'contact') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
                'Contact</a>' +
            '</div>' +
          '</div>' +

          /* Visas dropdown */
          '<div class="gnav-group" data-group="visas">' +
            '<button class="gnav-group-trigger">Visas ' + chevronSVG + '</button>' +
            '<div class="gnav-group-menu">' +
              '<a href="visa.html"' + isActive(activePage, 'visa') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>' +
                'All Visa Services</a>' +
              '<a href="visa-tourist-evisa.html"' + isActive(activePage, 'visa-tourist') + '>Tourist eVisa</a>' +
              '<a href="visa-umrah.html"' + isActive(activePage, 'visa-umrah') + '>Umrah Visa</a>' +
              '<a href="visa-family-visit.html"' + isActive(activePage, 'visa-family-visit') + '>Family Visit</a>' +
              '<a href="visa-family-residence.html"' + isActive(activePage, 'visa-family-residence') + '>Family Residence</a>' +
              '<a href="visa-about.html"' + isActive(activePage, 'visa-about') + '>About this service</a>' +
            '</div>' +
          '</div>' +

          /* Scholarships — top-level link */
          '<a href="scholarships.html"' + isActive(activePage, 'scholarships') + '>Scholarships</a>' +

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

  function isActive(current, page) {
    return current === page ? ' class="active"' : '';
  }

  /* ── Build Footer HTML ── */
  function buildGlobalFooter() {
    var footer = document.createElement('footer');
    footer.className = 'gfooter';
    footer.innerHTML =
      '<div class="container">' +
        '<div class="gfooter-grid">' +
          '<div class="gfooter-brand">' +
            '<img src="assets/brand/globalhire-logo.png" alt="GlobalHire Consult" class="gfooter-logo-img" style="margin-bottom:var(--space-3);">' +
            '<p>Healthcare recruitment platform connecting professionals with opportunities across multiple countries. A division of eLab Solutions International LLC.</p>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>For Professionals</h5>' +
            '<ul>' +
              '<li><a href="for-candidates.html">For Candidates</a></li>' +
              '<li><a href="jobs.html">Browse Careers</a></li>' +
              '<li><a href="licensing.html">Explore Countries</a></li>' +
              '<li><a href="licensing.html">Licensing Pathways</a></li>' +
              '<li><a href="scholarships.html">Scholarships</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Platform</h5>' +
            '<ul>' +
              '<li><a href="for-employers.html">For Employers</a></li>' +
              '<li><a href="platform.html">Platform Overview</a></li>' +
              '<li><a href="guides.html">Resource Guides</a></li>' +
              '<li><a href="events.html">Events</a></li>' +
              '<li><a href="compliance.html">Compliance &amp; Trust</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Company</h5>' +
            '<ul>' +
              '<li><a href="about.html">About GlobalHire</a></li>' +
              '<li><a href="faq.html">FAQ</a></li>' +
              '<li><a href="contact.html">Contact</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Legal</h5>' +
            '<ul>' +
              '<li><a href="privacy.html">Privacy Policy</a></li>' +
              '<li><a href="terms.html">Terms of Service</a></li>' +
              '<li><a href="cookies.html">Cookie Policy</a></li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="gfooter-bottom">' +
          '<span>&copy; 2026 eLab Solutions International LLC. All rights reserved.</span>' +
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
        '<div class="mobile-group-title">For Professionals</div>' +
        '<a href="for-candidates.html"' + isActive(activePage, 'for-candidates') + '>For Candidates</a>' +
        '<a href="jobs.html"' + isActive(activePage, 'careers') + '>Browse Careers</a>' +
        '<a href="licensing.html"' + isActive(activePage, 'explore') + '>Explore Countries</a>' +
        '<a href="licensing.html"' + isActive(activePage, 'licensing') + '>Licensing Pathways</a>' +
        '<div class="mobile-group-title">For Employers</div>' +
        '<a href="for-employers.html"' + isActive(activePage, 'for-employers') + '>For Employers</a>' +
        '<a href="contact.html"' + isActive(activePage, 'contact') + '>Post a Role</a>' +
        '<div class="mobile-group-title">Platform</div>' +
        '<a href="platform.html"' + isActive(activePage, 'platform') + '>Platform Overview</a>' +
        '<a href="guides.html"' + isActive(activePage, 'guides') + '>Resource Guides</a>' +
        '<a href="events.html"' + isActive(activePage, 'events') + '>Events</a>' +
        '<a href="compliance.html"' + isActive(activePage, 'compliance') + '>Compliance &amp; Trust</a>' +
        '<div class="mobile-group-title">About</div>' +
        '<a href="about.html"' + isActive(activePage, 'about') + '>About GlobalHire</a>' +
        '<a href="faq.html"' + isActive(activePage, 'faq') + '>FAQ</a>' +
        '<a href="contact.html"' + isActive(activePage, 'contact') + '>Contact</a>' +
        '<div class="mobile-group-title">&nbsp;</div>' +
        '<a href="scholarships.html"' + isActive(activePage, 'scholarships') + '>Scholarships</a>' +
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

      // Bind dropdown groups
      bindNavGroups();

      // Check auth state
      var actionsEl = document.getElementById('gnav-actions');
      if (window.ghSupabase) {
        window.ghSupabase.auth.getSession().then(function(result) {
          var session = result.data.session;
          if (session) {
            var userName = session.user.user_metadata && session.user.user_metadata.full_name || session.user.email.split('@')[0];
            var userEmail = session.user.email;
            setNavActions(actionsEl, true, userName, userEmail);
            setupMobileMenu(activePage, true);
            bindUserDropdown();
            bindSignout();
            // best-effort: admins get a "Visa Cases" link in the dropdown
            if (window.ghFrom) {
              ghFrom('profiles').select('role').eq('id', session.user.id).single().then(function(pr) {
                if (!(pr && pr.data && pr.data.role === 'admin')) return;
                var dd = document.getElementById('gnav-dropdown');
                if (!dd || dd.querySelector('[data-admin-visa]')) return;
                var div = dd.querySelector('.divider');
                var a = document.createElement('a');
                a.href = 'admin-visas.html';
                a.setAttribute('data-admin-visa', '1');
                a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>Visa Cases (Admin)';
                if (div) dd.insertBefore(a, div); else dd.appendChild(a);
              }).catch(function(){});
            }
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

  /* ── Bind Nav Group Dropdowns ── */
  function bindNavGroups() {
    var groups = document.querySelectorAll('.gnav-group');
    groups.forEach(function(group) {
      var trigger = group.querySelector('.gnav-group-trigger');
      if (!trigger) return;

      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var wasOpen = group.classList.contains('open');

        // Close all groups first
        groups.forEach(function(g) { g.classList.remove('open'); });

        // Toggle clicked group
        if (!wasOpen) group.classList.add('open');
      });
    });

    // Close on outside click
    document.addEventListener('click', function() {
      groups.forEach(function(g) { g.classList.remove('open'); });
    });

    // Prevent closing when clicking inside menu
    document.querySelectorAll('.gnav-group-menu').forEach(function(menu) {
      menu.addEventListener('click', function(e) {
        // Let link clicks propagate normally
      });
    });
  }

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

  function bindUserDropdown() {
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

  /* ── Auto-init when the script tag carries data-active-page ──
     Pages that already call GHNav.init('foo') in inline script keep working;
     pages that only set data-active-page (visa surfaces, etc.) get init'd here. */
  var thisScript = document.currentScript;
  if (thisScript && thisScript.hasAttribute('data-active-page')) {
    var activePage = thisScript.getAttribute('data-active-page') || '';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.GHNav.init(activePage);
      });
    } else {
      window.GHNav.init(activePage);
    }
  }
})();
