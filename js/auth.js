/* ============================================
   GLOBALHIRE@ELAB — Auth JS
   Login/Signup form logic, multi-step stepper
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // Ensure supabase client is available
  var sb = window.ghSupabase;
  if (!sb || !sb.auth) {
    console.error('Supabase client not initialized. sb=', sb);
    return;
  }

  // ── LOGIN FORM ──
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const alertBox = document.getElementById('login-alert');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';

      const email = emailInput.value.trim();
      const password = passInput.value;

      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      if (error) {
        alertBox.textContent = error.message;
        alertBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
        return;
      }

      // Fetch role for redirect
      const { data: profile } = await ghFrom('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      var redirectParam = new URLSearchParams(window.location.search).get('redirect');
      if (profile && profile.role === 'admin') {
        window.location.href = 'dashboard.html';
      } else if (profile && profile.role === 'recruiter') {
        window.location.href = 'recruiter.html';
      } else if (redirectParam) {
        window.location.href = redirectParam;
      } else {
        window.location.href = 'portal.html';
      }
    });
  }

  // ── SIGNUP STEPPER ──
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    const steps = document.querySelectorAll('.step-content');
    const indicators = document.querySelectorAll('.step-indicator');
    const alertBox = document.getElementById('signup-alert');
    let currentStep = 0;

    function showStep(index) {
      steps.forEach((s, i) => {
        s.classList.toggle('active', i === index);
      });
      indicators.forEach((ind, i) => {
        ind.classList.remove('active', 'completed');
        if (i < index) ind.classList.add('completed');
        if (i === index) ind.classList.add('active');
      });
      currentStep = index;
    }

    function validateStep(index) {
      alertBox.style.display = 'none';
      const step = steps[index];
      const required = step.querySelectorAll('[required]');
      for (const input of required) {
        if (!input.value.trim()) {
          input.focus();
          alertBox.textContent = 'Please fill in all required fields.';
          alertBox.style.display = 'block';
          return false;
        }
      }

      // Step 0: password validation
      if (index === 0) {
        const pass = document.getElementById('signup-password').value;
        if (pass.length < 6) {
          alertBox.textContent = 'Password must be at least 6 characters.';
          alertBox.style.display = 'block';
          return false;
        }
      }

      return true;
    }

    // Next buttons
    document.querySelectorAll('.btn-next').forEach(btn => {
      btn.addEventListener('click', () => {
        if (validateStep(currentStep)) {
          showStep(currentStep + 1);
        }
      });
    });

    // Back buttons
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        showStep(currentStep - 1);
      });
    });

    // Final submit
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateStep(currentStep)) return;

      alertBox.style.display = 'none';
      const submitBtn = signupForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Creating account...';

      const fullName = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;

      try {
        // Sign up
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin + '/login.html'
          }
        });

        if (error) {
          alertBox.textContent = error.message;
          alertBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Create Account';
          return;
        }

        // If no session and no user, the email may already exist
        if (!data.session && !data.user) {
          alertBox.textContent = 'An account with this email may already exist. Try logging in instead.';
          alertBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Create Account';
          return;
        }

        // Check if we got a session (email auto-confirmed)
        if (!data.session) {
          alertBox.textContent = 'Account created! Please check your email to confirm, then log in.';
          alertBox.style.display = 'block';
          alertBox.style.background = 'rgba(0,119,182,0.1)';
          alertBox.style.borderColor = 'var(--primary)';
          alertBox.style.color = 'var(--primary)';
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Create Account';
          return;
        }

        // Wait for profile trigger to fire
        await new Promise(r => setTimeout(r, 1500));

        // Update profile with professional details
        const specialty = document.getElementById('signup-specialty').value;
        const country = document.getElementById('signup-country').value;
        const experience = parseInt(document.getElementById('signup-experience').value) || 0;
        const license = document.getElementById('signup-license').value.trim();
        const phone = document.getElementById('signup-phone').value.trim();

        // Get preferred destinations
        const destinations = [];
        document.querySelectorAll('.dest-checkbox:checked').forEach(cb => {
          destinations.push(cb.value);
        });

        const initials = fullName.split(' ')
          .map(w => w[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);

        const profileData = {
          full_name: fullName,
          phone: phone || null,
          specialty: specialty || null,
          country_of_origin: country || null,
          years_of_experience: experience,
          license_number: license || null,
          preferred_destinations: destinations,
          avatar_initials: initials,
          profile_completed: !!(specialty && country && phone)
        };

        const { error: profileError } = await ghFrom('profiles')
          .update(profileData)
          .eq('id', data.user.id);

        if (profileError) {
          console.error('Profile update error:', profileError);
        }

        var redirectParam = new URLSearchParams(window.location.search).get('redirect');
        window.location.href = redirectParam || 'portal.html';

      } catch (err) {
        console.error('Signup error:', err);
        alertBox.textContent = err.message || 'Something went wrong. Please try again.';
        alertBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Account';
      }
    });

    // Show first step
    showStep(0);
  }

  // ── FORGOT PASSWORD ──
  const forgotLink = document.getElementById('forgot-password-link');
  const forgotModal = document.getElementById('forgot-modal');
  if (forgotLink && forgotModal) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      forgotModal.classList.add('visible');
    });

    document.getElementById('forgot-close')?.addEventListener('click', () => {
      forgotModal.classList.remove('visible');
    });

    document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      const btn = e.target.querySelector('button[type="submit"]');
      const msg = document.getElementById('forgot-message');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login.html'
      });

      msg.textContent = error
        ? error.message
        : 'Password reset link sent! Check your email.';
      msg.style.color = error ? 'var(--error)' : 'var(--success)';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Send Reset Link';
    });
  }
});
