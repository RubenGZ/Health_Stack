/* ============================================================
   onboarding.js — Modal de bienvenida (3 pasos) para nuevos usuarios
   Se muestra solo en el primer acceso (flag hs_onboarded en localStorage).
   Pre-rellena TDEE, peso inicial y días de entrenamiento.
   ============================================================ */

const Onboarding = (function () {
  'use strict';

  const LS_FLAG = 'hs_onboarded';

  // ── Pasos del onboarding ──────────────────────────────────
  const STEPS = [
    {
      id:       'goal',
      emoji:    '🎯',
      title:    '¿Cuál es tu objetivo principal?',
      subtitle: 'Esto personalizará tu experiencia desde el primer momento.',
      type:     'options',
      options: [
        { value: 'deficit_soft',  emoji: '🔥', label: 'Perder grasa',    hint: 'Déficit calórico moderado, alta proteína' },
        { value: 'maintain',      emoji: '⚖️',  label: 'Mantenerme',     hint: 'Recomposición corporal y salud general' },
        { value: 'surplus_soft',  emoji: '💪',  label: 'Ganar músculo',  hint: 'Superávit limpio + sobrecarga progresiva' },
        { value: 'surplus_hard',  emoji: '🏋',  label: 'Volumen agresivo',hint: 'Máximas ganancias, acepto algo más de grasa' },
      ],
    },
    {
      id:       'body',
      emoji:    '📏',
      title:    '¿Cuál es tu peso y talla actuales?',
      subtitle: 'Solo para calcular tu TDEE y BMI. Puedes cambiarlo en cualquier momento.',
      type:     'inputs',
      fields: [
        { id: 'ob-weight', label: 'Peso', unit: 'kg',  type: 'number', min: 30,  max: 300, placeholder: '70' },
        { id: 'ob-height', label: 'Talla', unit: 'cm', type: 'number', min: 100, max: 250, placeholder: '175' },
        { id: 'ob-age',    label: 'Edad', unit: 'años',type: 'number', min: 14,  max: 99,  placeholder: '25' },
      ],
    },
    {
      id:       'schedule',
      emoji:    '🗓',
      title:    '¿Cuántos días a la semana entrenas?',
      subtitle: 'Usamos esto para generar tu primera rutina personalizada.',
      type:     'options',
      options: [
        { value: 2, emoji: '😌', label: '2 días',  hint: 'Full Body — perfecto para empezar' },
        { value: 3, emoji: '💪', label: '3 días',  hint: 'Full Body ×3 o PPL comprimido' },
        { value: 4, emoji: '🔥', label: '4 días',  hint: 'Upper / Lower split' },
        { value: 5, emoji: '⚡', label: '5+ días', hint: 'PPL o especialización avanzada' },
      ],
    },
  ];

  // ── Estado ────────────────────────────────────────────────
  let currentStep = 0;
  let answers     = {};

  // ── Comprobar si ya hizo el onboarding ───────────────────
  function isOnboarded() {
    return localStorage.getItem(LS_FLAG) === '1';
  }

  // ── Inyectar el modal en el DOM ───────────────────────────
  function injectModal() {
    if (document.getElementById('onboarding-modal')) return;

    const overlay = document.createElement('div');
    overlay.id        = 'onboarding-modal';
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-modal" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <div class="ob-header">
          <div class="ob-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L29 9.5V22.5L16 29L3 22.5V9.5L16 3Z" stroke="url(#obg)" stroke-width="2" fill="none"/>
              <path d="M8 16H24M16 8V24" stroke="url(#obg)" stroke-width="2" stroke-linecap="round"/>
              <defs><linearGradient id="obg" x1="3" y1="3" x2="29" y2="29">
                <stop offset="0%" stop-color="#6c63ff"/>
                <stop offset="100%" stop-color="#00d2ff"/>
              </linearGradient></defs>
            </svg>
          </div>
          <span class="ob-brand">HealthStack Pro</span>
          <button class="ob-skip" id="ob-skip-btn">Saltar →</button>
        </div>

        <div class="ob-progress">
          <div class="ob-prog-bar"><div class="ob-prog-fill" id="ob-prog-fill"></div></div>
          <span class="ob-prog-label" id="ob-prog-label">Paso 1 de 3</span>
        </div>

        <div class="ob-body" id="ob-body"></div>

        <div class="ob-footer">
          <button class="btn btn--ghost" id="ob-prev-btn">← Atrás</button>
          <button class="btn btn--primary" id="ob-next-btn">Continuar →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('ob-skip-btn').addEventListener('click', finish);
    document.getElementById('ob-prev-btn').addEventListener('click', prevStep);
    document.getElementById('ob-next-btn').addEventListener('click', nextStep);
  }

  // ── Renderizar paso ───────────────────────────────────────
  function renderStep() {
    const step   = STEPS[currentStep];
    const total  = STEPS.length;
    const pct    = Math.round(((currentStep + 1) / total) * 100);

    const fill   = document.getElementById('ob-prog-fill');
    const label  = document.getElementById('ob-prog-label');
    const body   = document.getElementById('ob-body');
    const prev   = document.getElementById('ob-prev-btn');
    const next   = document.getElementById('ob-next-btn');

    if (fill)  fill.style.width = `${pct}%`;
    if (label) label.textContent = `Paso ${currentStep + 1} de ${total}`;
    if (prev)  prev.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    if (next)  next.textContent = currentStep === total - 1 ? '¡Empezar! 🚀' : 'Continuar →';
    if (!body) return;

    let html = `
      <div class="ob-step-emoji">${step.emoji}</div>
      <h2 class="ob-step-title" id="ob-title">${step.title}</h2>
      <p class="ob-step-sub">${step.subtitle}</p>
    `;

    if (step.type === 'options') {
      html += `<div class="ob-options">` + step.options.map(o => `
        <button class="ob-option${answers[step.id] == o.value ? ' selected' : ''}" data-val="${o.value}">
          <span class="ob-opt-emoji">${o.emoji}</span>
          <span class="ob-opt-label">${o.label}</span>
          <span class="ob-opt-hint">${o.hint}</span>
        </button>`).join('') + `</div>`;
    } else if (step.type === 'inputs') {
      html += `<div class="ob-fields">` + step.fields.map(f => `
        <div class="ob-field">
          <label class="form-label" for="${f.id}">${f.label}</label>
          <div class="input-wrapper">
            <input type="${f.type}" id="${f.id}" class="form-input"
                   min="${f.min}" max="${f.max}" placeholder="${f.placeholder}"
                   value="${answers[f.id] || ''}">
            <span class="input-unit">${f.unit}</span>
          </div>
        </div>`).join('') + `</div>`;
    }

    body.innerHTML = html;

    // Eventos opciones
    if (step.type === 'options') {
      body.querySelectorAll('.ob-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = isNaN(btn.dataset.val) ? btn.dataset.val : parseFloat(btn.dataset.val);
          answers[step.id] = val;
          body.querySelectorAll('.ob-option').forEach(b => b.classList.toggle('selected', b.dataset.val == val));
          // Auto-avanzar en 0.4s para opciones
          setTimeout(nextStep, 400);
        });
      });
    }
  }

  // ── Navegar ───────────────────────────────────────────────
  function prevStep() {
    if (currentStep > 0) { currentStep--; renderStep(); }
  }

  function nextStep() {
    if (!validate()) return;
    if (currentStep < STEPS.length - 1) {
      currentStep++;
      renderStep();
    } else {
      applyAnswers();
      finish();
    }
  }

  // ── Validar ───────────────────────────────────────────────
  function validate() {
    const step = STEPS[currentStep];

    if (step.type === 'options') {
      if (answers[step.id] === undefined) {
        // Shake visual
        const body = document.getElementById('ob-body');
        body?.classList.add('ob-shake');
        setTimeout(() => body?.classList.remove('ob-shake'), 500);
        return false;
      }
    }

    if (step.type === 'inputs') {
      for (const f of step.fields) {
        const el  = document.getElementById(f.id);
        const val = parseFloat(el?.value);
        if (!val || val < f.min || val > f.max) {
          el?.classList.add('error');
          el?.focus();
          setTimeout(() => el?.classList.remove('error'), 1000);
          return false;
        }
        answers[f.id] = val;
      }
    }

    return true;
  }

  // ── Cálculo TDEE directo (evita depender del form i18n) ─────
  const GOAL_DELTA = { deficit_hard:-500, deficit_soft:-250, maintain:0, surplus_soft:250, surplus_hard:500 };
  const GOAL_TIPS  = {
    deficit_soft: '✅ Déficit suave de 250 kcal — ideal para perder grasa sin perder músculo.',
    maintain:     '⚖️ Mantenimiento — momento ideal para recomposición corporal.',
    surplus_soft: '💪 Superávit de 250 kcal — minimiza grasa mientras maximiza músculo.',
    surplus_hard: '📈 Superávit agresivo — máximas ganancias, algo más de grasa.',
    deficit_hard: '⚠️ Déficit de 500 kcal — límite recomendado. Asegura ≥1.8 g proteína/kg.',
  };

  // Activity multiplier mapped from training days per week
  const ACTIVITY_MAP = { 2: 1.375, 3: 1.55, 4: 1.725, 5: 1.9 };

  function calcTDEEFromAnswers(weight, height, age, goal, activity = 1.55) {
    // Mifflin-St Jeor (asumimos male por defecto si no hay dato de sexo)
    const bmr    = 10 * weight + 6.25 * height - 5 * age + 5;
    const tdee   = Math.round(bmr * activity);
    const delta  = GOAL_DELTA[goal] || 0;
    const target = tdee + delta;
    // Macros: proteína 2g/kg, grasa 25%, carbos el resto
    const proteinG = Math.round(weight * 2.0);
    const fatKcal  = Math.round(target * 0.25);
    const fatG     = Math.round(fatKcal / 9);
    const carbsG   = Math.round(Math.max(0, target - proteinG * 4 - fatKcal) / 4);
    return { bmr, tdee, target, proteinG, fatG, carbsG };
  }

  // ── Aplicar respuestas a los módulos existentes ───────────
  function applyAnswers() {
    const w = answers['ob-weight'];
    const h = answers['ob-height'];
    const a = answers['ob-age'];
    const g = answers.goal;

    // 1. Registrar el peso de hoy automáticamente
    if (w && typeof WeightTracker !== 'undefined') {
      const today = new Date().toISOString().split('T')[0];
      WeightTracker.addEntry(today, w, 'Peso inicial — registrado en onboarding');
      if (h) localStorage.setItem('hs_height_cm', String(h));
    }

    // 2. Pre-configurar días de entrenamiento
    if (answers.schedule !== undefined) {
      localStorage.setItem('hs_onboarding_days', answers.schedule);
    }

    // 3. Guardar objetivo
    if (g) localStorage.setItem('hs_user_goal', g);

    // 4. Calcular y persistir TDEE directamente (sin pasar por el form HTML)
    //    El form puede tener opciones i18n vacías en este momento; lo bypaseamos.
    if (w && h && a && g) {
      const activity = ACTIVITY_MAP[answers.schedule] || 1.55;
      const result = calcTDEEFromAnswers(w, h, a, g, activity);
      const tdeeData = {
        sex: 'male', age: a, weight: w, height: h,
        activity: 1.55, goal: g,
        bmr: result.bmr, tdee: result.tdee, target: result.target,
        macros: {
          proteinG: result.proteinG, proteinKcal: result.proteinG * 4,
          fatG: result.fatG,         fatKcal: result.fatG * 9,
          carbsG: result.carbsG,     carbsKcal: result.carbsG * 4,
        },
        ts: Date.now(),
      };
      localStorage.setItem('hs_tdee',      JSON.stringify(tdeeData));
      localStorage.setItem('hs_last_tdee', String(result.target));
      localStorage.setItem('hs_height_cm', String(h));

      // Pre-rellenar el form TDEE para que esté listo cuando el usuario lo abra
      setTimeout(() => {
        const fld = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        fld('tdee-age',      a);
        fld('tdee-weight',   w);
        fld('tdee-height',   h);
        fld('tdee-activity', '1.55');
        fld('tdee-goal',     g);
        // Mostrar resultados en el panel de nutrición directamente
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('result-bmr',    Math.round(result.bmr));
        setEl('result-tdee',   result.tdee);
        setEl('result-target', result.target);
        setEl('macro-protein-g',    `${result.proteinG} g`);
        setEl('macro-fat-g',        `${result.fatG} g`);
        setEl('macro-carbs-g',      `${result.carbsG} g`);
        setEl('macro-protein-kcal', `${result.proteinG * 4} kcal`);
        setEl('macro-fat-kcal',     `${result.fatG * 9} kcal`);
        setEl('macro-carbs-kcal',   `${result.carbsG * 4} kcal`);
        setEl('tip-text', GOAL_TIPS[g] || '');
        const resEl = document.getElementById('nutrition-results');
        if (resEl) resEl.style.display = 'block';
        // Actualizar stat TDEE del dashboard
        const statTdee = document.getElementById('stat-tdee');
        if (statTdee) statTdee.textContent = `${result.target} kcal`;
      }, 200);

      // Notificar al resto de módulos
      window.dispatchEvent(new CustomEvent('hs:tdee-calculated'));
    }

    // 5. XP de bienvenida
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('login');
    }
  }

  // ── Cerrar modal y marcar como completado ─────────────────
  function finish() {
    localStorage.setItem(LS_FLAG, '1');
    const modal = document.getElementById('onboarding-modal');
    const hasTDEE = answers['ob-weight'] && answers.goal;

    if (modal) {
      modal.classList.add('ob-exit');
      setTimeout(() => {
        modal.remove();

        // Navigate to nutrición so the user sees their TDEE + macros immediately
        if (hasTDEE) {
          const nutriNav = document.querySelector('[data-section="nutricion"]');
          if (nutriNav) nutriNav.click();
        }
      }, 420);
    }

    // Mostrar mensaje de bienvenida en el stat del dashboard
    const hour = new Date().getHours();
    const sal  = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const greeting = document.getElementById('dashboard-greeting');
    if (greeting && answers['ob-weight']) {
      greeting.textContent = `${sal}, bienvenido/a a HealthStack 🎉`;
      setTimeout(() => {
        const user = typeof API !== 'undefined' ? API.getUser?.() : null;
        const name = user?.display_name || 'Atleta';
        greeting.textContent = `${sal}, ${name}`;
      }, 4000);
    }
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    // No mostrar si el usuario ya completó el onboarding
    if (isOnboarded()) return;

    // Esperar a que el DOM esté completamente listo y los módulos cargados
    setTimeout(() => {
      injectModal();
      renderStep();
    }, 800); // Pequeño delay para que el fondo 3D aparezca primero
  }

  // API pública — permite forzar el onboarding desde consola en desarrollo
  return { init, reset: () => { localStorage.removeItem(LS_FLAG); init(); } };
})();
