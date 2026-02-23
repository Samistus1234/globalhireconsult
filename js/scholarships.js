/* ============================================
   GLOBALHIRE@ELAB — Scholarships Finder JS
   Search, filter, save, FAQ accordion
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    if (window.GHNav) GHNav.init('scholarships');

    initSearch();
    initFilterChips();
    initSidebarFilters();
    initSaveButtons();
    initFAQ();
    updateCount();
  });

  /* ── Search ── */
  function initSearch() {
    var input = document.getElementById('sch-search');
    var btn = document.getElementById('sch-search-btn');
    if (!input) return;

    function runSearch() {
      var term = input.value.toLowerCase().trim();
      var cards = document.querySelectorAll('.sch-card');
      cards.forEach(function(card) {
        var text = card.textContent.toLowerCase();
        var matchesSearch = !term || text.indexOf(term) !== -1;
        // Combine with current filter visibility
        if (!matchesSearch) {
          card.style.display = 'none';
        } else if (!card.dataset._filtered) {
          card.style.display = '';
        }
      });
      updateCount();
    }

    input.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') runSearch();
    });
    if (btn) btn.addEventListener('click', runSearch);
  }

  /* ── Filter Chips ── */
  function initFilterChips() {
    var chips = document.querySelectorAll('.sch-filter-row .filter-chip');
    chips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        chips.forEach(function(c) { c.classList.remove('active'); });
        chip.classList.add('active');
        applyFilters();
      });
    });
  }

  /* ── Sidebar Filters ── */
  function initSidebarFilters() {
    var countrySelect = document.getElementById('filter-country');
    var toggle = document.getElementById('toggle-international');
    var clearBtn = document.getElementById('clear-filters');

    if (countrySelect) {
      countrySelect.addEventListener('change', applyFilters);
    }

    // Checkboxes
    document.querySelectorAll('.sch-sidebar input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', applyFilters);
    });

    // International toggle
    if (toggle) {
      toggle.addEventListener('click', function() {
        toggle.classList.toggle('active');
        applyFilters();
      });
    }

    // Clear
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (countrySelect) countrySelect.value = '';
        document.querySelectorAll('.sch-sidebar input[type="checkbox"]').forEach(function(cb) {
          cb.checked = true;
        });
        if (toggle) toggle.classList.add('active');
        var chips = document.querySelectorAll('.sch-filter-row .filter-chip');
        chips.forEach(function(c) { c.classList.remove('active'); });
        if (chips[0]) chips[0].classList.add('active');
        var searchInput = document.getElementById('sch-search');
        if (searchInput) searchInput.value = '';
        applyFilters();
      });
    }
  }

  function applyFilters() {
    var activeChip = document.querySelector('.sch-filter-row .filter-chip.active');
    var fieldFilter = activeChip ? activeChip.dataset.filter : 'all';
    var countryFilter = (document.getElementById('filter-country') || {}).value || '';
    var searchTerm = (document.getElementById('sch-search') || {}).value.toLowerCase().trim();

    var cards = document.querySelectorAll('.sch-card');
    cards.forEach(function(card) {
      var field = card.dataset.field || '';
      var country = card.dataset.country || '';
      var text = card.textContent.toLowerCase();

      var matchesField = (fieldFilter === 'all') || (field === fieldFilter);
      var matchesCountry = !countryFilter || (country === countryFilter);
      var matchesSearch = !searchTerm || text.indexOf(searchTerm) !== -1;

      if (matchesField && matchesCountry && matchesSearch) {
        card.style.display = '';
        delete card.dataset._filtered;
      } else {
        card.style.display = 'none';
        card.dataset._filtered = '1';
      }
    });
    updateCount();
  }

  function updateCount() {
    var countEl = document.getElementById('sch-count');
    if (!countEl) return;
    var visible = document.querySelectorAll('.sch-card:not([style*="display: none"])').length;
    countEl.textContent = visible;
  }

  /* ── Save Buttons ── */
  function initSaveButtons() {
    document.querySelectorAll('.sch-save-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var isSaved = btn.classList.toggle('saved');
        var svg = btn.querySelector('svg');
        var text = btn.childNodes[btn.childNodes.length - 1];
        if (isSaved) {
          if (svg) svg.setAttribute('fill', 'currentColor');
          if (text && text.nodeType === 3) text.textContent = ' Saved';
          btn.style.color = 'var(--primary)';
          btn.style.borderColor = 'var(--primary)';
        } else {
          if (svg) svg.setAttribute('fill', 'none');
          if (text && text.nodeType === 3) text.textContent = ' Save';
          btn.style.color = '';
          btn.style.borderColor = '';
        }
      });
    });
  }

  /* ── FAQ Accordion ── */
  function initFAQ() {
    document.querySelectorAll('.faq-question').forEach(function(btn) {
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
