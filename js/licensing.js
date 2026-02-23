/* ============================================
   GLOBALHIRE@ELAB — Licensing Page JS
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    // Init global nav
    if (window.GHNav) GHNav.init('licensing');
    if (window.GHE) GHE.init();

    // ── Tab Switching ──
    var tabBtns = document.querySelectorAll('.tab-btn');
    var tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tabId = 'tab-' + btn.getAttribute('data-tab');

        // Update buttons
        tabBtns.forEach(function(b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        // Update panels
        tabPanels.forEach(function(panel) {
          panel.classList.remove('active');
        });
        var target = document.getElementById(tabId);
        if (target) target.classList.add('active');
      });
    });

    // ── Pathway Analyzer ──
    var analyzerForm = document.getElementById('analyzer-form');
    var resultsEl = document.getElementById('analyzer-results');

    if (analyzerForm) {
      analyzerForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var source = document.getElementById('source-country').value;
        var dest = document.getElementById('dest-country').value;
        var specialty = document.getElementById('specialty').value;

        if (!source || !dest || !specialty) return;

        // Generate results based on destination
        var pathways = {
          'UK': { steps: 4, timeline: '3-6 months', difficulty: 'Moderate', docs: ['English language test (IELTS 7.0 / OET B)', 'Nursing degree certificate & transcripts', 'Certificate of good standing', 'CBT exam registration', 'OSCE exam booking', 'Character references (x2)', 'Passport & ID verification'] },
          'USA': { steps: 6, timeline: '6-12 months', difficulty: 'Complex', docs: ['NCLEX-RN exam registration', 'CGFNS VisaScreen certificate', 'Credential evaluation report', 'English proficiency (TOEFL/IELTS)', 'State licensure application', 'Background check clearance', 'Immigration petition (I-140)'] },
          'UAE': { steps: 3, timeline: '2-4 months', difficulty: 'Easy', docs: ['Dataflow verification application', 'Prometric/DHA exam registration', 'Medical fitness certificate', 'Degree attestation', 'Good standing certificate', 'Passport copies'] },
          'Saudi Arabia': { steps: 3, timeline: '2-4 months', difficulty: 'Easy', docs: ['SCFHS registration', 'Prometric exam', 'Dataflow verification', 'Medical report', 'Degree attestation', 'Police clearance'] },
          'Canada': { steps: 5, timeline: '8-14 months', difficulty: 'Complex', docs: ['NNAS credential assessment', 'English/French language test', 'Bridging program enrollment', 'Provincial registration', 'Background check', 'Supervised practice hours'] },
          'Australia': { steps: 4, timeline: '4-8 months', difficulty: 'Moderate', docs: ['AHPRA online application', 'English test (IELTS 7.0 / OET B)', 'Skills assessment report', 'National police check', 'Working With Children check', 'Registration fee payment'] },
          'Germany': { steps: 5, timeline: '6-12 months', difficulty: 'Complex', docs: ['German language certificate (B2)', 'Degree recognition (Anerkennung)', 'Kenntnisprüfung exam registration', 'Professional experience proof', 'Health insurance enrollment', 'Residence permit application'] },
          'Qatar': { steps: 3, timeline: '2-3 months', difficulty: 'Easy', docs: ['QCHP registration', 'Dataflow verification', 'Prometric exam', 'Medical fitness test', 'Degree attestation'] }
        };

        var info = pathways[dest] || pathways['UK'];

        // Update results
        document.getElementById('result-steps').textContent = info.steps;
        document.getElementById('result-timeline').textContent = info.timeline;
        document.getElementById('result-difficulty').textContent = info.difficulty;

        var diffBadge = document.getElementById('result-difficulty');
        diffBadge.className = 'badge badge-dot';
        if (info.difficulty === 'Easy') diffBadge.classList.add('badge-primary');
        else if (info.difficulty === 'Moderate') diffBadge.classList.add('badge-warning');
        else diffBadge.classList.add('badge-error');

        // Populate docs
        var docsList = document.getElementById('result-docs-list');
        if (docsList) {
          docsList.innerHTML = info.docs.map(function(doc) {
            return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m5 12 5 5L20 7"/></svg>' + doc + '</li>';
          }).join('');
        }

        // Show results
        resultsEl.style.display = 'block';
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // ── FAQ Accordion ──
    var faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(function(item) {
      var question = item.querySelector('.faq-question');
      if (!question) return;

      question.addEventListener('click', function() {
        var isOpen = item.classList.contains('open');

        // Close all
        faqItems.forEach(function(fi) { fi.classList.remove('open'); });

        // Toggle current
        if (!isOpen) {
          item.classList.add('open');
          question.setAttribute('aria-expanded', 'true');
        } else {
          question.setAttribute('aria-expanded', 'false');
        }
      });
    });
  });
})();
