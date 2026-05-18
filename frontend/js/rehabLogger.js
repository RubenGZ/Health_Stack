/**
 * rehabLogger.js — Cuestionario de Rehabilitación (3 pasos)
 *
 * Muestra un wizard de 3 pasos para capturar:
 *   1. Zona corporal afectada
 *   2. Tipo de lesión + nivel de dolor
 *   3. Tiempo desde la lesión + notas
 *
 * Llama a POST /api/v1/rehab/protocol y renderiza el protocolo resultante.
 * Freemium: los usuarios Free ven presets; Pro/Elite ven protocolos AI.
 *
 * AVISO LEGAL: Los protocolos son orientativos — no son prescripción médica.
 */

const RehabLogger = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || '/api/v1';

  const BODY_AREAS = [
    { value: 'shoulder',    label: 'Hombro',       emoji: '💪' },
    { value: 'elbow',       label: 'Codo',          emoji: '🦾' },
    { value: 'wrist',       label: 'Muñeca',        emoji: '🤚' },
    { value: 'lower_back',  label: 'Zona lumbar',   emoji: '🔙' },
    { value: 'hip',         label: 'Cadera',        emoji: '🦴' },
    { value: 'knee',        label: 'Rodilla',       emoji: '🦵' },
    { value: 'ankle',       label: 'Tobillo',       emoji: '🦶' },
    { value: 'neck',        label: 'Cuello',        emoji: '🧠' },
    { value: 'thoracic',    label: 'Zona dorsal',   emoji: '🏋' },
  ];

  const INJURY_TYPES = [
    { value: 'tendinopathy',  label: 'Tendinitis / tendinopatía', emoji: '🔥' },
    { value: 'muscle_strain', label: 'Desgarro muscular',         emoji: '⚡' },
    { value: 'joint_sprain',  label: 'Esguince',                  emoji: '🌀' },
    { value: 'overuse',       label: 'Sobrecarga',                emoji: '📈' },
    { value: 'post_surgery',  label: 'Post-operatorio',           emoji: '🏥' },
    { value: 'general_pain',  label: 'Dolor inespecífico',        emoji: '❓' },
  ];

  // ── Estado ────────────────────────────────────────────────────────────────
  let _currentStep = 0;
  let _answers = {};
  let _containerId = null;
  let _onResult = null;

  // ── Paso 1: zona corporal ──────────────────────────────────────────────────
  function _renderStep1(container) {
    container.innerHTML = `
      <div class="rehab-step">
        <div class="rehab-step-header">
          <span class="rehab-step-emoji">📍</span>
          <h3 class="rehab-step-title">¿Qué zona te duele?</h3>
          <p class="rehab-step-sub">Selecciona la zona principal afectada.</p>
        </div>
        <div class="rehab-options rehab-options--grid">
          ${BODY_AREAS.map(a => `
            <button class="rehab-opt${_answers.body_area === a.value ? ' selected' : ''}"
                    data-val="${a.value}" data-type="area">
              <span class="rehab-opt-emoji">${a.emoji}</span>
              <span class="rehab-opt-label">${a.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    container.querySelectorAll('[data-type="area"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _answers.body_area = btn.dataset.val;
        container.querySelectorAll('[data-type="area"]')
          .forEach(b => b.classList.toggle('selected', b.dataset.val === btn.dataset.val));
      });
    });
  }

  // ── Paso 2: tipo de lesión + nivel de dolor ────────────────────────────────
  function _renderStep2(container) {
    container.innerHTML = `
      <div class="rehab-step">
        <div class="rehab-step-header">
          <span class="rehab-step-emoji">🩺</span>
          <h3 class="rehab-step-title">¿Qué tipo de lesión tienes?</h3>
          <p class="rehab-step-sub">Si no estás seguro, elige "Dolor inespecífico".</p>
        </div>
        <div class="rehab-options">
          ${INJURY_TYPES.map(t => `
            <button class="rehab-opt${_answers.injury_type === t.value ? ' selected' : ''}"
                    data-val="${t.value}" data-type="injury">
              <span class="rehab-opt-emoji">${t.emoji}</span>
              <span class="rehab-opt-label">${t.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="rehab-pain-row">
          <label class="rehab-pain-label">
            Nivel de dolor actual
            <span class="rehab-pain-value" id="rehab-pain-display">${_answers.pain_level ?? 5}</span>/10
          </label>
          <input type="range" id="rehab-pain-slider" class="rehab-pain-slider"
                 min="1" max="10" step="1" value="${_answers.pain_level ?? 5}">
          <div class="rehab-pain-scale">
            <span>Sin dolor</span><span>Máximo</span>
          </div>
        </div>
      </div>
    `;
    container.querySelectorAll('[data-type="injury"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _answers.injury_type = btn.dataset.val;
        container.querySelectorAll('[data-type="injury"]')
          .forEach(b => b.classList.toggle('selected', b.dataset.val === btn.dataset.val));
      });
    });
    const slider = container.querySelector('#rehab-pain-slider');
    const display = container.querySelector('#rehab-pain-display');
    _answers.pain_level = parseInt(slider.value, 10);
    slider.addEventListener('input', () => {
      _answers.pain_level = parseInt(slider.value, 10);
      display.textContent = slider.value;
    });
  }

  // ── Paso 3: tiempo + notas ─────────────────────────────────────────────────
  function _renderStep3(container) {
    container.innerHTML = `
      <div class="rehab-step">
        <div class="rehab-step-header">
          <span class="rehab-step-emoji">📅</span>
          <h3 class="rehab-step-title">¿Cuándo ocurrió?</h3>
          <p class="rehab-step-sub">Esto ayuda a adaptar el protocolo a tu fase de recuperación.</p>
        </div>
        <div class="rehab-field">
          <label class="rehab-field-label" for="rehab-weeks">Semanas desde la lesión</label>
          <div class="rehab-input-row">
            <input type="number" id="rehab-weeks" class="form-input rehab-input"
                   min="0" max="104" value="${_answers.weeks_since_injury ?? 1}" placeholder="1">
            <span class="rehab-input-unit">semanas</span>
          </div>
        </div>
        <div class="rehab-field">
          <label class="rehab-field-label" for="rehab-notes">
            Notas adicionales <span class="rehab-optional">(opcional)</span>
          </label>
          <textarea id="rehab-notes" class="form-input rehab-textarea"
                    rows="3" maxlength="500"
                    placeholder="Cirugía previa, tratamientos, limitaciones específicas...">${_answers.notes ?? ''}</textarea>
        </div>
        <div class="rehab-disclaimer-box">
          ⚠️ El protocolo generado es orientativo. No reemplaza la valoración
          de un fisioterapeuta o médico cualificado.
        </div>
      </div>
    `;
    const weeksInput = container.querySelector('#rehab-weeks');
    const notesInput = container.querySelector('#rehab-notes');
    weeksInput.addEventListener('change', () => {
      _answers.weeks_since_injury = Math.max(0, parseInt(weeksInput.value, 10) || 0);
    });
    notesInput.addEventListener('input', () => {
      _answers.notes = notesInput.value.trim() || null;
    });
    _answers.weeks_since_injury = parseInt(weeksInput.value, 10) || 1;
  }

  // ── Validar paso actual ────────────────────────────────────────────────────
  function _validate() {
    if (_currentStep === 0 && !_answers.body_area) {
      _shake(); return false;
    }
    if (_currentStep === 1 && !_answers.injury_type) {
      _shake(); return false;
    }
    return true;
  }

  function _shake() {
    const container = document.getElementById(_containerId);
    const opts = container?.querySelector('.rehab-options');
    if (!opts) return;
    opts.classList.add('rehab-shake');
    setTimeout(() => opts.classList.remove('rehab-shake'), 500);
  }

  // ── Render del wizard ──────────────────────────────────────────────────────
  function _renderWizard(container) {
    container.innerHTML = `
      <div class="rehab-wizard">
        <div class="rehab-wizard-progress">
          <div class="rehab-wizard-bar">
            <div class="rehab-wizard-fill" id="rehab-prog-fill"
                 style="width: ${Math.round((_currentStep + 1) / 3 * 100)}%"></div>
          </div>
          <span class="rehab-wizard-label">Paso ${_currentStep + 1} de 3</span>
        </div>
        <div class="rehab-wizard-body" id="rehab-step-body"></div>
        <div class="rehab-wizard-footer">
          <button class="btn btn--ghost" id="rehab-prev-btn"
                  style="visibility: ${_currentStep === 0 ? 'hidden' : 'visible'}">
            ← Atrás
          </button>
          <button class="btn btn--primary" id="rehab-next-btn">
            ${_currentStep === 2 ? 'Generar protocolo 🏥' : 'Continuar →'}
          </button>
        </div>
      </div>
    `;

    const body = container.querySelector('#rehab-step-body');
    if (_currentStep === 0) _renderStep1(body);
    else if (_currentStep === 1) _renderStep2(body);
    else _renderStep3(body);

    container.querySelector('#rehab-prev-btn')?.addEventListener('click', () => {
      if (_currentStep > 0) { _currentStep--; _renderWizard(container); }
    });
    container.querySelector('#rehab-next-btn')?.addEventListener('click', async () => {
      if (!_validate()) return;
      if (_currentStep < 2) {
        _currentStep++;
        _renderWizard(container);
      } else {
        await _submit(container);
      }
    });
  }

  // ── Llamada a la API ───────────────────────────────────────────────────────
  async function _submit(container) {
    const btn = container.querySelector('#rehab-next-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

    const token = (typeof API !== 'undefined' && API.getToken?.())
      || localStorage.getItem('hs_access_token')
      || localStorage.getItem('access_token');

    const payload = {
      injury_type:         _answers.injury_type     || 'general_pain',
      body_area:           _answers.body_area        || 'lower_back',
      pain_level:          _answers.pain_level       ?? 5,
      weeks_since_injury:  _answers.weeks_since_injury ?? 1,
      notes:               _answers.notes            || null,
    };

    try {
      const res = await fetch(`${BASE}/rehab/protocol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const protocol = await res.json();
      _renderResult(container, protocol);
      if (typeof _onResult === 'function') _onResult(protocol);

    } catch (err) {
      container.innerHTML = `
        <div class="rehab-error">
          <span class="rehab-error-icon">⚠️</span>
          <p>No se pudo generar el protocolo: ${err.message}</p>
          <button class="btn btn--ghost" id="rehab-retry-btn">Reintentar</button>
        </div>
      `;
      container.querySelector('#rehab-retry-btn')?.addEventListener('click', () => {
        _currentStep = 0;
        _renderWizard(container);
      });
    }
  }

  // ── Render del resultado ───────────────────────────────────────────────────
  function _renderResult(container, protocol) {
    const tierBadge = protocol.is_ai_generated
      ? '<span class="rehab-badge rehab-badge--pro">✨ IA Personalizado</span>'
      : '<span class="rehab-badge rehab-badge--free">📋 Protocolo Estándar</span>';

    const phasesHtml = protocol.phases.map((phase, pi) => `
      <div class="rehab-phase">
        <div class="rehab-phase-header">
          <span class="rehab-phase-num">${pi + 1}</span>
          <div>
            <div class="rehab-phase-name">${phase.phase_name}</div>
            <div class="rehab-phase-meta">
              ${phase.duration_weeks} semana${phase.duration_weeks !== 1 ? 's' : ''} —
              ${phase.goal}
            </div>
          </div>
        </div>
        ${phase.precautions?.length ? `
          <div class="rehab-precautions">
            ${phase.precautions.map(p => `<div class="rehab-precaution">⚠️ ${p}</div>`).join('')}
          </div>` : ''}
        <div class="rehab-exercises">
          ${phase.exercises.map(ex => `
            <div class="rehab-exercise">
              <div class="rehab-exercise-name">${ex.name}</div>
              <div class="rehab-exercise-desc">${ex.description}</div>
              <div class="rehab-exercise-meta">
                ${ex.sets ? `${ex.sets} series` : ''}
                ${ex.sets && ex.reps ? ' × ' : ''}
                ${ex.reps ? ex.reps : ''}
                ${ex.rest_seconds ? ` · ${ex.rest_seconds}s descanso` : ''}
                ${ex.frequency_per_week ? ` · ${ex.frequency_per_week}×/semana` : ''}
              </div>
              ${ex.progression_note ? `
                <div class="rehab-progression">
                  📈 ${ex.progression_note}
                </div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const redFlagsHtml = protocol.red_flags?.length ? `
      <div class="rehab-red-flags">
        <div class="rehab-red-flags-title">🚨 Consulta médica urgente si:</div>
        ${protocol.red_flags.map(f => `<div class="rehab-red-flag">• ${f}</div>`).join('')}
      </div>` : '';

    container.innerHTML = `
      <div class="rehab-result">
        <div class="rehab-result-header">
          <div class="rehab-result-title-row">
            <h3 class="rehab-result-title">${protocol.title}</h3>
            ${tierBadge}
          </div>
          <p class="rehab-result-meta">
            ${protocol.phases.length} fases ·
            ${protocol.phases.reduce((a, p) => a + p.duration_weeks, 0)} semanas totales
          </p>
        </div>

        <div class="rehab-phases">${phasesHtml}</div>

        ${protocol.general_advice ? `
          <div class="rehab-advice">
            <div class="rehab-advice-icon">💡</div>
            <p>${protocol.general_advice}</p>
          </div>` : ''}

        ${redFlagsHtml}

        <div class="rehab-legal-disclaimer">
          ${protocol.disclaimer}
        </div>

        <div class="rehab-result-footer">
          <button class="btn btn--ghost btn--sm" id="rehab-restart-btn">
            ← Nuevo protocolo
          </button>
          ${!protocol.is_ai_generated && protocol.tier === 'free' ? `
            <div class="rehab-upgrade-hint">
              ✨ <strong>Pro</strong>: genera protocolos personalizados con IA para tu perfil y historial.
            </div>` : ''}
        </div>
      </div>
    `;

    container.querySelector('#rehab-restart-btn')?.addEventListener('click', () => {
      _currentStep = 0;
      _answers = {};
      _renderWizard(container);
    });
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /**
   * Monta el widget de rehabilitación en un contenedor HTML.
   *
   * @param {string|HTMLElement} target  - ID del contenedor o el elemento directamente.
   * @param {object}             opts    - Opciones: { onResult(protocol) }
   */
  function mount(target, opts = {}) {
    const container = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!container) {
      console.error('[RehabLogger] Contenedor no encontrado:', target);
      return;
    }
    _containerId = container.id;
    _onResult    = opts.onResult || null;
    _currentStep = 0;
    _answers     = {};
    _renderWizard(container);
  }

  /**
   * Muestra los presets disponibles en un contenedor.
   * Útil para mostrar un listado en la sección de rehab.
   */
  async function renderPresetList(target) {
    const container = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!container) return;

    container.innerHTML = '<div class="rehab-loading">Cargando protocolos…</div>';
    try {
      const res = await fetch(`${BASE}/rehab/presets`);
      const presets = await res.json();

      if (!presets.length) {
        container.innerHTML = '<p class="rehab-empty">No hay protocolos disponibles.</p>';
        return;
      }

      container.innerHTML = `
        <div class="rehab-preset-list">
          ${presets.map(p => `
            <div class="rehab-preset-card">
              <div class="rehab-preset-title">${p.title}</div>
              <div class="rehab-preset-meta">
                ${p.phases_count} fases · ${p.total_weeks} semanas
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch {
      container.innerHTML = '<p class="rehab-empty">Error al cargar protocolos.</p>';
    }
  }

  return { mount, renderPresetList };
})();

// Exponer globalmente para uso desde el HTML
if (typeof window !== 'undefined') {
  window.RehabLogger = RehabLogger;
}
