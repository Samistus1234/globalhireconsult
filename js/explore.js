/* ============================================
   GLOBALHIRE@ELAB — Explore Page Logic
   Personalized logged-in home experience
   ============================================ */

(function () {
  'use strict';

  /* ── Time-Aware Greeting ── */
  function getGreeting() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /* ── Format Today's Date ── */
  function formatDate() {
    var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('en-US', options);
  }

  /* ── Set Profile Completion Ring ── */
  function setProfileCompletion(pct) {
    var circle = document.getElementById('profile-ring-circle');
    var text = document.getElementById('profile-ring-pct');
    if (!circle || !text) return;

    var radius = 22;
    var circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference - (pct / 100) * circumference;
    text.textContent = pct + '%';
  }

  /* ── Populate Stats ── */
  function setStats(apps, matches, saved) {
    var elApps = document.getElementById('stat-applications');
    var elMatches = document.getElementById('stat-matches');
    var elSaved = document.getElementById('stat-saved');
    if (elApps) elApps.textContent = apps;
    if (elMatches) elMatches.textContent = matches;
    if (elSaved) elSaved.textContent = saved;
  }

  /* ── Build News Cards ── */
  function populateNews() {
    var container = document.getElementById('news-carousel');
    if (!container) return;

    var items = [
      {
        badge: 'Regulatory',
        badgeClass: 'badge-info',
        gradient: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(124,92,255,0.2))',
        title: 'UK NMC Streamlines International Nurse Registration',
        snippet: 'New CBT format and reduced processing times announced for overseas applicants starting Q2 2026.',
        date: '20 Feb 2026'
      },
      {
        badge: 'Industry',
        badgeClass: 'badge-secondary',
        gradient: 'linear-gradient(135deg, rgba(124,92,255,0.3), rgba(0,232,157,0.2))',
        title: 'Saudi Arabia Opens 15,000 Healthcare Positions',
        snippet: 'Vision 2030 healthcare expansion creates unprecedented demand for international nursing and medical professionals.',
        date: '18 Feb 2026'
      },
      {
        badge: 'Success Story',
        badgeClass: 'badge-primary',
        gradient: 'linear-gradient(135deg, rgba(0,232,157,0.3), rgba(255,176,32,0.2))',
        title: 'From Lagos to London: Grace\'s Journey to NHS',
        snippet: 'How one nurse used GlobalHire to fast-track her NMC registration and land her dream ICU position.',
        date: '15 Feb 2026'
      },
      {
        badge: 'Market Report',
        badgeClass: 'badge-warning',
        gradient: 'linear-gradient(135deg, rgba(255,176,32,0.3), rgba(255,92,92,0.2))',
        title: 'Global Healthcare Salary Report 2026',
        snippet: 'Comprehensive breakdown of nursing and physician compensation across 30+ countries with growth projections.',
        date: '12 Feb 2026'
      },
      {
        badge: 'Regulatory',
        badgeClass: 'badge-info',
        gradient: 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,232,157,0.2))',
        title: 'Germany Fast-Tracks Recognition for Non-EU Healthcare Workers',
        snippet: 'New legislation simplifies the credential evaluation process, cutting average wait times by 40%.',
        date: '10 Feb 2026'
      }
    ];

    container.innerHTML = items.map(function (item) {
      return '<div class="news-card">' +
        '<div class="news-card-img" style="background:' + item.gradient + ';">' +
          '<span class="news-badge badge ' + item.badgeClass + '">' + item.badge + '</span>' +
        '</div>' +
        '<div class="news-card-body">' +
          '<h4>' + item.title + '</h4>' +
          '<p class="news-snippet">' + item.snippet + '</p>' +
          '<span class="news-date">' + item.date + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── Build Job Cards ── */
  function populateJobs() {
    var container = document.getElementById('jobs-carousel');
    if (!container) return;

    var jobs = [
      { title: 'ICU Nurse (Band 5)', employer: 'NHS Manchester Royal', location: 'Manchester, UK', salary: '\u00a332,000 - \u00a340,000', match: 94 },
      { title: 'Emergency Physician', employer: 'Cleveland Clinic Abu Dhabi', location: 'Abu Dhabi, UAE', salary: 'AED 45,000/mo', match: 89 },
      { title: 'Registered Nurse - Paediatrics', employer: 'Great Ormond Street Hospital', location: 'London, UK', salary: '\u00a334,000 - \u00a342,000', match: 91 },
      { title: 'Senior Midwife', employer: 'King Faisal Medical City', location: 'Riyadh, KSA', salary: 'SAR 22,000/mo', match: 86 },
      { title: 'Radiographer', employer: 'Toronto General Hospital', location: 'Toronto, Canada', salary: 'CAD 72,000 - 88,000', match: 83 },
      { title: 'Theatre Nurse', employer: 'Royal Melbourne Hospital', location: 'Melbourne, Australia', salary: 'AUD 78,000 - 92,000', match: 80 }
    ];

    container.innerHTML = jobs.map(function (job) {
      var circumference = 2 * Math.PI * 16;
      var dashoffset = circumference - (job.match / 100) * circumference;
      var color = job.match >= 90 ? 'var(--primary)' : job.match >= 80 ? 'var(--accent-cyan)' : 'var(--accent-amber)';

      return '<div class="job-card-compact">' +
        '<div class="job-card-top">' +
          '<div>' +
            '<h4>' + job.title + '</h4>' +
          '</div>' +
          '<div class="job-match-ring">' +
            '<svg viewBox="0 0 44 44">' +
              '<circle class="ring-bg" cx="22" cy="22" r="16"/>' +
              '<circle class="ring-fill" cx="22" cy="22" r="16" style="stroke:' + color + ';stroke-dasharray:' + circumference + ';stroke-dashoffset:' + dashoffset + '"/>' +
              '<text class="ring-text" x="22" y="22" text-anchor="middle" dominant-baseline="central" transform="rotate(90 22 22)" style="fill:' + color + '">' + job.match + '%</text>' +
            '</svg>' +
          '</div>' +
        '</div>' +
        '<div class="job-card-detail">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>' +
          '<span>' + job.employer + '</span>' +
        '</div>' +
        '<div class="job-card-detail">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          '<span>' + job.location + '</span>' +
        '</div>' +
        '<div class="job-card-salary">' + job.salary + '</div>' +
      '</div>';
    }).join('');
  }

  /* ── Build Event Cards ── */
  function populateEvents() {
    var container = document.getElementById('events-row');
    if (!container) return;

    var events = [
      {
        month: 'MAR',
        day: '08',
        type: 'Webinar',
        typeClass: 'badge-secondary',
        title: 'NMC CBT Prep: Everything You Need to Know'
      },
      {
        month: 'MAR',
        day: '15',
        type: 'Career Fair',
        typeClass: 'badge-primary',
        title: 'GlobalHire Virtual Career Fair - GCC & UK'
      },
      {
        month: 'APR',
        day: '02',
        type: 'Workshop',
        typeClass: 'badge-warning',
        title: 'CV Masterclass for International Healthcare Workers'
      }
    ];

    container.innerHTML = events.map(function (ev) {
      return '<div class="event-card">' +
        '<div class="event-date-badge">' +
          '<span class="event-month">' + ev.month + '</span>' +
          '<span class="event-day">' + ev.day + '</span>' +
        '</div>' +
        '<div class="event-info">' +
          '<span class="event-type badge ' + ev.typeClass + '">' + ev.type + '</span>' +
          '<h4>' + ev.title + '</h4>' +
          '<button class="btn btn-outline-primary btn-sm">Register</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── Initialize Page ── */
  function initExplorePage(profile) {
    // Set greeting
    var greetEl = document.getElementById('explore-greeting');
    var firstName = 'there';
    if (profile && profile.full_name) {
      firstName = profile.full_name.split(' ')[0];
    }
    if (greetEl) {
      greetEl.textContent = getGreeting() + ', ' + firstName;
    }

    // Set date
    var dateEl = document.getElementById('explore-date');
    if (dateEl) dateEl.textContent = formatDate();

    // Profile completion (sample: calculate from profile fields)
    var completion = 65;
    if (profile) {
      var fields = ['full_name', 'phone', 'specialty', 'country_of_origin', 'years_of_experience', 'license_number'];
      var filled = 0;
      fields.forEach(function (f) {
        if (profile[f]) filled++;
      });
      completion = Math.round((filled / fields.length) * 100);
    }
    setProfileCompletion(completion);

    // Stats (sample data)
    setStats(3, 27, 8);

    // Populate sections
    populateNews();
    populateJobs();
    populateEvents();

    // Init global nav
    if (window.GHNav) {
      window.GHNav.init('explore');
    }
  }

  /* ── Listen for Auth Ready ── */
  window.addEventListener('gh:auth-ready', function (e) {
    var profile = e.detail && e.detail.profile ? e.detail.profile : null;
    initExplorePage(profile);
  });

  /* ── Fallback: if auth-ready already fired or page loads without auth ── */
  if (document.body.classList.contains('auth-ready')) {
    initExplorePage(null);
  }
})();
