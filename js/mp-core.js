/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace core bootstrap
   Loaded after js/supabase-client.js on every partner page.
   Resolves session → agency/membership, page guards, edge-fn caller.

   window.MP contract (consumed by the partner pages):
     MP.mpFrom(table)          → sb.from('gh_mp_' + table)
     await MP.init()           → resolves MP.user / MP.membership / MP.agency / MP.status; returns MP
     MP.user                   auth user | null
     MP.membership             { agency_id, role, status } | null
     MP.agency                 gh_mp_agencies row | null
     MP.status                 'no_agency' | 'pending_verification' | 'verified'
                               | 'suspended' | 'rejected' | 'error'
     MP.lastError              string (message) | null — set only when MP.status === 'error'
     MP.requireAgency(opts)    → false (+ redirect) if no user/membership; false WITHOUT redirect on 'error'
     MP.requireVerified(opts)  → false (+ redirect) unless verified; false WITHOUT redirect on 'error'
     await MP.callFn(name,body) → { ok, status, data } — never rejects
     MP.esc(str)               HTML-escape helper — element TEXT content ONLY.
     MP.escAttr(str)           HTML-escape helper — HTML ATTRIBUTE values.

     Why both exist: esc() builds a Text node and reads back its parent's
     .innerHTML. The HTML text-node serialisation algorithm only escapes
     '&', '<', '>' (and NBSP) — it never touches '"' or '\'', because those
     characters aren't special between tags. That makes esc() safe for
     element text content but UNSAFE on its own inside a quoted attribute
     (e.g. data-path="..."): an untrusted value containing a quote would
     close the attribute early. escAttr() layers a quote-escape ('"' →
     &quot;, '\'' → &#39;) on top of esc() so it is safe in single- or
     double-quoted attributes too. Use esc() for text between tags,
     escAttr() for anything interpolated into an attribute value — never
     esc() alone in an attribute position.
   ============================================ */

(function () {
  var sb = window.ghSupabase;

  // Routes marketplace queries through public.gh_mp_* security_invoker views.
  function mpFrom(table) {
    return sb.from('gh_mp_' + table);
  }

  // ── XSS escape (copied from js/recruiter.js) — element TEXT content only.
  // See the contract comment above for why this is unsafe inside an
  // attribute value and why escAttr() exists alongside it.
  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  // ── XSS escape for HTML ATTRIBUTE values. esc() + explicit quote escaping,
  // since the Text-node technique above never escapes quote characters.
  function escAttr(str) {
    return esc(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var MP = {
    user: null,
    membership: null,
    agency: null,
    status: 'no_agency',
    lastError: null,
    mpFrom: mpFrom,
    esc: esc,
    escAttr: escAttr,

    async init() {
      // Session state first: a logged-out visitor is a NORMAL state, not a failure.
      // getSession() returns { data: { session: null }, error: null } when signed out.
      var s = await sb.auth.getSession();
      if (s && s.error) {
        MP.status = 'error';
        MP.lastError = s.error.message || String(s.error);
        return MP;
      }
      if (!s || !s.data || !s.data.session) { MP.status = 'no_agency'; return MP; }

      var u = await sb.auth.getUser();
      MP.user = (u && u.data && u.data.user) || null;
      if (!MP.user) {
        // A session exists but the user can't be resolved — that IS a real failure.
        MP.status = 'error';
        MP.lastError = (u && u.error && u.error.message) || 'Could not resolve the signed-in user';
        return MP;
      }

      var m = await mpFrom('agency_members')
        .select('agency_id, role, status')
        .eq('user_id', MP.user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (m && m.error) {
        MP.status = 'error';
        MP.lastError = m.error.message || String(m.error);
        return MP;
      }
      MP.membership = (m && m.data) || null;
      if (!MP.membership) { MP.status = 'no_agency'; return MP; }

      var a = await mpFrom('agencies')
        .select('*')
        .eq('id', MP.membership.agency_id)
        .maybeSingle();
      if (a && a.error) {
        MP.status = 'error';
        MP.lastError = a.error.message || String(a.error);
        return MP;
      }
      MP.agency = (a && a.data) || null;
      MP.status = MP.agency ? MP.agency.status : 'no_agency';
      return MP;
    },

    requireAgency(opts) {
      opts = opts || {};
      if (MP.status === 'error') return false; // page renders its own retry banner — never redirect
      if (!MP.user) { window.location.href = 'login.html'; return false; }
      if (!MP.membership) { window.location.href = opts.to || 'partners-signup.html'; return false; }
      return true;
    },

    requireVerified(opts) {
      if (!MP.requireAgency(opts)) return false;
      if (MP.status !== 'verified') {
        window.location.href = (opts && opts.to) || 'partners-onboarding.html';
        return false;
      }
      return true;
    },

    async callFn(name, body) {
      try {
        var s = await sb.auth.getSession();
        var token = (s && s.data && s.data.session) ? s.data.session.access_token : null;
        var key = sb.supabaseKey || '';
        var res = await fetch(SUPABASE_URL + '/functions/v1/' + name, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': key,
            'Authorization': 'Bearer ' + (token || key)
          },
          body: JSON.stringify(body || {})
        });
        var json = await res.json().catch(function () { return {}; });
        return { ok: res.ok, status: res.status, data: json };
      } catch (e) {
        return { ok: false, status: 0, data: { error: (e && e.message) || String(e) } };
      }
    }
  };

  window.MP = MP;
})();
