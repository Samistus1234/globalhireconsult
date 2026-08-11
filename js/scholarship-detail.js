/* ============================================
   GLOBALHIRE@ELAB — Scholarship Detail Renderer
   Reads ?id= from the URL, renders window.SCHOLARSHIP_DETAILS[id]
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    if (window.GHNav) GHNav.init('scholarships');

    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var data = (window.SCHOLARSHIP_DETAILS || {})[id];

    var contentEl = document.getElementById('schd-content');
    var notFoundEl = document.getElementById('schd-notfound');

    if (!data) {
      if (contentEl) contentEl.style.display = 'none';
      if (notFoundEl) notFoundEl.style.display = 'block';
      document.title = 'Scholarship Not Found — GlobalHire@eLab';
      return;
    }

    document.title = data.title + ' — GlobalHire@eLab';
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && data.description) {
      metaDesc.setAttribute('content', data.description.slice(0, 155));
    }

    /* -- Header -- */
    setText('schd-title', data.title);
    setText('schd-provider', data.provider || '');
    var logoEl = document.getElementById('schd-logo');
    if (logoEl) logoEl.textContent = initials(data.provider || data.title || '');
    var deadlineEl = document.getElementById('schd-deadline');
    if (deadlineEl) {
      if (data.deadlineText) {
        deadlineEl.querySelector('span').textContent = 'Deadline: ' + data.deadlineText;
        if (data.closingSoon) deadlineEl.classList.add('closing');
      } else {
        deadlineEl.style.display = 'none';
      }
    }

    /* -- Meta chips: country / level / funding / field -- */
    var chipData = [
      { label: data.country, icon: 'location' },
      { label: data.level, icon: 'cap' },
      { label: data.funding, icon: 'coin', kind: data.fundingKind },
      { label: data.field, icon: 'folder' }
    ];
    var chipsEl = document.getElementById('schd-chips');
    if (chipsEl) {
      chipsEl.innerHTML = chipData.filter(function(c) { return c.label; }).map(function(c) {
        return '<span class="schd-chip"' + (c.kind ? ' data-kind="' + esc(c.kind) + '"' : '') + '>' +
          ICONS[c.icon] + esc(c.label) + '</span>';
      }).join('');
    }

    /* -- Overview -- */
    fillPara('block-overview', 'Overview', data.description);

    /* -- What it covers -- */
    fillList('block-coverage', 'What It Covers', data.coverage);

    /* -- Who can apply -- */
    fillList('block-eligibility', 'Who Can Apply', data.eligibility);

    /* -- Selection criteria -- */
    fillList('block-criteria', 'Selection Criteria', data.criteria);

    /* -- Documents needed -- */
    fillList('block-documents', 'Documents Needed', data.documents);

    /* -- How to apply -- */
    fillSteps('block-process', 'How to Apply', data.process);

    /* -- Important notes -- */
    fillPara('block-notes', 'Important Notes', data.notes);

    /* -- Sidebar facts -- */
    var facts = [
      { label: 'Country / Region', value: data.country, icon: 'location' },
      { label: 'Level', value: data.level, icon: 'cap' },
      { label: 'Funding', value: data.funding, icon: 'coin' },
      { label: 'Field', value: data.field, icon: 'folder' },
      { label: 'Deadline', value: data.deadlineText, icon: 'calendar' }
    ];
    var factsEl = document.getElementById('schd-facts');
    if (factsEl) {
      factsEl.innerHTML = facts.filter(function(f) { return f.value; }).map(function(f) {
        return '<div class="schd-fact">' + ICONS[f.icon] +
          '<div><b>' + esc(f.label) + '</b>' + esc(f.value) + '</div></div>';
      }).join('');
    }

    /* -- Official website CTA -- */
    var officialBtn = document.getElementById('schd-official-btn');
    if (officialBtn) {
      if (data.officialUrl) {
        officialBtn.href = data.officialUrl;
        officialBtn.target = '_blank';
        officialBtn.rel = 'noopener noreferrer';
      } else {
        officialBtn.style.display = 'none';
      }
    }
    var officialBtnWrap = document.getElementById('schd-official-wrap');
    if (officialBtnWrap && !data.officialUrl) officialBtnWrap.style.display = 'none';

    /* -- Share link -- */
    var shareEl = document.getElementById('schd-share-url');
    if (shareEl) shareEl.textContent = window.location.href;
    var copyBtn = document.getElementById('schd-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(window.location.href);
          var orig = copyBtn.innerHTML;
          copyBtn.textContent = 'Copied!';
          setTimeout(function() { copyBtn.innerHTML = orig; }, 1500);
        }
      });
    }
  });

  /* ── Helpers ── */
  function initials(str) {
    var words = String(str || '').split(/\s+/).filter(function(w) { return w.length; });
    if (!words.length) return 'GL';
    var a = words[0].charAt(0);
    var b = words.length > 1 ? words[words.length - 1].charAt(0) : '';
    return (a + b).toUpperCase();
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text || '';
  }

  // Escape data-derived strings before they enter innerHTML. All content in
  // window.SCHOLARSHIP_DETAILS is trusted (authored by us), but escaping keeps
  // any stray character from ever being interpreted as markup.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fillPara(blockId, heading, text) {
    var block = document.getElementById(blockId);
    if (!block) return;
    if (!text) { block.style.display = 'none'; return; }
    block.querySelector('h2 span').textContent = heading;
    block.querySelector('p').textContent = text;
  }

  function fillList(blockId, heading, items) {
    var block = document.getElementById(blockId);
    if (!block) return;
    if (!items || !items.length) { block.style.display = 'none'; return; }
    block.querySelector('h2 span').textContent = heading;
    block.querySelector('ul').innerHTML = items.map(function(i) { return '<li>' + esc(i) + '</li>'; }).join('');
  }

  function fillSteps(blockId, heading, steps) {
    var block = document.getElementById(blockId);
    if (!block) return;
    if (!steps || !steps.length) { block.style.display = 'none'; return; }
    block.querySelector('h2 span').textContent = heading;
    block.querySelector('ol').innerHTML = steps.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('');
  }

  var ICONS = {
    location: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    coin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    cap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/></svg>',
    folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    external: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
  };
})();
