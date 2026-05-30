/* ============================================================
   macroCalc.js — Calculadora TDEE + Macros
   Fórmula Mifflin-St Jeor (validada meta-análisis 2025).
   Persiste en localStorage. Gráfico de dona Chart.js.

   v3 — 2026-05-30:
   · Proteína por objetivo (max 2.0 g/kg en déficit, 1.8 en volumen)
   · 3 sliders de porcentaje: proteína%, grasa%, hidratos auto
   · Etiquetas % en el gráfico sin necesidad de hacer tap
   ============================================================ */

const MacroCalc = (function () {
  'use strict';

  const LS_KEY = 'hs_tdee';
  const LS_ADJ = 'hs_macro_adj';   // ajustes del usuario sobre los macros base

  let macroChartInstance = null;
  let _lastCalcCtx = null;          // { weight, targetKcal, goal } — para re-render desde sliders

  // ── Ajuste calórico por objetivo ───────────────────────────
  const GOAL_DELTA = {
    deficit_hard: -500,
    deficit_soft: -350,
    maintain:        0,
    surplus_soft:  350,
    surplus_hard:  500,
  };

  const GOAL_TIPS = {
    deficit_hard: 'Déficit de 500 kcal/día — pérdida estimada de ~0.5 kg/semana (límite saludable). Prioriza proteínas ≥2.0 g/kg para conservar músculo.',
    deficit_soft: 'Déficit de 350 kcal/día — pérdida estimada de ~0.35 kg/semana. Opción ideal para perder grasa sin comprometer el rendimiento ni la masa muscular.',
    maintain:     'Calorías de mantenimiento — el momento ideal para recomposición corporal si entrenas con sobrecarga progresiva.',
    surplus_soft: 'Superávit de 350 kcal/día — ganancia estimada de ~0.35 kg/semana. Minimiza la grasa ganada mientras maximiza la síntesis proteica.',
    surplus_hard: 'Superávit de 500 kcal/día — ganancia estimada de ~0.5 kg/semana (límite recomendado). Espera algo más de grasa. Ideal en fases de volumen.',
  };

  // ── Proteína por objetivo (g/kg de peso corporal) ──────────
  // Déficit: 2.0 g/kg — máximo para preservar músculo (ACSM 2023)
  // Mantenimiento/volumen: 1.8 g/kg — suficiente para síntesis proteica
  const PROTEIN_G_PER_KG = {
    deficit_hard: 2.0,
    deficit_soft: 2.0,
    maintain:     1.8,
    surplus_soft: 1.8,
    surplus_hard: 1.8,
  };

  // ── Ajustes del usuario ────────────────────────────────────
  function _loadAdj() {
    try { return JSON.parse(localStorage.getItem(LS_ADJ) || 'null') || {}; }
    catch { return {}; }
  }
  function _saveAdj(adj) {
    try { localStorage.setItem(LS_ADJ, JSON.stringify(adj)); } catch {}
  }

  // ── Cálculo BMR (Mifflin-St Jeor) ─────────────────────────
  function calcBMR(sex, age, weight, height) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === 'male' ? base + 5 : base - 161;
  }

  function calcTDEE(bmr, activity) {
    return Math.round(bmr * parseFloat(activity));
  }

  function calcTarget(tdee, goal) {
    return tdee + (GOAL_DELTA[goal] || 0);
  }

  // ── Base fat pct ───────────────────────────────────────────
  const BASE_FAT_PCT = 25;

  // ── Macros ─────────────────────────────────────────────────
  // adj: { proteinPct?: number, fatPct?: number } — % de kcal totales
  // Si adj tiene formato legacy (proteinDelta), se ignora → defaults
  function calcMacros(weight, targetKcal, goal, adj = {}) {
    const basePerKg     = PROTEIN_G_PER_KG[goal] || 1.8;
    const baseProteinG  = Math.round(weight * basePerKg);
    // Porcentaje recomendado de proteína según la fórmula g/kg
    const baseProteinPct = targetKcal > 0
      ? Math.min(50, Math.max(10, Math.round((baseProteinG * 4 / targetKcal) * 100)))
      : 30;
    const baseFatPct = BASE_FAT_PCT;

    // Si el adj es legacy (tiene proteinDelta), ignorarlo
    const hasNewFormat = adj.proteinPct !== undefined || adj.fatPct !== undefined;
    const safeAdj = hasNewFormat ? adj : {};

    const proteinPct = safeAdj.proteinPct !== undefined
      ? Math.min(50, Math.max(10, Math.round(safeAdj.proteinPct)))
      : baseProteinPct;
    const fatPct = safeAdj.fatPct !== undefined
      ? Math.min(50, Math.max(10, Math.round(safeAdj.fatPct)))
      : baseFatPct;
    const carbsPct = Math.max(0, 100 - proteinPct - fatPct);

    const proteinKcal = Math.round(targetKcal * proteinPct / 100);
    const proteinG    = Math.round(proteinKcal / 4);
    const fatKcal     = Math.round(targetKcal * fatPct / 100);
    const fatG        = Math.round(fatKcal / 9);
    const carbsKcal   = Math.max(0, targetKcal - proteinKcal - fatKcal);
    const carbsG      = Math.round(carbsKcal / 4);

    return {
      proteinG, proteinKcal, proteinPct,
      fatG, fatKcal, fatPct,
      carbsG, carbsKcal, carbsPct,
      basePerKg, baseProteinG, baseProteinPct, baseFatPct,
    };
  }

  // ── Leer formulario ────────────────────────────────────────
  function readForm() {
    return {
      sex:      document.querySelector('input[name="sex"]:checked')?.value || 'male',
      age:      parseInt(document.getElementById('tdee-age')?.value)      || 0,
      weight:   parseFloat(document.getElementById('tdee-weight')?.value) || 0,
      height:   parseFloat(document.getElementById('tdee-height')?.value) || 0,
      activity: document.getElementById('tdee-activity')?.value          || '1.55',
      goal:     document.getElementById('tdee-goal')?.value              || 'maintain',
    };
  }

  // ── Validar formulario ─────────────────────────────────────
  function validate({ age, weight, height }) {
    if (!age    || age    < 15 || age    > 99)  return { field: 'tdee-age',    msg: 'La edad debe estar entre 15 y 99 años.' };
    if (!weight || weight < 30 || weight > 300) return { field: 'tdee-weight', msg: 'El peso debe estar entre 30 y 300 kg.' };
    if (!height || height < 100|| height > 250) return { field: 'tdee-height', msg: 'La talla debe estar entre 100 y 250 cm.' };
    return null;
  }

  function _clearFieldStates() {
    ['tdee-age', 'tdee-weight', 'tdee-height'].forEach(id => {
      const el = document.getElementById(id);
      if (el && typeof window.setFieldState === 'function') window.setFieldState(el, 'clear');
    });
  }

  // ── Plugin: etiquetas % en el donut ───────────────────────
  // Dibuja el porcentaje directamente sobre cada segmento del donut,
  // sin necesidad de hacer tap. No requiere plugins externos.
  const _donutLabelsPlugin = {
    id: 'donutLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta  = chart.getDatasetMeta(0);
      const data  = chart.data.datasets[0].data;
      const total = data.reduce((a, b) => a + b, 0);
      if (!total) return;

      meta.data.forEach((arc, i) => {
        const pct = Math.round((data[i] / total) * 100);
        if (pct < 7) return; // segmentos muy pequeños — omitir etiqueta

        const midAngle = (arc.startAngle + arc.endAngle) / 2;
        const r        = (arc.outerRadius + arc.innerRadius) / 2;
        const lx       = arc.x + Math.cos(midAngle) * r;
        const ly       = arc.y + Math.sin(midAngle) * r;

        ctx.save();
        ctx.font         = '700 11px Inter, system-ui, sans-serif';
        ctx.fillStyle    = 'rgba(7,7,15,0.88)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%`, lx, ly);
        ctx.restore();
      });
    },
  };

  // ── Gráfico de dona ────────────────────────────────────────
  function renderMacroChart(proteinKcal, fatKcal, carbsKcal) {
    const canvas = document.getElementById('macro-chart');
    if (!canvas) return;

    if (macroChartInstance) { macroChartInstance.destroy(); macroChartInstance = null; }

    const ctx = canvas.getContext('2d');
    macroChartInstance = new Chart(ctx, {
      type: 'doughnut',
      plugins: [_donutLabelsPlugin],
      data: {
        labels: ['Proteína', 'Grasa', 'Hidratos'],
        datasets: [{
          data: [proteinKcal, fatKcal, carbsKcal],
          backgroundColor: ['#c4a561', '#f59e0b', '#00d2ff'],
          borderColor:     ['#c4a561', '#f59e0b', '#00d2ff'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '62%',   // ligeramente más ancho para que quepan los %
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(14, 14, 26, 0.95)',
            borderColor: 'rgba(196,165,97,0.28)',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#e2e8f0',
            callbacks: {
              label: item => {
                const tot = item.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((item.parsed / tot) * 100).toFixed(0);
                return ` ${item.label}: ${item.raw} kcal (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  // ── Actualizar UI de macros (reutilizable desde sliders) ───
  function _applyMacros(macros, targetKcal) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('macro-protein-g',    `${macros.proteinG} g`);
    set('macro-protein-kcal', `${macros.proteinKcal} kcal`);
    set('macro-protein-pct',  `${macros.proteinPct}%`);
    set('macro-fat-g',        `${macros.fatG} g`);
    set('macro-fat-kcal',     `${macros.fatKcal} kcal`);
    set('macro-fat-pct',      `${macros.fatPct}%`);
    set('macro-carbs-g',      `${macros.carbsG} g`);
    set('macro-carbs-kcal',   `${macros.carbsKcal} kcal`);
    set('macro-carbs-pct',    `${macros.carbsPct}%`);

    // Fórmula dinámica bajo "Proteína": muestra la base g/kg de referencia
    const fEl = document.getElementById('macro-protein-formula');
    if (fEl) fEl.textContent = `rec. ${macros.basePerKg}g/kg · ${macros.baseProteinG}g`;

    renderMacroChart(macros.proteinKcal, macros.fatKcal, macros.carbsKcal);
  }

  // ── Recalcular desde ajustes (usado por sliders) ───────────
  function _refreshFromAdj() {
    if (!_lastCalcCtx) return;
    const { weight, targetKcal, goal } = _lastCalcCtx;
    const adj    = _loadAdj();
    const macros = calcMacros(weight, targetKcal, goal, adj);
    _applyMacros(macros, targetKcal);
  }

  // ── Sliders de ajuste ──────────────────────────────────────
  function _renderAdjustSliders(weight, targetKcal, goal) {
    document.getElementById('macro-adj-panel')?.remove();

    const adj            = _loadAdj();
    const basePerKg      = PROTEIN_G_PER_KG[goal] || 1.8;
    const baseProteinG   = Math.round(weight * basePerKg);
    const baseProteinPct = targetKcal > 0
      ? Math.min(50, Math.max(10, Math.round((baseProteinG * 4 / targetKcal) * 100)))
      : 30;
    const baseFatPct = BASE_FAT_PCT;

    // Leer adj en nuevo formato (proteinPct/fatPct), ignorar legacy
    const hasNew     = adj.proteinPct !== undefined || adj.fatPct !== undefined;
    const curProtPct = hasNew && adj.proteinPct !== undefined ? adj.proteinPct : baseProteinPct;
    const curFatPct  = hasNew && adj.fatPct     !== undefined ? adj.fatPct     : baseFatPct;
    const curCarbPct = Math.max(0, 100 - curProtPct - curFatPct);

    const panel = document.createElement('div');
    panel.id        = 'macro-adj-panel';
    panel.className = 'macro-adj-panel';
    panel.innerHTML = `
      <div class="macro-adj-header">
        <span class="macro-adj-title">Distribución de macros</span>
        <button class="macro-adj-reset" id="macro-adj-reset">Restablecer óptimos</button>
      </div>
      <p class="macro-adj-hint">Los valores recomendados son óptimos para tu objetivo. Ajústalos a tu gusto.</p>
      <div class="macro-adj-sliders">
        <div class="macro-adj-row">
          <div class="macro-adj-label">
            <span class="macro-adj-dot" style="background:var(--hs-accent,#c4a561)"></span>
            <span>Proteína</span>
            <span class="macro-adj-rec" id="adj-protein-rec">rec. ${baseProteinPct}%</span>
          </div>
          <div class="macro-adj-ctrl">
            <input type="range" id="adj-protein" class="macro-adj-range"
                   min="10" max="50" step="1" value="${curProtPct}">
            <span class="macro-adj-val" id="adj-protein-val">${curProtPct}%</span>
          </div>
        </div>
        <div class="macro-adj-row">
          <div class="macro-adj-label">
            <span class="macro-adj-dot" style="background:#f59e0b"></span>
            <span>Grasa</span>
            <span class="macro-adj-rec" id="adj-fat-rec">rec. ${baseFatPct}%</span>
          </div>
          <div class="macro-adj-ctrl">
            <input type="range" id="adj-fat" class="macro-adj-range"
                   min="10" max="50" step="1" value="${curFatPct}">
            <span class="macro-adj-val" id="adj-fat-val">${curFatPct}%</span>
          </div>
        </div>
        <div class="macro-adj-row macro-adj-row--auto">
          <div class="macro-adj-label">
            <span class="macro-adj-dot" style="background:#00d2ff"></span>
            <span>Hidratos</span>
            <span class="macro-adj-auto-badge">auto</span>
          </div>
          <div class="macro-adj-ctrl">
            <input type="range" id="adj-carbs" class="macro-adj-range macro-adj-range--auto"
                   min="0" max="80" step="1" value="${curCarbPct}" disabled>
            <span class="macro-adj-val" id="adj-carbs-val">${curCarbPct}%</span>
          </div>
        </div>
      </div>
    `;

    const macroList = document.querySelector('.macro-list');
    macroList?.insertAdjacentElement('afterend', panel);

    const protSlider  = document.getElementById('adj-protein');
    const fatSlider   = document.getElementById('adj-fat');
    const carbsSlider = document.getElementById('adj-carbs');
    const pVal        = document.getElementById('adj-protein-val');
    const fVal        = document.getElementById('adj-fat-val');
    const cVal        = document.getElementById('adj-carbs-val');

    const onSlide = () => {
      const pPct = parseInt(protSlider.value);
      const fPct = parseInt(fatSlider.value);
      const cPct = Math.max(0, 100 - pPct - fPct);
      if (carbsSlider) carbsSlider.value = cPct;
      if (pVal) pVal.textContent = `${pPct}%`;
      if (fVal) fVal.textContent = `${fPct}%`;
      if (cVal) cVal.textContent = `${cPct}%`;
      _saveAdj({ proteinPct: pPct, fatPct: fPct });
      _refreshFromAdj();
    };

    protSlider.addEventListener('input', onSlide);
    fatSlider.addEventListener('input',  onSlide);

    document.getElementById('macro-adj-reset').addEventListener('click', () => {
      _saveAdj({});
      protSlider.value = baseProteinPct;
      fatSlider.value  = baseFatPct;
      const cPct = Math.max(0, 100 - baseProteinPct - baseFatPct);
      if (carbsSlider) carbsSlider.value = cPct;
      if (pVal) pVal.textContent = `${baseProteinPct}%`;
      if (fVal) fVal.textContent = `${baseFatPct}%`;
      if (cVal) cVal.textContent = `${cPct}%`;
      _refreshFromAdj();
    });
  }

  // ── Mostrar resultados ─────────────────────────────────────
  function showResults(data) {
    const { sex, age, weight, height, activity, goal } = data;

    const bmr    = calcBMR(sex, age, weight, height);
    const tdee   = calcTDEE(bmr, activity);
    const target = calcTarget(tdee, goal);

    // Guardar contexto para que los sliders puedan recalcular
    _lastCalcCtx = { weight, targetKcal: target, goal };

    const adj    = _loadAdj();
    const macros = calcMacros(weight, target, goal, adj);

    // Tarjetas de calorías
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('result-bmr',    `${Math.round(bmr)}`);
    set('result-tdee',   `${tdee}`);
    set('result-target', `${target}`);

    // Tip
    set('tip-text', GOAL_TIPS[goal] || '');

    // Macros + gráfico
    _applyMacros(macros, target);

    // Sliders de ajuste
    _renderAdjustSliders(weight, target, goal);

    // Mostrar sección de resultados
    const resultsEl = document.getElementById('nutrition-results');
    if (resultsEl) {
      resultsEl.style.display = 'block';
      resultsEl.style.animation = 'fadeIn 0.35s ease';
    }

    // Persistir
    localStorage.setItem(LS_KEY, JSON.stringify({ ...data, bmr, tdee, target, macros, ts: Date.now() }));
    if (isFinite(target) && target > 0) localStorage.setItem('hs_last_tdee', String(target));
    if (data.height) localStorage.setItem('hs_height_cm', String(data.height));

    // Actualizar dashboard TDEE
    const statTdee  = document.getElementById('stat-tdee');
    const statTdeeL = document.getElementById('stat-tdee-label');
    if (statTdee)  statTdee.textContent  = isFinite(target) && target > 0 ? `${target} kcal` : '-- kcal';
    if (statTdeeL) statTdeeL.textContent = goal === 'maintain' ? 'Mantenimiento' :
                                           goal.startsWith('deficit') ? 'Para perder peso' : 'Para ganar músculo';

    WeightTracker.renderAll();
    window.dispatchEvent(new CustomEvent('hs:tdee-calculated'));
  }

  // ── Cargar datos guardados ─────────────────────────────────
  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!saved) return;

      const radio = document.querySelector(`input[name="sex"][value="${saved.sex}"]`);
      if (radio) radio.checked = true;

      const fld = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      fld('tdee-age',      saved.age);
      fld('tdee-weight',   saved.weight);
      fld('tdee-height',   saved.height);
      fld('tdee-activity', saved.activity);
      fld('tdee-goal',     saved.goal);

      showResults(saved);
    } catch { /* ignorar datos corruptos */ }
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    const form = document.getElementById('tdee-form');
    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      _clearFieldStates();
      const data  = readForm();
      const error = validate(data);
      if (error) {
        showToast(error.msg, 'warning');
        if (typeof window.setFieldState === 'function') {
          const el = document.getElementById(error.field);
          window.setFieldState(el, 'error', error.msg);
          el?.focus();
        }
        return;
      }
      showResults(data);
      if (typeof window.setFieldState === 'function') {
        ['tdee-age','tdee-weight','tdee-height'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            window.setFieldState(el, 'success');
            setTimeout(() => window.setFieldState(el, 'clear'), 2000);
          }
        });
      }
    });

    loadSaved();
  }

  return { init };
})();
