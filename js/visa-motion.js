/* ============================================
   GLOBALHIRE@ELAB — Visa motion module
   Pure-function helpers (top of file) + DOM wiring (bottom).
   Spec §3.4
   ============================================ */

/* ───────── Pure helpers (also imported by visa-motion_test.ts) ───────── */

export function shouldEnableMotion({ reducedMotion, hasIO }) {
  return !reducedMotion && hasIO;
}

export function shouldUseViewTransitions({ apiSupported, reducedMotion }) {
  return apiSupported && !reducedMotion;
}

// Synthesizable test loop: caller supplies now() + deadline so the test can run synchronously.
export function animatePriceCounter({ from, to, duration, onTick, now = () => performance.now(), deadline = Infinity }) {
  const start = now();
  let iter = 0;
  while (iter++ < deadline) {
    const t = Math.min(1, (now() - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);  // easeOutCubic
    const value = Math.round(from + (to - from) * eased);
    onTick(value);
    if (t >= 1) return;
  }
}

/* ───────── DOM wiring — runs only in browsers ───────── */

if (typeof window !== 'undefined') {

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  // — Scroll reveals —
  if (shouldEnableMotion({ reducedMotion, hasIO })) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.visa-reveal').forEach((el) => io.observe(el));
  }

  // — Mouse-tracking spotlight (hub hero only) —
  if (!reducedMotion) {
    const hero = document.querySelector('.visa-hero--hub');
    if (hero) {
      let rafId = 0;
      hero.addEventListener('mousemove', (e) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const rect = hero.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          hero.style.setProperty('--mouse-x', x + '%');
          hero.style.setProperty('--mouse-y', y + '%');
        });
      });
    }
  }

  // — Animated price counters —
  document.querySelectorAll('[data-visa-counter]').forEach((el) => {
    const to = Number(el.dataset.visaCounter);
    if (!Number.isFinite(to)) return;

    if (reducedMotion) { el.textContent = '$' + to; return; }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.disconnect();
        animatePriceCounter({
          from: 0, to, duration: 800,
          onTick: (v) => { el.textContent = '$' + v; },
        });
      }
    });
    io.observe(el);
  });

  // — View Transitions on /visa* internal links —
  if (shouldUseViewTransitions({
    apiSupported: typeof document.startViewTransition === 'function',
    reducedMotion,
  })) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank') return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/') && !href.includes('visa')) return;
      // Only intercept same-origin links to other visa pages
      if (!/^(\/?visa[\w-]*\.html)/.test(href.replace(window.location.origin, '').replace(/^\//, ''))) return;
      e.preventDefault();
      document.startViewTransition(() => { window.location.href = a.href; });
    });
  }

  // — Lenis smooth scroll (only when motion enabled and Lenis is loaded) —
  if (!reducedMotion && typeof window.Lenis === 'function') {
    const lenis = new window.Lenis({ duration: 1.2, smoothTouch: false });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }
}
