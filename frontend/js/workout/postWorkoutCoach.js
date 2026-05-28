// frontend/js/workout/postWorkoutCoach.js
// Post-Workout AI Coach — genera y muestra el plan de feedback tras la sesión.
// Expuesto como window.PostWorkoutCoach (sin módulo ES, compatible con SPA vanilla).

(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function _apiBase() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || '/api/v1';
  }

  function _authHeaders() {
    const token =
      localStorage.getItem('hs_access_token') ||
      sessionStorage.getItem('hs_access_token');
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  }

  /** Escape HTML to prevent XSS from server-returned strings */
  function _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Category icons for tip categories */
  const CATEGORY_ICONS = {
    recovery:    '💤',
    technique:   '🎯',
    progression: '📈',
    nutrition:   '🥗',
    mindset:     '🧠',
  };

  /** Intensity badge colour class */
  function _intensityClass(intensity) {
    const i = (intensity || '').toLowerCase();
    if (i === 'light')    return 'pw-intensity-badge--light';
    if (i === 'hard')     return 'pw-intensity-badge--hard';
    return 'pw-intensity-badge--moderate'; // default / moderate
  }

  /** Intensity label (keep original capitalisation) */
  function _intensityLabel(intensity) {
    const map = { light: 'Ligero', moderate: 'Moderado', hard: 'Intenso' };
    return map[(intensity || '').toLowerCase()] || _esc(intensity);
  }

  // ─── Session-ID resolution ───────────────────────────────────────────────────
  // summary.js stores result.session_id in sessionStorage under 'hs_last_session_id'
  // after renderSummary(). If not present (offline / failed POST), generate a
  // client-side UUID and cache it keyed by the workout start timestamp.

  function _resolveSessionId() {
    // Preferred: UUID returned by the backend, stored by summary.js
    const stored = sessionStorage.getItem('hs_last_session_id');
    if (stored) return stored;

    // Fallback: generate and memoize a client UUID for this session
    const fallbackKey = 'hs_coaching_fallback_uuid';
    let fallback = sessionStorage.getItem(fallbackKey);
    if (!fallback) {
      fallback = crypto.randomUUID();
      sessionStorage.setItem(fallbackKey, fallback);
    }
    return fallback;
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────────────

  function _getBtn() {
    return document.getElementById('btn-get-ai-coaching');
  }

  function _getContainer() {
    // The coaching card lives right after the AI coach button
    const btn = _getBtn();
    if (!btn) return null;
    let container = document.getElementById('pw-coach-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pw-coach-container';
      btn.insertAdjacentElement('afterend', container);
    }
    return container;
  }

  // ─── Build coaching card HTML ─────────────────────────────────────────────────

  function _buildTipsHtml(tips) {
    if (!Array.isArray(tips) || tips.length === 0) return '';

    const items = tips.map(t => {
      const icon = CATEGORY_ICONS[(t.category || '').toLowerCase()] || '💡';
      const label = _esc(t.category || '');
      const text  = _esc(t.tip || '');
      return `<div class="pw-tip-item">
        <span class="pw-tip-icon" aria-hidden="true">${icon}</span>
        <div class="pw-tip-body">
          <span class="pw-tip-category">${label}</span>
          <p class="pw-tip-text">${text}</p>
        </div>
      </div>`;
    }).join('');

    return `<div class="pw-tips-section">
      <h4 class="pw-section-title">Consejos personalizados</h4>
      <div class="pw-tips-list">${items}</div>
    </div>`;
  }

  function _buildNextSessionHtml(next) {
    if (!next) return '';

    const focus       = _esc(next.focus || '');
    const exercises   = _esc(
      Array.isArray(next.suggested_exercises)
        ? next.suggested_exercises.join(', ')
        : (next.suggested_exercises || '')
    );
    const intensityClass = _intensityClass(next.intensity);
    const intensityLabel = _intensityLabel(next.intensity);
    const duration    = next.estimated_duration_min
      ? `<span class="pw-next-duration">⏱ ${_esc(String(next.estimated_duration_min))} min estimados</span>`
      : '';

    return `<div class="pw-next-session">
      <h4 class="pw-section-title">Próxima sesión sugerida</h4>
      <div class="pw-next-focus">
        <span class="pw-next-focus-label">Foco:</span>
        <span class="pw-next-focus-value">${focus}</span>
        <span class="pw-intensity-badge ${intensityClass}">${intensityLabel}</span>
      </div>
      ${exercises ? `<p class="pw-next-exercises"><strong>Ejercicios:</strong> ${exercises}</p>` : ''}
      ${duration}
    </div>`;
  }

  function _buildCardHtml(plan) {
    const summary     = _esc(plan.summary || '');
    const tipsHtml    = _buildTipsHtml(plan.tips);
    const nextHtml    = _buildNextSessionHtml(plan.next_session);
    const planId      = _esc(String(plan.plan_id || ''));

    return `<div class="pw-coach-card" data-plan-id="${planId}">
      <div class="pw-coach-header">
        <span class="pw-coach-badge">🤖 Coach IA</span>
        <button
          class="pw-dismiss-btn"
          aria-label="Cerrar feedback del coach"
          data-plan-id="${planId}"
        >✕</button>
      </div>

      <div class="pw-coach-summary">
        <p>${summary}</p>
      </div>

      ${tipsHtml}
      ${nextHtml}
    </div>`;
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  function renderCoachingCard(plan, container) {
    const target = container || _getContainer();
    if (!target) return;

    target.innerHTML = _buildCardHtml(plan);

    // Wire dismiss button
    const dismissBtn = target.querySelector('.pw-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        const id = dismissBtn.dataset.planId;
        window.PostWorkoutCoach.dismissPlan(id);
      });
    }
  }

  // ─── API calls ────────────────────────────────────────────────────────────────

  async function requestCoaching() {
    const btn = _getBtn();
    if (!btn) return;

    // Prevent double-submit
    if (btn.disabled) return;

    // Loading state
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="pw-btn-spinner" aria-hidden="true"></span> Generando feedback…`;

    try {
      const notes     = (document.getElementById('workout-session-notes')?.value || '').trim();
      const sessionId = _resolveSessionId();

      const resp = await fetch(`${_apiBase()}/workout/post-workout-coach`, {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify({ session_id: sessionId, notes: notes || null }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const plan = await resp.json();

      // Hide button after success (card replaces it)
      btn.style.display = 'none';

      renderCoachingCard(plan, _getContainer());
    } catch (err) {
      console.error('[PostWorkoutCoach] requestCoaching failed:', err);
      if (typeof showToast === 'function') {
        showToast('No se pudo obtener el feedback del coach.', 'error');
      }
      // Restore button so user can retry
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function dismissPlan(planId) {
    const card = document.querySelector(`.pw-coach-card[data-plan-id="${CSS.escape(planId)}"]`);

    try {
      const resp = await fetch(`${_apiBase()}/workout/post-workout-coach/dismiss`, {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // Fade out and remove
      if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity    = '0';
        card.style.transform  = 'translateY(-8px)';
        setTimeout(() => {
          card.remove();
          // Show button again so user can request a new plan
          const btn = _getBtn();
          if (btn) {
            btn.style.display = '';
            btn.disabled = false;
          }
        }, 320);
      }
    } catch (err) {
      console.error('[PostWorkoutCoach] dismissPlan failed:', err);
      if (typeof showToast === 'function') {
        showToast('No se pudo descartar el plan del coach.', 'error');
      }
    }
  }

  async function loadExistingPlan(sessionId, container) {
    // Silent background load — no toasts on failure
    try {
      const resp = await fetch(
        `${_apiBase()}/workout/post-workout-coach/${encodeURIComponent(sessionId)}`,
        { headers: _authHeaders() }
      );
      if (resp.status === 404) return; // No plan yet — expected
      if (!resp.ok) return;            // Other errors — fail silently

      const plan = await resp.json();
      renderCoachingCard(plan, container);

      // Hide the CTA button — card is already showing
      const btn = _getBtn();
      if (btn) btn.style.display = 'none';
    } catch {
      // Fail silently — this is background preloading
    }
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  window.PostWorkoutCoach = {
    requestCoaching,
    renderCoachingCard,
    dismissPlan,
    loadExistingPlan,
  };
})();
