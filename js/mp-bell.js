/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: unread notification bell
   Loaded after js/mp-core.js on every page that mounts it (partner and
   admin surfaces alike). Requires window.ghSupabase and window.MP.

   window.MPBell.mount(el) renders a bell button + dropdown into `el` and
   wires it up. Injects its own <style> once (id="mp-bell-styles") instead
   of relying on page-local CSS, because at least one host page already
   defines an UNRELATED ".mp-badge" class (partners-onboarding.html's
   "Partner Portal" pill) — reusing that name here would silently pick up
   the wrong look. All bell classes are namespaced mp-bell-* to avoid any
   such collision.

   Task 8 (the DB trigger that populates gh_mp_notifications) is DEFERRED
   and not yet applied, so `unread()` legitimately returns an empty array
   right now — that's the correct steady state until Task 8 ships, not a
   bug. No Realtime: this polls once on mount, matching the rest of the
   messaging feature (Tasks 9-12 poll on load / after send).

   Escaping (see js/mp-core.js MP.esc / MP.escAttr / MP.safeHref contract
   comment):
   - n.title / n.body are rendered as element TEXT content → MP.esc().
   - n.id is interpolated into a data-id ATTRIBUTE value → MP.escAttr().
     (MP.esc() alone is NOT safe here: it never escapes quote characters,
     so a value containing a '"' could close the attribute early.)
   - n.link is interpolated into an href ATTRIBUTE value and needs BOTH
     MP.safeHref() (rejects a dangerous scheme — 'javascript:alert(1)' and
     'data:text/html,...' contain no quotes, so escAttr() alone lets them
     straight through) and MP.escAttr() (protects the attribute boundary
     itself). safeHref() runs first so escAttr() only ever escapes a value
     already confirmed to be a plain same-origin relative link.
   ============================================ */
(function () {
  var STYLE_ID = 'mp-bell-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.mp-bell-wrap{position:relative;display:inline-block;}' +
      '.mp-bell-btn{position:relative;background:none;border:none;cursor:pointer;' +
      'font-size:18px;line-height:1;padding:6px;border-radius:var(--radius-md,6px);color:var(--text-secondary,#666);}' +
      '.mp-bell-btn:hover{background:var(--bg-hover,rgba(0,0,0,0.05));}' +
      '.mp-bell-count{position:absolute;top:0;right:0;min-width:16px;height:16px;padding:0 4px;' +
      'border-radius:999px;background:var(--primary,#0077B6);color:#fff;font-size:10px;font-weight:800;' +
      'line-height:16px;text-align:center;}' +
      '.mp-bell-menu{position:absolute;right:0;top:calc(100% + 8px);width:320px;max-height:380px;' +
      'overflow-y:auto;background:var(--bg-card,#fff);border:1px solid var(--border-default,#e2e2e2);' +
      'border-radius:var(--radius-lg,10px);box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:200;}' +
      '.mp-bell-menu a{display:block;padding:10px 14px;border-bottom:1px solid var(--border-subtle,#eee);' +
      'text-decoration:none;color:var(--text-primary,#111);font-size:13px;line-height:1.4;}' +
      '.mp-bell-menu a:last-child{border-bottom:none;}' +
      '.mp-bell-menu a strong{display:block;font-size:12px;margin-bottom:2px;color:var(--text-primary,#111);}' +
      '.mp-bell-menu a:hover{background:var(--bg-hover,rgba(0,0,0,0.04));}' +
      '.mp-bell-empty{padding:16px;font-size:13px;color:var(--text-tertiary,#888);}';
    document.head.appendChild(style);
  }

  async function unread() {
    var r = await window.ghSupabase.from('gh_mp_notifications')
      .select('id, title, body, link, created_at')
      .is('read_at', null).order('created_at', { ascending: false }).limit(20);
    return r.data || [];
  }

  async function mount(el) {
    if (!el) return;
    injectStyles();
    el.classList.add('mp-bell-wrap');
    var rows = await unread();

    el.innerHTML =
      '<button type="button" class="mp-bell-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">🔔' +
      (rows.length ? '<span class="mp-bell-count">' + rows.length + '</span>' : '') +
      '</button><div class="mp-bell-menu" hidden>' +
      (rows.length
        ? rows.map(function (n) {
            // n.title / n.body: agency- or system-authored free text as
            // element TEXT content → MP.esc(). n.id: interpolated into a
            // data-id ATTRIBUTE → MP.escAttr(). n.link: interpolated into
            // an href ATTRIBUTE → MP.safeHref() FIRST (rejects a
            // javascript:/data: scheme, which contains no quotes and so
            // would sail through escAttr() untouched) THEN MP.escAttr()
            // (protects the attribute boundary itself) — an href needs
            // both, they defend different things.
            return '<a href="' + window.MP.escAttr(window.MP.safeHref(n.link || '#')) + '" data-id="' + window.MP.escAttr(n.id) + '">' +
                   '<strong>' + window.MP.esc(n.title) + '</strong>' +
                   (n.body ? window.MP.esc(n.body) : '') + '</a>';
          }).join('')
        : '<p class="mp-bell-empty">Nothing new.</p>') +
      '</div>';

    var btn = el.querySelector('.mp-bell-btn');
    var menu = el.querySelector('.mp-bell-menu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    // Close on an outside click — a menu that can only be dismissed by
    // re-clicking the bell is a common source of "stuck open" reports.
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !el.contains(e.target)) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Mark read on click-through. read_at is the only column the guard lets
    // us touch (see task-13-brief.md Step 3 — the column-guard trigger
    // rejects any other change to a notification row).
    Array.prototype.forEach.call(el.querySelectorAll('[data-id]'), function (a) {
      a.addEventListener('click', function () {
        window.ghSupabase.from('gh_mp_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', a.getAttribute('data-id'));
      });
    });
  }

  window.MPBell = { mount: mount, unread: unread };
})();
