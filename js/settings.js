/* ============================================
   GLOBALHIRE@ELAB — Settings Page
   Admin profile + platform overview
   ============================================ */

(function () {
  var adminProfile = null;

  window.addEventListener('gh:auth-ready', async function (e) {
    adminProfile = e.detail.profile;
    updateAdminUI();
    await loadSettings(e.detail.session);
  });

  function updateAdminUI() {
    var nameEl = document.getElementById('admin-user-name');
    var roleEl = document.getElementById('admin-user-role');
    var avatarEl = document.getElementById('admin-user-avatar');
    if (nameEl) nameEl.textContent = adminProfile.full_name || 'Admin';
    if (roleEl) roleEl.textContent = 'Platform Admin';
    if (avatarEl) {
      avatarEl.textContent = adminProfile.avatar_initials || 'A';
      var colors = GHE.avatarColors[adminProfile.avatar_color_index || 0];
      avatarEl.style.background = colors[0];
      avatarEl.style.color = colors[1];
    }
    document.getElementById('admin-signout')?.addEventListener('click', function (e) {
      e.preventDefault();
      GHAuth.signOut();
    });
  }

  async function loadSettings(session) {
    // Admin profile
    var setName = document.getElementById('set-name');
    var setEmail = document.getElementById('set-email');
    var setRole = document.getElementById('set-role');
    var setCreated = document.getElementById('set-created');
    if (setName) setName.textContent = adminProfile.full_name || 'N/A';
    if (setEmail) setEmail.textContent = session?.user?.email || 'N/A';
    if (setRole) setRole.textContent = (adminProfile.role || 'admin').charAt(0).toUpperCase() + (adminProfile.role || 'admin').slice(1);
    if (setCreated) setCreated.textContent = adminProfile.created_at ? new Date(adminProfile.created_at).toLocaleDateString() : 'N/A';

    // Platform counts
    var [applicantsRes, campaignsRes, docsRes] = await Promise.all([
      ghFrom('admin_applicant_overview').select('id'),
      ghFrom('campaigns').select('id'),
      ghFrom('documents').select('id')
    ]);

    var setApplicants = document.getElementById('set-applicants');
    var setCampaigns = document.getElementById('set-campaigns');
    var setDocs = document.getElementById('set-docs');
    if (setApplicants) setApplicants.textContent = (applicantsRes.data ? applicantsRes.data.length : 0) + ' registered applicants';
    if (setCampaigns) setCampaigns.textContent = (campaignsRes.data ? campaignsRes.data.length : 0) + ' campaigns created';
    if (setDocs) setDocs.textContent = (docsRes.data ? docsRes.data.length : 0) + ' documents uploaded';
  }
})();
