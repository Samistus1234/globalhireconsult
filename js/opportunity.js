/* ============================================
   GLOBALHIRE@ELAB — Opportunity Response JS
   Token-based response (no auth required)
   + Deactivation / opt-out flow
   ============================================ */

(function () {
  var SUPABASE_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var container = document.getElementById('opp-content');

  // Get params from URL
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  var urlAction = params.get('action');

  if (!token) {
    showError('No Token Provided', 'This link appears to be invalid. Please check your email for the correct link, or log in to your portal.');
    return;
  }

  // If ?action=unsubscribe, show deactivation form directly
  if (urlAction === 'unsubscribe') {
    showDeactivationForm(null);
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

      <hr class="opp-separator">
      <a class="opp-optout-link" id="optout-link">I'm no longer looking for opportunities</a>
      <div id="deactivation-container"></div>
    `;

    // Bind response buttons
    document.getElementById('btn-interested').addEventListener('click', () => submitResponse('interested'));
    document.getElementById('btn-declined').addEventListener('click', () => submitResponse('declined'));
    document.getElementById('btn-maybe').addEventListener('click', () => submitResponse('maybe_later'));

    // Bind opt-out link
    document.getElementById('optout-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('optout-link').style.display = 'none';
      showDeactivationInline();
    });
  }

  function showDeactivationInline() {
    var el = document.getElementById('deactivation-container');
    if (!el) return;
    el.innerHTML = buildDeactivationFormHtml();
    bindDeactivationForm(el);
  }

  function showDeactivationForm() {
    container.innerHTML = `
      <div class="opp-header">
        <h2 class="opp-title">Unsubscribe from Opportunities</h2>
        <p class="opp-subtitle">Let us know why you'd like to stop receiving outreach</p>
      </div>
      ${buildDeactivationFormHtml()}
    `;
    bindDeactivationForm(container);
  }

  function buildDeactivationFormHtml() {
    return `
      <div class="deactivation-form">
        <h4>Why are you opting out?</h4>
        <select id="deactivate-reason">
          <option value="">Select a reason...</option>
          <option value="Got an offer">Got an offer</option>
          <option value="No longer interested">No longer interested in opportunities</option>
          <option value="Taking a break">Taking a break from job searching</option>
          <option value="Other">Other</option>
        </select>
        <textarea id="deactivate-note" placeholder="Additional notes (optional)"></textarea>
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-2);">
          <label style="flex:1;cursor:pointer;padding:var(--space-3);border:1px solid var(--border-default);border-radius:var(--radius-md);text-align:center;font-size:var(--text-sm);color:var(--accent-amber);">
            <input type="radio" name="deactivate-status" value="paused" style="display:none;">
            Pause (maybe later)
          </label>
          <label style="flex:1;cursor:pointer;padding:var(--space-3);border:1px solid var(--border-default);border-radius:var(--radius-md);text-align:center;font-size:var(--text-sm);color:var(--accent-coral);">
            <input type="radio" name="deactivate-status" value="closed" checked style="display:none;">
            Close (permanently)
          </label>
        </div>
        <button class="btn-deactivate" id="btn-confirm-deactivate">Confirm Opt-Out</button>
        <button class="btn-cancel-deactivate" id="btn-cancel-deactivate">Cancel</button>
      </div>
    `;
  }

  function bindDeactivationForm(parentEl) {
    // Style radio toggle
    var radios = parentEl.querySelectorAll('input[name="deactivate-status"]');
    radios.forEach(function(radio) {
      var label = radio.closest('label');
      if (radio.checked) label.style.borderColor = 'var(--accent-coral)';
      radio.addEventListener('change', function() {
        radios.forEach(function(r) {
          r.closest('label').style.borderColor = 'var(--border-default)';
        });
        if (radio.checked) {
          label.style.borderColor = radio.value === 'paused' ? 'var(--accent-amber)' : 'var(--accent-coral)';
        }
      });
    });

    parentEl.querySelector('#btn-confirm-deactivate').addEventListener('click', submitDeactivation);

    var cancelBtn = parentEl.querySelector('#btn-cancel-deactivate');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        // If on direct unsubscribe page, just reload the opportunity
        if (urlAction === 'unsubscribe') {
          window.location.href = 'opportunity.html?token=' + encodeURIComponent(token);
        } else {
          var deactContainer = document.getElementById('deactivation-container');
          if (deactContainer) deactContainer.innerHTML = '';
          var link = document.getElementById('optout-link');
          if (link) link.style.display = '';
        }
      });
    }
  }

  async function submitDeactivation() {
    var reason = document.getElementById('deactivate-reason')?.value || '';
    var note = document.getElementById('deactivate-note')?.value || '';
    var statusRadio = document.querySelector('input[name="deactivate-status"]:checked');
    var status = statusRadio ? statusRadio.value : 'closed';

    var fullReason = reason;
    if (note) fullReason = fullReason ? fullReason + ': ' + note : note;

    var btn = document.getElementById('btn-confirm-deactivate');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing...'; }

    try {
      var resp = await fetch(SUPABASE_URL + '/functions/v1/gh-respond-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({
          token: token,
          action: 'deactivate',
          status: status,
          reason: fullReason || null
        })
      });

      var data = await resp.json();

      if (data.success === false) {
        showError('Opt-Out Failed', data.error || 'Unable to process your request.');
        return;
      }

      showDeactivationConfirmation(status, data.applicant_name);
    } catch (err) {
      showError('Connection Error', 'Unable to process your request. Please try again.');
    }
  }

  function showDeactivationConfirmation(status, name) {
    var statusMsg = status === 'paused'
      ? 'Your profile has been paused. You won\'t receive outreach emails until you reactivate.'
      : 'You\'ve been removed from future outreach. Your profile is now closed.';

    container.innerHTML = `
      <div class="opp-confirmation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <path d="m9 11 3 3L22 4"/>
        </svg>
        <h3>Opt-Out Confirmed</h3>
        <p>${statusMsg}</p>
        <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);">You can reactivate anytime from your portal.</p>
        <a href="portal.html" class="btn btn-primary" style="display:inline-flex;padding:var(--space-3) var(--space-6);margin-top:var(--space-4);">Go to Portal</a>
      </div>
    `;
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

        <hr class="opp-separator">
        <a class="opp-optout-link" id="optout-link-responded">I'm no longer looking for opportunities</a>
        <div id="deactivation-container"></div>
      </div>
    `;

    document.getElementById('optout-link-responded').addEventListener('click', function(e) {
      e.preventDefault();
      this.style.display = 'none';
      var el = document.getElementById('deactivation-container');
      if (!el) return;
      el.innerHTML = buildDeactivationFormHtml();
      bindDeactivationForm(el);
    });
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
