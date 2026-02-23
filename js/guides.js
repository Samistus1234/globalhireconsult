/* ============================================
   GLOBALHIRE@ELAB — Guides / Knowledge Hub JS
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    // Init global nav
    if (window.GHNav) GHNav.init('guides');
    if (window.GHE) GHE.init();

    // ── Search Filtering ──
    var searchInput = document.getElementById('guides-search');
    if (searchInput) {
      searchInput.addEventListener('input', GHE ? GHE.debounce(handleSearch, 300) : handleSearch);
    }

    function handleSearch() {
      var query = (searchInput.value || '').toLowerCase().trim();
      // Search across all cards with data-search attribute
      var allCards = document.querySelectorAll('[data-search]');
      allCards.forEach(function(card) {
        var searchText = (card.getAttribute('data-search') || '').toLowerCase();
        var title = (card.querySelector('h4') || {}).textContent || '';
        var combined = searchText + ' ' + title.toLowerCase();
        if (!query || combined.indexOf(query) !== -1) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    // ── Filter Chips ──
    var filterChips = document.querySelectorAll('#guides-filter-chips .filter-chip');
    filterChips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        // Update active state
        filterChips.forEach(function(c) { c.classList.remove('active'); });
        chip.classList.add('active');

        var category = chip.getAttribute('data-category');
        var sections = document.querySelectorAll('.guides-section');

        if (category === 'all') {
          sections.forEach(function(s) { s.style.display = ''; });
        } else {
          sections.forEach(function(s) {
            var sectionCat = s.getAttribute('data-category');
            if (!sectionCat || sectionCat === category) {
              s.style.display = '';
            } else {
              s.style.display = 'none';
            }
          });
        }
      });
    });

    // ── Carousel Arrows ──
    var arrows = document.querySelectorAll('.carousel-arrow');
    arrows.forEach(function(arrow) {
      arrow.addEventListener('click', function() {
        var carouselId = arrow.getAttribute('data-carousel');
        var carousel = document.getElementById(carouselId);
        if (!carousel) return;

        var scrollAmount = 300;
        if (arrow.classList.contains('carousel-arrow-left')) {
          carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        } else {
          carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      });
    });
  });
})();
