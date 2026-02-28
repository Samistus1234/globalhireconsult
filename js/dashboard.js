/* ============================================
   GLOBALHIRE@ELAB — Dashboard JavaScript
   Interactions, data simulation, and UI logic
   ============================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ── Responsive sidebar toggle ──
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  function checkWidth() {
    if (window.innerWidth <= 1024) {
      sidebarToggle.style.display = 'flex';
    } else {
      sidebarToggle.style.display = 'none';
      sidebar.classList.remove('open');
    }
  }
  checkWidth();
  window.addEventListener('resize', GHE.debounce(checkWidth, 150));

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1024 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== sidebarToggle) {
      sidebar.classList.remove('open');
    }
  });

  // ── Nav item active state ──
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // ── Animate KPI values on load ──
  const kpiValues = document.querySelectorAll('.kpi-value[data-count]');
  kpiValues.forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1800;
    const start = performance.now();

    const update = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(eased * target);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  });

  // ── Pipeline stage hover effects ──
  document.querySelectorAll('.pipeline-stage').forEach(stage => {
    stage.addEventListener('mouseenter', () => {
      stage.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    });
    stage.addEventListener('mouseleave', () => {
      stage.style.boxShadow = 'none';
    });
  });

  // ── Chart bar hover tooltips ──
  document.querySelectorAll('.chart-bar').forEach(bar => {
    bar.addEventListener('mouseenter', () => {
      bar.style.filter = 'brightness(1.2)';
    });
    bar.addEventListener('mouseleave', () => {
      bar.style.filter = 'none';
    });
  });

  // ── Search input focus ──
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('focus', () => {
      searchInput.style.borderColor = 'var(--primary)';
      searchInput.style.boxShadow = '0 0 0 3px rgba(0,232,157,0.15)';
    });
    searchInput.addEventListener('blur', () => {
      searchInput.style.borderColor = 'var(--border-subtle)';
      searchInput.style.boxShadow = 'none';
    });
  }

  // ── Activity feed ──
  // Activity feed is now populated by live data from dashboard-live.js

  // ── Match ring SVG animation ──
  document.querySelectorAll('.match-ring').forEach(ring => {
    const fill = ring.querySelector('.ring-fill');
    const valueEl = ring.querySelector('.ring-value');
    if (!fill || !valueEl) return;

    const score = parseInt(valueEl.textContent, 10);
    const circumference = 2 * Math.PI * 15.9; // radius 15.9
    const offset = circumference - (score / 100) * circumference;

    fill.style.strokeDasharray = circumference;
    fill.style.strokeDashoffset = circumference; // Start empty

    // Animate on load
    setTimeout(() => {
      fill.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
      fill.style.strokeDashoffset = offset;
    }, 300);
  });

  // ── Quick action button ripple ──
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position:absolute;top:${e.clientY - rect.top}px;left:${e.clientX - rect.left}px;
        width:0;height:0;border-radius:50%;background:rgba(0,232,157,0.3);
        transform:translate(-50%,-50%);pointer-events:none;
      `;
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);

      requestAnimationFrame(() => {
        ripple.style.transition = 'width 0.5s, height 0.5s, opacity 0.5s';
        ripple.style.width = '200px';
        ripple.style.height = '200px';
        ripple.style.opacity = '0';
      });

      setTimeout(() => ripple.remove(), 600);
    });
  });

  // ── Chart bars entrance animation ──
  const chartBars = document.querySelectorAll('.chart-bar');
  chartBars.forEach((bar, i) => {
    const originalY = bar.getAttribute('y');
    const originalHeight = bar.getAttribute('height');
    bar.setAttribute('y', 180);
    bar.setAttribute('height', 0);

    setTimeout(() => {
      bar.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
      bar.setAttribute('y', originalY);
      bar.setAttribute('height', originalHeight);
    }, 200 + i * 80);
  });

});
