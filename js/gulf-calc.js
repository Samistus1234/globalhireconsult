/* ============================================
   GLOBALHIRE — Gulf salary + relocation calculators
   Data: window.GH_CALC (data/gulf-calc-data.js)
   ============================================ */
(function () {
  'use strict';

  var D = window.GH_CALC;
  if (!D) return;

  /* ── Helpers ── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function market(key) { return D.markets.filter(function (m) { return m.key === key; })[0]; }
  function prof(key) { return D.professions.filter(function (p) { return p.key === key; })[0]; }

  // fx: units of currency per 1 USD
  function convert(amount, from, to) {
    if (amount == null) return null;
    if (from === to) return amount;
    return amount / D.fx.rates[from] * D.fx.rates[to];
  }
  var SYM = { NGN: '₦', GHS: 'GH₵', USD: '$', GBP: '£' };
  function round(n) {
    var a = Math.abs(n);
    var step = a >= 1e7 ? 1e5 : a >= 1e6 ? 1e4 : a >= 1e5 ? 1e3 : a >= 1e4 ? 100 : a >= 1000 ? 10 : 1;
    return Math.round(n / step) * step;
  }
  function money(n, cur) {
    if (n == null || isNaN(n)) return '—';
    var v = round(n).toLocaleString('en-US');
    return SYM[cur] ? SYM[cur] + v : cur + ' ' + v;
  }
  function compact(n, cur) {
    if (n == null || isNaN(n)) return '—';
    var a = Math.abs(n), s;
    if (a >= 1e6) s = (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'm';
    else if (a >= 1e4) s = Math.round(n / 1e3) + 'k';
    else s = round(n).toLocaleString('en-US');
    return SYM[cur] ? SYM[cur] + s : cur + ' ' + s;
  }
  function range(a, b, cur) {
    if (a == null) return '—';
    if (b == null || round(a) === round(b)) return money(a, cur);
    return money(a, cur) + ' – ' + (SYM[cur] ? SYM[cur] : '') + round(b).toLocaleString('en-US');
  }
  function crange(a, b, cur) {
    if (a == null) return '—';
    if (b == null || compact(a, cur) === compact(b, cur)) return compact(a, cur);
    return compact(a, cur) + ' – ' + compact(b, cur);
  }
  function params() {
    var o = {};
    new URLSearchParams(location.search).forEach(function (v, k) { o[k] = v; });
    return o;
  }
  function setParams(o) {
    var q = new URLSearchParams(o).toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
  }
  function srcLink(ids) {
    var links = (ids || []).map(function (id) {
      var i = D.sources.findIndex(function (s) { return s.id === id; });
      return i < 0 ? '' : '<a href="#src-' + esc(id) + '" aria-label="Source ' + (i + 1) + '">' + (i + 1) + '</a>';
    }).filter(Boolean);
    return links.length ? '<sup class="src">' + links.join(', ') + '</sup>' : '';
  }
  function renderSources(target, ids) {
    var list = D.sources.filter(function (s) { return !ids || ids.indexOf(s.id) >= 0; });
    target.innerHTML = list.map(function (s) {
      var n = D.sources.indexOf(s) + 1;
      return '<li id="src-' + esc(s.id) + '" value="' + n + '">' +
        (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>' : esc(s.title)) +
        ' <span class="s-type">· ' + esc(s.type) + (s.date ? ', ' + esc(s.date) : '') + '</span></li>';
    }).join('');
  }

  function seg(container, options, value, onChange) {
    container.innerHTML = '';
    options.forEach(function (o) {
      var b = el('button', { type: 'button', 'aria-pressed': String(o.value === value) }, esc(o.label));
      b.addEventListener('click', function () {
        container.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      });
      container.appendChild(b);
    });
  }
  function tiles(container, value, onChange, filter) {
    container.innerHTML = '';
    D.markets.forEach(function (m) {
      if (filter && !filter(m)) return;
      var b = el('button', { type: 'button', class: 'tile', 'aria-pressed': String(m.key === value) },
        '<span class="t-name">' + esc(m.short) + '</span><span class="t-sub">' + esc(m.sub) + '</span>');
      b.addEventListener('click', function () {
        container.querySelectorAll('.tile').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onChange(m.key);
      });
      container.appendChild(b);
    });
  }
  function fillSelect(sel, value) {
    sel.innerHTML = D.professions.map(function (p) {
      return '<option value="' + esc(p.key) + '"' + (p.key === value ? ' selected' : '') + '>' + esc(p.label) + '</option>';
    }).join('');
  }

  /* ── Salary model ── */
  function band(years) { return years <= 3 ? 'early' : years <= 9 ? 'mid' : 'senior'; }
  var BAND_SPAN = { early: [1, 3], mid: [4, 9], senior: [10, 20] };
  var CONF_TEXT = {
    high: 'Several independent sources agree on this range.',
    medium: 'Based on real job adverts and pay reports; offers outside this range happen.',
    low: 'Few reliable sources for this role here, and published guides disagree with each other. Treat it as a starting point and check any real offer with us.'
  };
  var BAND_LABEL = { early: 'Early career (1–3 yrs)', mid: 'Mid career (4–9 yrs)', senior: 'Senior (10+ yrs)' };

  function estimate(mKey, pKey, years, sector) {
    var m = market(mKey); if (!m) return null;
    var cell = m.pay[pKey]; if (!cell) return null;
    var b = band(years);
    var r = cell[b]; if (!r) return null;
    var span = BAND_SPAN[b];
    var f = Math.max(0, Math.min(1, (Math.min(years, span[1]) - span[0]) / Math.max(1, span[1] - span[0])));
    var factor = 1;
    if (sector !== 'any' && cell.sector && cell.sector[sector]) factor = cell.sector[sector];
    var lo = r[0] * factor, hi = r[1] * factor;
    var point = lo + (hi - lo) * f;
    var basicShare = cell.basicShare || m.basicShare || 0.6;
    var housing = cell.housing || m.housing || 'allowance';
    return {
      m: m, cell: cell, band: b, lo: lo, hi: hi, point: point, cur: m.currency,
      basic: point * basicShare, basicShare: basicShare, housing: housing,
      sectorApplied: factor !== 1
    };
  }
  function livingCost(m, living, housingProvided) {
    var L = m.living; if (!L) return null;
    var rent = living === 'own' ? L.ownRent : L.sharedRent;
    var rentMid = housingProvided ? 0 : (rent[0] + rent[1]) / 2;
    var other = (L.other[0] + L.other[1]) / 2;
    return rentMid + other;
  }
  function gratuity(e, years) {
    var days = e.m.gratuityDaysPerYear;
    if (days == null) return null;
    return e.basic / 30 * days * years;
  }
  function homeSalary(home, pKey, b) {
    var H = D.home && D.home[home]; if (!H || !H.pay[pKey] || !H.pay[pKey][b]) return null;
    var r = H.pay[pKey][b];
    return { mid: (r[0] + r[1]) / 2, cur: H.currency };
  }

  /* ── Salary page ── */
  function initSalary() {
    var root = $('#salary-calc'); if (!root) return;
    var q = params();
    var S = {
      p: prof(q.p) ? q.p : 'rn',
      m: market(q.m) ? q.m : 'saudi',
      y: Math.max(1, Math.min(20, parseInt(q.y, 10) || 5)),
      s: 'any',
      h: ['NGN', 'GHS', 'USD'].indexOf(q.h) >= 0 ? q.h : 'NGN',
      l: q.l === 'own' ? 'own' : 'shared'
    };

    fillSelect($('#f-prof'), S.p);
    $('#f-prof').addEventListener('change', function (e) { S.p = e.target.value; render(); });
    tiles($('#f-market'), S.m, function (v) { S.m = v; render(); });
    var yr = $('#f-years'); yr.value = S.y;
    yr.addEventListener('input', function () { S.y = parseInt(yr.value, 10); render(); });
    seg($('#f-home'), [{ value: 'NGN', label: 'Naira' }, { value: 'GHS', label: 'Cedi' }, { value: 'USD', label: 'Dollar' }], S.h, function (v) { S.h = v; render(); });
    seg($('#f-living'), [{ value: 'shared', label: 'Shared flat' }, { value: 'own', label: 'Own flat' }], S.l, function (v) { S.l = v; render(); });

    function render() {
      setParams({ p: S.p, m: S.m, y: S.y, h: S.h, l: S.l });
      $('#f-years-val').textContent = S.y + (S.y >= 20 ? '+ years' : S.y === 1 ? ' year' : ' years');
      var e = estimate(S.m, S.p, S.y, S.s);
      var P = prof(S.p);
      var out = $('#r-body');
      if (!e && S.m === 'bahrain' && (S.p === 'gp' || S.p === 'dentist')) {
        out.innerHTML = '<p class="r-sub">' + esc(market(S.m).payNote) + ' There are no expat offers to compare. Try a specialist role, or another market below.</p>';
        renderRank(); return;
      }
      if (!e) {
        out.innerHTML = '<p class="r-sub">We don\'t have figures we trust for a ' + esc(P.label.toLowerCase()) +
          ' in ' + esc(market(S.m).name) + ' yet, so we won\'t guess. <a href="contact.html">Ask us</a> and we\'ll tell you what offers actually look like.</p>';
        renderRank(); return;
      }
      var provided = e.housing === 'provided';
      var live = livingCost(e.m, S.l, provided);
      var save = live == null ? null : e.point - live;
      var homeV = function (x) { return convert(x, e.cur, S.h); };
      var hs = S.h === 'USD' ? null : homeSalary(S.h === 'NGN' ? 'NG' : 'GH', S.p, e.band);
      var mult = hs ? convert(e.point, e.cur, hs.cur) / hs.mid : null;
      var g2 = gratuity(e, 2);
      var contract = e.point * 24 + (g2 || 0);

      var allowance = 1 - e.basicShare;

      $('#r-title').textContent = P.label + ' · ' + e.m.name;
      $('#r-conf').className = 'chip ' + (e.cell.confidence || 'medium');
      $('#r-conf').textContent = { high: 'Well sourced', medium: 'Fair evidence', low: 'Thin evidence' }[e.cell.confidence || 'medium'];

      out.innerHTML =
        '<div class="r-label">Monthly package, before living costs</div>' +
        '<div class="r-big">' + range(e.lo, e.hi, e.cur) + '</div>' +
        '<div class="r-sub">About <strong>' + money(e.point, e.cur) + '</strong> at ' + S.y + (S.y >= 20 ? '+' : '') + ' years' +
          (S.h !== e.cur ? ' · <strong>' + money(homeV(e.point), S.h) + '</strong>' : '') + ' a month' + srcLink(e.cell.sourceIds) + '</div>' +
        '<div class="r-bar" aria-hidden="true">' +
          '<span style="width:' + (e.basicShare * 100) + '%;background:#155bd0"></span>' +
          '<span style="width:' + (allowance * 100) + '%;background:#b9cff3"></span>' +
        '</div>' +
        '<div class="r-legend">' +
          '<span><i style="background:#155bd0"></i>Basic ' + Math.round(e.basicShare * 100) + '%</span>' +
          '<span><i style="background:#b9cff3"></i>Allowances ' + Math.round(allowance * 100) + '%</span>' +
          (provided ? '<span>Accommodation usually provided on top</span>' : '') +
        '</div>' +
        '<div class="stats">' +
          stat('You could save', save == null ? '—' : compact(homeV(save), S.h), save == null ? '' : 'a month after ' + (provided ? 'food and transport (room provided)' : (S.l === 'own' ? 'own-flat rent' : 'shared rent') + ', food and transport')) +
          stat('Versus home', mult ? mult.toFixed(mult < 10 ? 1 : 0) + '×' : '—', mult ? 'what a ' + esc(P.short) + ' typically earns in ' + (S.h === 'NGN' ? 'Nigeria' : 'Ghana') : S.h === 'USD' ? 'Pick naira or cedi to compare' : 'No reliable home figure') +
          stat('Two-year contract', compact(homeV(contract), S.h), g2 ? 'pay plus about ' + compact(homeV(g2), S.h) + ' end-of-service' : 'pay over 24 months') +
        '</div>' +
        '<p class="note">' + CONF_TEXT[e.cell.confidence || 'low'] +
          (e.m.living && e.m.living.sharedEstimated && S.l === 'shared' && !provided ? ' Shared-flat rent here is our estimate from one-bedroom prices.' : '') + '</p>';

      var reloc = $('#to-reloc');
      if (reloc) reloc.href = 'relocation-cost-calculator.html?' + new URLSearchParams({ m: S.m, g: P.group, o: S.h === 'GHS' ? 'GH' : 'NG', p: S.p, y: S.y }).toString();
      renderRank();
    }

    function stat(k, v, n) {
      return '<div class="stat"><div class="s-k">' + k + '</div><div class="s-v">' + v + '</div><div class="s-n">' + n + '</div></div>';
    }

    function renderRank() {
      var rows = D.markets.map(function (m) {
        var e = estimate(m.key, S.p, S.y, S.s); if (!e) return { m: m };
        var live = livingCost(m, S.l, e.housing === 'provided');
        return { m: m, pay: convert(e.point, e.cur, S.h), save: live == null ? null : convert(e.point - live, e.cur, S.h) };
      });
      var max = Math.max.apply(null, rows.map(function (r) { return r.pay || 0; }));
      rows.sort(function (a, b) { return (b.save == null ? -1e15 : b.save) - (a.save == null ? -1e15 : a.save); });
      var box = $('#rank'); box.innerHTML = '';
      rows.forEach(function (r) {
        var b = el('button', { type: 'button', class: 'rank-row' + (r.m.key === S.m ? ' is-on' : '') });
        b.innerHTML = '<span class="rk-name">' + esc(r.m.name) + '<small>' + esc(r.m.sub) + '</small></span>' +
          (r.pay == null
            ? '<span class="rank-track"></span><span class="rk-val"><small>Not enough data</small></span>'
            : '<span class="rank-track"><span class="rk-pay" style="width:' + (r.pay / max * 100) + '%"></span>' +
              '<span class="rk-save" style="width:' + (Math.max(0, r.save || 0) / max * 100) + '%"></span></span>' +
              (r.save == null ? '<span class="rk-val">' + compact(r.pay, S.h) + '<small>package; living costs unknown</small></span>'
                : '<span class="rk-val">' + compact(r.save, S.h) + '<small>saved of ' + compact(r.pay, S.h) + '</small></span>'));
        b.addEventListener('click', function () {
          S.m = r.m.key;
          tiles($('#f-market'), S.m, function (v) { S.m = v; render(); });
          render();
          $('#salary-calc').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        });
        box.appendChild(b);
      });
      $('#rank-cap').textContent = prof(S.p).label + ', ' + S.y + (S.y >= 20 ? '+' : '') + ' years, ' + (S.l === 'own' ? 'own flat' : 'shared flat') + '. Amounts per month in ' + ({ NGN: 'naira', GHS: 'cedi', USD: 'US dollars' }[S.h]) + '.';
    }

    renderGratuityTable();
    renderSources($('#sources'), D.salarySourceIds);
    render();
  }

  function renderGratuityTable() {
    var t = $('#pkg-table'); if (!t) return;
    t.innerHTML = D.markets.map(function (m) {
      return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.gratuity || '—') + '</td><td>' + esc(m.leave || '—') +
        '</td><td>' + esc(m.flights || '—') + '</td><td>' + esc(m.tax || '—') + '</td></tr>';
    }).join('');
  }

  /* ── Relocation page ── */
  var STAGES = [
    { key: 'documents', label: 'Papers from home' },
    { key: 'verification', label: 'Verification' },
    { key: 'exam', label: 'Licensing exam' },
    { key: 'exam-travel', label: 'Travelling for the exam' },
    { key: 'pre-departure', label: 'Before you fly' },
    { key: 'travel', label: 'The flight' },
    { key: 'arrival', label: 'First weeks there' }
  ];
  var PAYER = { candidate: ['you', 'You pay'], employer: ['employer', 'Employer pays'], varies: ['varies', 'Depends on employer'] };

  function initReloc() {
    var root = $('#reloc-calc'); if (!root) return;
    var q = params();
    var R = D.relocation;
    var S = {
      o: q.o === 'GH' ? 'GH' : 'NG',
      m: R.markets[q.m] ? q.m : 'saudi',
      g: ['nurse', 'allied', 'doctor', 'dentist'].indexOf(q.g) >= 0 ? q.g : 'nurse',
      have: { verification: false, exam: false },
      housing: false,
      p: prof(q.p) ? q.p : null,
      y: parseInt(q.y, 10) || 5
    };

    seg($('#f-origin'), [{ value: 'NG', label: 'Nigeria' }, { value: 'GH', label: 'Ghana' }], S.o, function (v) { S.o = v; render(); });
    seg($('#f-group'), [{ value: 'nurse', label: 'Nurse' }, { value: 'allied', label: 'Allied' }, { value: 'doctor', label: 'Doctor' }, { value: 'dentist', label: 'Dentist' }], S.g, function (v) { S.g = v; S.p = null; render(); });
    tiles($('#f-market'), S.m, function (v) { S.m = v; render(); }, function (m) { return !!R.markets[m.key]; });
    $('#f-have-dataflow').addEventListener('change', function (e) { S.have.verification = e.target.checked; render(); });
    $('#f-have-exam').addEventListener('change', function (e) { S.have.exam = e.target.checked; render(); });
    $('#f-housing').addEventListener('change', function (e) { S.housing = e.target.checked; render(); });

    function render() {
      setParams({ o: S.o, m: S.m, g: S.g });
      var home = S.o === 'GH' ? 'GHS' : 'NGN';
      var mk = R.markets[S.m];
      var mInfo = market(S.m);
      var all = mk.items.filter(function (it) {
        if (it.appliesTo && it.appliesTo.indexOf(S.g) < 0) return false;
        if (it.origin && it.origin.indexOf(S.o) < 0) return false;
        if (S.have.verification && it.stage === 'verification') return false;
        if (S.have.exam && (it.stage === 'exam' || it.stage === 'exam-travel')) return false;
        if (S.housing && it.housing) return false;
        return true;
      });
      var items = all.filter(function (it) { return it.min != null && it.counted; });
      var extra = all.filter(function (it) { return it.min != null && !it.counted; });
      var unpriced = all.filter(function (it) { return it.min == null && it.counted; });

      var you = [0, 0], emp = [0, 0], weeks = [0, 0];
      var html = '';
      STAGES.forEach(function (st) {
        var list = items.filter(function (it) { return it.stage === st.key; });
        if (!list.length) return;
        var w = [0, 0];
        list.forEach(function (it) { if (it.weeks) { w[0] = Math.max(w[0], it.weeks[0]); w[1] = Math.max(w[1], it.weeks[1]); } });
        weeks[0] += w[0]; weeks[1] += w[1];
        html += '<div class="stage"><div class="stage-h"><h3>' + esc(st.label) + '</h3>' +
          (w[1] ? '<span>' + (w[0] === w[1] ? w[1] : w[0] + '–' + w[1]) + ' weeks</span>' : '') + '</div>';
        list.forEach(function (it) {
          var lo = convert(it.min, it.currency, home), hi = convert(it.max == null ? it.min : it.max, it.currency, home);
          var payer = PAYER[it.payer] || PAYER.varies;
          if (it.payer === 'employer') { emp[0] += lo; emp[1] += hi; }
          else if (it.payer === 'varies') { you[1] += hi; emp[1] += hi; }
          else { you[0] += lo; you[1] += hi; }
          html += '<div class="item' + (it.payer === 'employer' ? ' is-employer' : '') + '">' +
            '<div class="i-name">' + esc(it.label) + '<span class="payer ' + payer[0] + '">' + payer[1] + '</span></div>' +
            '<div class="i-val">' + range(lo, hi, home) +
              (it.currency !== home ? '<small>' + range(it.min, it.max, it.currency) + '</small>' : '') + '</div>' +
            ((it.note || it.condition) ? '<div class="i-meta">' + esc(it.condition ? it.condition + (it.note ? ' ' + it.note : '') : it.note) + srcLink(it.sourceIds) + '</div>'
              : '<div class="i-meta">' + srcLink(it.sourceIds) + '</div>') +
          '</div>';
        });
        html += '</div>';
      });
      if (extra.length) {
        html += '<div class="stage"><div class="stage-h"><h3>Only if your case needs it</h3><span>not in the total</span></div>';
        extra.forEach(function (it) {
          var lo = convert(it.min, it.currency, home), hi = convert(it.max == null ? it.min : it.max, it.currency, home);
          html += '<div class="item is-employer"><div class="i-name">' + esc(it.label) + '</div><div class="i-val">' + range(lo, hi, home) + '</div>' +
            '<div class="i-meta">' + esc(it.condition || '') + srcLink(it.sourceIds) + '</div></div>';
        });
        html += '</div>';
      }
      if (unpriced.length) {
        html += '<div class="stage"><div class="stage-h"><h3>Fees nobody publishes yet</h3><span>ask before you pay</span></div>';
        unpriced.forEach(function (it) {
          html += '<div class="item is-employer"><div class="i-name">' + esc(it.label) + '</div><div class="i-val">Not published</div>' +
            (it.condition ? '<div class="i-meta">' + esc(it.condition) + '</div>' : '') + '</div>';
        });
        html += '</div>';
      }
      $('#journey').innerHTML = html || '<p class="r-sub">Nothing left to pay at this stage.</p>';

      $('#r-title').textContent = 'From ' + (S.o === 'GH' ? 'Ghana' : 'Nigeria') + ' to ' + mInfo.name;
      $('#t-you').textContent = crange(you[0], you[1], home);
      $('#t-you-usd').textContent = 'about ' + range(convert(you[0], home, 'USD'), convert(you[1], home, 'USD'), 'USD');
      $('#t-emp').textContent = crange(emp[0], emp[1], home);
      $('#t-weeks').textContent = weeks[1] ? 'Roughly ' + Math.round(weeks[0] / 4.3) + '–' + Math.max(1, Math.round(weeks[1] / 4.3)) + ' months from first document to landing, if nothing stalls.' : '';

      // Payback
      var pKey = S.p || ({ nurse: 'rn', allied: 'physio', doctor: 'gp', dentist: 'dentist' }[S.g]);
      var e = estimate(S.m, pKey, S.y, 'any');
      var pb = $('#t-payback');
      if (e) {
        var live = livingCost(e.m, 'shared', e.housing === 'provided');
        var save = convert(e.point - (live || 0), e.cur, home);
        var months = save > 0 ? you[1] / save : null;
        pb.innerHTML = months == null ? '—' : (months < 1 ? 'Under a month' : '≈ ' + Math.ceil(months) + ' month' + (Math.ceil(months) === 1 ? '' : 's'));
        $('#t-payback-n').textContent = 'of savings as a ' + prof(pKey).short + ' with ' + S.y + ' years, sharing a flat, covers the top of your range.';
        $('#to-salary').href = 'salary-calculator.html?' + new URLSearchParams({ p: pKey, m: S.m, y: S.y, h: home }).toString();
      } else {
        pb.textContent = '—';
        $('#t-payback-n').textContent = 'No reliable salary figure for this role here yet.';
      }

      $('#legal').innerHTML = esc((R.legal && R.legal[S.m]) || '');
      var bn = $('#market-note'); if (bn) bn.textContent = (S.m === 'bahrain' && (S.g === 'doctor' || S.g === 'dentist')) ? mInfo.payNote + ' Only specialists and consultants can be licensed.' : '';
    }

    var ids = []; Object.keys(R.markets).forEach(function (k) { R.markets[k].items.forEach(function (it) { (it.sourceIds || []).forEach(function (s) { if (ids.indexOf(s) < 0) ids.push(s); }); }); });
    (R.legalSourceIds || []).forEach(function (s) { if (ids.indexOf(s) < 0) ids.push(s); });
    renderSources($('#sources'), ids);
    var sc = $('#scams'); if (sc && R.scams) sc.innerHTML = R.scams.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var asOf = document.querySelectorAll('[data-asof]');
    asOf.forEach(function (n) { n.textContent = D.asOfLabel; });
    var fx = document.querySelectorAll('[data-fx]');
    fx.forEach(function (n) { n.textContent = D.fx.label; });
    initSalary();
    initReloc();
  });
})();
