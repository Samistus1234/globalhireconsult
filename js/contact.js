/* ============================================
   GLOBALHIRE@ELAB — Contact Form Handling
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var name = document.getElementById('contact-name').value.trim();
      var email = document.getElementById('contact-email').value.trim();
      var type = document.getElementById('contact-type').value;
      var subject = document.getElementById('contact-subject').value.trim();
      var message = document.getElementById('contact-message').value.trim();
      var feedback = document.getElementById('contact-feedback');
      var submitBtn = document.getElementById('contact-submit');

      // Basic validation
      if (!name || !email || !type || !subject || !message) {
        showFeedback(feedback, 'Please fill in all fields.', 'error');
        return;
      }

      if (!isValidEmail(email)) {
        showFeedback(feedback, 'Please enter a valid email address.', 'error');
        return;
      }

      // Disable button
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      // Simulate submission (replace with actual API call)
      setTimeout(function() {
        showFeedback(feedback, 'Thank you! Your message has been sent. We will respond within 24 hours.', 'success');
        form.reset();
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Send Message <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      }, 1500);
    });
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showFeedback(el, message, type) {
    el.style.display = 'block';
    el.className = type === 'success' ? 'callout' : 'callout';
    el.style.borderLeftColor = type === 'success' ? 'var(--primary)' : 'var(--accent-coral)';
    el.innerHTML = '<div class="callout-content"><p style="color:var(--text-primary);margin:0">' + message + '</p></div>';

    if (type === 'success') {
      setTimeout(function() {
        el.style.display = 'none';
      }, 8000);
    }
  }
})();
