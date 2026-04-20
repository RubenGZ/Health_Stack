/* ============================================================
   routineGenerator.js — Cuestionario 7 pasos + generador de rutina
   ============================================================ */

const RoutineGenerator = (function () {
  'use strict';

  const LS_KEY      = 'hs_routine';
  const LS_HISTORY  = 'hs_routine_history';
  const HISTORY_MAX = 5;

  // ── Definición del cuestionario ───────────────────────────
  const STEPS = [
    {
      id: 'age', title: '¿Cuántos años tienes?',
      type: 'number', placeholder: '25', min: 14, max: 80, unit: 'años',
      hint: 'Influye en el volumen y densidad del entrenamiento.',
    },
    {
      id: 'weight', title: '¿Cuánto pesas?',
      type: 'number', placeholder: '70', min: 30, max: 300, unit: 'kg',
      hint: 'Usamos tu peso para personalizar la intensidad.',
    },
    {
      id: 'days', title: '¿Cuántos días a la semana puedes entrenar?',
      type: 'options',
      options: [
        { value: 2, label: '2 días', desc: 'Cuerpo completo x2' },
        { value: 3, label: '3 días', desc: 'Full body x3 o PPL comprimido' },
        { value: 4, label: '4 días', desc: 'Upper/Lower split' },
        { value: 5, label: '5 días', desc: 'PPL + especialización' },
        { value: 6, label: '6 días', desc: 'PPL doble' },
      ],
    },
    {
      id: 'duration', title: '¿Cuánto tiempo tienes por sesión?',
      type: 'options',
      options: [
        { value: 30, label: '30 min',  desc: 'Sesiones express, alta intensidad' },
        { value: 45, label: '45 min',  desc: 'Entrenamiento eficiente' },
        { value: 60, label: '60 min',  desc: 'Estándar recomendado' },
        { value: 90, label: '90 min',  desc: 'Sesión extensa, alto volumen' },
      ],
    },
    {
      id: 'level', title: '¿Cuál es tu nivel de experiencia?',
      type: 'options',
      options: [
        { value: 'beginner',     label: 'Principiante', desc: 'Menos de 1 año entrenando' },
        { value: 'intermediate', label: 'Intermedio',   desc: '1-3 años de experiencia' },
        { value: 'advanced',     label: 'Avanzado',     desc: 'Más de 3 años, buen dominio técnico' },
      ],
    },
    {
      id: 'goal', title: '¿Cuál es tu objetivo principal?',
      type: 'options',
      options: [
        { value: 'strength',     label: '💪 Fuerza',         desc: 'Cargas altas, pocas reps (3-5), descansos largos' },
        { value: 'hypertrophy',  label: '🏋 Hipertrofia',     desc: 'Volumen moderado, 8-12 reps, técnica al límite' },
        { value: 'fat_loss',     label: '🔥 Definición',      desc: 'Alta densidad, supersets, HIIT integrado' },
        { value: 'endurance',    label: '🏃 Resistencia',     desc: 'Reps altas, pesos moderados, cardio integrado' },
        { value: 'recomposition',label: '⚖️ Recomposición',   desc: 'Déficit calórico + estímulo de fuerza equilibrado' },
      ],
    },
    {
      id: 'injuries', title: '¿Tienes alguna lesión o limitación?',
      type: 'multicheck',
      options: [
        { value: 'none',         label: 'Ninguna' },
        { value: 'shoulder',     label: 'Hombro' },
        { value: 'knee',         label: 'Rodilla' },
        { value: 'lower_back',   label: 'Lumbar' },
        { value: 'wrist',        label: 'Muñeca' },
        { value: 'elbow',        label: 'Codo' },
      ],
    },
  ];

  // ── Plantillas de ejercicios por split ────────────────────
  const EXERCISE_POOL = {
    chest:     ['Press banca plano', 'Press banca inclinado', 'Aperturas mancuernas', 'Fondos en paralelas', 'Flexiones'],
    back:      ['Dominadas', 'Remo con barra', 'Jalón al pecho', 'Remo mancuerna', 'Pull-over'],
    shoulders: ['Press militar', 'Elevaciones laterales', 'Pájaro mancuernas', 'Face pull'],
    triceps:   ['Extensión polea', 'Press francés', 'Fondos banco', 'Press cerrado'],
    biceps:    ['Curl barra', 'Curl martillo', 'Curl concentrado', 'Curl polea baja'],
    quads:     ['Sentadilla barra', 'Prensa de piernas', 'Extensión cuádriceps', 'Zancada búlgara'],
    hamstrings:['Peso muerto rumano', 'Curl femoral', 'Buenos días'],
    glutes:    ['Hip thrust', 'Patada trasera polea', 'Puente glúteos', 'Abducción cadera'],
    core:      ['Plancha frontal', 'Crunch abdominal', 'Plancha lateral', 'Rueda abdominal'],
    cardio:    ['HIIT 15 min', 'Comba 10 min', 'Remo máquina 15 min'],
  };

  // ── Config por objetivo ───────────────────────────────────
  const GOAL_CONFIG = {
    strength:     { sets: '3-5', reps: '3-5', rest: '3-5 min',  intensity: 'RPE 8-9' },
    hypertrophy:  { sets: '3-5', reps: '8-12', rest: '60-90 s', intensity: 'RPE 7-8' },
    fat_loss:     { sets: '3-4', reps: '12-15',rest: '45-60 s', intensity: 'RPE 7, supersets' },
    endurance:    { sets: '3-4', reps: '15-20',rest: '30-45 s', intensity: 'RPE 6-7' },
    recomposition:{ sets: '3-4', reps: '8-12', rest: '60-90 s', intensity: 'RPE 7-8' },
  };

  // ── Generador de rutina ───────────────────────────────────
  function generateRoutine(answers) {
    const { days, level, goal, injuries, duration } = answers;
    const d = parseInt(days);
    const cfg = GOAL_CONFIG[goal] || GOAL_CONFIG.hypertrophy;
    const exercisesPerSession = duration <= 30 ? 4 : duration <= 45 ? 5 : duration <= 60 ? 6 : 8;

    // Limitar grupos lesionados
    const skip = new Set();
    if (injuries?.includes('shoulder')) { skip.add('shoulders'); skip.add('triceps'); }
    if (injuries?.includes('knee'))      { skip.add('quads'); skip.add('hamstrings'); }
    if (injuries?.includes('lower_back')){ skip.add('hamstrings'); }
    if (injuries?.includes('wrist'))     { skip.add('biceps'); skip.add('triceps'); }
    if (injuries?.includes('elbow'))     { skip.add('biceps'); skip.add('triceps'); }

    function pick(arr, n = 2) {
      const available = arr.filter(e => e !== undefined);
      return available.slice(0, n).map(name => ({ name, sets: cfg.sets, reps: cfg.reps, rest: cfg.rest }));
    }

    function sessionExercises(groups) {
      const ex = [];
      groups.forEach(g => { if (!skip.has(g)) ex.push(...pick(EXERCISE_POOL[g] || [], 2)); });
      return ex.slice(0, exercisesPerSession);
    }

    // Días de la semana disponibles
    const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let sessions = [];

    if (d <= 2) {
      // Full body x2
      sessions = [
        { day: DAY_NAMES[0], name: 'Full Body A', exercises: sessionExercises(['chest','back','quads','core']) },
        { day: DAY_NAMES[3], name: 'Full Body B', exercises: sessionExercises(['shoulders','back','hamstrings','glutes','core']) },
      ];
    } else if (d === 3) {
      if (level === 'beginner') {
        sessions = [
          { day: DAY_NAMES[0], name: 'Full Body A', exercises: sessionExercises(['chest','back','quads','core']) },
          { day: DAY_NAMES[2], name: 'Full Body B', exercises: sessionExercises(['shoulders','back','hamstrings','glutes']) },
          { day: DAY_NAMES[4], name: 'Full Body C', exercises: sessionExercises(['chest','back','quads','core','cardio']) },
        ];
      } else {
        // PPL comprimido
        sessions = [
          { day: DAY_NAMES[0], name: 'Push (Pecho + Hombros + Tríceps)', exercises: sessionExercises(['chest','shoulders','triceps']) },
          { day: DAY_NAMES[2], name: 'Pull (Espalda + Bíceps)',           exercises: sessionExercises(['back','biceps']) },
          { day: DAY_NAMES[4], name: 'Legs (Piernas + Core)',             exercises: sessionExercises(['quads','hamstrings','glutes','core']) },
        ];
      }
    } else if (d === 4) {
      sessions = [
        { day: DAY_NAMES[0], name: 'Upper A (Pecho + Espalda)',        exercises: sessionExercises(['chest','back']) },
        { day: DAY_NAMES[1], name: 'Lower A (Cuádriceps + Core)',      exercises: sessionExercises(['quads','core']) },
        { day: DAY_NAMES[3], name: 'Upper B (Hombros + Bíceps + Trí)', exercises: sessionExercises(['shoulders','biceps','triceps']) },
        { day: DAY_NAMES[4], name: 'Lower B (Isquios + Glúteos)',      exercises: sessionExercises(['hamstrings','glutes','core']) },
      ];
    } else if (d === 5) {
      sessions = [
        { day: DAY_NAMES[0], name: 'Push A (Pecho + Hombros + Tríceps)', exercises: sessionExercises(['chest','shoulders','triceps']) },
        { day: DAY_NAMES[1], name: 'Pull A (Espalda + Bíceps)',           exercises: sessionExercises(['back','biceps']) },
        { day: DAY_NAMES[2], name: 'Legs (Piernas + Glúteos + Core)',     exercises: sessionExercises(['quads','hamstrings','glutes','core']) },
        { day: DAY_NAMES[3], name: 'Push B (Hombros + Pecho)',            exercises: sessionExercises(['shoulders','chest','triceps']) },
        { day: DAY_NAMES[4], name: 'Pull B (Espalda + Bíceps + Cardio)', exercises: sessionExercises(['back','biceps','cardio']) },
      ];
    } else {
      // PPL doble
      sessions = [
        { day: DAY_NAMES[0], name: 'Push (Pecho + Hombros + Tríceps)', exercises: sessionExercises(['chest','shoulders','triceps']) },
        { day: DAY_NAMES[1], name: 'Pull (Espalda + Bíceps)',           exercises: sessionExercises(['back','biceps']) },
        { day: DAY_NAMES[2], name: 'Legs A (Cuádriceps + Core)',        exercises: sessionExercises(['quads','core']) },
        { day: DAY_NAMES[3], name: 'Push (Hombros + Pecho + Tríceps)', exercises: sessionExercises(['shoulders','chest','triceps']) },
        { day: DAY_NAMES[4], name: 'Pull (Espalda + Bíceps)',           exercises: sessionExercises(['back','biceps']) },
        { day: DAY_NAMES[5], name: 'Legs B (Isquios + Glúteos)',        exercises: sessionExercises(['hamstrings','glutes','core']) },
      ];
    }

    return { sessions, cfg, answers };
  }

  // ── Estado del quiz ───────────────────────────────────────
  let currentStep = 0;
  let answers     = {};

  // ── Renderizar paso actual ────────────────────────────────
  function renderStep() {
    const step    = STEPS[currentStep];
    const total   = STEPS.length;
    const pct     = Math.round(((currentStep + 1) / total) * 100);
    const fillEl  = document.getElementById('quiz-fill');
    const labelEl = document.getElementById('quiz-step-label');
    const card    = document.getElementById('quiz-card');
    const prev    = document.getElementById('quiz-prev');
    const next    = document.getElementById('quiz-next');

    if (fillEl)  fillEl.style.width = `${pct}%`;
    const _t = window.t || (k => k);
    if (labelEl) labelEl.textContent = `${_t('routines.step')} ${currentStep + 1} / ${total}`;
    if (prev)    prev.style.visibility = currentStep === 0 ? 'hidden' : '';
    if (next)    next.textContent = currentStep === total - 1 ? 'Generar rutina ✨' : _t('routines.next');
    if (!card)   return;

    let html = `<h3 class="quiz-question">${step.title}</h3>`;
    if (step.hint) html += `<p class="quiz-hint">${step.hint}</p>`;

    if (step.type === 'number') {
      const val = answers[step.id] || '';
      html += `
        <div class="quiz-number-wrap">
          <input type="number" id="quiz-input" class="form-input quiz-number-input"
                 value="${val}" min="${step.min}" max="${step.max}" placeholder="${step.placeholder}">
          <span class="input-unit">${step.unit}</span>
        </div>`;
    } else if (step.type === 'options') {
      html += `<div class="quiz-options">` + step.options.map(o => `
        <label class="quiz-option${answers[step.id] === o.value ? ' selected' : ''}" data-val="${o.value}">
          <input type="radio" name="q_${step.id}" value="${o.value}"${answers[step.id] === o.value ? ' checked' : ''} style="display:none">
          <span class="quiz-opt-label">${o.label}</span>
          <span class="quiz-opt-desc">${o.desc}</span>
        </label>`).join('') + `</div>`;
    } else if (step.type === 'multicheck') {
      const selected = answers[step.id] || [];
      html += `<div class="quiz-options quiz-options--multi">` + step.options.map(o => `
        <label class="quiz-option${selected.includes(o.value) ? ' selected' : ''}" data-val="${o.value}">
          <input type="checkbox" name="q_${step.id}" value="${o.value}"${selected.includes(o.value) ? ' checked' : ''} style="display:none">
          <span class="quiz-opt-label">${o.label}</span>
        </label>`).join('') + `</div>`;
    }

    card.innerHTML = html;

    // Eventos opciones radio
    card.querySelectorAll('.quiz-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const val = isNaN(opt.dataset.val) ? opt.dataset.val : parseFloat(opt.dataset.val);
        if (step.type === 'options') {
          answers[step.id] = val;
          card.querySelectorAll('.quiz-option').forEach(o => o.classList.toggle('selected', o.dataset.val == val));
        } else {
          // multicheck
          let sel = answers[step.id] || [];
          const strVal = String(opt.dataset.val);
          if (strVal === 'none') {
            sel = sel.includes('none') ? [] : ['none'];
          } else {
            sel = sel.filter(v => v !== 'none');
            sel.includes(strVal) ? sel = sel.filter(v => v !== strVal) : sel.push(strVal);
          }
          answers[step.id] = sel;
          card.querySelectorAll('.quiz-option').forEach(o => {
            o.classList.toggle('selected', sel.includes(o.dataset.val));
          });
        }
      });
    });
  }

  // ── Validar paso ──────────────────────────────────────────
  function validateStep() {
    const step = STEPS[currentStep];
    if (step.type === 'number') {
      const input = document.getElementById('quiz-input');
      const val   = parseFloat(input?.value);
      if (!val || val < step.min || val > step.max) {
        input?.classList.add('error');
        setTimeout(() => input?.classList.remove('error'), 800);
        return false;
      }
      answers[step.id] = val;
    } else if (step.type === 'options') {
      if (answers[step.id] === undefined) {
        const card = document.getElementById('quiz-card');
        card?.classList.add('shake');
        setTimeout(() => card?.classList.remove('shake'), 500);
        return false;
      }
    } else if (step.type === 'multicheck') {
      if (!answers[step.id] || !answers[step.id].length) {
        answers[step.id] = ['none'];
      }
    }
    return true;
  }

  // ── Mostrar resultado ─────────────────────────────────────
  function showResult(routine) {
    const questionnaire = document.getElementById('routine-questionnaire');
    const resultEl      = document.getElementById('routine-result');
    const resetBtn      = document.getElementById('btn-reset-routine');

    if (questionnaire) questionnaire.style.display = 'none';
    if (resultEl)      resultEl.style.display = '';
    if (resetBtn)      resetBtn.style.display = '';

    const shareBtn = document.getElementById('btn-share-routine');
    if (shareBtn) shareBtn.style.display = '';

    const cfg  = routine.cfg;
    const ans  = routine.answers;
    const goal = { strength:'Fuerza', hypertrophy:'Hipertrofia', fat_loss:'Definición', endurance:'Resistencia', recomposition:'Recomposición' };
    const lvl  = { beginner:'Principiante', intermediate:'Intermedio', advanced:'Avanzado' };

    const summary = document.getElementById('routine-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="routine-meta">
          <span class="rmeta-item"><strong>Objetivo:</strong> ${goal[ans.goal] || ans.goal}</span>
          <span class="rmeta-item"><strong>Nivel:</strong> ${lvl[ans.level] || ans.level}</span>
          <span class="rmeta-item"><strong>Días:</strong> ${ans.days} por semana</span>
          <span class="rmeta-item"><strong>Duración:</strong> ${ans.duration} min/sesión</span>
          <span class="rmeta-item"><strong>Intensidad:</strong> ${cfg.intensity}</span>
        </div>`;
    }

    const week = document.getElementById('routine-week');
    if (!week) return;
    week.innerHTML = routine.sessions.map(s => `
      <div class="routine-day card">
        <div class="routine-day-header">
          <span class="routine-day-name">${s.day}</span>
          <span class="routine-day-session">${s.name}</span>
        </div>
        <div class="routine-exercises">
          ${s.exercises.map(ex => `
            <div class="routine-ex">
              <span class="rex-name">${ex.name}</span>
              <span class="rex-scheme">${ex.sets} × ${ex.reps}</span>
              <span class="rex-rest">Descanso: ${ex.rest}</span>
            </div>`).join('')}
        </div>
      </div>
    `).join('');

    // Añadir XP si el módulo de gamificación está disponible
    if (typeof Gamification !== 'undefined') Gamification.addXP('routine');

    // Persistir rutina actual
    localStorage.setItem(LS_KEY, JSON.stringify({ routine, ts: Date.now() }));

    // Añadir al historial (máx HISTORY_MAX)
    saveToHistory(routine);

    // Actualizar panel de historial
    renderHistory();
  }

  // ── Historial ─────────────────────────────────────────────
  function saveToHistory(routine) {
    try {
      const history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      const goal = { strength:'Fuerza', hypertrophy:'Hipertrofia', fat_loss:'Definición', endurance:'Resistencia', recomposition:'Recomposición' };
      const lvl  = { beginner:'Principiante', intermediate:'Intermedio', advanced:'Avanzado' };
      history.unshift({
        ts:   Date.now(),
        label: `${goal[routine.answers?.goal] || 'Rutina'} · ${lvl[routine.answers?.level] || ''} · ${routine.answers?.days || '?'} días`,
        days: routine.answers?.days,
        routine,
      });
      localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, HISTORY_MAX)));
    } catch { /* ignorar */ }
  }

  function renderHistory() {
    const wrap = document.getElementById('routine-history');
    if (!wrap) return;
    try {
      const history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      if (!history.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = '';
      wrap.innerHTML = `
        <h3 class="history-title">Historial de rutinas</h3>
        <div class="history-list">
          ${history.map((h, i) => `
            <div class="history-item" data-idx="${i}">
              <div class="history-info">
                <span class="history-label">${h.label}</span>
                <span class="history-date">${new Date(h.ts).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })}</span>
              </div>
              <button class="btn btn--ghost btn--sm history-load-btn" data-idx="${i}">Cargar</button>
            </div>`).join('')}
        </div>`;

      wrap.querySelectorAll('.history-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
          if (history[idx]) showResult(history[idx].routine);
        });
      });
    } catch { wrap.style.display = 'none'; }
  }

  // ── Reset ─────────────────────────────────────────────────
  function reset() {
    currentStep = 0;
    answers     = {};
    const questionnaire = document.getElementById('routine-questionnaire');
    const resultEl      = document.getElementById('routine-result');
    const resetBtn      = document.getElementById('btn-reset-routine');
    if (questionnaire) questionnaire.style.display = '';
    if (resultEl)      resultEl.style.display = 'none';
    if (resetBtn)      resetBtn.style.display = 'none';
    const shareBtn = document.getElementById('btn-share-routine');
    if (shareBtn) shareBtn.style.display = 'none';
    renderStep();
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    renderStep();

    document.getElementById('quiz-next')?.addEventListener('click', () => {
      if (!validateStep()) return;
      if (currentStep < STEPS.length - 1) {
        currentStep++;
        renderStep();
      } else {
        const routine = generateRoutine(answers);
        showResult(routine);
      }
    });

    document.getElementById('quiz-prev')?.addEventListener('click', () => {
      if (currentStep > 0) { currentStep--; renderStep(); }
    });

    document.getElementById('btn-reset-routine')?.addEventListener('click', reset);
    document.getElementById('btn-share-routine')?.addEventListener('click', shareRoutine);

    // Share overlay close buttons
    document.getElementById('share-close')?.addEventListener('click', closeShareOverlay);
    document.getElementById('share-close-2')?.addEventListener('click', closeShareOverlay);

    // Cargar rutina guardada
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved?.routine) showResult(saved.routine);
    } catch { /* ignorar */ }

    // Mostrar historial
    renderHistory();
  }

  // ── Compartir rutina ──────────────────────────────────────
  function shareRoutine() {
    const overlay  = document.getElementById('share-overlay');
    const canvasWrap = document.getElementById('share-canvas-wrap');
    const resultEl = document.getElementById('routine-result');
    if (!overlay || !canvasWrap || !resultEl) return;

    canvasWrap.innerHTML = '';

    // Intentar con html2canvas si está cargado
    if (typeof html2canvas !== 'undefined') {
      html2canvas(resultEl, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false,
      }).then(canvas => {
        canvas.style.cssText = 'max-width:100%;border-radius:12px';
        canvasWrap.appendChild(canvas);

        document.getElementById('btn-download-share')?.addEventListener('click', () => {
          const link = document.createElement('a');
          link.download = 'mi-rutina-healthstack.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        }, { once: true });

        overlay.style.display = 'flex';
      }).catch(() => shareAsFallback(overlay, canvasWrap));
    } else {
      shareAsFallback(overlay, canvasWrap);
    }
  }

  function shareAsFallback(overlay, canvasWrap) {
    // Polyfill para roundRect en Safari/browsers más viejos
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        this.closePath();
      };
    }

    // Fallback: canvas con texto de la rutina cuando html2canvas no está disponible
    const canvas  = document.createElement('canvas');
    canvas.width  = 800;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 800, 480);

    // Cabecera
    const grad = ctx.createLinearGradient(0, 0, 800, 0);
    grad.addColorStop(0, '#6c63ff');
    grad.addColorStop(1, '#00d2ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 6);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('Mi Rutina — HealthStack Pro', 40, 60);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('healthstackpro.app', 40, 90);

    // Días
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    const sessions = saved?.routine?.sessions || [];
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui, sans-serif';
    sessions.slice(0, 6).forEach((s, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 40 + col * 250;
      const y = 130 + row * 160;

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(x, y, 220, 140, 12);
      ctx.fill();

      ctx.fillStyle = '#6c63ff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(s.day, x + 14, y + 26);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(s.name, x + 14, y + 42);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px system-ui, sans-serif';
      s.exercises.slice(0, 4).forEach((ex, j) => {
        ctx.fillText(`• ${ex.name} ${ex.sets}×${ex.reps}`, x + 14, y + 62 + j * 18);
      });
    });

    canvas.style.cssText = 'max-width:100%;border-radius:12px';
    canvasWrap.appendChild(canvas);

    document.getElementById('btn-download-share')?.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = 'mi-rutina-healthstack.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }, { once: true });

    overlay.style.display = 'flex';
  }

  function closeShareOverlay() {
    const overlay = document.getElementById('share-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  return { init };
})();
