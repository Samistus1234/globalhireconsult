/* ============================================
   GLOBALHIRE@ELAB — Core JavaScript
   Healthcare Recruitment Platform v2.0
   ============================================ */

'use strict';

const GHE = {
  // ── Scroll Reveal ──
  initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-blur, .reveal-stagger').forEach(el => observer.observe(el));
  },

  // ── Counter Animation ──
  animateCounters() {
    const counters = document.querySelectorAll('[data-count]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.count, 10);
          const suffix = el.dataset.suffix || '';
          const prefix = el.dataset.prefix || '';
          const duration = 2000;
          const start = performance.now();

          const update = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(eased * target);
            el.textContent = prefix + current.toLocaleString() + suffix;
            if (progress < 1) {
              requestAnimationFrame(update);
            } else {
              el.classList.add('counter-done');
            }
          };

          requestAnimationFrame(update);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.3 });

    counters.forEach(el => observer.observe(el));
  },

  // ── Sticky Nav ──
  initStickyNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          nav.classList.toggle('scrolled', window.scrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    });
  },

  // ── Smooth scroll for anchor links ──
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  },

  // ── Format Numbers ──
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  },

  // ── Debounce ──
  debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // ── Escape HTML ──
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  },

  // ── Recruitment Pipeline registry (single source of truth) ──
  // One master pipeline replaces the six fragmented stage systems.
  // Keys match profiles.pipeline_stage values (see schema-v25-pipeline.sql).
  PHASES: [
    { key: 'lead', label: 'Lead & Application' },
    { key: 'qualification', label: 'Qualification' },
    { key: 'employer', label: 'Employer' },
    { key: 'offer', label: 'Offer' },
    { key: 'deployment', label: 'Deployment' },
    { key: 'revenue', label: 'Revenue' }
  ],

  PIPELINE: [
    { key: 'suggested',             label: 'Suggested',              phase: 'lead' },
    { key: 'application_received',  label: 'Application Received',   phase: 'lead' },
    { key: 'screening',             label: 'Screening',              phase: 'qualification' },
    { key: 'qualified',             label: 'Qualified',              phase: 'qualification' },
    { key: 'shortlisted',           label: 'Shortlisted',            phase: 'qualification' },
    { key: 'presented_to_employer', label: 'Presented to Employer',  phase: 'employer' },
    { key: 'interview_scheduled',   label: 'Interview Scheduled',    phase: 'employer' },
    { key: 'interview_completed',   label: 'Interview Completed',    phase: 'employer' },
    { key: 'offer_extended',        label: 'Offer Extended',         phase: 'offer' },
    { key: 'offer_accepted',        label: 'Offer Accepted',         phase: 'offer' },
    { key: 'pre_employment',        label: 'Pre-Employment',         phase: 'deployment' },
    { key: 'placement_confirmed',   label: 'Placement Confirmed',    phase: 'deployment' },
    { key: 'started_employment',    label: 'Started Employment',     phase: 'deployment' },
    { key: 'commission_due',        label: 'Commission Due',         phase: 'revenue' },
    { key: 'invoiced',              label: 'Invoiced',               phase: 'revenue' },
    { key: 'paid_closed',           label: 'Paid & Closed',          phase: 'revenue' }
  ],

  EXIT_STATUSES: [
    { value: 'rejected',         label: 'Rejected' },
    { value: 'withdrawn',        label: 'Withdrawn' },
    { value: 'declined',         label: 'Declined' },
    { value: 'terminated',       label: 'Terminated' },
    { value: 'placed_elsewhere', label: 'Placed Elsewhere' }
  ],

  // Phase accent colors (badge text/border tint uses color + '1f' alpha bg)
  PHASE_COLORS: {
    lead: '#0EA5E9',
    qualification: '#D4A84B',
    employer: '#7C3AED',
    offer: '#0096C7',
    deployment: '#0F766E',
    revenue: '#16A34A'
  },

  stageLabel(key) {
    const s = this.PIPELINE.find(x => x.key === key);
    return s ? s.label : key;
  },

  phaseOf(key) {
    const s = this.PIPELINE.find(x => x.key === key);
    return s ? s.phase : null;
  },

  phaseColor(phase) {
    return this.PHASE_COLORS[phase] || '#94A3B8';
  },

  phaseLabel(phase) {
    const p = this.PHASES.find(x => x.key === phase);
    return p ? p.label : phase;
  },

  // Tinted pill badge for a pipeline stage
  stageBadge(key) {
    if (!key) return '<span style="color:var(--text-tertiary);">—</span>';
    const s = this.PIPELINE.find(x => x.key === key);
    if (!s) return '<span style="color:var(--text-tertiary);">' + this.escapeHtml(key) + '</span>';
    const color = this.phaseColor(s.phase);
    return '<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;color:' + color + ';background:' + color + '1f;letter-spacing:0.02em;">' + this.escapeHtml(s.label) + '</span>';
  },

  // Red pill for an exited candidate
  exitBadge(status) {
    const e = this.EXIT_STATUSES.find(x => x.value === status);
    const label = e ? e.label : status;
    return '<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;color:#EF4444;background:#EF44441f;letter-spacing:0.02em;">✕ ' + this.escapeHtml(label) + '</span>';
  },

  // ── Avatar colors (healthcare palette) ──
  avatarColors: [
    ['#0077B6', '#ffffff'],
    ['#D4A84B', '#0A1628'],
    ['#2EC4B6', '#0A1628'],
    ['#48CAE4', '#0A1628'],
    ['#E56B8A', '#ffffff'],
    ['#F4A261', '#0A1628'],
  ],

  getAvatarStyle(index) {
    const c = this.avatarColors[index % this.avatarColors.length];
    return `background:${c[0]};color:${c[1]}`;
  },

  // ── Theme Toggle ──
  initThemeToggle() {
    const stored = localStorage.getItem('gh-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        const next = current === 'dark' ? 'light' : 'dark';

        document.body.classList.add('theme-transitioning');
        document.documentElement.dataset.theme = next;
        localStorage.setItem('gh-theme', next);

        setTimeout(() => document.body.classList.remove('theme-transitioning'), 350);
      });
    });
  },

  // ── Parallax Elements ──
  initParallax() {
    const els = document.querySelectorAll('[data-parallax]');
    if (!els.length) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          els.forEach(el => {
            const speed = parseFloat(el.dataset.parallax) || 0.1;
            const rect = el.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const offset = (center - window.innerHeight / 2) * speed;
            el.style.transform = `translateY(${offset}px)`;
          });
          ticking = false;
        });
        ticking = true;
      }
    });
  },

  // ── Initialize all core features ──
  init() {
    this.initThemeToggle();
    this.initReveal();
    this.animateCounters();
    this.initStickyNav();
    this.initSmoothScroll();
    this.initParallax();
  }
};

document.addEventListener('DOMContentLoaded', () => GHE.init());
