/* ============================================================
   macroCalc.js — Calculadora TDEE + Macros
   Fórmula Mifflin-St Jeor. Persiste en localStorage.
   Gráfico de dona (doughnut) Chart.js para la distribución.
   ============================================================ */

const MacroCalc = (function () {
  'use strict';

  const LS_KEY = 'hs_tdee';

  let macroChartInstance = null;

  // ── Ajuste calórico por objetivo ───────────────────────────
  const GOAL_DELTA = {
    deficit_hard: -500,
    deficit_soft: -250,
    maintain:        0,
    surplus_soft:  250,
    surplus_hard:  500,
  };

  const GOAL_TIPS = {
    deficit_hard: '⚠️ Un déficit de 500 kcal es el límite recomendado para preservar masa muscular. Asegura ≥1.8 g de proteína por kg corporal.',
    deficit_soft: '✅ Un déficit suave de 250 kcal es ideal para perder grasa sin perder músculo ni afectar el rendimiento.',
    maintain:     '⚖️ En mantenimiento es el momento ideal para recomposición corporal si entrenas con progresión de cargas.',
    surplus_soft: '💪 Un superávit de 250 kcal minimiza la ganancia de grasa mientras maximiza la síntesis proteica muscular.',
    surplus_hard: '📈 Un superávit agresivo acelera la ganancia muscular, pero espera algo más de ganancia de grasa. Ideal en fases de volumen.',
  };

  // ── Cálculo BMR (Mifflin-St Jeor) ─────────────────────────
  function calcBMR(sex, age, weight, height) {
    // sex: 'male' | 'female'
    // Fórmula: 10*peso + 6.25*talla - 5*edad + constante
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === 'male' ? base + 5 : base - 161;
  }

  function calcTDEE(bmr, activity) {
    return Math.round(bmr * parseFloat(activity));
  }

  function calcTarget(tdee, goal) {
    return tdee + (GOAL_DELTA[goal] || 0);
  }

  // ── Macros ─────────────────────────────────────────────────
  function calcMacros(weight, targetKcal) {
    // Proteína: 2.0 g/kg de peso corporal
    const proteinG   = Math.round(weight * 2.0);
    const proteinKcal = proteinG * 4;

    // Grasa: 25% de las kcal objetivo (mínimo saludable ~20%)
    const fatKcal = Math.round(targetKcal * 0.25);
    const fatG    = Math.round(fatKcal / 9);

    // Hidratos: calorías restantes
    const carbsKcal = Math.max(0, targetKcal - proteinKcal - fatKcal);
    const carbsG    = Math.round(carbsKcal / 4);

    return { proteinG, proteinKcal, fatG, fatKcal, carbsG, carbsKcal };
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
    if (!age    || age    < 15 || age    > 99)  return 'La edad debe estar entre 15 y 99 años.';
    if (!weight || weight < 30 || weight > 300) return 'El peso debe estar entre 30 y 300 kg.';
    if (!height || height < 100|| height > 250) return 'La talla debe estar entre 100 y 250 cm.';
    return null;
  }

  // ── Gráfico de dona ────────────────────────────────────────
  function renderMacroChart(proteinKcal, fatKcal, carbsKcal) {
    const canvas = document.getElementById('macro-chart');
    if (!canvas) return;

    if (macroChartInstance) { macroChartInstance.destroy(); macroChartInstance = null; }

    const ctx = canvas.getContext('2d');
    macroChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Proteína', 'Grasa', 'Hidratos'],
        datasets: [{
          data: [proteinKcal, fatKcal, carbsKcal],
          backgroundColor: ['#6c63ff', '#f59e0b', '#00d2ff'],
          borderColor:     ['#6c63ff', '#f59e0b', '#00d2ff'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(14, 14, 26, 0.95)',
            borderColor: 'rgba(108, 99, 255, 0.3)',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#e2e8f0',
            callbacks: {
              label: item => {
                const total = item.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = ((item.parsed / total) * 100).toFixed(0);
                return ` ${item.label}: ${item.raw} kcal (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  // ── Mostrar resultados ─────────────────────────────────────
  function showResults(data) {
    const { sex, age, weight, height, activity, goal } = data;

    const bmr    = calcBMR(sex, age, weight, height);
    const tdee   = calcTDEE(bmr, activity);
    const target = calcTarget(tdee, goal);
    const macros = calcMacros(weight, target);

    // Tarjetas de calorías
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('result-bmr',    `${Math.round(bmr)}`);
    set('result-tdee',   `${tdee}`);
    set('result-target', `${target}`);

    // Macros
    set('macro-protein-g',    `${macros.proteinG} g`);
    set('macro-protein-kcal', `${macros.proteinKcal} kcal`);
    set('macro-fat-g',        `${macros.fatG} g`);
    set('macro-fat-kcal',     `${macros.fatKcal} kcal`);
    set('macro-carbs-g',      `${macros.carbsG} g`);
    set('macro-carbs-kcal',   `${macros.carbsKcal} kcal`);

    // Tip
    set('tip-text', GOAL_TIPS[goal] || '');

    // Gráfico
    renderMacroChart(macros.proteinKcal, macros.fatKcal, macros.carbsKcal);

    // Mostrar resultados
    const resultsEl = document.getElementById('nutrition-results');
    if (resultsEl) {
      resultsEl.style.display = 'block';
      resultsEl.style.animation = 'fadeIn 0.35s ease';
    }

    // Persistir
    localStorage.setItem(LS_KEY, JSON.stringify({ ...data, bmr, tdee, target, macros, ts: Date.now() }));
    // Valores globales para el dashboard
    localStorage.setItem('hs_last_tdee', String(target));
    if (data.height) localStorage.setItem('hs_height_cm', String(data.height));

    // Actualizar dashboard TDEE
    const statTdee  = document.getElementById('stat-tdee');
    const statTdeeL = document.getElementById('stat-tdee-label');
    if (statTdee)  statTdee.textContent  = `${target} kcal`;
    if (statTdeeL) statTdeeL.textContent = goal === 'maintain' ? 'Mantenimiento' :
                                           goal.startsWith('deficit') ? 'Para perder peso' : 'Para ganar músculo';

    // Trigger actualización de BMI en peso
    WeightTracker.renderAll();

    // Notificar gamificación
    window.dispatchEvent(new CustomEvent('hs:tdee-calculated'));
  }

  // ── Cargar datos guardados ─────────────────────────────────
  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!saved) return;

      // Rellenar formulario
      const radio = document.querySelector(`input[name="sex"][value="${saved.sex}"]`);
      if (radio) radio.checked = true;

      const fld = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      fld('tdee-age',      saved.age);
      fld('tdee-weight',   saved.weight);
      fld('tdee-height',   saved.height);
      fld('tdee-activity', saved.activity);
      fld('tdee-goal',     saved.goal);

      // Mostrar resultados guardados
      showResults(saved);
    } catch { /* ignorar datos corruptos */ }
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    const form = document.getElementById('tdee-form');
    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const data  = readForm();
      const error = validate(data);
      if (error) { alert(error); return; }
      showResults(data);
    });

    // Cargar datos guardados si existen
    loadSaved();
  }

  return { init };
})();
