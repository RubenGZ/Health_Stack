/* ============================================================
   timingPlanner.js — Planificador inteligente de timing nutricional
   Genera un horario diario óptimo basado en:
   - Hora y duración del entrenamiento
   - Objetivo (hipertrofia / definición / rendimiento)
   - Nº de comidas
   - Suplementos que usa el atleta
   Basado en los principios de las capturas FitSciPro.
   ============================================================ */

const TimingPlanner = (function () {
  'use strict';

  const LS_KEY = 'hs_timing_plan';

  // ── Templates de comidas por objetivo y slot ───────────────────────────────
  const MEAL_TEMPLATES = {
    hypertrophy: {
      breakfast: { name: 'Desayuno hipertrofia', desc: 'Avena + proteína whey + plátano + nueces', kcal: 580, p: 42, c: 68, f: 14 },
      snack1:    { name: 'Media mañana',          desc: 'Yogur griego + granola + frutos rojos', kcal: 320, p: 22, c: 38, f: 8 },
      pre:       { name: 'Pre-entreno',            desc: 'Arroz integral + pechuga + aguacate', kcal: 490, p: 38, c: 52, f: 10 },
      post:      { name: 'Post-entreno',           desc: 'Batido whey + dextrose + creatina', kcal: 420, p: 44, c: 50, f: 4 },
      lunch:     { name: 'Almuerzo',               desc: 'Salmón + arroz integral + brócoli', kcal: 560, p: 48, c: 56, f: 14 },
      snack2:    { name: 'Merienda',               desc: 'Requesón + nueces + canela', kcal: 220, p: 18, c: 8, f: 12 },
      dinner:    { name: 'Cena',                   desc: 'Ternera magra + patata + espinacas', kcal: 480, p: 42, c: 38, f: 14 },
    },
    deficit: {
      breakfast: { name: 'Desayuno déficit',       desc: 'Tortilla 4 claras + espinacas + tomate', kcal: 280, p: 32, c: 8, f: 12 },
      snack1:    { name: 'Media mañana',            desc: 'Yogur griego 0% + frutos rojos', kcal: 180, p: 16, c: 18, f: 2 },
      pre:       { name: 'Pre-entreno',             desc: 'Boniato + pechuga de pollo', kcal: 360, p: 36, c: 38, f: 4 },
      post:      { name: 'Post-entreno',            desc: 'Whey + plátano pequeño', kcal: 280, p: 30, c: 28, f: 3 },
      lunch:     { name: 'Almuerzo',                desc: 'Merluza al horno + quinoa + verduras', kcal: 380, p: 40, c: 32, f: 8 },
      snack2:    { name: 'Merienda',                desc: 'Edamame + requesón bajo en grasa', kcal: 160, p: 18, c: 10, f: 4 },
      dinner:    { name: 'Cena',                    desc: 'Pavo + brócoli + champiñones', kcal: 300, p: 38, c: 12, f: 8 },
    },
    performance: {
      breakfast: { name: 'Desayuno rendimiento',   desc: 'Pasta integral + huevos + zumo naranja', kcal: 620, p: 32, c: 88, f: 12 },
      snack1:    { name: 'Media mañana',            desc: 'Plátano + mantequilla cacahuete + avena', kcal: 360, p: 12, c: 56, f: 10 },
      pre:       { name: 'Pre-entreno',             desc: 'Arroz blanco + pechuga + plátano', kcal: 520, p: 38, c: 68, f: 4 },
      post:      { name: 'Post-entreno',            desc: 'Recovery shake: whey + dextrose + creatina + sal', kcal: 460, p: 48, c: 58, f: 4 },
      lunch:     { name: 'Almuerzo',                desc: 'Pollo + arroz integral + garbanzos + AOVE', kcal: 680, p: 52, c: 72, f: 16 },
      snack2:    { name: 'Merienda',                desc: 'Pan integral + atún + aguacate', kcal: 380, p: 28, c: 32, f: 14 },
      dinner:    { name: 'Cena',                    desc: 'Salmón + patata + ensalada verde', kcal: 520, p: 44, c: 44, f: 16 },
    },
  };

  // ── Suplementos con su lógica de timing ───────────────────────────────────
  const SUPP_TIMING_RULES = {
    whey:       { name: 'Proteína Whey (1 scoop)',    offset: +10,  desc: 'Tomar inmediatamente post-entreno con agua o leche' },
    creatine:   { name: 'Creatina (5 g)',             offset: +15,  desc: 'Puede tomarse en cualquier momento; post-entreno o con comida' },
    caffeine:   { name: 'Cafeína (200-300 mg)',       offset: -45,  desc: 'Tomar 45 min antes del entreno para máximo efecto' },
    betaalanine:{ name: 'Beta-Alanina (3.2 g)',       offset: -30,  desc: 'Tomar 30 min antes del entreno. Normal sentir hormigueo' },
    omega3:     { name: 'Omega-3 (2 cápsulas)',       offset: 0,    desc: 'Tomar con la comida más abundante para mejor absorción' },
    vitamind:   { name: 'Vitamina D3+K2',             offset: 0,    desc: 'Tomar con la comida principal (absorción con grasa)' },
    magnesium:  { name: 'Magnesio (300 mg)',          offset: -30,  desc: 'Tomar 30 min antes de dormir para mejor descanso' },
  };

  // ── Conversión hora → minutos ──────────────────────────────────────────────
  function toMins(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function fromMins(mins) {
    const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
    const m = ((mins % 1440) + 1440) % 1440 % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ── Generar schedule ───────────────────────────────────────────────────────
  function generateSchedule(params) {
    const { trainTime, duration, goal, mealCount, supplements, bedTime } = params;
    const trainMins = toMins(trainTime);
    const trainEnd  = trainMins + parseInt(duration);
    const bedMins   = toMins(bedTime);
    const wakeMin   = 360; // 06:00 por defecto

    const tpl = MEAL_TEMPLATES[goal] || MEAL_TEMPLATES.hypertrophy;
    const events = [];

    // ── Distribución de comidas ────────────────────────────────────────────
    const mealSlots = {
      3: ['breakfast', 'lunch', 'dinner'],
      4: ['breakfast', 'lunch', 'snack2', 'dinner'],
      5: ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'],
      6: ['breakfast', 'snack1', 'pre', 'post', 'snack2', 'dinner'],
    };
    const slots = mealSlots[Math.min(Math.max(parseInt(mealCount), 3), 6)] ||
      mealSlots[5];

    // Asignar horas a las comidas alrededor del entrenamiento
    const awakeWindow = bedMins - wakeMin; // minutos disponibles
    const mealSpacing = Math.floor(awakeWindow / (slots.length + 1));

    let mealTimes = {};
    slots.forEach((slot, i) => {
      // Pre-entreno y post-entreno fijados alrededor del gym
      if (slot === 'pre') {
        mealTimes[slot] = trainMins - 90;
      } else if (slot === 'post') {
        mealTimes[slot] = trainEnd + 15;
      } else {
        mealTimes[slot] = wakeMin + mealSpacing * (i + 1);
      }
    });

    // Ajustar para que post siempre sea después del entreno
    if (mealTimes['post'] && mealTimes['post'] < trainEnd) {
      mealTimes['post'] = trainEnd + 15;
    }

    // Añadir comidas al schedule
    slots.forEach(slot => {
      const meal = tpl[slot];
      if (!meal) return;
      events.push({
        time: fromMins(mealTimes[slot]),
        mins: mealTimes[slot],
        type: 'meal',
        slot,
        icon: slotIcon(slot),
        title: meal.name,
        desc: meal.desc,
        kcal: meal.kcal,
        p: meal.p, c: meal.c, f: meal.f,
      });
    });

    // ── Entrenamiento ──────────────────────────────────────────────────────
    events.push({
      time: trainTime,
      mins: trainMins,
      type: 'training',
      icon: '🏋️',
      title: `Entrenamiento (${duration} min)`,
      desc: goalLabel(goal),
      kcal: null, p: null, c: null, f: null,
    });

    // ── Suplementos ────────────────────────────────────────────────────────
    supplements.forEach(key => {
      const rule = SUPP_TIMING_RULES[key];
      if (!rule) return;
      let suppMins;

      if (rule.offset < 0) {
        suppMins = trainMins + rule.offset;
      } else if (rule.offset > 0) {
        suppMins = trainEnd + rule.offset;
      } else {
        // "con comida principal" → almuerzo o cena
        suppMins = mealTimes['lunch'] || mealTimes['dinner'] || trainEnd + 30;
      }

      // Magnesio → antes de dormir
      if (key === 'magnesium') {
        suppMins = bedMins - 30;
      }

      events.push({
        time: fromMins(suppMins),
        mins: suppMins,
        type: 'supplement',
        icon: '💊',
        title: rule.name,
        desc: rule.desc,
        kcal: null, p: null, c: null, f: null,
      });
    });

    // ── Hidratación ────────────────────────────────────────────────────────
    events.push({
      time: fromMins(trainMins - 30),
      mins: trainMins - 30,
      type: 'hydration',
      icon: '💧',
      title: 'Hidratación pre-entreno',
      desc: '400-600 ml de agua en los 30 min previos',
      kcal: null, p: null, c: null, f: null,
    });
    events.push({
      time: fromMins(trainEnd),
      mins: trainEnd,
      type: 'hydration',
      icon: '💧',
      title: 'Rehidratación',
      desc: 'Reponer 150% del peso perdido en sudor. Mínimo 500 ml en la primera hora.',
      kcal: null, p: null, c: null, f: null,
    });

    // Ordenar por hora
    events.sort((a, b) => a.mins - b.mins);

    return events;
  }

  function slotIcon(slot) {
    const icons = {
      breakfast: '🍳', snack1: '🍎', pre: '⚡', post: '🔋',
      lunch: '🍽️', snack2: '🥜', dinner: '🌙',
    };
    return icons[slot] || '🍴';
  }

  function goalLabel(goal) {
    const map = { hypertrophy: 'Hipertrofia', deficit: 'Definición', performance: 'Rendimiento' };
    return map[goal] || goal;
  }

  // ── Calcular totales del día ───────────────────────────────────────────────
  function calcDayTotals(events) {
    const meals = events.filter(e => e.type === 'meal');
    return {
      kcal: meals.reduce((s, e) => s + (e.kcal || 0), 0),
      p:    meals.reduce((s, e) => s + (e.p || 0), 0),
      c:    meals.reduce((s, e) => s + (e.c || 0), 0),
      f:    meals.reduce((s, e) => s + (e.f || 0), 0),
    };
  }

  // ── Generar avisos personalizados ─────────────────────────────────────────
  function generateTips(params, events) {
    const tips = [];
    const trainH = parseInt(params.trainTime.split(':')[0]);

    // Consejos según hora de entreno
    if (trainH >= 20) {
      tips.push({ icon: '⚠️', text: 'Entrenas tarde: evita la cafeína si tienes sensibilidad. Considera cambiar a L-teanina o pre-entreno sin estimulantes.' });
    } else if (trainH < 8) {
      tips.push({ icon: '🌅', text: 'Entreno matutino: toma carbohidratos de rápida absorción antes (plátano, dátiles) para activar el rendimiento.' });
    }
    if (parseInt(params.duration) > 90) {
      tips.push({ icon: '💧', text: 'Sesión larga (>90 min): añade bebida isotónica o carbohidratos de rápida absorción durante el entreno.' });
    }
    if (params.goal === 'deficit') {
      tips.push({ icon: '🎯', text: 'En déficit: la proteína es lo más importante. Prioriza 2.2–2.4 g/kg para preservar músculo.' });
    }
    if (params.goal === 'hypertrophy') {
      tips.push({ icon: '💪', text: 'Para hipertrofia: asegura un superávit calórico de 250-500 kcal/día y al menos 2 g/kg de proteína.' });
    }
    if (params.goal === 'performance') {
      tips.push({ icon: '⚡', text: 'Rendimiento: carga de carbohidratos la noche anterior. Prioriza 5-7 g/kg de hidratos en días de competición.' });
    }
    if (!params.supplements.includes('creatine')) {
      tips.push({ icon: '💡', text: 'No usas creatina. Es el suplemento más eficaz y barato: considera añadir 5 g/día.' });
    }
    if (parseInt(params.mealCount) <= 3) {
      tips.push({ icon: '📊', text: 'Con pocas comidas, asegura ingestas proteicas de 30-40 g para maximizar síntesis muscular.' });
    }
    // Consejo general siempre visible
    tips.push({ icon: '🕐', text: 'Respeta la ventana anabólica: consume proteína + carbohidratos en los 45-60 min post-entreno.' });

    return tips;
  }

  // ── Render schedule ────────────────────────────────────────────────────────
  function renderSchedule(events, params) {
    const container = document.getElementById('timing-schedule');
    if (!container) return;

    const totals = calcDayTotals(events);
    const tips = generateTips(params, events);

    container.innerHTML = `
      <div class="ts-header">
        <div class="ts-totals">
          <div class="ts-total-item"><span class="ts-total-val">${totals.kcal}</span><span class="ts-total-label">kcal/día</span></div>
          <div class="ts-total-item"><span class="ts-total-val" style="color:#6c63ff">${totals.p}g</span><span class="ts-total-label">Proteína</span></div>
          <div class="ts-total-item"><span class="ts-total-val" style="color:#00d2ff">${totals.c}g</span><span class="ts-total-label">Hidratos</span></div>
          <div class="ts-total-item"><span class="ts-total-val" style="color:#f59e0b">${totals.f}g</span><span class="ts-total-label">Grasa</span></div>
        </div>
        <div class="ts-actions">
          <button class="btn btn--primary btn--sm" id="btn-apply-to-planner">📅 Aplicar al Planner</button>
          <button class="btn btn--ghost btn--sm" id="btn-copy-schedule">📋 Copiar horario</button>
        </div>
      </div>

      <div class="ts-timeline">
        ${events.map(e => `
          <div class="ts-event ts-event--${e.type}">
            <div class="ts-time-col">
              <span class="ts-time">${e.time}</span>
            </div>
            <div class="ts-dot-col">
              <div class="ts-dot ts-dot--${e.type}"></div>
              <div class="ts-line"></div>
            </div>
            <div class="ts-content-col">
              <div class="ts-event-header">
                <span class="ts-event-icon">${e.icon}</span>
                <span class="ts-event-title">${e.title}</span>
                ${e.kcal ? `<span class="ts-event-kcal">${e.kcal} kcal</span>` : ''}
              </div>
              <p class="ts-event-desc">${e.desc}</p>
              ${e.type === 'meal' ? `
                <div class="ts-event-macros">
                  <span class="rmacro rmacro--p">P ${e.p}g</span>
                  <span class="rmacro rmacro--c">H ${e.c}g</span>
                  <span class="rmacro rmacro--f">G ${e.f}g</span>
                </div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      ${tips.length ? `
        <div class="ts-tips card">
          <h4 class="ts-tips-title">💡 Consejos personalizados</h4>
          <ul class="ts-tips-list">
            ${tips.map(t => `<li><span class="ts-tip-icon">${t.icon}</span> ${t.text}</li>`).join('')}
          </ul>
        </div>` : ''}
    `;

    // Aplicar al planner
    document.getElementById('btn-apply-to-planner')?.addEventListener('click', () => {
      applyToPlanner(events);
    });

    // Copiar horario
    document.getElementById('btn-copy-schedule')?.addEventListener('click', () => {
      const text = events.map(e => `${e.time} — ${e.title}: ${e.desc}`).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Horario copiado al portapapeles');
      }).catch(() => {
        showToast('⚠️ No se pudo copiar');
      });
    });
  }

  // ── Aplicar al Planner semanal ─────────────────────────────────────────────
  function applyToPlanner(events) {
    const mealEvents = events.filter(e => e.type === 'meal');
    document.dispatchEvent(new CustomEvent('hs:timing-apply', {
      detail: { meals: mealEvents },
    }));
    showToast('✅ Plan aplicado al Planner semanal (día actual)');
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg) {
    let t = document.getElementById('hs-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'hs-toast';
      t.className = 'hs-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('hs-toast--visible');
    setTimeout(() => t.classList.remove('hs-toast--visible'), 2800);
  }

  // ── Render checkboxes de suplementos ──────────────────────────────────────
  function renderSuppCheckboxes() {
    const wrap = document.getElementById('timing-suppl-checks');
    if (!wrap) return;

    wrap.innerHTML = Object.entries(SUPP_TIMING_RULES).map(([key, rule]) => `
      <label class="suppl-check-label">
        <input type="checkbox" name="tp-supp" value="${key}"
          ${['whey','creatine','caffeine'].includes(key) ? 'checked' : ''}>
        <span>${rule.name.split('(')[0].trim()}</span>
      </label>
    `).join('');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    renderSuppCheckboxes();

    // Valores por defecto del formulario
    // Si la hora actual es >= 22 o < 6 se usa 19:00 como valor por defecto
    const now = new Date();
    const nowH = now.getHours();
    const defaultTrainH = (nowH >= 6 && nowH + 2 <= 22) ? nowH + 2 : 19;
    const defaultTrain = `${String(defaultTrainH).padStart(2, '0')}:00`;
    const trainTimeEl = document.getElementById('tp-train-time');
    const bedTimeEl   = document.getElementById('tp-bed-time');
    if (trainTimeEl) trainTimeEl.value = defaultTrain;
    if (bedTimeEl)   bedTimeEl.value   = '23:00';

    document.getElementById('tp-generate-btn')?.addEventListener('click', () => {
      const trainTime = document.getElementById('tp-train-time')?.value || '19:00';
      const duration  = document.getElementById('tp-duration')?.value  || '60';
      const goal      = document.getElementById('tp-goal')?.value       || 'hypertrophy';
      const mealCount = document.getElementById('tp-meals')?.value      || '5';
      const bedTime   = document.getElementById('tp-bed-time')?.value   || '23:00';

      const checked = Array.from(
        document.querySelectorAll('input[name="tp-supp"]:checked')
      ).map(cb => cb.value);

      const params = { trainTime, duration, goal, mealCount, supplements: checked, bedTime };
      const events  = generateSchedule(params);

      localStorage.setItem(LS_KEY, JSON.stringify({ params, events }));

      document.getElementById('timing-result')?.classList.remove('hidden');
      renderSchedule(events, params);

      document.getElementById('timing-result')?.scrollIntoView({ behavior: 'smooth' });
    });

    // Cargar último plan si existe
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved?.events?.length) {
        document.getElementById('timing-result')?.classList.remove('hidden');
        renderSchedule(saved.events, saved.params);
      }
    } catch { /* ignorar */ }
  }

  return { init };
})();
