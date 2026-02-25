/* ============================================
   GLOBALHIRE@ELAB — Core JavaScript
   Shared utilities, animations, and interactions
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

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
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
            if (progress < 1) requestAnimationFrame(update);
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

  // ── Network Canvas (Hero Background) ──
  initNetworkCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animId;
    const nodes = [];
    const nodeCount = 60;
    const connectionDistance = 180;

    function resize() {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    }

    function createNodes() {
      nodes.length = 0;
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 2 + 1,
          opacity: Math.random() * 0.5 + 0.2
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const opacity = (1 - dist / connectionDistance) * 0.15;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(0, 232, 157, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw & update nodes
      nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 232, 157, ${node.opacity})`;
        ctx.fill();

        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
      });

      animId = requestAnimationFrame(draw);
    }

    resize();
    createNodes();
    draw();

    window.addEventListener('resize', () => {
      resize();
      createNodes();
    });

    return () => cancelAnimationFrame(animId);
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

  // ── Generate random color avatar ──
  avatarColors: [
    ['#00e89d', '#08090d'],
    ['#7c5cff', '#ffffff'],
    ['#ff5c5c', '#ffffff'],
    ['#ffb020', '#08090d'],
    ['#00d4ff', '#08090d'],
    ['#ff4da6', '#ffffff'],
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

  // ── Initialize all core features ──
  init() {
    this.initThemeToggle();
    this.initReveal();
    this.animateCounters();
    this.initStickyNav();
    this.initSmoothScroll();
  }
};

document.addEventListener('DOMContentLoaded', () => GHE.init());
