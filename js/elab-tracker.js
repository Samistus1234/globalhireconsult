/* ============================================
   GLOBALHIRE — eLab Activity Tracker
   Sends admin actions to eLab Command Centre
   for unified staff performance analytics.
   ============================================ */

'use strict';

var ElabTracker = (function () {
  var ELAB_SUPABASE_URL = 'https://fwmhfwprvqaovidykaqt.supabase.co';
  var ELAB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3bWhmd3BydnFhb3ZpZHlrYXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzOTY2NTQsImV4cCI6MjA0ODk3MjY1NH0.TvIn_gTBMpGJSDBXLqG52T0j0KZqfiga3MQQNbOFnSM';

  var _queue = [];
  var _flushing = false;
  var _actorEmail = null;

  function init() {
    // Get current admin email from GHAuth
    if (typeof GHAuth !== 'undefined') {
      GHAuth.getUser().then(function (user) {
        if (user && user.email) _actorEmail = user.email;
      });
    }
    // Flush queue every 10 seconds
    setInterval(flush, 10000);
    // Flush on page unload
    window.addEventListener('beforeunload', flush);
  }

  function track(actionType, actionCategory, metadata) {
    if (!_actorEmail) return;
    _queue.push({
      actor_email: _actorEmail,
      action_type: actionType,
      action_category: actionCategory || 'medium_value',
      metadata: metadata || {},
      occurred_at: new Date().toISOString()
    });
    // Flush immediately for important actions
    if (actionCategory === 'high_value') flush();
  }

  function flush() {
    if (_flushing || _queue.length === 0) return;
    _flushing = true;
    var batch = _queue.splice(0, _queue.length);

    fetch(ELAB_SUPABASE_URL + '/rest/v1/rpc/ingest_globalhire_action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ELAB_ANON_KEY,
        'Authorization': 'Bearer ' + ELAB_ANON_KEY
      },
      body: JSON.stringify(batch[0]) // RPC takes single call
    }).catch(function () {
      // Put back on queue on failure
      _queue.unshift.apply(_queue, batch);
    }).finally(function () {
      _flushing = false;
      // If more than 1, send remaining
      if (batch.length > 1) {
        batch.slice(1).forEach(function (item) { _queue.push(item); });
        setTimeout(flush, 100);
      }
    });
  }

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { track: track, flush: flush };
})();

window.ElabTracker = ElabTracker;
