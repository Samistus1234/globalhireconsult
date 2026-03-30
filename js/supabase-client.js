/* ============================================
   GLOBALHIRE@ELAB — Supabase Client
   Init + session helpers (GHAuth namespace)
   Schema: globalhire (isolated from public.*)
   ============================================ */

var SUPABASE_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk';

var _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Expose on window
window.ghSupabase = _sbClient;

// Routes queries through public.gh_* wrapper views that proxy to globalhire.* tables.
// This avoids schema header issues entirely — no Accept-Profile header needed.
function ghFrom(table) {
  return _sbClient.from('gh_' + table);
}
window.ghFrom = ghFrom;

// GHE is defined in core.js with const — provide fallback for pages that don't load core.js
if (typeof GHE === 'undefined') {
  window.GHE = {
    avatarColors: [
      ['#0077B6', '#ffffff'],
      ['#D4A84B', '#0A1628'],
      ['#2EC4B6', '#0A1628'],
      ['#48CAE4', '#0A1628'],
      ['#E56B8A', '#ffffff'],
      ['#F4A261', '#0A1628']
    ]
  };
}

var GHAuth = {
  async getSession() {
    var r = await _sbClient.auth.getSession();
    if (r.error) { console.error('Session error:', r.error); return null; }
    return r.data.session;
  },

  async getUser() {
    var r = await _sbClient.auth.getUser();
    if (r.error) { console.error('User error:', r.error); return null; }
    return r.data.user;
  },

  async getProfile() {
    var user = await this.getUser();
    if (!user) return null;
    var r = await ghFrom('profiles').select('*').eq('id', user.id).single();
    if (r.error) { console.error('Profile error:', r.error); return null; }
    return r.data;
  },

  async signOut() {
    var r = await _sbClient.auth.signOut();
    if (r.error) console.error('Sign out error:', r.error);
    window.location.href = 'login.html';
  },

  onAuthStateChange(callback) {
    return _sbClient.auth.onAuthStateChange(function(event, session) {
      callback(event, session);
    });
  }
};
