/* ============================================
   GLOBALHIRE@ELAB — Placement Partners (admin)
   Outbound partner database + outreach log.
   Reads/writes public.gh_placement_partners* views (admin RLS).
   ============================================ */

(function () {
  'use strict';
  var listEl = document.getElementById('pp-list');
  var drawer = document.getElementById('pp-drawer');
  var statsEl = document.getElementById('pp-stats');
  if (!listEl || !drawer) return;

  var STATUSES = ['not_contacted','contacted','registered','docs_submitted','agreement_signed','active','declined','not_eligible'];
  var CHANNELS = ['email','form','portal','phone','whatsapp','linkedin','meeting','other'];
  var adminProfile = null;
  var rowsCache = [];

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s == null ? '' : s)));
    return d.innerHTML;
  }
  function label(s) { return String(s || '').replace(/_/g, ' '); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
  function linkify(url, text) {
    if (!url || !/^https?:\/\//i.test(url)) return esc(text || url || '—');
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || url) + '</a>';
  }

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    ['pp-region', 'pp-priority', 'pp-status'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', load);
    });
    document.getElementById('pp-q').addEventListener('input', function () {
      clearTimeout(window._ppQT); window._ppQT = setTimeout(render, 200);
    });
    listEl.addEventListener('click', function (ev) {
      var tr = ev.target.closest('tr[data-id]');
      if (tr && !ev.target.closest('a')) openDrawer(tr.getAttribute('data-id'));
    });
    await load();
    loadPack();
  });

  function updateAdminUI() {
    var nameEl = document.getElementById('admin-user-name');
    var avatarEl = document.getElementById('admin-user-avatar');
    if (nameEl) nameEl.textContent = adminProfile.full_name || 'Admin';
    if (avatarEl && window.GHE && GHE.avatarColors) {
      avatarEl.textContent = adminProfile.avatar_initials || 'A';
      var colors = GHE.avatarColors[adminProfile.avatar_color_index || 0];
      avatarEl.style.background = colors[0]; avatarEl.style.color = colors[1];
    }
    var so = document.getElementById('admin-signout');
    if (so) so.addEventListener('click', function (e) { e.preventDefault(); GHAuth.signOut(); });
  }

  var packCache = [], templateCache = null;

  async function loadPack() {
    var el = document.getElementById('pp-pack-list');
    var r = await ghFrom('placement_partner_pack').select('*').order('sort_order');
    if (r.error || !el) return;
    packCache = r.data || [];
    var rows = await Promise.all(packCache.map(async function (d) {
      var link = '';
      if (d.file_path) {
        var s = await window.ghSupabase.storage.from('partner-pack').createSignedUrl(d.file_path, 600);
        if (s.data && s.data.signedUrl) link = '<a href="' + esc(s.data.signedUrl) + '" target="_blank" rel="noopener">Download</a>';
      }
      var st = d.status === 'current' ? '<span class="pp-status pp-status--active">current</span>' :
               d.status === 'pending' ? '<span class="pp-status pp-status--contacted">pending</span>' : '<span class="pp-status pp-status--declined">superseded</span>';
      return '<div class="pp-pack-row"><div><strong>' + esc(d.title) + '</strong> ' + st +
        '<div class="meta">' + (d.file_name ? esc(d.file_name) + ' · ' + Math.round((d.file_size_bytes || 0) / 1024) + ' KB · ' : '') +
        (d.attach_by_default ? 'attached by default' : 'on request') + (d.notes ? ' · ' + esc(d.notes) : '') + '</div></div><div>' + link + '</div></div>';
    }));
    el.innerHTML = rows.join('') || '<em>No pack documents.</em>';
  }

  async function loadTemplate() {
    if (templateCache) return templateCache;
    var r = await ghFrom('placement_partner_templates').select('*').eq('code', 'intro').single();
    templateCache = r.data || null;
    return templateCache;
  }

  var REGION_CLAUSE = {
    'UK/Ireland': ' We understand the Code of Practice for international recruitment: we would supply only candidates resident outside red-list countries (for example, Nigerian nurses already licensed and working in the Gulf), and signpost Nigeria-resident applicants to your direct-application routes.',
    'GCC': ' Nigeria and Saudi Arabia signed a bilateral labour-recruitment agreement in January 2026, and we operate within that framework and the licensed-agency (wakala) model.',
    'Canada': ' We are aware that recruitment for Canadian employers must run through a provincially licensed recruiter, and we propose to operate as your offshore sourcing affiliate under your licence.',
    'USA': ' We would welcome an arrangement modelled on the accredited-agency channels you already use in the Philippines, adapted for Nigeria and West Africa.',
    'Australia/NZ': ' Our candidates are supported through the AHPRA/NMBA outcome-based assessment pathway, and we can supply only registration-ready profiles.'
  };

  function buildIntro(p, tpl) {
    var greeting = p.contact_email && /^[a-z]+@/i.test(p.contact_email) && !/^(info|hello|recruit|recruitment|partners|jobs|careers|contact|support|hr|admin|enquiries|international)/i.test(p.contact_email)
      ? p.contact_email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); })
      : p.name + ' team';
    var hook = '';
    var prog = String(p.partner_program || '').toLowerCase();
    if (prog.indexOf('yes') === 0 && p.partner_program_url) hook = 'We note your partner programme (' + p.partner_program_url + ') and would like to apply as an overseas sourcing partner.';
    else if (prog.indexOf('yes') === 0) hook = 'We note that you work with overseas sourcing partners and would like to apply to join that network.';
    else hook = 'We would like to understand how you work with overseas sourcing agencies and whether a referral or agency agreement is possible.';
    if (p.registration_method) hook += ' (' + String(p.registration_method).slice(0, 220) + (String(p.registration_method).length > 220 ? '…' : '') + ')';
    var body = tpl.body_text
      .replace(/{{partner_greeting}}/g, greeting)
      .replace(/{{region_clause}}/g, REGION_CLAUSE[p.region] || '')
      .replace(/{{partner_hook}}/g, hook);
    return { subject: tpl.subject, body: body };
  }

  async function openCompose(p) {
    var tpl = await loadTemplate();
    if (!tpl) { alert('Intro template missing.'); return; }
    if (!packCache.length) await loadPack();
    var draft = buildIntro(p, tpl);
    var emailGuess = (p.contact_email || '').split(/[;,\s]+/)[0] || '';
    var m = document.createElement('div'); m.className = 'pp-modal';
    m.innerHTML = '<div class="pp-modal__box">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:var(--text-lg);">Intro email — ' + esc(p.name) + '</h2><button class="btn btn-ghost btn-sm" id="pp-c-close">✕</button></div>' +
      '<p style="font-size:12px;color:var(--text-tertiary);margin:6px 0 10px;">Review and edit before sending. Sends from GlobalHire mail with the ticked pack documents attached, then logs the outreach.</p>' +
      '<div class="row"><label style="width:60px;">To</label><input class="form-input" id="pp-c-to" style="flex:1;" value="' + esc(emailGuess) + '" placeholder="partner@example.com"></div>' +
      '<div class="row"><label style="width:60px;">Cc</label><input class="form-input" id="pp-c-cc" style="flex:1;" placeholder="optional"></div>' +
      '<div class="row"><label style="width:60px;">Subject</label><input class="form-input" id="pp-c-subject" style="flex:1;" value="' + esc(draft.subject) + '"></div>' +
      '<textarea id="pp-c-body"></textarea>' +
      '<div class="pp-attach" style="margin:var(--space-2) 0;"><strong style="font-size:12px;">Attach:</strong> ' +
        packCache.filter(function (d) { return d.file_path && d.status === 'current'; }).map(function (d) {
          return '<label><input type="checkbox" data-code="' + esc(d.code) + '"' + (d.attach_by_default ? ' checked' : '') + '> ' + esc(d.title) + '</label>';
        }).join('') + '</div>' +
      '<div class="row" style="justify-content:flex-end;"><span id="pp-c-msg" style="font-size:12px;color:var(--text-tertiary);flex:1;"></span>' +
        '<button class="btn btn-secondary btn-sm" id="pp-c-cancel">Cancel</button><button class="btn btn-primary btn-sm" id="pp-c-send">Send intro email</button></div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#pp-c-body').value = draft.body;
    function close() { m.remove(); }
    m.querySelector('#pp-c-close').addEventListener('click', close);
    m.querySelector('#pp-c-cancel').addEventListener('click', close);
    m.querySelector('#pp-c-send').addEventListener('click', async function () {
      var to = m.querySelector('#pp-c-to').value.trim();
      var msg = m.querySelector('#pp-c-msg');
      if (!to) { msg.textContent = 'Recipient required.'; return; }
      if (!confirm('Send this intro email to ' + to + ' now?')) return;
      var btn = this; btn.disabled = true; msg.textContent = 'Sending…';
      var codes = Array.prototype.map.call(m.querySelectorAll('.pp-attach input:checked'), function (i) { return i.getAttribute('data-code'); });
      var sb = window.ghSupabase;
      var s = await sb.auth.getSession();
      var token = (s.data && s.data.session) ? s.data.session.access_token : null;
      var out;
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/pp-send-intro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': sb.supabaseKey || '', 'Authorization': 'Bearer ' + (token || '') },
          body: JSON.stringify({ partner_id: p.id, to: to, cc: m.querySelector('#pp-c-cc').value.trim() || undefined,
            subject: m.querySelector('#pp-c-subject').value.trim(), body_text: m.querySelector('#pp-c-body').value, attach_codes: codes })
        });
        out = await res.json().catch(function () { return { error: 'HTTP ' + res.status }; });
        if (!res.ok && !out.error) out.error = 'HTTP ' + res.status;
      } catch (e) { out = { error: (e && e.message) || String(e) }; }
      if (out.error) { msg.textContent = 'Error: ' + out.error; btn.disabled = false; return; }
      msg.textContent = 'Sent (' + out.attachments + ' attachment' + (out.attachments === 1 ? '' : 's') + ').';
      setTimeout(function () { close(); load(); openDrawer(p.id); }, 900);
    });
  }

  async function loadStats() {
    var r = await ghFrom('placement_partner_stats').select('*');
    if (r.error || !statsEl) return;
    var order = ['GCC', 'USA', 'Canada', 'UK/Ireland', 'Australia/NZ'];
    var rows = (r.data || []).slice().sort(function (a, b) { return order.indexOf(a.region) - order.indexOf(b.region); });
    var tot = rows.reduce(function (acc, x) {
      ['total','priority_a','contacted','registered','active'].forEach(function (k) { acc[k] = (acc[k] || 0) + Number(x[k] || 0); });
      return acc;
    }, {});
    var cards = [{ region: 'All regions', total: tot.total, priority_a: tot.priority_a, contacted: tot.contacted, registered: tot.registered, active: tot.active }].concat(rows);
    statsEl.innerHTML = cards.map(function (x) {
      return '<div class="pp-stat"><div class="pp-stat__label">' + esc(x.region) + '</div>' +
        '<div class="pp-stat__val">' + Number(x.contacted) + ' <span style="font-weight:400;color:var(--text-tertiary);font-size:12px;">/ ' + Number(x.total) + ' contacted</span></div>' +
        '<div class="pp-stat__sub">' + Number(x.registered) + ' registered · ' + Number(x.active) + ' active · ' + Number(x.priority_a) + ' pri-A</div></div>';
    }).join('');
  }

  async function load() {
    var region = document.getElementById('pp-region').value;
    var pri = document.getElementById('pp-priority').value;
    var st = document.getElementById('pp-status').value;
    var qy = ghFrom('placement_partners')
      .select('id,name,website,region,hq_country,priority,partner_program,outreach_status,last_contact_at,next_action,next_action_due,contact_email')
      .order('priority', { ascending: true }).order('region').order('name');
    if (region) qy = qy.eq('region', region);
    if (pri) qy = qy.eq('priority', pri);
    if (st) qy = qy.eq('outreach_status', st);
    var r = await qy;
    if (r.error) {
      listEl.innerHTML = '<div class="panel"><div class="panel-body" style="color:var(--danger);">Could not load partners: ' + esc(r.error.message) + '</div></div>';
      return;
    }
    rowsCache = r.data || [];
    render();
    loadStats();
  }

  function render() {
    var q = (document.getElementById('pp-q').value || '').toLowerCase().trim();
    var rows = rowsCache.filter(function (x) {
      if (!q) return true;
      return [x.name, x.hq_country, x.contact_email, x.website].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var body = rows.length ? rows.map(function (x) {
      var prog = String(x.partner_program || '').toLowerCase();
      var progLbl = prog.indexOf('yes') === 0 ? 'Yes' : prog.indexOf('no') === 0 ? 'No' : 'Unclear';
      return '<tr data-id="' + esc(x.id) + '" style="cursor:pointer;">' +
        '<td><span class="pp-pri pp-pri--' + esc(x.priority) + '">' + esc(x.priority) + '</span></td>' +
        '<td><strong>' + esc(x.name) + '</strong><div style="font-size:11px;color:var(--text-tertiary);">' + esc(x.hq_country || '') + '</div></td>' +
        '<td>' + esc(x.region) + '</td>' +
        '<td>' + progLbl + '</td>' +
        '<td><span class="pp-status pp-status--' + esc(x.outreach_status) + '">' + esc(label(x.outreach_status)) + '</span></td>' +
        '<td>' + fmtDate(x.last_contact_at) + '</td>' +
        '<td style="font-size:12px;">' + esc(x.next_action || '') + (x.next_action_due ? '<div style="color:var(--text-tertiary);font-size:11px;">due ' + fmtDate(x.next_action_due) + '</div>' : '') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">No partners match.</td></tr>';

    listEl.innerHTML = '<div class="panel"><div class="panel-body-flush"><table class="recruiter-table">' +
      '<thead><tr><th>Pri</th><th>Partner</th><th>Region</th><th>Programme</th><th>Status</th><th>Last contact</th><th>Next action</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      '<div style="padding:var(--space-2) var(--space-4);font-size:11px;color:var(--text-tertiary);">' + rows.length + ' partner' + (rows.length === 1 ? '' : 's') + '</div></div>';
  }

  async function openDrawer(id) {
    var r = await ghFrom('placement_partners').select('*').eq('id', id).single();
    if (r.error) return;
    var p = r.data;
    var lg = await ghFrom('placement_partner_outreach').select('*').eq('partner_id', id).order('occurred_at', { ascending: false }).limit(50);
    var logRows = lg.data || [];

    function kv(k, v, isLink) {
      if (v == null || v === '') return '';
      return '<dt>' + esc(k) + '</dt><dd>' + (isLink ? linkify(v) : esc(v)) + '</dd>';
    }
    var evidence = (p.evidence_urls || []).map(function (u) { return '<div>' + linkify(u) + '</div>'; }).join('');

    drawer.hidden = false;
    drawer.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">' +
        '<div><span class="pp-pri pp-pri--' + esc(p.priority) + '">' + esc(p.priority) + '</span> <span style="font-size:11px;color:var(--text-tertiary);">' + esc(p.region) + ' · ' + esc(p.hq_country || '') + '</span>' +
        '<h2>' + esc(p.name) + '</h2>' + (p.website ? linkify(p.website) : '') + '</div>' +
        '<div style="display:flex;gap:6px;"><button class="btn btn-primary btn-sm" id="pp-drawer-compose">Draft intro email</button><button class="btn btn-ghost btn-sm" id="pp-drawer-close">✕</button></div></div>' +

      '<dl class="pp-kv">' +
        kv('Status', label(p.outreach_status)) + kv('Last contact', p.last_contact_at ? fmtDate(p.last_contact_at) : null) +
        kv('Professions', p.professions) + kv('Source countries', p.source_countries) + kv('African candidates', p.accepts_african) +
        kv('Visa / model', p.visa_model) + kv('Partner programme', p.partner_program) + kv('Programme URL', p.partner_program_url, true) +
        kv('How to register', p.registration_method) + kv('Docs required', p.required_docs) +
        kv('Contact email', p.contact_email) + kv('Contact form', p.contact_form_url, true) +
        kv('Candidate minimums', p.candidate_requirements) + kv('Ethical cert', p.ethical_cert) + kv('Research notes', p.research_notes) +
      '</dl>' +
      (evidence ? '<div style="font-size:12px;"><strong>Evidence</strong>' + evidence + '</div>' : '') +

      '<form class="pp-form" id="pp-edit">' +
        '<strong>Plan</strong>' +
        '<input class="form-input" name="next_action" placeholder="Next action" value="' + esc(p.next_action || '') + '">' +
        '<div style="display:flex;gap:var(--space-2);">' +
          '<input class="form-input" type="date" name="next_action_due" value="' + esc(p.next_action_due || '') + '" style="width:auto;">' +
          '<select class="select-input" name="priority" style="width:auto;">' + ['A','B','C'].map(function (x) { return '<option' + (x === p.priority ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<textarea class="form-input" name="internal_notes" placeholder="Internal notes" style="min-height:70px;resize:vertical;font-family:inherit;">' + esc(p.internal_notes || '') + '</textarea>' +
        '<div><button class="btn btn-secondary btn-sm" type="submit">Save plan</button> <span id="pp-edit-msg" style="font-size:12px;color:var(--text-tertiary);"></span></div>' +
      '</form>' +

      '<form class="pp-form" id="pp-log">' +
        '<strong>Log outreach</strong>' +
        '<div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">' +
          '<select class="select-input" name="channel" style="width:auto;">' + CHANNELS.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') + '</select>' +
          '<select class="select-input" name="direction" style="width:auto;"><option value="outbound">outbound</option><option value="inbound">inbound</option></select>' +
          '<select class="select-input" name="status_after" style="width:auto;"><option value="">(status unchanged)</option>' +
            STATUSES.map(function (s) { return '<option value="' + s + '">→ ' + label(s) + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<textarea class="form-input" name="summary" required placeholder="What happened? (e.g. Sent partner-intro email + licence pack to info@…)" style="min-height:70px;resize:vertical;font-family:inherit;"></textarea>' +
        '<div><button class="btn btn-primary btn-sm" type="submit">Log outreach</button> <span id="pp-log-msg" style="font-size:12px;color:var(--text-tertiary);"></span></div>' +
      '</form>' +

      '<div style="margin-top:var(--space-4);"><strong>History</strong><ul class="pp-log" style="list-style:none;padding:0;margin:var(--space-2) 0 0;">' +
        (logRows.length ? logRows.map(function (l) {
          return '<li><span style="color:var(--text-tertiary);">' + fmtDate(l.occurred_at) + '</span> · <em>' + esc(l.channel) + (l.direction === 'inbound' ? ' (inbound)' : '') + '</em>' +
            (l.status_after ? ' · <span class="pp-status pp-status--' + esc(l.status_after) + '">→ ' + esc(label(l.status_after)) + '</span>' : '') +
            '<div>' + esc(l.summary) + '</div>' + (l.email_subject ? '<div style="font-size:11px;color:var(--text-tertiary);">Subject: ' + esc(l.email_subject) + '</div>' : '') + '</li>';
        }).join('') : '<li style="color:var(--text-tertiary);">No outreach logged yet.</li>') +
      '</ul></div>';

    document.getElementById('pp-drawer-close').addEventListener('click', function () { drawer.hidden = true; });
    document.getElementById('pp-drawer-compose').addEventListener('click', function () { openCompose(p); });

    document.getElementById('pp-edit').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var f = ev.target; var msg = document.getElementById('pp-edit-msg'); msg.textContent = 'Saving…';
      var upd = {
        next_action: f.next_action.value.trim() || null,
        next_action_due: f.next_action_due.value || null,
        priority: f.priority.value,
        internal_notes: f.internal_notes.value.trim() || null,
      };
      var u = await ghFrom('placement_partners').update(upd).eq('id', id);
      msg.textContent = u.error ? 'Error: ' + u.error.message : 'Saved.';
      if (!u.error) load();
    });

    document.getElementById('pp-log').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var f = ev.target; var msg = document.getElementById('pp-log-msg'); msg.textContent = 'Logging…';
      var ins = await ghFrom('placement_partner_outreach').insert({
        partner_id: id,
        channel: f.channel.value,
        direction: f.direction.value,
        status_after: f.status_after.value || null,
        summary: f.summary.value.trim(),
        logged_by: adminProfile && adminProfile.id ? adminProfile.id : null,
      });
      if (ins.error) { msg.textContent = 'Error: ' + ins.error.message; return; }
      await load();
      openDrawer(id);
    });
  }
})();
