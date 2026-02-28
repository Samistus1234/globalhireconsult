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
          'UK': { steps: 5, timeline: '4-12 months', difficulty: 'Moderate', docs: ['English language test (IELTS 7.0 R/L/S, 6.5 W or OET Grade B)', 'NMC account & application (passport, qualifications, registration)', 'Computer-Based Test (CBT) via Pearson VUE', 'OSCE practical exam at UK test centre', 'Final review & NMC PIN issuance', 'Cost: ~£1,170 (application + CBT + registration)'] },
          'USA': { steps: 6, timeline: '12-18 months', difficulty: 'Complex', docs: ['CGFNS credential evaluation / CES Report ($350–$450)', 'Target state selection (TX, FL, NV recommended)', 'English proficiency (IELTS / TOEFL iBT / OET)', 'State Board of Nursing application ($75–$300)', 'NCLEX-RN exam via Pearson VUE ($200)', 'VisaScreen certificate from CGFNS (~$740)', 'Total cost: $1,290–$1,490'] },
          'UAE': { steps: 6, timeline: '3-6 months', difficulty: 'Moderate', docs: ['DHA Sheryan Portal self-assessment', 'DataFlow PSV ($250–$350, 30–45 days)', 'Eligibility application via Sheryan', 'CBT/Prometric exam (100 MCQs, 60% pass)', 'DHA registration (valid 1 year)', 'Employer license activation & visa', 'Total cost: AED 2,800–5,000'] },
          'Saudi Arabia': { steps: 6, timeline: '6-10 months', difficulty: 'Moderate', docs: ['Mumaris+ account creation on SCFHS portal', 'DataFlow PSV ($250–$350, 30–60 days)', 'Eligibility determination & category assignment', 'Prometric exam (specialty-specific, SAR 400–800)', 'Professional Classification Certificate', 'Professional Registration via employer with Iqama', 'Total cost: $680–$850'] },
          'Canada': { steps: 6, timeline: '8-14 months', difficulty: 'Complex', docs: ['NNAS Advisory Report (3–6 months)', 'CRNA application with NNAS report', 'English evidence (IELTS 7.0 overall / CELBAN)', 'Competency assessment by CRNA', 'NCLEX-RN exam via Pearson VUE', 'Jurisprudence exam (Alberta legislation)'] },
          'Australia': { steps: 4, timeline: '1-12 months', difficulty: 'Moderate', docs: ['AHPRA practitioner portal self-check assessment', 'English test (IELTS 7.0 / OET B / PTE 65 / TOEFL 94)', 'Stream allocation (A: qualification-based, B: modified, C: full assessment)', 'Orientation Part 1 (AUD 640) & AGSE-40 form (AUD 475)', 'Annual registration: AUD 185', 'Stream A: 1–3 months | Stream B/C: 6–12 months'] },
          'Germany': { steps: 6, timeline: '12-24 months', difficulty: 'Complex', docs: ['German language B2 (Goethe-Zertifikat / telc)', 'Fachsprachprüfung (FSP) medical language exam (€420)', 'Berufserlaubnis temporary license (1–2 yrs)', 'Equivalency assessment (€1,773)', 'Kenntnisprüfung knowledge exam (€300–€600)', 'Approbation issuance', 'Language training: €3,000–€8,000'] },
          'Qatar': { steps: 3, timeline: '2-3 months', difficulty: 'Easy', docs: ['QCHP registration', 'DataFlow verification', 'Prometric exam', 'Medical fitness test', 'Degree attestation'] },
          'Kuwait': { steps: 4, timeline: '3-6 months', difficulty: 'Moderate', docs: ['KMOH application & document submission', 'DataFlow PSV verification', 'Prometric exam (specialty-specific)', 'Medical fitness & visa processing', 'Degree attestation'] },
          'Oman': { steps: 4, timeline: '2-4 months', difficulty: 'Moderate', docs: ['OMSB / MOH application', 'DataFlow PSV verification', 'Prometric exam', 'Medical fitness certificate', 'Degree attestation & good standing'] },
          'Bahrain': { steps: 4, timeline: '2-4 months', difficulty: 'Moderate', docs: ['NHRA application & registration', 'DataFlow PSV verification', 'Prometric exam', 'Medical fitness certificate', 'Degree attestation & good standing'] },
          'Singapore': { steps: 4, timeline: '3-6 months', difficulty: 'Moderate', docs: ['SNB online application', 'Credential verification', 'English proficiency evidence', 'Nursing board evaluation', 'Registration & practising certificate'] },
          'New Zealand': { steps: 4, timeline: '3-8 months', difficulty: 'Moderate', docs: ['NCNZ competence assessment', 'English language (IELTS 7.0 / OET B)', 'Criminal history check', 'Supervised practice (if required)', 'Annual Practising Certificate'] },
          'Ireland': { steps: 4, timeline: '3-6 months', difficulty: 'Moderate', docs: ['NMBI online application', 'Credential & qualification verification', 'English proficiency (IELTS 7.0 / OET B)', 'Garda vetting (police check)', 'Clinical adaptation/aptitude test (if required)'] }
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
