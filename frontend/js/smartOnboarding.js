/* ============================================================
   smartOnboarding.js — Wizard inteligente de onboarding v2
   7 pasos: consentimiento RGPD, objetivo, trabajo+pasos, deportes,
   fuerza, composición corporal, alimentación.
   Preview TDEE dinámico (Mifflin local) en pasos 1-3.
   Sincroniza con POST /api/v1/auth/onboarding-v2.
   ============================================================ */

const SmartOnboarding = (function () {
  'use strict';

  const LS_FLAG    = 'hs_smart_onboarded';
  const LS_ANSWERS = 'hs_smart_ob_answers';
  const LS_STEP    = 'hs_smart_ob_step';

  // ── NEAT factors (Mifflin local preview) ─────────────────
  const NEAT = {
    desk:     { lt4k: 1.20, '4k7k': 1.30, '7k10k': 1.40, gt10k: 1.45 },
    remote:   { lt4k: 1.20, '4k7k': 1.30, '7k10k': 1.40, gt10k: 1.45 },
    standing: { lt4k: 1.35, '4k7k': 1.45, '7k10k': 1.50, gt10k: 1.55 },
    physical: { lt4k: 1.55, '4k7k': 1.60, '7k10k': 1.65, gt10k: 1.70 },
    none:     { lt4k: 1.20, '4k7k': 1.30, '7k10k': 1.40, gt10k: 1.45 },
  };

  const GOAL_MAP = {
    lose_fat: 'Perder grasa', maintain: 'Mantenerme',
    gain_muscle: 'Ganar músculo', increase_strength: 'Aumentar fuerza',
  };

  let answers = {};
  let currentStep = 0;
  let sports = []; // [{sport, days_per_week, duration_min, intensity}]

  // ── Init ─────────────────────────────────────────────────
  function init() {
    // Solo mostrar si hay token (usuario registrado) y no completó v2
    const token = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token');
    if (!token) return;
    if (localStorage.getItem(LS_FLAG) === '1') return;

    // Intentar recuperar progreso guardado (incl. sports para no perder datos al reabrir)
    try {
      const saved = localStorage.getItem(LS_ANSWERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        sports = Array.isArray(parsed._sports) ? parsed._sports : [];
        answers = parsed;
        delete answers._sports; // mantener answers limpio
      }
      const savedStep = parseInt(localStorage.getItem(LS_STEP) || '0', 10);
      currentStep = isNaN(savedStep) ? 0 : savedStep;
    } catch (_) { answers = {}; sports = []; currentStep = 0; }

    // Iniciar en siguiente frame para no bloquear el render inicial
    requestAnimationFrame(render);
  }

  // ── Preview TDEE ─────────────────────────────────────────
  function previewTDEE() {
    const user = JSON.parse(localStorage.getItem('hs_user') || '{}');
    const w = parseFloat(user.current_weight_kg || 70);
    const h = parseFloat(user.height_cm || 170);
    const sex = user.biological_sex || 'male';
    const birth = user.birth_date;
    let age = 30;
    if (birth) {
      const b = new Date(birth);
      const today = new Date();
      age = today.getFullYear() - b.getFullYear();
    }
    const tmb = 10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161);
    const work = answers.work_type || 'desk';
    const steps = answers.daily_steps_range || 'lt4k';
    const neat = (NEAT[work] || NEAT.desk)[steps] || 1.30;
    return Math.round(tmb * neat);
  }

  // ── Guardar respuestas en localStorage (cada paso) ───────
  function saveProgress() {
    try {
      // Persiste sports junto con answers para sobrevivir recargas/reaperturas
      localStorage.setItem(LS_ANSWERS, JSON.stringify({ ...answers, _sports: sports }));
      localStorage.setItem(LS_STEP, String(currentStep));
    } catch (_) {}
  }

  // ── Telemetría por paso ───────────────────────────────────
  function telemetry(stepName) {
    if (typeof window._sendTelemetryEvent === 'function') {
      window._sendTelemetryEvent('onboarding_step_completado', { step: stepName });
    }
  }

  // ── Render principal ──────────────────────────────────────
  function render() {
    if (document.getElementById('smart-ob-overlay')) return; // ya existe

    const overlay = document.createElement('div');
    overlay.id = 'smart-ob-overlay';
    overlay.className = 'smart-ob-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Configuración de perfil');

    overlay.innerHTML = `
      <div class="smart-ob-modal">
        <div class="smart-ob-header">
          <div class="smart-ob-brand">
            <img src="/icons/logo-icon-white.svg" alt="HealthStack" width="24" height="24">
            <span>HealthStack Pro</span>
          </div>
          <button class="smart-ob-skip" id="smart-ob-skip-btn" aria-label="Completar más tarde">
            Completar después →
          </button>
        </div>
        <div class="smart-ob-progress-wrap">
          <div class="smart-ob-progress-bar" id="smart-ob-progress"></div>
          <p class="smart-ob-step-label" id="smart-ob-step-label"></p>
        </div>
        <div class="smart-ob-body" id="smart-ob-body"></div>
        <div class="smart-ob-footer">
          <button class="smart-ob-btn-secondary" id="smart-ob-back" style="display:none">← Atrás</button>
          <button class="smart-ob-btn-primary" id="smart-ob-next">Continuar →</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('smart-ob-skip-btn').addEventListener('click', skipWizard);
    document.getElementById('smart-ob-back').addEventListener('click', prevStep);
    document.getElementById('smart-ob-next').addEventListener('click', nextStep);

    renderStep();
  }

  // ── Renderizar el paso actual ────────────────────────────
  function renderStep() {
    const overlay = document.getElementById('smart-ob-overlay');
    if (!overlay) return;

    const TOTAL = 7;
    const progress = document.getElementById('smart-ob-progress');
    const label    = document.getElementById('smart-ob-step-label');
    const body     = document.getElementById('smart-ob-body');
    const nextBtn  = document.getElementById('smart-ob-next');
    const backBtn  = document.getElementById('smart-ob-back');

    if (progress) progress.style.width = `${((currentStep + 1) / TOTAL) * 100}%`;
    if (label) label.textContent = `Paso ${currentStep + 1} de ${TOTAL}`;
    if (backBtn) backBtn.style.display = currentStep > 0 ? '' : 'none';
    if (nextBtn) nextBtn.textContent = currentStep === TOTAL - 1 ? 'Ver mi análisis →' : 'Continuar →';

    // Mostrar/ocultar skip desde paso 1+
    const skipBtn = document.getElementById('smart-ob-skip-btn');
    if (skipBtn) skipBtn.style.display = currentStep >= 1 ? '' : 'none';

    if (!body) return;

    switch (currentStep) {
      case 0: body.innerHTML = renderConsent(); break;
      case 1: body.innerHTML = renderWork(); break;
      case 2: body.innerHTML = renderSports(); break;
      case 3: body.innerHTML = renderStrength(); break;
      case 4: body.innerHTML = renderBodyComp(); break;
      case 5: body.innerHTML = renderEating(); break;
      case 6: body.innerHTML = renderSummaryPreview(); break;
    }

    attachStepListeners();
    updatePreviewTDEE();
  }

  // ── PASO 0: Consentimiento RGPD ──────────────────────────
  function renderConsent() {
    return `
      <div class="smart-ob-step">
        <h2 class="smart-ob-title">Análisis metabólico personalizado</h2>
        <p class="smart-ob-subtitle">En 2 minutos calculamos tu TDEE real con IA, igual que haría un nutricionista deportivo.</p>
        <div class="smart-ob-consent-box">
          <label class="smart-ob-consent-label">
            <input type="checkbox" id="ob-consent-check" ${answers.ai_consent ? 'checked' : ''}>
            <span>
              Quiero que la IA analice mis datos para darme un plan más preciso
            </span>
          </label>
        </div>
        <div class="smart-ob-consent-details">
          <p>🔒 <strong>Tus datos viajan cifrados</strong> — solo números (edad, peso, altura…), nunca tu nombre ni email. Los procesa <strong>Groq Inc.</strong> para generar tu análisis y luego se descartan.</p>
          <p>🗑️ Puedes <strong>retirar este permiso cuando quieras</strong> desde Ajustes › Privacidad. Al hacerlo, borramos tu perfil IA al instante.</p>
          <p>📋 Cumple el Reglamento Europeo de Protección de Datos (RGPD).</p>
        </div>
        <p class="smart-ob-consent-note">
          Si prefieres no activarlo, calculamos tu plan con una fórmula estándar, sin enviar nada fuera de tu dispositivo.
        </p>
        <div class="smart-ob-tdee-preview" id="ob-tdee-preview" style="display:none"></div>
      </div>`;
  }

  // ── PASO 1: Trabajo + pasos ───────────────────────────────
  function renderWork() {
    const w = answers.work_type || '';
    const s = answers.daily_steps_range || '';
    return `
      <div class="smart-ob-step">
        <h2 class="smart-ob-title">¿Cómo es tu día a día?</h2>
        <p class="smart-ob-subtitle">El trabajo y los pasos son el mayor componente de tu metabolismo.</p>
        <div class="smart-ob-tdee-preview" id="ob-tdee-preview"></div>
        <p class="smart-ob-field-label">Tipo de trabajo principal</p>
        <div class="smart-ob-options" id="ob-work-options">
          ${[
            ['desk',     '🖥️', 'Escritorio / Oficina', 'Sentado la mayor parte del día'],
            ['remote',   '🏠', 'Remoto / Casa',         'Trabajo desde casa, poco movimiento'],
            ['standing', '🏪', 'De pie',                'Tiendas, hostelería, enfermería'],
            ['physical', '🏗️', 'Trabajo físico',        'Construcción, reparto, agricultura'],
            ['none',     '📚', 'Sin trabajo / Estudiante', 'Activo principalmente fuera del trabajo'],
          ].map(([v, e, l, h]) => `
            <button class="smart-ob-option ${w === v ? 'selected' : ''}" data-field="work_type" data-value="${v}">
              <span class="smart-ob-option-emoji">${e}</span>
              <strong>${l}</strong>
              <small>${h}</small>
            </button>`).join('')}
        </div>
        <p class="smart-ob-field-label" style="margin-top:16px">Pasos diarios habituales</p>
        <div class="smart-ob-options smart-ob-options-2col" id="ob-steps-options">
          ${[
            ['lt4k',   '< 4.000',        'Muy sedentario'],
            ['4k7k',   '4.000 – 7.000',  'Moderado'],
            ['7k10k',  '7.000 – 10.000', 'Activo'],
            ['gt10k',  '> 10.000',       'Muy activo'],
          ].map(([v, l, h]) => `
            <button class="smart-ob-option ${s === v ? 'selected' : ''}" data-field="daily_steps_range" data-value="${v}">
              <strong>${l}</strong><small>${h}</small>
            </button>`).join('')}
        </div>
      </div>`;
  }

  // ── PASO 2: Deportes ──────────────────────────────────────
  function renderSports() {
    const sportsList = [
      ['natacion', '🏊', 'Natación'], ['running', '🏃', 'Running'],
      ['ciclismo', '🚴', 'Ciclismo'], ['futbol', '⚽', 'Fútbol'],
      ['padel', '🎾', 'Pádel'], ['crossfit', '🏋️', 'CrossFit'],
      ['yoga', '🧘', 'Yoga / Pilates'], ['senderismo', '🥾', 'Senderismo'],
      ['otros', '🏅', 'Otros deportes'], ['ninguno', '❌', 'Sin deporte regular'],
    ];
    const sportRows = sports.map((s, i) => `
      <div class="smart-ob-sport-row" data-idx="${i}">
        <span class="smart-ob-sport-name">${s.sport}</span>
        <span>${s.days_per_week}d/sem · ${s.duration_min}min · ${s.intensity}</span>
        <button class="smart-ob-sport-remove" data-idx="${i}" aria-label="Eliminar">✕</button>
      </div>`).join('');

    return `
      <div class="smart-ob-step">
        <h2 class="smart-ob-title">¿Qué deportes practicas?</h2>
        <p class="smart-ob-subtitle">Añade hasta 6. Si no haces deporte, selecciona "Sin deporte regular".</p>
        <div class="smart-ob-tdee-preview" id="ob-tdee-preview"></div>
        <div class="smart-ob-sport-list" id="ob-sport-list">${sportRows}</div>
        ${sports.length < 6 ? `
        <div class="smart-ob-sport-add-form" id="ob-sport-add-form">
          <select class="smart-ob-select" id="ob-sport-select">
            <option value="">Selecciona un deporte…</option>
            ${sportsList.map(([v, e, l]) => `<option value="${v}">${e} ${l}</option>`).join('')}
          </select>
          <div class="smart-ob-sport-details" id="ob-sport-details" style="display:none">
            <label>Días/semana: <input type="number" id="ob-sport-days" min="1" max="7" value="3" class="smart-ob-input-sm"></label>
            <label>Min/sesión: <input type="number" id="ob-sport-mins" min="10" max="300" value="45" class="smart-ob-input-sm"></label>
            <label>Intensidad:
              <select id="ob-sport-intensity" class="smart-ob-select-sm">
                <option value="low">Baja</option>
                <option value="moderate" selected>Moderada</option>
                <option value="high">Alta</option>
              </select>
            </label>
            <button class="smart-ob-btn-add" id="ob-sport-add-btn">+ Añadir</button>
          </div>
        </div>` : '<p class="smart-ob-note">Máximo 6 deportes alcanzado.</p>'}
      </div>`;
  }

  // ── PASO 3: Historial de fuerza ───────────────────────────
  function renderStrength() {
    const e = answers.strength_experience || '';
    const c = answers.strength_consistency || '';
    return `
      <div class="smart-ob-step">
        <h2 class="smart-ob-title">¿Cuánto llevas entrenando fuerza?</h2>
        <p class="smart-ob-subtitle">Afecta a la distribución de macros y al potencial de recomposición.</p>
        <p class="smart-ob-field-label">Experiencia en entrenamiento de fuerza</p>
        <div class="smart-ob-options" id="ob-exp-options">
          ${[
            ['never', '🆕', 'Sin experiencia', 'Nunca he levantado peso'],
            ['lt6m',  '📗', 'Menos de 6 meses', 'Principiante — estoy empezando'],
            ['6m2y',  '📘', '6 meses – 2 años', 'Intermedio — tengo base'],
            ['gt2y',  '📕', 'Más de 2 años', 'Avanzado — llevo tiempo en el gym'],
          ].map(([v, em, l, h]) => `
            <button class="smart-ob-option ${e === v ? 'selected' : ''}" data-field="strength_experience" data-value="${v}">
              <span class="smart-ob-option-emoji">${em}</span>
              <strong>${l}</strong><small>${h}</small>
            </button>`).join('')}
        </div>
        <p class="smart-ob-field-label" style="margin-top:16px">¿Con qué frecuencia entrenas fuerza ahora mismo?</p>
        <div class="smart-ob-options smart-ob-options-3col" id="ob-cons-options">
          ${[
            ['regular',      '✅', 'Regular', '2-4 veces/semana de forma constante'],
            ['inconsistent', '⚡', 'Irregular', 'Cuando puedo — no hay rutina fija'],
            ['starting',     '🌱', 'Empezando', 'Quiero empezar o retomar ahora'],
          ].map(([v, em, l, h]) => `
            <button class="smart-ob-option ${c === v ? 'selected' : ''}" data-field="strength_consistency" data-value="${v}">
              <span class="smart-ob-option-emoji">${em}</span>
              <strong>${l}</strong><small>${h}</small>
            </button>`).join('')}
        </div>
      </div>`;
  }

  // ── PASO 4: Composición corporal ──────────────────────────
  function renderBodyComp() {
    const bfp = answers.body_fat_pct || '';
    const bfv = answers.body_fat_visual || '';
    return `
      <div class="smart-ob-step">
        <h2 class="smart-ob-title">¿Cómo es tu composición corporal?</h2>
        <p class="smart-ob-subtitle">Opcional — mejora la precisión del cálculo. Si sabes tu % de grasa, úsalo.</p>
        <div class="smart-ob-bodycomp-tabs">
          <button class="smart-ob-tab ${!bfv || bfp ? 'active' : ''}" id="ob-tab-exact" data-tab="exact">Sé mi % exacto</button>
          <button class="smart-ob-tab ${bfv && !bfp ? 'active' : ''}" id="ob-tab-visual" data-tab="visual">Estimar visualmente</button>
          <button class="smart-ob-tab ${!bfp && !bfv ? 'active' : ''}" id="ob-tab-skip" data-tab="skip">Omitir</button>
        </div>
        <div id="ob-bc-exact" class="smart-ob-bc-panel" style="display:${bfp || (!bfv) ? '' : 'none'}">
          <label class="smart-ob-input-label">% de grasa corporal
            <input type="number" id="ob-bfp-input" class="smart-ob-input" min="3" max="60"
              placeholder="ej: 20" value="${bfp}">
          </label>
          <p class="smart-ob-note">Obtenido de báscula de impedancia, DEXA o cáliper.</p>
        </div>
        <div id="ob-bc-visual" class="smart-ob-bc-panel" style="display:${bfv && !bfp ? '' : 'none'}">
          <div class="smart-ob-options smart-ob-options-2col">
            ${[
              ['lean_soft',   '💪', 'Delgado/a con músculo',    'Venas visibles, ~18-22%'],
              ['belly_main',  '🔘', 'Grasa principalmente abdominal', 'Algo de barriga, ~25-28%'],
              ['uniform',     '⭕', 'Grasa uniforme',           'Distribuida por todo, ~23-26%'],
              ['high_volume', '🔴', 'Grasa generalizada alta',  '>30%, objetivo pérdida de grasa'],
            ].map(([v, em, l, h]) => `
              <button class="smart-ob-option ${bfv === v ? 'selected' : ''}" data-field="body_fat_visual" data-value="${v}">
                <span class="smart-ob-option-emoji">${em}</span>
                <strong>${l}</strong><small>${h}</small>
              </button>`).join('')}
          </div>
        </div>
        <div id="ob-bc-skip" class="smart-ob-bc-panel" style="display:${!bfp && !bfv ? '' : 'none'}">
          <p class="smart-ob-note-center">Sin datos de composición corporal. Usaremos fórmula estándar basada en peso y altura.</p>
        </div>
      </div>`;
  }

  // ── PASO 5: Alimentación ──────────────────────────────────
  function renderEating() {
    const es = answers.eating_style || '';
    const fi = answers.food_intolerances || [];
    return `
      <div class="smart-ob-step">
        <h2 class="smart-ob-title">¿Cómo comes?</h2>
        <p class="smart-ob-subtitle">Ajustamos las fuentes de macros a tu estilo de alimentación.</p>
        <p class="smart-ob-field-label">Estilo de alimentación</p>
        <div class="smart-ob-options smart-ob-options-3col" id="ob-eating-options">
          ${[
            ['omnivore',    '🥩', 'Omnívoro',    'Como de todo'],
            ['vegetarian',  '🥗', 'Vegetariano', 'Sin carne ni pescado'],
            ['vegan',       '🌱', 'Vegano',      'Sin productos animales'],
          ].map(([v, em, l, h]) => `
            <button class="smart-ob-option ${es === v ? 'selected' : ''}" data-field="eating_style" data-value="${v}">
              <span class="smart-ob-option-emoji">${em}</span>
              <strong>${l}</strong><small>${h}</small>
            </button>`).join('')}
        </div>
        <p class="smart-ob-field-label" style="margin-top:16px">Intolerancias alimentarias (opcional)</p>
        <div class="smart-ob-checkboxes">
          <label class="smart-ob-check-label">
            <input type="checkbox" id="ob-intol-gluten" ${fi.includes('gluten') ? 'checked' : ''}>
            🌾 Sin gluten (celiaquía / intolerancia)
          </label>
          <label class="smart-ob-check-label">
            <input type="checkbox" id="ob-intol-lactose" ${fi.includes('lactose') ? 'checked' : ''}>
            🥛 Sin lactosa
          </label>
        </div>
      </div>`;
  }

  // ── PASO 6: Resumen previo ────────────────────────────────
  function renderSummaryPreview() {
    const tdee = previewTDEE();
    const goal = answers.primary_fitness_goal || 'maintain';
    const hasConsent = answers.ai_consent;
    return `
      <div class="smart-ob-step smart-ob-step-summary">
        <h2 class="smart-ob-title">¡Todo listo!</h2>
        <p class="smart-ob-subtitle">
          ${hasConsent
            ? 'Vamos a calcular tu metabolismo real con IA. Puede tardar unos segundos.'
            : 'Tu TDEE estimado con fórmula estándar.'}
        </p>
        <div class="smart-ob-tdee-big">
          <span class="smart-ob-tdee-number">${tdee}</span>
          <span class="smart-ob-tdee-unit">kcal/día</span>
        </div>
        <p class="smart-ob-tdee-caption">
          ${hasConsent ? 'Estimación inicial — la IA calculará el valor final' : 'Estimación Mifflin-St Jeor + NEAT'}
        </p>
        <div class="smart-ob-summary-chips">
          ${answers.work_type ? `<span class="smart-ob-chip">🏢 ${answers.work_type}</span>` : ''}
          ${answers.daily_steps_range ? `<span class="smart-ob-chip">👟 ${answers.daily_steps_range}</span>` : ''}
          ${sports.length ? `<span class="smart-ob-chip">🏅 ${sports.length} deporte${sports.length > 1 ? 's' : ''}</span>` : ''}
          ${answers.eating_style ? `<span class="smart-ob-chip">🍽️ ${answers.eating_style}</span>` : ''}
        </div>
        ${hasConsent ? '<p class="smart-ob-ai-note">🤖 Generando tu análisis metabólico...</p>' : ''}
      </div>`;
  }

  // ── Listeners por paso ────────────────────────────────────
  function attachStepListeners() {
    // Opciones tipo botón con data-field/data-value
    document.querySelectorAll('.smart-ob-option[data-field]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        answers[field] = value;
        // Deselect siblings
        document.querySelectorAll(`.smart-ob-option[data-field="${field}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        saveProgress();
        updatePreviewTDEE();
      });
    });

    // Checkbox consentimiento
    const consentCheck = document.getElementById('ob-consent-check');
    if (consentCheck) {
      consentCheck.addEventListener('change', () => {
        answers.ai_consent = consentCheck.checked;
        saveProgress();
      });
    }

    // Tabs composición corporal
    document.querySelectorAll('.smart-ob-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.smart-ob-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.smart-ob-bc-panel').forEach(p => p.style.display = 'none');
        const panel = document.getElementById(`ob-bc-${tab.dataset.tab}`);
        if (panel) panel.style.display = '';
        if (tab.dataset.tab === 'skip') {
          delete answers.body_fat_pct;
          delete answers.body_fat_visual;
        }
        saveProgress();
      });
    });

    // Input % grasa exacto
    const bfpInput = document.getElementById('ob-bfp-input');
    if (bfpInput) {
      bfpInput.addEventListener('input', () => {
        const v = parseFloat(bfpInput.value);
        if (v >= 3 && v <= 60) { answers.body_fat_pct = v; delete answers.body_fat_visual; }
        else { delete answers.body_fat_pct; }
        saveProgress();
      });
    }

    // Intolerancias
    const glutenCb  = document.getElementById('ob-intol-gluten');
    const lactoseCb = document.getElementById('ob-intol-lactose');
    function updateIntolerances() {
      const arr = [];
      if (glutenCb && glutenCb.checked) arr.push('gluten');
      if (lactoseCb && lactoseCb.checked) arr.push('lactose');
      answers.food_intolerances = arr;
      saveProgress();
    }
    if (glutenCb)  glutenCb.addEventListener('change', updateIntolerances);
    if (lactoseCb) lactoseCb.addEventListener('change', updateIntolerances);

    // Deporte: mostrar detalles al seleccionar
    const sportSelect = document.getElementById('ob-sport-select');
    if (sportSelect) {
      sportSelect.addEventListener('change', () => {
        const details = document.getElementById('ob-sport-details');
        if (details) details.style.display = sportSelect.value ? '' : 'none';
      });
    }

    // Añadir deporte
    const addBtn = document.getElementById('ob-sport-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const sport = document.getElementById('ob-sport-select').value;
        const days  = parseInt(document.getElementById('ob-sport-days').value || '3', 10);
        const mins  = parseInt(document.getElementById('ob-sport-mins').value || '45', 10);
        const inten = document.getElementById('ob-sport-intensity').value;
        if (!sport) return;
        if (sport === 'ninguno') {
          sports = [];
          answers.no_sports = true;
        } else {
          if (sports.length >= 6) return;
          sports.push({ sport, days_per_week: days, duration_min: mins, intensity: inten });
          delete answers.no_sports;
        }
        saveProgress();
        renderStep();
      });
    }

    // Eliminar deporte
    document.querySelectorAll('.smart-ob-sport-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        sports.splice(idx, 1);
        saveProgress();
        renderStep();
      });
    });
  }

  // ── Actualizar preview TDEE ────────────────────────────────
  function updatePreviewTDEE() {
    const previewEl = document.getElementById('ob-tdee-preview');
    if (!previewEl) return;
    if (!answers.work_type) { previewEl.style.display = 'none'; return; }
    const tdee = previewTDEE();
    previewEl.style.display = '';
    previewEl.innerHTML = `<span class="ob-preview-label">TDEE estimado</span><span class="ob-preview-value">${tdee} kcal</span>`;
  }

  // ── Validar paso actual ───────────────────────────────────
  function validateStep() {
    switch (currentStep) {
      case 0: return true; // Consentimiento es opcional
      case 1: return !!(answers.work_type && answers.daily_steps_range);
      case 2: return true; // Deportes es opcional
      case 3: return !!(answers.strength_experience && answers.strength_consistency);
      case 4: return true; // Composición opcional
      case 5: return !!answers.eating_style;
      case 6: return true;
      default: return true;
    }
  }

  // ── Avanzar ───────────────────────────────────────────────
  function nextStep() {
    if (!validateStep()) {
      // Shake animation
      const body = document.getElementById('smart-ob-body');
      if (body) { body.classList.add('smart-ob-shake'); setTimeout(() => body.classList.remove('smart-ob-shake'), 400); }
      if (typeof window.showToast === 'function') {
        const missing = currentStep === 1 ? 'Selecciona tipo de trabajo y rango de pasos.'
          : currentStep === 3 ? 'Selecciona tu experiencia y consistencia.'
          : currentStep === 5 ? 'Selecciona tu estilo de alimentación.' : '';
        if (missing) window.showToast(missing, 'warning');
      }
      return;
    }

    telemetry(`paso_${currentStep}`);

    if (currentStep < 6) {
      currentStep++;
      saveProgress();
      renderStep();
    } else {
      submitWizard();
    }
  }

  // ── Retroceder ────────────────────────────────────────────
  function prevStep() {
    if (currentStep > 0) { currentStep--; renderStep(); }
  }

  // ── Skip (Completar más tarde) ────────────────────────────
  function skipWizard() {
    localStorage.setItem(LS_FLAG, '1');
    // Limpiar progreso guardado
    localStorage.removeItem(LS_ANSWERS);
    localStorage.removeItem(LS_STEP);

    const overlay = document.getElementById('smart-ob-overlay');
    if (overlay) { overlay.classList.add('smart-ob-exit'); setTimeout(() => overlay.remove(), 400); }

    // Mostrar banner en dashboard
    showCompleteLaterBanner();

    if (typeof window._sendTelemetryEvent === 'function') {
      window._sendTelemetryEvent('onboarding_v2_skipped', { step: currentStep });
    }
  }

  // ── Banner para completar más tarde ──────────────────────
  function showCompleteLaterBanner() {
    const container = document.getElementById('dashboard-content') || document.body;
    if (document.getElementById('smart-ob-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'smart-ob-banner';
    banner.className = 'smart-ob-dashboard-banner';
    banner.innerHTML = `
      <div class="smart-ob-banner-content">
        <span class="smart-ob-banner-icon">🧠</span>
        <div>
          <strong>Mejora tu análisis metabólico</strong>
          <p>Completa tu perfil para recibir un diagnóstico nutricional personalizado con IA.</p>
        </div>
        <button class="smart-ob-banner-cta" id="smart-ob-banner-cta">Completar ahora</button>
        <button class="smart-ob-banner-dismiss" id="smart-ob-banner-dismiss" aria-label="Cerrar">✕</button>
      </div>`;
    container.prepend(banner);
    document.getElementById('smart-ob-banner-cta').addEventListener('click', () => {
      banner.remove();
      localStorage.removeItem(LS_FLAG);
      render();
    });
    document.getElementById('smart-ob-banner-dismiss').addEventListener('click', () => banner.remove());
  }

  // ── Enviar wizard ─────────────────────────────────────────
  async function submitWizard() {
    const nextBtn = document.getElementById('smart-ob-next');
    if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Generando tu análisis...'; }

    const body = {
      ai_consent: !!answers.ai_consent,
      work_type: answers.work_type || 'desk',
      daily_steps_range: answers.daily_steps_range || 'lt4k',
      sport_activities: sports,
      strength_experience: answers.strength_experience || 'never',
      strength_consistency: answers.strength_consistency || 'starting',
      eating_style: answers.eating_style || 'omnivore',
      food_intolerances: answers.food_intolerances || [],
    };
    if (answers.body_fat_pct) body.body_fat_pct = answers.body_fat_pct;
    if (answers.body_fat_visual) body.body_fat_visual = answers.body_fat_visual;

    const token = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token');

    try {
      const resp = await fetch('/api/v1/auth/onboarding-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        // err.error para 429 (slowapi), err.detail para FastAPI validation
        const msg = err.error || err.detail || `HTTP ${resp.status}`;
        throw new Error(resp.status === 429 ? 'Demasiados intentos, espera unos minutos.' : msg);
      }

      const result = await resp.json();

      // Limpiar localStorage del wizard (seguridad — eliminar datos sensibles)
      localStorage.removeItem(LS_ANSWERS);
      localStorage.removeItem(LS_STEP);
      localStorage.setItem(LS_FLAG, '1');

      showResult(result);

      if (typeof window._sendTelemetryEvent === 'function') {
        window._sendTelemetryEvent('onboarding_v2_completado', { ai_used: result.ai_used });
      }
    } catch (err) {
      if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Ver mi análisis →'; }
      if (typeof window.showToast === 'function') {
        window.showToast(`Error al guardar tu perfil: ${err?.message || 'inténtalo de nuevo'}`, 'error');
      }
    }
  }

  // ── Pantalla de resultado ─────────────────────────────────
  function showResult(r) {
    const overlay = document.getElementById('smart-ob-overlay');
    if (!overlay) return;

    const isFallback = !r.ai_used;
    const actionSteps = (r.action_steps || []).slice(0, 3);
    // Guard: macros puede ser null si el fallback no los calcula (evita TypeError)
    const macros = r.macros || { protein_g: '--', carbs_g: '--', fat_g: '--' };

    overlay.querySelector('.smart-ob-modal').innerHTML = `
      <div class="smart-ob-result">
        <div class="smart-ob-result-header">
          <h2>Tu análisis metabólico</h2>
          ${r.ai_used ? '<span class="smart-ob-ai-badge">⚡ IA</span>' : ''}
        </div>

        <div class="smart-ob-result-tdee">
          <div class="smart-ob-result-tdee-card">
            <span class="smart-ob-result-label">TDEE</span>
            <span class="smart-ob-result-big">${_esc(String(r.tdee_kcal ?? '--'))}</span>
            <span class="smart-ob-result-unit">kcal/día</span>
          </div>
          <div class="smart-ob-result-tdee-card">
            <span class="smart-ob-result-label">Objetivo</span>
            <span class="smart-ob-result-big">${_esc(String(r.target_kcal ?? '--'))}</span>
            <span class="smart-ob-result-unit">kcal/día</span>
          </div>
        </div>

        <div class="smart-ob-result-macros">
          <div class="smart-ob-macro-pill smart-ob-macro-p">
            <strong>${_esc(String(macros.protein_g))}g</strong><small>Proteína</small>
          </div>
          <div class="smart-ob-macro-pill smart-ob-macro-c">
            <strong>${_esc(String(macros.carbs_g))}g</strong><small>Carbos</small>
          </div>
          <div class="smart-ob-macro-pill smart-ob-macro-f">
            <strong>${_esc(String(macros.fat_g))}g</strong><small>Grasa</small>
          </div>
        </div>

        ${r.diagnosis ? `<div class="smart-ob-result-diagnosis">${_esc(r.diagnosis)}</div>` : ''}

        ${actionSteps.length ? `
        <div class="smart-ob-result-actions">
          <h4>Tus 3 próximos pasos</h4>
          <ol>
            ${actionSteps.map(a => `<li>${_esc(a)}</li>`).join('')}
          </ol>
        </div>` : ''}

        ${r.diet_alert ? `<div class="smart-ob-result-alert">⚠️ ${_esc(r.diet_alert)}</div>` : ''}

        ${isFallback ? `<p class="smart-ob-result-fallback">
          Estimación estándar. Activa el análisis IA en Ajustes › Privacidad para un diagnóstico completo.
        </p>` : ''}

        ${r.ai_used ? '<p class="smart-ob-ai-disclosure">Análisis generado con Groq (Meta llama-3.3). Solo métricas numéricas anónimas fueron procesadas.</p>' : ''}

        <button class="smart-ob-btn-primary smart-ob-result-close" id="smart-ob-close-btn">
          Ir al dashboard →
        </button>
      </div>`;

    document.getElementById('smart-ob-close-btn').addEventListener('click', closeWizard);
  }

  // ── XSS escape ────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Cerrar overlay ────────────────────────────────────────
  function closeWizard() {
    const overlay = document.getElementById('smart-ob-overlay');
    if (overlay) {
      overlay.classList.add('smart-ob-exit');
      setTimeout(() => { overlay.remove(); window.location.reload(); }, 400);
    }
  }

  return { init, showCompleteLaterBanner };
})();

// Auto-init cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', SmartOnboarding.init);
} else {
  SmartOnboarding.init();
}
