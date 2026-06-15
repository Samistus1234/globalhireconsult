/* ============================================================
   home-openings.js — "Latest Openings" homepage carousel
   Pure helpers (unit-tested) + browser runtime (Task 2).
   ============================================================ */
(function (root) {
  'use strict';

  var NEW_WINDOW_DAYS = 14;

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isNew(createdAt, nowMs) {
    if (!createdAt) return false;
    var t = new Date(createdAt).getTime();
    if (isNaN(t)) return false;
    return (nowMs - t) <= NEW_WINDOW_DAYS * 86400000;
  }

  function salaryText(campaign) {
    // Empty/missing salary_display falls back to 'Competitive'.
    return (campaign && campaign.salary_display) ? campaign.salary_display : 'Competitive';
  }

  function slidesPerView(width) {
    if (width >= 992) return 3;
    if (width >= 640) return 2;
    return 1;
  }

  function pageCount(total, perView) {
    if (!total || perView < 1) return 0;
    return Math.ceil(total / perView);
  }

  function cardHtml(c, nowMs) {
    var newPill = isNew(c.created_at, nowMs) ? '<span class="lo-pill">NEW</span>' : '';
    var tag = c.specialty ? '<span class="lo-tag">' + escHtml(c.specialty) + '</span>' : '';
    return '' +
      '<article class="lo-card">' +
        '<div class="lo-card-top">' +
          newPill +
          '<h3 class="lo-card-title">' + escHtml(c.title) + '</h3>' +
          '<p class="lo-card-employer">' + escHtml(c.employer_name) + '</p>' +
        '</div>' +
        '<div class="lo-card-meta">' +
          '<span class="lo-country">' + escHtml(c.destination_country) + '</span>' +
          tag +
        '</div>' +
        '<div class="lo-card-salary">' + escHtml(salaryText(c)) + '</div>' +
          // Links to the full board (jobs.html) by design: live campaigns have no per-job detail page.
          '<a class="lo-card-cta" href="jobs.html">View role &rarr;</a>' +
      '</article>';
  }

  var api = {
    escHtml: escHtml,
    isNew: isNew,
    salaryText: salaryText,
    slidesPerView: slidesPerView,
    pageCount: pageCount,
    cardHtml: cardHtml,
    NEW_WINDOW_DAYS: NEW_WINDOW_DAYS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.HomeOpenings = api;
  }
})(typeof window !== 'undefined' ? window : this);
