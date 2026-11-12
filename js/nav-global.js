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
              '<a href="salary-calculator.html"' + isActive(activePage, 'salary-calculator') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/></svg>' +
                'Salary Calculator</a>' +
              '<a href="relocation-cost-calculator.html"' + isActive(activePage, 'relocation-calculator') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>' +
                'Relocation Cost Calculator</a>' +
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

          /* For Agencies dropdown */
          '<div class="gnav-group" data-group="agencies">' +
            '<button class="gnav-group-trigger">For Agencies ' + chevronSVG + '</button>' +
            '<div class="gnav-group-menu">' +
              '<a href="partners-signup.html"' + isActive(activePage, 'partners-signup') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>' +
                'Become a Partner Agency</a>' +
              '<a href="partners-dashboard.html"' + isActive(activePage, 'partners-dashboard') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
                'Partner Dashboard</a>' +
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
            '<div class="gfooter-member">' +
              '<span class="gfooter-member-eyebrow">Member</span>' +
              '<span class="gfooter-member-body">Employers Association for Private Employment Agencies of Nigeria &middot; Membership No. <strong>EAP0339</strong></span>' +
            '</div>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>For Professionals</h5>' +
            '<ul>' +
              '<li><a href="for-candidates.html">For Candidates</a></li>' +
              '<li><a href="jobs.html">Browse Careers</a></li>' +
              '<li><a href="licensing.html">Explore Countries</a></li>' +
              '<li><a href="licensing.html">Licensing Pathways</a></li>' +
              '<li><a href="scholarships.html">Scholarships</a></li>' +
              '<li><a href="salary-calculator.html">Salary Calculator</a></li>' +
              '<li><a href="relocation-cost-calculator.html">Relocation Cost Calculator</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="gfooter-col">' +
            '<h5>Platform</h5>' +
            '<ul>' +
              '<li><a href="for-employers.html">For Employers</a></li>' +
              '<li><a href="partners-signup.html">Become a Partner Agency</a></li>' +
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
          '<span class="gfooter-offices">eLab Solutions International LLC &middot; US &middot; Nigeria</span>' +
          '<div class="gfooter-social">' +
            '<a href="https://facebook.com/ElabSolutionsInternational/" target="_blank" rel="noopener noreferrer" aria-label="eLab on Facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg></a>' +
            '<a href="https://instagram.com/elab.solutions/" target="_blank" rel="noopener noreferrer" aria-label="eLab on Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.9 5.9 0 0 0-2.13 1.38A5.9 5.9 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13a5.9 5.9 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"/></svg></a>' +
            '<a href="https://x.com/elab_solution" target="_blank" rel="noopener noreferrer" aria-label="eLab on X"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>' +
            '<a href="https://linkedin.com/company/elab-solutions-intl-llc/" target="_blank" rel="noopener noreferrer" aria-label="eLab on LinkedIn"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>' +
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
        '<a href="salary-calculator.html"' + isActive(activePage, 'salary-calculator') + '>Salary Calculator</a>' +
        '<a href="relocation-cost-calculator.html"' + isActive(activePage, 'relocation-calculator') + '>Relocation Cost Calculator</a>' +
        '<div class="mobile-group-title">For Employers</div>' +
        '<a href="for-employers.html"' + isActive(activePage, 'for-employers') + '>For Employers</a>' +
        '<a href="contact.html"' + isActive(activePage, 'contact') + '>Post a Role</a>' +
        '<div class="mobile-group-title">For Agencies</div>' +
        '<a href="partners-signup.html"' + isActive(activePage, 'partners-signup') + '>Become a Partner Agency</a>' +
        '<a href="partners-dashboard.html"' + isActive(activePage, 'partners-dashboard') + '>Partner Dashboard</a>' +
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
        '<a href="portal.html" data-my-portal="1" class="btn btn-ghost btn-sm hide-mobile">My Portal</a>' +
        '<div class="gnav-user" id="gnav-user">' +
          '<div class="avatar">' + initials + '</div>' +
          '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>' +
          '<div class="gnav-dropdown" id="gnav-dropdown">' +
            '<div class="gnav-dropdown-header">' +
              '<div class="name">' + (userName || 'User') + '</div>' +
              '<div class="email">' + (userEmail || '') + '</div>' +
            '</div>' +
            '<a href="portal.html" data-applicant-link="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>My Dashboard</a>' +
            '<a href="portal.html#profile" data-applicant-link="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>My Profile</a>' +
            '<a href="portal.html#documents" data-applicant-link="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>My Documents</a>' +
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

              // Partner-agency members: swap the applicant chrome for the partner nav.
              // Two things had to be true for this to render at all:
              //  1. ghFrom() already prefixes 'gh_', so the old
              //     'gh_mp_agency_members' asked for gh_gh_mp_agency_members — a table
              //     that has never existed (HTTP 404 PGRST205). The link never rendered.
              //  2. A partner's profiles.role is 'applicant' — the role CHECK allows
              //     only applicant/admin/recruiter, so partner identity is this
              //     mp_agency_members row and never a role. Without the swap below, a
              //     partner saw applicant links, which now also bounce back off
              //     portal.html's partner redirect.
              ghFrom('mp_agency_members').select('agency_id').eq('user_id', session.user.id).eq('status', 'active').limit(1).then(function(mr) {
                if (!(mr && mr.data && mr.data.length)) return;
                var dd = document.getElementById('gnav-dropdown');
                if (!dd || dd.querySelector('[data-partner-dash]')) return;

                // Drop the applicant-only entries (My Dashboard / My Profile / My Documents).
                Array.prototype.slice.call(dd.querySelectorAll('[data-applicant-link]')).forEach(function(el) {
                  el.parentNode.removeChild(el);
                });

                // The header button reads "My Portal" and points at portal.html.
                var portalBtn = actionsEl.querySelector('[data-my-portal]');
                if (portalBtn) {
                  portalBtn.href = 'partners-dashboard.html';
                  portalBtn.textContent = 'Partner Dashboard';
                }

                var div = dd.querySelector('.divider');
                var icons = {
                  dashboard: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
                  jobs: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
                  messages: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
                  team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
                };
                var partnerLinks = [
                  ['partners-dashboard.html', 'Partner Dashboard', 'dashboard'],
                  ['partners-jobs.html', 'Jobs', 'jobs'],
                  ['partners-messages.html', 'Messages', 'messages'],
                  ['partners-onboarding.html', 'Team', 'team']
                ];
                // Insert in order, each before the divider that precedes Sign Out.
                var anchor = div;
                partnerLinks.forEach(function (l) {
                  var a = document.createElement('a');
                  a.href = l[0];
                  a.setAttribute('data-partner-dash', '1');
                  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icons[l[2]] + '</svg>' + l[1];
                  if (anchor) dd.insertBefore(a, anchor); else dd.appendChild(a);
                });
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
