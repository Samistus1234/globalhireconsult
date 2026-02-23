/* ============================================
   GLOBALHIRE@ELAB — Events Page JS
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    // Init global nav
    if (window.GHNav) GHNav.init('events');
    if (window.GHE) GHE.init();

    // ── Countdown Timer ──
    var targetDate = new Date('2026-03-15T00:00:00Z').getTime();

    function updateCountdown() {
      var now = Date.now();
      var diff = targetDate - now;

      if (diff <= 0) {
        document.getElementById('cd-days').textContent = '0';
        document.getElementById('cd-hours').textContent = '0';
        document.getElementById('cd-minutes').textContent = '0';
        document.getElementById('cd-seconds').textContent = '0';
        return;
      }

      var days = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      var seconds = Math.floor((diff % (1000 * 60)) / 1000);

      var daysEl = document.getElementById('cd-days');
      var hoursEl = document.getElementById('cd-hours');
      var minutesEl = document.getElementById('cd-minutes');
      var secondsEl = document.getElementById('cd-seconds');

      if (daysEl) daysEl.textContent = days;
      if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
      if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
      if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    // ── Filter Bar ──
    var filterPills = document.querySelectorAll('.filter-pill');
    var eventCards = document.querySelectorAll('.event-card');
    var featuredCard = document.querySelector('.featured-card');

    filterPills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        filterPills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');

        var filter = pill.getAttribute('data-filter');

        // Filter event cards
        eventCards.forEach(function(card) {
          if (filter === 'all' || card.getAttribute('data-type') === filter) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });

        // Filter featured card
        if (featuredCard) {
          if (filter === 'all' || featuredCard.getAttribute('data-type') === filter) {
            featuredCard.closest('.featured-section').style.display = '';
          } else {
            featuredCard.closest('.featured-section').style.display = 'none';
          }
        }
      });
    });

    // ── Past Events Toggle ──
    var pastToggle = document.getElementById('past-toggle');
    var pastWrapper = pastToggle ? pastToggle.closest('.past-events-wrapper') : null;

    if (pastToggle && pastWrapper) {
      pastToggle.addEventListener('click', function() {
        pastWrapper.classList.toggle('open');
      });
    }

    // ── Register Buttons ──
    var registerBtns = document.querySelectorAll('.btn-register');
    registerBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = 'Registered!';
        btn.style.opacity = '0.7';
        showToast('Registration confirmed! Check your email for details.');
      });
    });

    // ── Toast ──
    function showToast(msg) {
      var container = document.getElementById('toast-container');
      if (!container) return;

      var toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round"><path d="m5 12 5 5L20 7"/></svg>' +
        '<span class="toast-msg">' + msg + '</span>';

      container.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(function() { toast.remove(); }, 300);
      }, 3500);
    }
  });
})();
