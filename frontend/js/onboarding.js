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

  // ── Aplicar respuestas a los módulos existentes ───────────
  function applyAnswers() {
    // 1. Pre-rellenar formulario TDEE
    const goalEl     = document.getElementById('tdee-goal');
    const weightEl   = document.getElementById('tdee-weight');
    const heightEl   = document.getElementById('tdee-height');
    const ageEl      = document.getElementById('tdee-age');
    const activityEl = document.getElementById('tdee-activity');

    if (goalEl   && answers.goal)      goalEl.value   = answers.goal;
    if (weightEl && answers['ob-weight']) weightEl.value = answers['ob-weight'];
    if (heightEl && answers['ob-height']) heightEl.value = answers['ob-height'];
    if (ageEl    && answers['ob-age'])    ageEl.value    = answers['ob-age'];
    // Actividad por defecto: moderada
    if (activityEl) activityEl.value = '1.55';

    // 2. Registrar el peso de hoy automáticamente
    if (answers['ob-weight'] && typeof WeightTracker !== 'undefined') {
      const today = new Date().toISOString().split('T')[0];
      WeightTracker.addEntry(today, answers['ob-weight'], 'Peso inicial — registrado en onboarding');
      // Guardar altura para el dashboard IMC
      if (answers['ob-height']) localStorage.setItem('hs_height_cm', String(answers['ob-height']));
    }

    // 3. Pre-configurar cuestionario de rutina si el módulo existe
    if (answers.schedule !== undefined) {
      localStorage.setItem('hs_onboarding_days', answers.schedule);
    }

    // Guardar objetivo para el insight de progreso del dashboard
    if (answers.goal) {
      localStorage.setItem('hs_user_goal', answers.goal);
    }

    // 4. Calcular TDEE automáticamente si tenemos todos los datos
    if (answers['ob-weight'] && answers['ob-height'] && answers['ob-age'] && answers.goal) {
      const form = document.getElementById('tdee-form');
      if (form) {
        // Disparar el submit del formulario programáticamente
        setTimeout(() => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 300);
      }
    }

    // 5. XP de bienvenida a través de gamificación
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('login'); // Cuenta como sesión inaugural
    }
  }

  // ── Cerrar modal y marcar como completado ─────────────────
  function finish() {
    localStorage.setItem(LS_FLAG, '1');
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.classList.add('ob-exit');
      setTimeout(() => modal.remove(), 400);
    }

    // Mostrar mensaje de bienvenida en dashboard
    const greeting = document.getElementById('dashboard-greeting');
    if (greeting && answers['ob-weight']) {
      const hour = new Date().getHours();
      const sal  = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
      greeting.textContent = `${sal}, bienvenido/a a HealthStack 🎉`;
      setTimeout(() => {
        const user = typeof API !== 'undefined' ? API.getUser?.() : null;
        const name = user?.display_name || 'Atleta';
        greeting.textContent = `${sal}, ${name}`;
      }, 4000);
    }

    // Navegar a la sección nutrición si ya tenemos datos TDEE
    if (answers['ob-weight'] && answers.goal) {
      setTimeout(() => {
        // Si hay datos de peso, mostrar sección peso con el primer registro
        // Si tiene TDEE calculado, ir a nutrición
        // Por defecto quedamos en dashboard para ver los datos ya rellenados
      }, 500);
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
