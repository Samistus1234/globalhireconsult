/* ============================================
   GLOBALHIRE — Visa hub guided flow
   Pick a visa → a few questions → price for the
   whole group → account → details (visa-start.html).
   The plan is saved in localStorage ('gh_visa_plan')
   so it survives sign-up / email confirmation, and
   visa-start.html shows it as the price summary.
   ============================================ */
(function () {
  'use strict';

  var WA = 'https://wa.me/19294192327?text=';
  var NGN_PER_USD_QUOTE = 1500; // basis used on the published visa prices (₦814,500 ≈ $543)
  var DEPOSIT_USD = 50;
  var PLAN_KEY = 'gh_visa_plan';

  var VISAS = {
    tourist: {
      name: 'Tourist eVisa', slug: 'tourist-evisa', outcome: 'visit-saudi', page: 'visa-tourist-evisa.html',
      currency: 'USD', residence: true,
      tiers: [{ key: 'p', label: 'Travellers', sub: 'Any age', price: 185, min: 1 }],
      perPersonNote: 'Government fee $135 + ELAB $50, per person',
      docs: ['Passport bio page (valid 6+ months)', 'Recent passport-style photo'],
      nigeria: {
        text: 'From Nigeria we arrange the Tourist visa as a full package rather than visa-only. Message us your dates and we will quote it.',
        cta: 'Ask for a Tourist package', href: WA + encodeURIComponent("Hi, I'm in Nigeria and want a Saudi Tourist visa package.")
      }
    },
    umrah: {
      name: 'Umrah visa', slug: 'umrah', outcome: 'go-for-umrah', page: 'visa-umrah.html',
      currency: 'USD', residence: true,
      tiers: [{ key: 'p', label: 'Pilgrims', sub: 'Any age', price: 295, min: 1 }],
      perPersonNote: 'Processing $245 + ELAB $50, per person',
      docs: ['Passport bio page (valid 6+ months from arrival)', 'Recent passport-style photo', 'Women under 40 may need a Mahram declaration (we guide you)'],
      nigeria: {
        text: 'Visa-only Umrah is for pilgrims who already live abroad. From Nigeria we run full packages from Kano: the visa, return flights, transport in Saudi and your hotel.',
        cta: 'See Kano departures', href: 'visa-umrah.html#packages'
      }
    },
    family_visit: {
      name: 'Family Visit visa', slug: 'family-visit', outcome: 'bring-my-family', page: 'visa-family-visit.html',
      currency: 'NGN', sponsor: true, shared: 30000,
      who: [['spouse', 'Spouse'], ['child', 'Children'], ['parent', 'Parents']],
      tiers: [
        { key: 'a', label: 'Ages 1–49', price: 814500 },
        { key: 'b', label: 'Ages 50–69', sub: 'Includes required health insurance', price: 844500 },
        { key: 'c', label: 'Ages 70–89', sub: 'Includes required health insurance', price: 984500 }
      ],
      perPersonNote: 'All-in, per visitor',
      docs: ['Each visitor: passport bio page and photo (white background)', "Sponsor's Iqama (front and back)", "Sponsor's recent salary certificate", 'Court affidavit (consent for children, relationship for spouse or parents)', 'Invitation letter']
    },
    family_residence: {
      name: 'Family Residence', slug: 'family-residence', outcome: 'live-with-family', page: 'visa-family-residence.html',
      currency: 'NGN', sponsor: true, shared: 30000,
      who: [['spouse', 'Spouse'], ['child', 'Children']],
      tiers: [
        { key: 'a', label: 'Children 1–5', sub: 'Biometrics and stamping', price: 424000 },
        { key: 'b', label: 'Children 6–13', sub: 'Adds a medical exam', price: 614000 },
        { key: 'c', label: 'Adults 14+', sub: 'Adds medical and police certificate', price: 659000 }
      ],
      perPersonNote: 'All-in, per dependant, including the post-issuance fee',
      docs: ['Each person: passport bio page and photo (white background)', "Sponsor's Iqama (front and back)", 'Court affidavit (consent for children, relationship for spouse)', 'Invitation letter', 'Medical and police certificate where the age needs it (we tell you who)']
    }
  };

  /* ── helpers ── */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, cur) { return (cur === 'NGN' ? '₦' : '$') + Math.round(n).toLocaleString('en-US'); }
  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
      localStorage.setItem(PLAN_KEY, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function sessionId() {
    try {
      var k = 'gh_visa_session', s = localStorage.getItem(k);
      if (!s) { s = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(k, s); }
      return s;
    } catch (e) { return 'sess-anon'; }
  }
  function logLead(outcome) {
    // Same background lead log the old wizard made; never blocks the flow.
    try {
      var p = new URLSearchParams(location.search);
      var anon = window.SUPABASE_ANON_KEY || '';
      fetch('https://' + (window.SUPABASE_REF || 'evzhnsugmvtqgmvzwyix') + '.functions.supabase.co/submit-visa-eligibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anon, Authorization: 'Bearer ' + anon },
        body: JSON.stringify({
          outcome: outcome, session_id: sessionId(),
          utm_source: p.get('utm_source') || undefined, utm_medium: p.get('utm_medium') || undefined, utm_campaign: p.get('utm_campaign') || undefined
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.lead_id) { try { sessionStorage.setItem('gh_visa_lead_id', j.lead_id); } catch (e) {} }
      }).catch(function () {});
    } catch (e) {}
  }
  function startUrl(slug) { return 'visa-start.html?slug=' + encodeURIComponent(slug); }

  /* ── state ── */
  var S = null;
  function fresh(type) {
    var v = VISAS[type], counts = {};
    v.tiers.forEach(function (t, i) { counts[t.key] = t.min != null ? t.min : (i === 0 ? 1 : 0); });
    return { type: type, step: 0, residence: null, sponsor: null, who: [], counts: counts };
  }
  function stepsFor(v) { return v.residence ? ['residence', 'people', 'quote'] : ['sponsor', 'who', 'people', 'quote']; }
  function quote(st) {
    var v = VISAS[st.type], lines = [], total = 0, people = 0;
    v.tiers.forEach(function (t) {
      var n = st.counts[t.key] || 0;
      if (!n) return;
      people += n; total += n * t.price;
      lines.push([n + ' × ' + t.label, fmt(n * t.price, v.currency)]);
    });
    if (v.shared && people) { total += v.shared; lines.push(['Family documents fee (shared, approx.)', fmt(v.shared, v.currency)]); }
    return { total: total, people: people, lines: lines, currency: v.currency };
  }

  /* ── render ── */
  var flow, body, prog, back, label;
  function render() {
    var v = VISAS[S.type], steps = stepsFor(v), step = steps[S.step];
    prog.innerHTML = steps.map(function (_, i) { return '<i class="' + (i <= S.step ? 'on' : '') + '"></i>'; }).join('');
    label.textContent = v.name + ' · step ' + (S.step + 1) + ' of ' + steps.length;
    back.hidden = S.step === 0;
    var h = '';

    if (step === 'residence') {
      h = q('Where do you live right now?', 'Visa-only applications are for people who already live outside Nigeria.') +
        '<div class="v-options">' +
        opt('abroad', 'Outside Nigeria, with residence there', 'For example an Iqama, a UK or UAE permit, or a study visa', S.residence) +
        opt('nigeria', 'In Nigeria', 'We arrange a full package instead', S.residence) +
        opt('none', 'Somewhere else, without residence', '', S.residence) +
        '</div><div id="v-branch"></div>';
    }
    if (step === 'sponsor') {
      h = q('Is the person inviting them living in Saudi Arabia with a valid Iqama?', 'Family visas are sponsored by an Iqama holder.') +
        '<div class="v-options">' +
        opt('yes', 'Yes, they hold a valid Iqama', '', S.sponsor) +
        opt('no', 'No, or not sure', '', S.sponsor) +
        '</div><div id="v-branch"></div>';
    }
    if (step === 'who') {
      h = q('Who is coming?', 'Choose everyone who applies.') + '<div class="v-options">' +
        v.who.map(function (w) {
          return '<button type="button" class="v-opt check" data-who="' + w[0] + '" aria-pressed="' + (S.who.indexOf(w[0]) >= 0) + '"><span><b>' + esc(w[1]) + '</b></span></button>';
        }).join('') + '</div>' +
        '<button type="button" class="btn btn-primary btn-lg v-next" data-next' + (S.who.length ? '' : ' disabled') + '>Continue</button>';
    }
    if (step === 'people') {
      var many = v.tiers.length > 1;
      h = q(many ? 'How many people, and how old?' : 'How many ' + v.tiers[0].label.toLowerCase() + '?', many ? 'Prices change with age because of the required checks and insurance.' : 'Price is per person.') +
        '<div>' + v.tiers.map(function (t) {
          var n = S.counts[t.key] || 0;
          return '<div class="v-counter"><div><b>' + esc(t.label) + '</b><small>' + esc(t.sub ? t.sub + ' · ' : '') + fmt(t.price, v.currency) + ' each</small></div>' +
            '<div class="v-step"><button type="button" data-dec="' + t.key + '" aria-label="Fewer ' + esc(t.label) + '"' + (n <= (t.min || 0) ? ' disabled' : '') + '>−</button>' +
            '<output aria-live="polite">' + n + '</output>' +
            '<button type="button" data-inc="' + t.key + '" aria-label="More ' + esc(t.label) + '"' + (n >= 10 ? ' disabled' : '') + '>+</button></div></div>';
        }).join('') + '</div>' +
        '<button type="button" class="btn btn-primary btn-lg v-next" data-next' + (quote(S).people ? '' : ' disabled') + '>See my price</button>';
    }
    if (step === 'quote') {
      var Q = quote(S);
      var usd = Q.currency === 'NGN' ? ' <span class="v-quote-sub">≈ ' + fmt(Q.total / NGN_PER_USD_QUOTE, 'USD') + '</span>' : '';
      h = '<small class="v-quote-sub">Your price, ' + Q.people + ' ' + (Q.people === 1 ? 'person' : 'people') + '</small>' +
        '<div class="v-quote-total">' + fmt(Q.total, Q.currency) + '</div>' + usd +
        '<div class="v-lines">' + Q.lines.map(function (l) { return '<div class="v-line"><span>' + esc(l[0]) + '</span><span>' + l[1] + '</span></div>'; }).join('') +
        '<div class="v-line start"><span>You pay today to start</span><span>$' + DEPOSIT_USD + '</span></div></div>' +
        '<p class="v-note">The $' + DEPOSIT_USD + ' is credited to your total and refunded if you are not eligible. You pay the balance once your documents are approved.' +
        (Q.currency === 'NGN' ? ' Dollar figures are a guide; the naira price is what you pay.' : '') + ' We confirm the timeline when we review your documents.</p>' +
        '<h3 style="font-size:18px;margin:22px 0 8px">What you will upload</h3><ul class="v-docs">' + v.docs.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' +
        '<div class="v-actions" id="v-actions">' +
          '<a class="btn btn-primary btn-lg" href="signup.html?redirect=' + encodeURIComponent(startUrl(v.slug)) + '">Create an account to continue</a>' +
          '<a class="btn btn-ghost btn-lg" href="login.html?redirect=' + encodeURIComponent(startUrl(v.slug)) + '">I already have an account</a>' +
          '<a class="btn btn-ghost btn-lg" href="' + WA + encodeURIComponent('Hi, I want a ' + v.name + ' for ' + Q.people + ' (' + fmt(Q.total, Q.currency) + ' quote).') + '" target="_blank" rel="noopener">Ask us on WhatsApp</a>' +
        '</div>';
      store(false, { type: S.type, slug: v.slug, name: v.name, who: S.who, counts: S.counts, people: Q.people, total: Q.total, currency: Q.currency, lines: Q.lines, ts: Date.now() });
      // Signed in already? Go straight to the details step.
      if (window.GHAuth && GHAuth.getSession) {
        GHAuth.getSession().then(function (sess) {
          var a = $('#v-actions');
          if (sess && a) a.innerHTML = '<a class="btn btn-primary btn-lg" href="' + startUrl(v.slug) + '">Continue to your details</a>' +
            '<a class="btn btn-ghost btn-lg" href="' + WA + encodeURIComponent('Hi, I want a ' + v.name + '.') + '" target="_blank" rel="noopener">Ask us on WhatsApp</a>';
        }).catch(function () {});
      }
    }
    body.innerHTML = h;
  }
  function q(t, sub) { return '<h2 class="v-q">' + esc(t) + '</h2>' + (sub ? '<p class="v-q-sub">' + esc(sub) + '</p>' : ''); }
  function opt(val, t, sub, cur) {
    return '<button type="button" class="v-opt" data-opt="' + val + '" aria-pressed="' + (cur === val) + '"><span><b>' + esc(t) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span></button>';
  }
  function branch(html) { var b = $('#v-branch'); if (b) b.innerHTML = '<div class="v-alert" style="margin-top:16px">' + html + '</div>'; }

  function next() { S.step = Math.min(S.step + 1, stepsFor(VISAS[S.type]).length - 1); render(); focusTop(); }
  function focusTop() {
    var h = $('.v-q, .v-quote-total', body);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    var r = flow.getBoundingClientRect();
    if (r.top < 60 || r.top > innerHeight * 0.5) flow.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function onClick(e) {
    var v = VISAS[S.type], t;
    if ((t = e.target.closest('[data-opt]'))) {
      var val = t.getAttribute('data-opt'), step = stepsFor(v)[S.step];
      if (step === 'residence') {
        S.residence = val;
        if (val === 'abroad') return next();
        render();
        if (val === 'nigeria') branch('<b>' + esc(v.nigeria.text.split('.')[0]) + '.</b>' + esc(v.nigeria.text.slice(v.nigeria.text.indexOf('.') + 1)) +
          '<br><a class="btn btn-primary" href="' + v.nigeria.href + '"' + (v.nigeria.href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '') + '>' + esc(v.nigeria.cta) + '</a>');
        else branch('<b>Visa-only needs residence outside Nigeria.</b> Tell us where you are and we will tell you what is possible.<br><a class="btn btn-primary" href="' + WA + encodeURIComponent('Hi, I want a Saudi ' + v.name + ' but I have no residence abroad.') + '" target="_blank" rel="noopener">Ask us on WhatsApp</a>');
      }
      if (step === 'sponsor') {
        S.sponsor = val;
        if (val === 'yes') return next();
        render();
        branch('<b>A family visa needs a sponsor with a valid Iqama.</b> If you are not sure about their status, message us and we will check what is possible.<br><a class="btn btn-primary" href="' + WA + encodeURIComponent('Hi, I want a Saudi ' + v.name + ' but I am not sure about the sponsor.') + '" target="_blank" rel="noopener">Ask us on WhatsApp</a>');
      }
      return;
    }
    if ((t = e.target.closest('[data-who]'))) {
      var w = t.getAttribute('data-who'), i = S.who.indexOf(w);
      if (i >= 0) S.who.splice(i, 1); else S.who.push(w);
      return render();
    }
    if ((t = e.target.closest('[data-inc]'))) { var k = t.getAttribute('data-inc'); S.counts[k] = Math.min(10, (S.counts[k] || 0) + 1); return render(); }
    if ((t = e.target.closest('[data-dec]'))) {
      var k2 = t.getAttribute('data-dec'), tier = v.tiers.filter(function (x) { return x.key === k2; })[0];
      S.counts[k2] = Math.max(tier.min || 0, (S.counts[k2] || 0) - 1); return render();
    }
    if (e.target.closest('[data-next]')) return next();
  }

  function open(type, opts) {
    if (!VISAS[type]) return;
    S = fresh(type);
    flow.hidden = false;
    document.querySelectorAll('[data-visa]').forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-visa') === type)); });
    render();
    if (!opts || !opts.silent) logLead(VISAS[type].outcome);
    focusTop();
  }

  function init() {
    flow = $('#v-flow'); if (!flow) return;
    body = $('#v-flow-body'); prog = $('#v-progress'); back = $('#v-back'); label = $('#v-flow-label');
    body.addEventListener('click', onClick);
    back.addEventListener('click', function () { S.step = Math.max(0, S.step - 1); render(); focusTop(); });
    document.querySelectorAll('[data-visa]').forEach(function (c) {
      c.addEventListener('click', function (e) { e.preventDefault(); open(c.getAttribute('data-visa')); });
    });
    // Deep link from a detail page: visa.html?type=umrah#price
    var t = new URLSearchParams(location.search).get('type');
    if (t && VISAS[t]) open(t);
    // A plan from an earlier visit (e.g. before confirming email): offer to carry on.
    var plan = store(true);
    var resume = $('#v-resume');
    if (plan && resume && VISAS[plan.type] && Date.now() - plan.ts < 14 * 864e5) {
      resume.hidden = false;
      resume.innerHTML = 'Saved price: ' + esc(plan.name) + ' for ' + (Number(plan.people) || 1) + ' ' + (Number(plan.people) === 1 ? 'person' : 'people') +
        ' (' + fmt(Number(plan.total) || 0, plan.currency === 'NGN' ? 'NGN' : 'USD') + '). <a class="v-link" href="' + startUrl(plan.slug) + '">Continue your application</a>';
    }
  }

  window.GHVisaFlow = { VISAS: VISAS, open: function (t) { open(t); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
