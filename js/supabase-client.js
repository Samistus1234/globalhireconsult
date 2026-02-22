/* ============================================
   GLOBALHIRE@ELAB — Supabase Client
   Init + session helpers (GHAuth namespace)
   Schema: globalhire (isolated from public.*)
   ============================================ */

'use strict';

const SUPABASE_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'globalhire' },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Helper to query the globalhire schema explicitly
// Falls back to supabase.from() since schema is set in client init
function ghQuery(table) {
  try {
    return supabase.schema('globalhire').from(table);
  } catch (e) {
    return supabase.from(table);
  }
}

const GHAuth = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) { console.error('Session error:', error); return null; }
    return data.session;
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) { console.error('User error:', error); return null; }
    return data.user;
  },

  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) { console.error('Profile error:', error); return null; }
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    window.location.href = 'login.html';
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
};
