/* ============================================================
   jobs.js — Fetch campaigns from Supabase & render on jobs.html
   ============================================================ */
(function () {
  'use strict';

  var allCampaigns = [];   // raw data from Supabase
  var filtered     = [];   // after search / filter / sort

  /* ---------- Featured / Pinned listings ---------- */
  var WA_LINK = 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20interested%20in%20the%20Qatar%20Caregiver%20position.%20My%20name%20is%20____%20and%20I%20have%20____%20years%20of%20experience.';

  var featuredListings = [
    {
      id: 'featured-elderly-caregiver-qatar',
      title: 'Elderly Caregiver',
      employer_name: 'Qatar Healthcare Employer',
      destination_country: 'Qatar',
      specialty: 'Elderly Care',
      category: 'Allied Health',
      positions: 3,
      salary_display: '2,500 QAR/month',
      min_experience: 2,
      visa_sponsored: true,
      benefits: ['Accommodation', 'Transport', 'Meals', 'Flight', 'Visa'],
      description: 'Provide daily living assistance, medication reminders, mobility support, and companionship for elderly patients in Qatar.',
      requirements: 'Caregiver certificate + 2 years experience',
      wa_link: WA_LINK,
    },
    {
      id: 'featured-paediatric-caregiver-qatar',
      title: 'Paediatric Caregiver',
      employer_name: 'Qatar Healthcare Employer',
      destination_country: 'Qatar',
      specialty: 'Paediatric Care',
      category: 'Allied Health',
      positions: 2,
      salary_display: '2,500 QAR/month',
      min_experience: 2,
      visa_sponsored: true,
      benefits: ['Accommodation', 'Transport', 'Meals', 'Flight', 'Visa'],
      description: 'Provide child care, developmental support, feeding, bathing, health monitoring, and age-appropriate activities.',
      requirements: 'Caregiver certificate + 2 years experience',
      wa_link: WA_LINK,
    },
  ];

  /* ---------- DOM refs ---------- */
  var container    = null;
  var countEl      = null;
  var searchInput  = null;
  var locInput     = null;
  var sortSelect   = null;

  /* ---------- Helpers ---------- */
  function relativeTime(dateStr) {
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins  = Math.floor(diff / 60000);
    var hrs   = Math.floor(mins / 60);
    var days  = Math.floor(hrs / 24);
    if (days > 30) return Math.floor(days / 30) + ' months ago';
    if (days > 0) return days + (days === 1 ? ' day ago' : ' days ago');
    if (hrs > 0)  return hrs  + (hrs  === 1 ? ' hour ago' : ' hours ago');
    if (mins > 0) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    return 'just now';
  }

  function isNew(dateStr) {
    return (Date.now() - new Date(dateStr).getTime()) < 7 * 86400000;
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function parseSalaryNumber(s) {
    if (!s) return 0;
    var m = s.replace(/[^0-9.]/g, '');
    return parseFloat(m) || 0;
  }

  /* ---------- Specialty → category mapping ---------- */
  var specialtyMap = {
    'General Nursing': 'Nursing', 'ICU/Critical Care': 'Nursing',
    'Emergency': 'Nursing', 'Paediatric': 'Nursing',
    'Midwifery': 'Midwifery',
    'General Medicine': 'Physician', 'General Surgery': 'Physician',
    'Emergency Medicine': 'Physician',
    'Radiology': 'Allied Health', 'Physiotherapy': 'Allied Health',
    'Laboratory Science': 'Allied Health', 'Dentistry': 'Allied Health',
    'Pharmacy': 'Pharmacy'
  };

  function getCategory(specialty) {
    return specialtyMap[specialty] || 'Allied Health';
  }

  /* ---------- Loading skeleton ---------- */
  function showSkeleton() {
    var html = '';
    for (var i = 0; i < 4; i++) {
      html +=
        '<div class="job-card" style="opacity:0.5;pointer-events:none">' +
          '<div class="job-card-body">' +
            '<div class="job-card-header">' +
              '<div class="job-employer-logo" style="background:var(--bg-tertiary)"></div>' +
              '<div style="flex:1">' +
                '<div style="height:18px;width:60%;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:8px"></div>' +
                '<div style="height:14px;width:40%;background:var(--bg-tertiary);border-radius:var(--radius-sm)"></div>' +
              '</div>' +
            '</div>' +
            '<div class="job-meta">' +
              '<span class="job-meta-item" style="width:80px;height:14px;background:var(--bg-tertiary);border-radius:var(--radius-sm)"></span>' +
              '<span class="job-meta-item" style="width:100px;height:14px;background:var(--bg-tertiary);border-radius:var(--radius-sm)"></span>' +
            '</div>' +
          '</div>' +
          '<div class="job-card-aside">' +
            '<div style="height:24px;width:100px;background:var(--bg-tertiary);border-radius:var(--radius-sm)"></div>' +
          '</div>' +
        '</div>';
    }
    container.innerHTML = html;
  }

  /* ---------- Empty state ---------- */
  function showEmpty() {
    container.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:var(--space-16) var(--space-8);">' +
        '<div style="margin-bottom:var(--space-4);">' +
          '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5;">' +
            '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>' +
          '</svg>' +
        '</div>' +
        '<h3 style="color:var(--text-secondary);margin-bottom:var(--space-2);">No positions currently listed</h3>' +
        '<p style="color:var(--text-tertiary);max-width:400px;margin:0 auto var(--space-6);">We are actively working with employers to bring you verified healthcare opportunities. Check back soon or create a profile to be notified when new roles are posted.</p>' +
        '<a href="signup.html" class="btn btn-primary">Create Your Profile</a>' +
      '</div>';
  }

  /* ---------- Build card HTML ---------- */
  function cardHtml(c) {
    var badge = isNew(c.created_at)
      ? '<span class="job-badge job-badge-new">NEW</span>'
      : '';

    var initial = (c.employer_name || '?').charAt(0).toUpperCase();

    var visaTag = c.visa_sponsored
      ? '<span class="tag">Visa Sponsored</span>'
      : '';

    return (
      '<div class="job-card" data-id="' + c.id + '">' +
        badge +
        '<div class="job-card-body">' +
          '<div class="job-card-header">' +
            '<div class="job-employer-logo" style="background:var(--primary-muted);color:var(--primary)">' +
              escHtml(initial) +
            '</div>' +
            '<div>' +
              '<h3>' + escHtml(c.title) + '</h3>' +
              '<span class="job-employer-name">' + escHtml(c.employer_name) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="job-meta">' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' +
              escHtml(c.destination_country) +
            '</span>' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> ' +
              escHtml(c.specialty) +
            '</span>' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' +
              (c.min_experience || 0) + '+ years' +
            '</span>' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> ' +
              (c.positions || 0) + ' positions' +
            '</span>' +
          '</div>' +
          '<div class="job-tags">' +
            '<span class="tag">' + escHtml(c.specialty) + '</span>' +
            visaTag +
          '</div>' +
        '</div>' +
        '<div class="job-card-aside">' +
          '<div class="job-salary">' + escHtml(c.salary_display || 'Competitive') + '</div>' +
          '<span class="job-posted">Posted ' + relativeTime(c.created_at) + '</span>' +
          '<div class="job-card-actions">' +
            '<button class="btn btn-primary btn-sm" onclick="JobsPage.apply(\'' + c.id + '\',\'' + escHtml(c.title).replace(/'/g, "\\'") + '\')">Apply Now</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------- Featured card HTML ---------- */
  function featuredCardHtml(f) {
    var benefitsHtml = f.benefits.map(function (b) {
      return '<span class="benefit-tag">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m5 12 5 5L20 7"/></svg>' +
        b + '</span>';
    }).join('');

    return (
      '<div class="job-card featured" data-id="' + f.id + '">' +
        '<div class="featured-accent"></div>' +
        '<span class="job-badge job-badge-featured">FEATURED</span>' +
        '<div class="job-card-body">' +
          '<div class="job-card-header">' +
            '<div class="job-employer-logo" style="background:rgba(139,26,58,0.15);color:#d4a84b;font-weight:800;">' +
              (f.title === 'Elderly Caregiver' ? '&#x2764;' : '&#x1F476;') +
            '</div>' +
            '<div>' +
              '<h3>' + escHtml(f.title) + '</h3>' +
              '<span class="job-employer-name">' + escHtml(f.employer_name) + '</span>' +
            '</div>' +
          '</div>' +
          '<p style="color:var(--text-secondary);font-size:var(--text-sm);line-height:1.6;margin-top:var(--space-3);margin-bottom:var(--space-2);">' +
            escHtml(f.description) +
          '</p>' +
          '<div class="job-meta">' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' +
              escHtml(f.destination_country) +
            '</span>' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> ' +
              escHtml(f.specialty) +
            '</span>' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' +
              f.min_experience + '+ years' +
            '</span>' +
            '<span class="job-meta-item">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> ' +
              f.positions + ' positions' +
            '</span>' +
          '</div>' +
          '<div class="job-tags">' +
            '<span class="tag">' + escHtml(f.specialty) + '</span>' +
            '<span class="tag">Visa Sponsored</span>' +
          '</div>' +
          '<div class="benefits-strip">' + benefitsHtml + '</div>' +
        '</div>' +
        '<div class="job-card-aside">' +
          '<div class="job-salary" style="color:#d4a84b;">' + escHtml(f.salary_display) + '</div>' +
          '<span class="job-posted" style="color:var(--text-tertiary);">' + escHtml(f.requirements) + '</span>' +
          '<div class="job-card-actions">' +
            '<a href="' + f.wa_link + '" target="_blank" rel="noopener noreferrer" class="btn-featured">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
              'Apply on WhatsApp' +
            '</a>' +
          '</div>' +
          '<a href="/qatar-caregivers" style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);display:inline-block;text-decoration:underline;">View full details &rarr;</a>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------- Render filtered list ---------- */
  function render() {
    // Always render featured listings first
    var featuredHtml = featuredListings.map(featuredCardHtml).join('');

    if (!filtered.length && !featuredListings.length) { showEmpty(); }
    else {
      container.innerHTML = featuredHtml + filtered.map(cardHtml).join('');
    }
    var total = filtered.length + featuredListings.length;
    countEl.textContent = 'Showing ' + total + ' position' + (total !== 1 ? 's' : '');
  }

  /* ---------- Collect current filter state ---------- */
  function getFilters() {
    var keyword = (searchInput.value || '').toLowerCase().trim();
    var loc     = (locInput.value || '').toLowerCase().trim();

    // Active filter chip
    var activeChip = document.querySelector('.filter-chip.active');
    var chipLabel  = activeChip ? activeChip.textContent.trim() : 'All Roles';

    // Sidebar specialties
    var specBoxes = document.querySelectorAll('.jobs-sidebar .sidebar-section:first-child .sidebar-checkbox input');
    var specLabels = [];
    specBoxes.forEach(function (cb) {
      if (cb.checked) specLabels.push(cb.parentElement.textContent.trim());
    });

    // Sidebar country
    var countryEl = document.querySelector('.jobs-sidebar .sidebar-select');
    var country = countryEl ? countryEl.value : '';

    // Sidebar experience
    var expBoxes = document.querySelectorAll('.jobs-sidebar .sidebar-section:nth-of-type(4) .sidebar-checkbox input');
    var expRanges = [];
    expBoxes.forEach(function (cb) {
      if (cb.checked) {
        var txt = cb.parentElement.textContent.trim();
        if (txt.indexOf('0-2') !== -1)  expRanges.push([0, 2]);
        if (txt.indexOf('3-5') !== -1)  expRanges.push([3, 5]);
        if (txt.indexOf('6-10') !== -1) expRanges.push([6, 10]);
        if (txt.indexOf('10+') !== -1)  expRanges.push([10, 999]);
      }
    });

    // Visa toggle
    var visaToggle = document.querySelector('.jobs-sidebar .toggle-switch');
    var visaOnly = visaToggle ? visaToggle.classList.contains('active') : false;

    // Sort
    var sort = sortSelect ? sortSelect.value : 'Newest First';

    return { keyword: keyword, loc: loc, chipLabel: chipLabel, specLabels: specLabels, country: country, expRanges: expRanges, visaOnly: visaOnly, sort: sort };
  }

  /* ---------- Apply filters & sort ---------- */
  function applyFilters() {
    var f = getFilters();

    filtered = allCampaigns.filter(function (c) {
      // Keyword search
      if (f.keyword) {
        var haystack = [c.title, c.specialty, c.employer_name, c.destination_country, c.description].join(' ').toLowerCase();
        if (haystack.indexOf(f.keyword) === -1) return false;
      }

      // Location search
      if (f.loc) {
        if ((c.destination_country || '').toLowerCase().indexOf(f.loc) === -1) return false;
      }

      // Filter chip
      if (f.chipLabel === 'Visa Sponsored') {
        if (!c.visa_sponsored) return false;
      } else if (f.chipLabel !== 'All Roles' && f.chipLabel !== 'Remote / Tele') {
        if (getCategory(c.specialty) !== f.chipLabel) return false;
      }

      // Sidebar specialty
      if (f.specLabels.length > 0) {
        var cat = getCategory(c.specialty);
        if (f.specLabels.indexOf(cat) === -1 && f.specLabels.indexOf(c.specialty) === -1) return false;
      }

      // Sidebar country
      if (f.country && c.destination_country !== f.country) return false;

      // Sidebar experience
      if (f.expRanges.length > 0) {
        var exp = c.min_experience || 0;
        var match = f.expRanges.some(function (r) { return exp >= r[0] && exp <= r[1]; });
        if (!match) return false;
      }

      // Visa toggle
      if (f.visaOnly && !c.visa_sponsored) return false;

      return true;
    });

    // Sort
    if (f.sort === 'Newest First' || f.sort === 'Best Match') {
      filtered.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    } else if (f.sort === 'Salary: High to Low') {
      filtered.sort(function (a, b) { return parseSalaryNumber(b.salary_display) - parseSalaryNumber(a.salary_display); });
    } else if (f.sort === 'Salary: Low to High') {
      filtered.sort(function (a, b) { return parseSalaryNumber(a.salary_display) - parseSalaryNumber(b.salary_display); });
    }

    render();
  }

  var debouncedFilter = (window.GHE && GHE.debounce) ? GHE.debounce(applyFilters, 300) : applyFilters;

  /* ---------- Wire up events ---------- */
  function bindEvents() {
    // Search inputs
    searchInput.addEventListener('input', debouncedFilter);
    locInput.addEventListener('input', debouncedFilter);

    // Search button
    var searchBtn = document.querySelector('.search-bar-large .btn-primary');
    if (searchBtn) searchBtn.addEventListener('click', function (e) { e.preventDefault(); applyFilters(); });

    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (chip.textContent.trim() === 'All Roles') {
          document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
        } else {
          var allChip = document.querySelector('.filter-chip');
          if (allChip) allChip.classList.remove('active');
          document.querySelectorAll('.filter-chip').forEach(function (c) {
            if (c !== chip && c.textContent.trim() !== 'All Roles') { /* keep multi-select possible */ }
          });
          // Single-select among non-All chips
          document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
        }
        applyFilters();
      });
    });

    // Sidebar controls
    document.querySelectorAll('.jobs-sidebar input[type="checkbox"], .jobs-sidebar select').forEach(function (el) {
      el.addEventListener('change', applyFilters);
    });

    // Visa toggle
    var visaToggle = document.querySelector('.jobs-sidebar .toggle-switch');
    if (visaToggle) {
      visaToggle.addEventListener('click', function () {
        this.classList.toggle('active');
        applyFilters();
      });
    }

    // Sort dropdown
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);

    // Clear all filters
    var clearBtn = document.querySelector('.btn-clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        locInput.value = '';
        document.querySelectorAll('.filter-chip').forEach(function (c, i) {
          c.classList.toggle('active', i === 0);
        });
        document.querySelectorAll('.jobs-sidebar input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
        var countrySelect = document.querySelector('.jobs-sidebar .sidebar-select');
        if (countrySelect) countrySelect.value = '';
        document.querySelectorAll('.sidebar-range input').forEach(function (inp) { inp.value = ''; });
        var vt = document.querySelector('.jobs-sidebar .toggle-switch');
        if (vt) vt.classList.remove('active');
        if (sortSelect) sortSelect.selectedIndex = 0;
        applyFilters();
      });
    }
  }

  /* ---------- Apply: auth-aware redirect ---------- */
  async function handleApply(campaignId, title) {
    var sb = window.ghSupabase;
    if (!sb) return;

    try {
      var res = await sb.auth.getSession();
      var session = res.data && res.data.session;
      var portalUrl = 'portal.html?apply=' + encodeURIComponent(campaignId);

      if (!session) {
        // Not logged in — redirect to login with return URL
        window.location.href = 'login.html?redirect=' + encodeURIComponent(portalUrl);
      } else {
        // Logged in — go straight to portal
        window.location.href = portalUrl;
      }
    } catch (e) {
      console.error('Apply check failed:', e);
      window.location.href = 'login.html?redirect=' + encodeURIComponent('portal.html?apply=' + encodeURIComponent(campaignId));
    }
  }

  /* ---------- Fetch & Init ---------- */
  function init() {
    container   = document.getElementById('jobs-container');
    countEl     = document.getElementById('results-count');
    searchInput = document.getElementById('job-search');
    locInput    = document.getElementById('location-search');
    sortSelect  = document.querySelector('.sort-select select');

    if (!container) return;

    showSkeleton();
    bindEvents();

    ghFrom('campaigns')
      .select('*')
      .not('status', 'in', '("draft","closed")')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) {
          console.error('Failed to fetch campaigns:', res.error);
          allCampaigns = [];
        } else {
          allCampaigns = res.data || [];
        }
        filtered = allCampaigns.slice();
        render();
      });
  }

  /* ---------- Public API ---------- */
  window.JobsPage = { apply: handleApply };

  document.addEventListener('DOMContentLoaded', init);
})();
