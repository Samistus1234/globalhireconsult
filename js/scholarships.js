/* ============================================
   GLOBALHIRE@ELAB — Scholarships Page JS
   Eligibility checker, FAQ accordion
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    if (window.GHNav) GHNav.init('scholarships');

    initEligibilityChecker();
    initFAQ();
  });

  /* ── Eligibility Checker ── */
  function initEligibilityChecker() {
    var form = document.getElementById('eligibility-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var profession = document.getElementById('sch-profession').value;
      var experience = document.getElementById('sch-experience').value;
      var country = document.getElementById('sch-country').value;
      var destination = document.getElementById('sch-destination').value;

      if (!profession || !experience || !country || !destination) return;

      var programs = getEligiblePrograms(profession, experience, destination);
      displayResults(programs);
    });
  }

  function getEligiblePrograms(profession, experience, destination) {
    var programs = [];

    // NCLEX Sponsorship — nurses targeting USA
    if ((profession === 'nurse' || profession === 'midwife') && destination === 'USA') {
      programs.push({
        name: 'NCLEX Exam Sponsorship',
        amount: 'Up to $5,000',
        desc: 'Full NCLEX-RN exam coverage including prep courses and study materials',
        color: 'primary',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/></svg>'
      });
    }

    // English Language — UK, Australia, NZ, Ireland, Canada
    if (['UK', 'Australia', 'New Zealand', 'Ireland', 'Canada'].indexOf(destination) !== -1) {
      programs.push({
        name: 'English Language Exam Support',
        amount: 'Up to $2,000',
        desc: 'OET or IELTS exam fees plus preparation course access',
        color: 'secondary',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
      });
    }

    // CBT/OSCE — nurses targeting UK
    if ((profession === 'nurse' || profession === 'midwife') && destination === 'UK') {
      programs.push({
        name: 'CBT & OSCE Exam Sponsorship',
        amount: 'Up to $3,500',
        desc: 'NMC Computer-Based Test and OSCE clinical exam coverage',
        color: 'cyan',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>'
      });
    }

    // Relocation Grant — everyone with 1+ year experience
    if (experience !== '0-1') {
      programs.push({
        name: 'Relocation Assistance Grant',
        amount: 'Up to $8,000',
        desc: 'Flights, initial accommodation, and settling-in expenses',
        color: 'amber',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
      });
    }

    // Continuing Education — experienced professionals
    if (['3-5', '5-10', '10+'].indexOf(experience) !== -1) {
      programs.push({
        name: 'Continuing Education Scholarship',
        amount: 'Up to $4,000',
        desc: 'Specialty certifications and professional development funding',
        color: 'coral',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>'
      });
    }

    // Visa & Immigration — everyone
    programs.push({
      name: 'Visa & Immigration Support',
      amount: 'Up to $3,000',
      desc: 'Visa fees, immigration legal counsel, and document attestation',
      color: 'secondary',
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M7 15h4"/></svg>'
    });

    return programs;
  }

  var colorMap = {
    primary: { bg: 'var(--primary-muted)', fg: 'var(--primary)' },
    secondary: { bg: 'var(--secondary-muted)', fg: 'var(--secondary)' },
    amber: { bg: 'rgba(255,176,32,0.12)', fg: 'var(--accent-amber)' },
    cyan: { bg: 'rgba(0,212,255,0.12)', fg: 'var(--accent-cyan)' },
    coral: { bg: 'rgba(255,92,92,0.12)', fg: 'var(--accent-coral)' }
  };

  function displayResults(programs) {
    var resultsEl = document.getElementById('eligibility-results');
    var listEl = document.getElementById('results-list');
    var countEl = document.getElementById('result-count');

    if (!resultsEl || !listEl) return;

    countEl.textContent = programs.length + ' Program' + (programs.length !== 1 ? 's' : '');

    var html = '';
    for (var i = 0; i < programs.length; i++) {
      var p = programs[i];
      var c = colorMap[p.color] || colorMap.primary;
      html +=
        '<div class="sch-result-item">' +
          '<div class="sch-result-icon" style="background:' + c.bg + ';color:' + c.fg + ';">' + p.icon + '</div>' +
          '<div class="sch-result-info">' +
            '<h5>' + p.name + '</h5>' +
            '<p>' + p.desc + '</p>' +
          '</div>' +
          '<div class="sch-result-amount">' + p.amount + '</div>' +
        '</div>';
    }

    listEl.innerHTML = html;
    resultsEl.style.display = 'block';
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── FAQ Accordion ── */
  function initFAQ() {
    var questions = document.querySelectorAll('.faq-question');
    questions.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = btn.closest('.faq-item');
        var answer = item.querySelector('.faq-answer');
        var isOpen = item.classList.contains('open');

        // Close all
        document.querySelectorAll('.faq-item.open').forEach(function(openItem) {
          openItem.classList.remove('open');
          openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          openItem.querySelector('.faq-answer').style.maxHeight = '0';
        });

        // Toggle current
        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });
  }

})();
