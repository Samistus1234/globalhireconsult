/* ============================================================
   jobs.js — Fetch campaigns from Supabase & render on jobs.html
   ============================================================ */
(function () {
  'use strict';

  var allCampaigns = [];   // raw data from Supabase
  var filtered     = [];   // after search / filter / sort
  var savedJobIds  = new Set(); // job IDs the current user has saved

  /* ---------- Featured / Pinned listings ---------- */
  var WA_QATAR = 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20interested%20in%20the%20Qatar%20Caregiver%20position.%20My%20name%20is%20____%20and%20I%20have%20____%20years%20of%20experience.';
  var WA_LINK = WA_QATAR;
  var WA_ALBANIA = 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20interested%20in%20the%20Albania%20Work%20Visa%20program.%20My%20name%20is%20____%20and%20I%20want%20to%20know%20more.';

  var featuredListings = [
    {
      id: 'featured-qatar-derm-consultant',
      title: 'Consultant Dermatologist',
      employer_name: 'Leading Healthcare Provider — Qatar',
      destination_country: 'Qatar',
      specialty: 'Dermatology',
      category: 'Physician',
      positions: 2,
      salary_display: 'Competitive Tax-Free',
      min_experience: 0,
      visa_sponsored: true,
      benefits: ['Tax-Free Salary', 'QCHP Licensing', 'DataFlow', 'Flights', 'Accommodation', 'Relocation'],
      description: 'Consultant Dermatologist opening in Doha, Qatar (2 positions). ELAB handles QCHP licensing, DataFlow verification, visa, and relocation end to end.',
      requirements: 'MBBS/MD + Specialty/Fellowship Certificate + Medical License + Experience',
      wa_link: 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20a%20Consultant%20Dermatologist%20interested%20in%20the%20Doha%2C%20Qatar%20role.%20My%20name%20is%20____%20and%20I%20have%20____%20years%20of%20experience.',
      detail_link: 'qatar-consultant-doctors.html',
      accent_color: '#0077B6',
    },
    {
      id: 'featured-qatar-plastics-consultant',
      title: 'Consultant Plastic Surgeon',
      employer_name: 'Leading Healthcare Provider — Qatar',
      destination_country: 'Qatar',
      specialty: 'Plastic Surgery',
      category: 'Physician',
      positions: 2,
      salary_display: 'Competitive Tax-Free',
      min_experience: 0,
      visa_sponsored: true,
      benefits: ['Tax-Free Salary', 'QCHP Licensing', 'DataFlow', 'Flights', 'Accommodation', 'Relocation'],
      description: 'Consultant Plastic Surgeon opening in Doha, Qatar (2 positions). ELAB handles QCHP licensing, DataFlow verification, visa, and relocation end to end.',
      requirements: 'MBBS/MD + Specialty/Fellowship Certificate + Medical License + Experience',
      wa_link: 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20a%20Consultant%20Plastic%20Surgeon%20interested%20in%20the%20Doha%2C%20Qatar%20role.%20My%20name%20is%20____%20and%20I%20have%20____%20years%20of%20experience.',
      detail_link: 'qatar-consultant-doctors.html',
      accent_color: '#0077B6',
    },
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
      wa_link: WA_QATAR,
    },
    {
      id: 'featured-albania-work-visa',
      title: 'Work in Albania (Europe) — D Visa',
      employer_name: 'eLab Solutions International',
      destination_country: 'Albania',
      specialty: 'General / Multiple Roles',
      category: 'General',
      positions: 0,
      salary_display: '600–850 EUR/month',
      min_experience: 0,
      visa_sponsored: true,
      benefits: ['Accommodation', 'Meals', 'Flight', 'Residence Permit', 'Citizenship Pathway'],
      description: 'Work legally in Europe with a Type D working visa and residence permit. Earn in Euros, with accommodation and meals included. Eligible for Albanian citizenship after 5-6 years.',
      requirements: 'Passport + Certificate + Police Report + CV',
      wa_link: WA_ALBANIA,
      detail_link: 'https://elabsolution.org/albania',
      accent_color: '#E41E3F',
    },
    {
      id: 'featured-qatar-nursing-2yr',
      title: 'Registered Nurse — 2-Year Contract',
      employer_name: 'Qatar Hospital',
      destination_country: 'Qatar',
      specialty: 'General Nursing',
      category: 'Nursing',
      positions: 0,
      salary_display: '4,500 QAR/month',
      min_experience: 0,
      visa_sponsored: true,
      benefits: ['Accommodation', 'Flight', 'Visa'],
      description: 'Nursing positions in Qatar with a 2-year contract. Salary of 4,500 QAR/month with accommodation, flight, and visa fully covered. Interviews starting in 1 week.',
      requirements: 'Prometric + DataFlow + Degree + License + CV',
      wa_link: 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20interested%20in%20the%20Qatar%20Nursing%20position%20(2-year%20contract).%20My%20name%20is%20____%20and%20I%20have%20____%20years%20of%20experience.',
      detail_link: 'qatar-nursing.html',
      accent_color: '#6366f1',
    },
    {
      id: 'featured-qatar-nursing-5yr',
      title: 'Registered Nurse — 5-Year Contract',
      employer_name: 'Qatar Hospital',
      destination_country: 'Qatar',
      specialty: 'General Nursing',
      category: 'Nursing',
      positions: 0,
      salary_display: '4,400 QAR/month',
      min_experience: 0,
      visa_sponsored: true,
      benefits: ['Accommodation', 'Flight', 'Visa'],
      description: 'Long-term nursing positions in Qatar with a 5-year contract. Salary of 4,400 QAR/month with accommodation, flight, and visa fully covered. Interviews starting in 1 week.',
      requirements: 'Prometric + DataFlow + Degree + License + CV',
      wa_link: 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20interested%20in%20the%20Qatar%20Nursing%20position%20(5-year%20contract).%20My%20name%20is%20____%20and%20I%20have%20____%20years%20of%20experience.',
      detail_link: 'qatar-nursing-5yr.html',
      accent_color: '#6366f1',
    },
    {
      id: 'featured-saudi-ent-surgeon',
      title: 'ENT Surgeon / Otorhinolaryngologist',
      employer_name: 'Private Hospital — Saudi Arabia',
      destination_country: 'Saudi Arabia',
      specialty: 'Otorhinolaryngology (ENT)',
      category: 'Physician',
      positions: 1,
      salary_display: 'Competitive Tax-Free',
      min_experience: 2,
      visa_sponsored: true,
      benefits: ['Tax-Free Salary', 'Accommodation', 'Annual Flights', 'Medical Insurance', 'End of Service'],
      description: 'A leading private hospital in Saudi Arabia is recruiting an ENT Specialist. Must have DataFlow, Mumaris (SCFHS), and Prometric. Minimum 2 years post-specialization experience.',
      requirements: 'DataFlow + Mumaris + Prometric + Specialist License + 2 yrs experience',
      wa_link: 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20an%20ENT%20Surgeon%20interested%20in%20the%20Saudi%20placement.%20My%20name%20is%20____%20and%20I%20want%20to%20know%20more.',
      detail_link: 'https://elabsolution.org/saudi-ent',
      accent_color: '#006C35',
    },
    {
      id: 'featured-elab-complete',
      title: 'eLab Complete — Guaranteed Nursing Placement',
      employer_name: 'eLab Solutions International',
      destination_country: 'Qatar & Saudi Arabia',
      specialty: 'General Nursing',
      category: 'Nursing',
      positions: 0,
      salary_display: 'Guaranteed Placement',
      min_experience: 0,
      visa_sponsored: true,
      benefits: ['DataFlow', 'Exam Prep', 'Prometric', 'Job Placement', 'Visa Support', 'Money-Back Guarantee'],
      description: 'End-to-end guaranteed nursing placement program. We handle everything from verification to deployment. If we don\'t place you within 9 months, you get your money back.',
      requirements: 'RN/RM/BNSc + Age 21-45 + Medical Screening',
      wa_link: 'https://wa.me/19294192327?text=Hi%20eLab%2C%20I%E2%80%99m%20interested%20in%20the%20eLab%20Complete%20guaranteed%20placement%20program.%20My%20name%20is%20____%20and%20I%20am%20a%20registered%20nurse.',
      detail_link: 'elab-complete.html',
      accent_color: '#059669',
    },
  ];

  /* ---------- DOM refs ---------- */
  var container    = null;
  var countEl      = null;
  var searchInput  = null;
  var locInput     = null;
  var sortSelect   = null;

  /* ---------- Social Share Buttons ---------- */
  function shareButtons(title, destination, salary) {
    var pageUrl = encodeURIComponent(window.location.origin + '/jobs.html');
    var text = encodeURIComponent(title + ' in ' + (destination || '') + (salary ? ' — ' + salary : '') + '. Apply now at GlobalHire by eLab Solutions!');
    var waText = encodeURIComponent('Check out this opportunity: *' + title + '* in ' + (destination || '') + (salary ? ' (' + salary + ')' : '') + '. Apply here: ' + window.location.origin + '/jobs.html');

    return (
      '<div style="display:flex;gap:6px;margin-top:var(--space-2);align-items:center;">' +
        '<span style="font-size:10px;color:var(--text-tertiary);margin-right:2px;">Share:</span>' +
        // WhatsApp
        '<a href="https://wa.me/?text=' + waText + '" target="_blank" rel="noopener noreferrer" title="Share on WhatsApp" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(37,211,102,0.12);color:#25d366;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(37,211,102,0.25)\'" onmouseout="this.style.background=\'rgba(37,211,102,0.12)\'">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        '</a>' +
        // LinkedIn
        '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + pageUrl + '" target="_blank" rel="noopener noreferrer" title="Share on LinkedIn" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(10,102,194,0.12);color:#0a66c2;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(10,102,194,0.25)\'" onmouseout="this.style.background=\'rgba(10,102,194,0.12)\'">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' +
        '</a>' +
        // Facebook
        '<a href="https://www.facebook.com/sharer/sharer.php?u=' + pageUrl + '&quote=' + text + '" target="_blank" rel="noopener noreferrer" title="Share on Facebook" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(24,119,242,0.12);color:#1877f2;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(24,119,242,0.25)\'" onmouseout="this.style.background=\'rgba(24,119,242,0.12)\'">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' +
        '</a>' +
        // X/Twitter
        '<a href="https://twitter.com/intent/tweet?text=' + text + '&url=' + pageUrl + '" target="_blank" rel="noopener noreferrer" title="Share on X" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.06);color:var(--text-secondary);text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.12)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.06)\'">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' +
        '</a>' +
      '</div>'
    );
  }

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

  /* ---------- Bookmark SVG helpers ---------- */
  var SVG_BOOKMARK_OUTLINE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var SVG_BOOKMARK_FILLED  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

  /* ---------- Save / Unsave job ---------- */
  async function handleSave(jobId, title, employer, destination, salary) {
    var sb = window.ghSupabase;
    if (!sb) return;

    var res = await sb.auth.getSession();
    var session = res.data && res.data.session;

    if (!session) {
      window.location.href = 'login.html?redirect=jobs.html';
      return;
    }

    var userId = session.user.id;

    if (savedJobIds.has(jobId)) {
      // Unsave
      await sb.from('gh_saved_jobs').delete()
        .eq('user_id', userId)
        .eq('job_id', jobId);
      savedJobIds.delete(jobId);
    } else {
      // Save
      await sb.from('gh_saved_jobs').upsert({
        job_id: jobId,
        user_id: userId,
        job_title: title,
        job_employer: employer,
        job_destination: destination,
        job_salary: salary
      }, { onConflict: 'user_id,job_id' });
      savedJobIds.add(jobId);
    }

    // Update all bookmark buttons for this job
    document.querySelectorAll('.btn-save-job[data-job-id="' + jobId + '"]').forEach(function (btn) {
      var isSaved = savedJobIds.has(jobId);
      btn.innerHTML = isSaved ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK_OUTLINE;
      btn.title = isSaved ? 'Remove from saved' : 'Save this job';
      btn.style.color = isSaved ? 'var(--primary)' : 'var(--text-tertiary)';
    });
  }

  /* ---------- Load saved job IDs for current user ---------- */
  async function loadSavedJobIds() {
    var sb = window.ghSupabase;
    if (!sb) return;
    try {
      var res = await sb.auth.getSession();
      var session = res.data && res.data.session;
      if (!session) return;
      var { data } = await sb.from('gh_saved_jobs')
        .select('job_id')
        .eq('user_id', session.user.id);
      if (data) {
        data.forEach(function (row) { savedJobIds.add(row.job_id); });
      }
    } catch (e) {
      console.warn('Could not load saved jobs:', e);
    }
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
            shareButtons(c.title, c.destination_country, c.salary_display) +
            '<button class="btn-save-job" data-job-id="' + c.id + '" title="' + (savedJobIds.has(c.id) ? 'Remove from saved' : 'Save this job') + '" style="background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;color:' + (savedJobIds.has(c.id) ? 'var(--primary)' : 'var(--text-tertiary)') + ';border-radius:var(--radius-sm);transition:color 0.15s;" onmouseover="this.style.color=\'var(--primary)\'" onmouseout="if(!window.JobsPage._isSaved(\'' + c.id + '\'))this.style.color=\'var(--text-tertiary)\'" onclick="JobsPage.saveJob(\'' + c.id + '\',\'' + escHtml(c.title).replace(/'/g, "\\'") + '\',\'' + escHtml(c.employer_name).replace(/'/g, "\\'") + '\',\'' + escHtml(c.destination_country).replace(/'/g, "\\'") + '\',\'' + escHtml(c.salary_display || 'Competitive').replace(/'/g, "\\'") + '\')">' +
              (savedJobIds.has(c.id) ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK_OUTLINE) +
            '</button>' +
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
            '<div class="job-employer-logo" style="background:' + (f.accent_color ? f.accent_color + '20' : 'rgba(139,26,58,0.15)') + ';color:' + (f.accent_color || '#d4a84b') + ';font-weight:800;font-size:18px;">' +
              (f.id.indexOf('elderly') !== -1 ? '&#x2764;' : f.id.indexOf('paediatric') !== -1 ? '&#x1F476;' : f.id.indexOf('albania') !== -1 ? '&#x1F1E6;&#x1F1F1;' : f.id.indexOf('nursing') !== -1 ? '&#x1FA7A;' : f.id.indexOf('ent') !== -1 ? '&#x1F3E5;' : escHtml((f.employer_name || '?').charAt(0))) +
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
              (f.positions > 0 ? f.positions + ' positions' : 'Multiple openings') +
            '</span>' +
          '</div>' +
          '<div class="job-tags">' +
            '<span class="tag">' + escHtml(f.specialty) + '</span>' +
            '<span class="tag">Visa Sponsored</span>' +
          '</div>' +
          '<div class="benefits-strip">' + benefitsHtml + '</div>' +
        '</div>' +
        '<div class="job-card-aside">' +
          '<div class="job-salary" style="color:' + (f.accent_color || '#d4a84b') + ';">' + escHtml(f.salary_display) + '</div>' +
          '<span class="job-posted" style="color:var(--text-tertiary);">' + escHtml(f.requirements) + '</span>' +
          '<div class="job-card-actions" style="display:flex;flex-direction:column;gap:8px;">' +
            (f.detail_link ? '<a href="' + f.detail_link + '" class="btn btn-primary btn-sm" style="text-decoration:none;text-align:center;">Apply Now</a>' : '') +
            '<button class="btn-save-job" data-job-id="' + f.id + '" title="' + (savedJobIds.has(f.id) ? 'Remove from saved' : 'Save this job') + '" style="background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;gap:6px;color:' + (savedJobIds.has(f.id) ? 'var(--primary)' : 'var(--text-tertiary)') + ';font-size:var(--text-xs);border-radius:var(--radius-sm);transition:color 0.15s;" onmouseover="this.style.color=\'var(--primary)\'" onmouseout="if(!window.JobsPage._isSaved(\'' + f.id + '\'))this.style.color=\'var(--text-tertiary)\'" onclick="JobsPage.saveJob(\'' + f.id + '\',\'' + escHtml(f.title).replace(/'/g, "\\'") + '\',\'' + escHtml(f.employer_name).replace(/'/g, "\\'") + '\',\'' + escHtml(f.destination_country).replace(/'/g, "\\'") + '\',\'' + escHtml(f.salary_display).replace(/'/g, "\\'") + '\')">' +
              (savedJobIds.has(f.id) ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK_OUTLINE) +
              (savedJobIds.has(f.id) ? 'Saved' : 'Save Job') +
            '</button>' +
            '<a href="' + f.wa_link + '" target="_blank" rel="noopener noreferrer" class="btn-featured">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
              'Apply on WhatsApp' +
            '</a>' +
          '</div>' +
          '<a href="' + (f.detail_link || 'https://elabsolution.org/qatar-caregivers') + '" style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);display:inline-block;text-decoration:underline;">View full details &rarr;</a>' +
          shareButtons(f.title, f.destination_country, f.salary_display) +
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

    // Load saved job IDs first (if logged in), then fetch campaigns
    loadSavedJobIds().then(function () {
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
    });
  }

  /* ---------- Job Alerts Signup ---------- */
  function initJobAlerts() {
    var form = document.getElementById('job-alerts-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var nameEl = document.getElementById('alert-name');
      var emailEl = document.getElementById('alert-email');
      var specEl = document.getElementById('alert-specialty');
      var msgEl = document.getElementById('alert-msg');
      var btn = form.querySelector('button[type="submit"]');

      var name = nameEl.value.trim();
      var email = emailEl.value.trim();
      var specialty = specEl.value;

      if (!name || !email) return;

      btn.disabled = true;
      btn.textContent = 'Subscribing...';
      msgEl.style.display = 'none';

      try {
        var { error } = await ghFrom('job_alert_subscribers').insert({
          full_name: name,
          email: email,
          specialty_interest: specialty || null,
        });

        if (error) {
          if (error.message && error.message.includes('duplicate')) {
            msgEl.textContent = 'You\'re already subscribed! We\'ll keep you updated.';
            msgEl.style.color = 'var(--primary)';
          } else {
            throw error;
          }
        } else {
          msgEl.textContent = 'Subscribed! You\'ll receive job alerts at ' + email;
          msgEl.style.color = 'var(--success, #10b981)';
          nameEl.value = '';
          emailEl.value = '';
          specEl.value = '';
        }
      } catch (err) {
        console.error('Alert signup error:', err);
        msgEl.textContent = 'Something went wrong. Please try again or contact us on WhatsApp.';
        msgEl.style.color = 'var(--error, #ef4444)';
      }

      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Subscribe';
    });
  }

  /* ---------- Public API ---------- */
  window.JobsPage = {
    apply: handleApply,
    saveJob: handleSave,
    unsaveJob: function (jobId) { return handleSave(jobId, '', '', '', ''); },
    _isSaved: function (jobId) { return savedJobIds.has(jobId); }
  };

  document.addEventListener('DOMContentLoaded', function () {
    init();
    initJobAlerts();
  });
})();
