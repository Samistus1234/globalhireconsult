/* ============================================
   GLOBALHIRE@ELAB — Opportunity Response JS
   Token-based response (no auth required)
   ============================================ */

(function () {
  var SUPABASE_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var container = document.getElementById('opp-content');

  // Get token from URL
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');

  if (!token) {
    showError('No Token Provided', 'This link appears to be invalid. Please check your email for the correct link, or log in to your portal.');
    return;
  }

  // Fetch opportunity details
  loadOpportunity();

  async function loadOpportunity() {
    try {
      var resp = await fetch(SUPABASE_URL + '/functions/v1/gh-respond-token?token=' + encodeURIComponent(token), {
        headers: { 'apikey': window.SUPABASE_ANON_KEY || '' }
      });

      if (!resp.ok) {
        var err = await resp.json().catch(() => ({}));
        if (resp.status === 410) {
          showError('Link Expired', err.error || 'This link has expired. Please log in to your portal to respond.');
        } else {
          showError('Invalid Link', err.error || 'This link is no longer valid.');
        }
        return;
      }

      var data = await resp.json();
      var match = data.match;
      var campaign = data.campaign;

      if (!campaign) {
        showError('Opportunity Not Found', 'This opportunity could not be loaded.');
        return;
      }

      // Already responded?
      if (match.response) {
        showAlreadyResponded(match, campaign);
        return;
      }

      // Show opportunity details
      renderOpportunity(match, campaign);
    } catch (err) {
      showError('Connection Error', 'Unable to load opportunity details. Please try again later.');
    }
  }

  function renderOpportunity(match, campaign) {
    container.innerHTML = `
      <div class="opp-header">
        <p class="opp-subtitle">You've been matched with an opportunity</p>
        <h2 class="opp-title">${esc(campaign.title)}</h2>
      </div>

      <div class="opp-match-score">
        <div class="score-circle">${match.match_score}%</div>
        <div class="score-label">Match Score</div>
      </div>

      <div class="opp-details">
        <div class="opp-detail-row">
          <span class="opp-detail-label">Employer</span>
          <span class="opp-detail-value">${esc(campaign.employer_name || 'Confidential')}</span>
        </div>
        <div class="opp-detail-row">
          <span class="opp-detail-label">Destination</span>
          <span class="opp-detail-value">${esc(campaign.destination_country)}</span>
        </div>
        <div class="opp-detail-row">
          <span class="opp-detail-label">Specialty</span>
          <span class="opp-detail-value">${esc(campaign.specialty)}</span>
        </div>
        <div class="opp-detail-row">
          <span class="opp-detail-label">Salary</span>
          <span class="opp-detail-value" style="color:var(--primary);font-weight:700;">${esc(campaign.salary_display || 'Competitive')}</span>
        </div>
        <div class="opp-detail-row">
          <span class="opp-detail-label">Positions</span>
          <span class="opp-detail-value">${campaign.positions} available</span>
        </div>
        <div class="opp-detail-row">
          <span class="opp-detail-label">Visa</span>
          <span class="opp-detail-value">${campaign.visa_sponsored ? '<span style="color:var(--primary)">Sponsored</span>' : 'Not included'}</span>
        </div>
      </div>

      ${campaign.description ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:var(--space-6);">${esc(campaign.description)}</p>` : ''}

      <p style="font-size:var(--text-sm);color:var(--text-tertiary);text-align:center;margin-bottom:var(--space-4);">Are you interested in this opportunity?</p>

      <div class="opp-actions">
        <button class="btn btn-interested" style="width:100%;padding:var(--space-4);" id="btn-interested">I'm Interested</button>
        <button class="btn btn-declined" style="width:100%;padding:var(--space-3);" id="btn-declined">Not for Me</button>
        <button class="btn btn-maybe" style="width:100%;" id="btn-maybe">Maybe Later</button>
      </div>
    `;

    // Bind response buttons
    document.getElementById('btn-interested').addEventListener('click', () => submitResponse('interested'));
    document.getElementById('btn-declined').addEventListener('click', () => submitResponse('declined'));
    document.getElementById('btn-maybe').addEventListener('click', () => submitResponse('maybe_later'));
  }

  async function submitResponse(response) {
    // Disable buttons
    container.querySelectorAll('.opp-actions button').forEach(b => { b.disabled = true; });

    var activeBtn = document.getElementById('btn-' + (response === 'maybe_later' ? 'maybe' : response));
    if (activeBtn) activeBtn.innerHTML = '<span class="spinner"></span> Submitting...';

    try {
      var resp = await fetch(SUPABASE_URL + '/functions/v1/gh-respond-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({ token: token, response: response })
      });

      var data = await resp.json();

      if (data.success === false) {
        showError('Response Failed', data.error || 'Unable to submit your response.');
        return;
      }

      showConfirmation(response, data.campaign || {});
    } catch (err) {
      showError('Connection Error', 'Unable to submit your response. Please try again.');
    }
  }

  function showConfirmation(response, campaign) {
    var messages = {
      interested: { title: 'Response Recorded!', text: 'We\'ve noted your interest. The recruitment team will follow up with next steps.' },
      declined: { title: 'Response Recorded', text: 'Thank you for letting us know. We\'ll keep looking for opportunities that match your preferences.' },
      maybe_later: { title: 'Response Saved', text: 'We\'ve saved this opportunity for you. You can change your response anytime from your portal.' }
    };
    var msg = messages[response] || messages.interested;

    container.innerHTML = `
      <div class="opp-confirmation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <path d="m9 11 3 3L22 4"/>
        </svg>
        <h3>${msg.title}</h3>
        <p>${msg.text}</p>
        <a href="portal.html" class="btn btn-primary" style="display:inline-flex;padding:var(--space-3) var(--space-6);">Log in to Your Portal</a>
      </div>
    `;
  }

  function showAlreadyResponded(match, campaign) {
    var labels = { interested: 'Interested', declined: 'Declined', maybe_later: 'Maybe Later' };
    container.innerHTML = `
      <div class="opp-confirmation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <h3>Already Responded</h3>
        <p>You've already responded to <strong>${esc(campaign.title)}</strong> with: <strong>${labels[match.response] || match.response}</strong></p>
        <p style="margin-top:var(--space-2);">You can update your response from your portal.</p>
        <a href="portal.html" class="btn btn-primary" style="display:inline-flex;padding:var(--space-3) var(--space-6);margin-top:var(--space-2);">Go to Portal</a>
      </div>
    `;
  }

  function showError(title, message) {
    container.innerHTML = `
      <div class="opp-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3>${title}</h3>
        <p>${message}</p>
        <a href="portal.html" class="btn btn-primary" style="display:inline-flex;padding:var(--space-3) var(--space-6);margin-top:var(--space-4);">Log in to Portal</a>
      </div>
    `;
  }

  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
