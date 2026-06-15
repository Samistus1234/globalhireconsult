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

  /* ---------- Browser runtime ---------- */
  if (typeof document === 'undefined') return; // Node test context: stop here
  root.HomeOpenings = api;

  var ROTATE_MS = 5000;
  var FETCH_LIMIT = 9;
  var state = { jobs: [], page: 0, perView: 3, timer: null };
  var els = {};

  function fetchOpenings() {
    if (!root.ghFrom) {
      console.error('home-openings: window.ghFrom unavailable');
      return Promise.resolve([]);
    }
    return root.ghFrom('campaigns')
      .select('*')
      .not('status', 'in', '("draft","closed")')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)
      .then(function (res) {
        if (res.error) { console.error('home-openings: fetch failed', res.error); return []; }
        return res.data || [];
      })
      .catch(function (err) { console.error('home-openings: fetch threw', err); return []; });
  }

  function renderCards() {
    var now = Date.now();
    els.track.innerHTML = state.jobs.map(function (c) { return cardHtml(c, now); }).join('');
  }

  function renderDots() {
    var pages = pageCount(state.jobs.length, state.perView);
    var html = '';
    for (var i = 0; i < pages; i++) {
      html += '<button class="lo-dot" data-page="' + i + '" aria-label="Go to slide ' + (i + 1) + '"></button>';
    }
    els.dots.innerHTML = html;
    syncDots();
  }

  function syncDots() {
    var dots = els.dots.querySelectorAll('.lo-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-active', i === state.page);
    }
  }

  function go(page, smooth) {
    var pages = pageCount(state.jobs.length, state.perView);
    if (pages === 0) return;
    state.page = ((page % pages) + pages) % pages;
    els.viewport.scrollTo({
      left: state.page * els.viewport.clientWidth,
      behavior: smooth === false ? 'auto' : 'smooth'
    });
    syncDots();
  }

  function startAuto() {
    if (state.timer) return;
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    if (pageCount(state.jobs.length, state.perView) < 2) return;
    state.timer = setInterval(function () { go(state.page + 1); }, ROTATE_MS);
  }

  function stopAuto() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function onScroll() {
    var p = Math.round(els.viewport.scrollLeft / els.viewport.clientWidth);
    if (p !== state.page) { state.page = p; syncDots(); }
  }

  function onResize() {
    state.perView = slidesPerView(root.innerWidth);
    renderDots();
    go(state.page, false);
  }

  function bindEvents() {
    els.next.addEventListener('click', function () { go(state.page + 1); });
    els.prev.addEventListener('click', function () { go(state.page - 1); });
    els.dots.addEventListener('click', function (e) {
      var btn = e.target.closest('.lo-dot');
      if (btn) go(parseInt(btn.getAttribute('data-page'), 10));
    });
    els.section.addEventListener('mouseenter', stopAuto);
    els.section.addEventListener('mouseleave', startAuto);
    els.section.addEventListener('focusin', stopAuto);
    els.section.addEventListener('focusout', startAuto);
    els.viewport.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('resize', onResize);
  }

  function init() {
    els.section = document.getElementById('latest-openings');
    if (!els.section) return;
    els.viewport = els.section.querySelector('.lo-viewport');
    els.track = els.section.querySelector('.lo-track');
    els.dots = els.section.querySelector('.lo-dots');
    els.next = els.section.querySelector('.lo-next');
    els.prev = els.section.querySelector('.lo-prev');

    fetchOpenings().then(function (jobs) {
      if (!jobs.length) return; // stay hidden — no empty/broken block
      state.jobs = jobs;
      state.perView = slidesPerView(root.innerWidth);
      renderCards();
      renderDots();
      bindEvents();
      els.section.hidden = false;
      startAuto();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : this);
