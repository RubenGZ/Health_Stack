// frontend/js/workout/nextSessionPreloader.js
// Silent preloader for post-workout coaching plans from previous sessions.
// On page load, checks if a coaching plan from the last session exists
// and preloads it into the summary screen if visible.
// Exposed as window.NextSessionPreloader.

(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Find the container where the coaching card should be rendered.
   * Priority: #pw-coach-container (already exists), else after #btn-get-ai-coaching.
   */
  function _findCoachingContainer() {
    let container = document.getElementById('pw-coach-container');
    if (container) return container;

    const btn = document.getElementById('btn-get-ai-coaching');
    if (!btn) return null;

    container = document.createElement('div');
    container.id = 'pw-coach-container';
    btn.insertAdjacentElement('afterend', container);
    return container;
  }

  /**
   * Check if the summary screen is currently visible.
   * Look for the summary container or the AI coach button.
   */
  function _isSummaryVisible() {
    const btn = document.getElementById('btn-get-ai-coaching');
    if (!btn) return false;

    // Button exists and is not hidden
    return btn.style.display !== 'none';
  }

  /**
   * Store pending plan data in sessionStorage for later display.
   */
  function _storePendingPlan(sessionId) {
    sessionStorage.setItem('hs_pending_coach_plan', sessionId);
  }

  /**
   * Retrieve pending plan data from sessionStorage.
   */
  function _getPendingPlan() {
    return sessionStorage.getItem('hs_pending_coach_plan');
  }

  /**
   * Clear pending plan from sessionStorage.
   */
  function _clearPendingPlan() {
    sessionStorage.removeItem('hs_pending_coach_plan');
  }

  // ─── Main Logic ─────────────────────────────────────────────────────────────

  /**
   * Called once on page load.
   * If there's a last session ID in sessionStorage, attempt to load its coaching plan.
   */
  async function init() {
    const sessionId = sessionStorage.getItem('hs_last_session_id');
    if (!sessionId) return;

    // Always clear the session ID so it only loads once
    sessionStorage.removeItem('hs_last_session_id');

    // Check if PostWorkoutCoach is available
    if (!window.PostWorkoutCoach?.loadExistingPlan) return;

    // Check if summary screen is visible
    if (_isSummaryVisible()) {
      // Load immediately into the coaching container
      const container = _findCoachingContainer();
      if (container) {
        await window.PostWorkoutCoach.loadExistingPlan(sessionId, container);
      }
    } else {
      // Summary not visible yet — store for later
      _storePendingPlan(sessionId);
    }
  }

  /**
   * Called when the workout section becomes visible (e.g., tab change).
   * If there's a pending plan, load it now.
   */
  async function onWorkoutSectionVisible() {
    const pendingSessionId = _getPendingPlan();
    if (!pendingSessionId) return;

    if (!window.PostWorkoutCoach?.loadExistingPlan) return;

    _clearPendingPlan();

    const container = _findCoachingContainer();
    if (container) {
      await window.PostWorkoutCoach.loadExistingPlan(pendingSessionId, container);
    }
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  window.NextSessionPreloader = {
    init,
    onWorkoutSectionVisible,
  };
})();
