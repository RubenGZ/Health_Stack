// frontend/js/workout/readiness-check.js
// Encuesta pre-sesión (~20 s). Aparece entre selector de día y pre-workout adjust.

const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ─── Score ─────────────────────────────────────────────────────────────────────
export function calcReadinessScore({ sleep, food, preworkout, feeling }) {
  let score = 50;
  if (sleep === '8+')  score += 20;
  else if (sleep === '7-8') score += 12;
  else if (sleep === '<6')  score -= 20;
  // '6-7' → +0

  if (food === '1-2h')  score += 15;
  else if (food === '<1h')  score += 5;
  else if (food === 'nada') score -= 15;
  // '+3h' → +0

  if (preworkout) score += 10;

  if (feeling === 'top')     score += 25;
  else if (feeling === 'bien')   score += 15;
  else if (feeling === 'mal')    score -= 25;
  // 'normal' → +0

  return Math.max(0, Math.min(100, score));
}

// ─── Adjustment ───────────────────────────────────────────────────────────────
export function getReadinessAdj(score) {
  if (score >= 80) {
    return { setsDelta: null, volumePct: null, weightPct: null,
             message: '🔥 Hoy estás al 100% — dale fuerte', canApply: false };
  }
  if (score >= 60) {
    return { setsDelta: null, volumePct: null, weightPct: null,
             message: '💪 Día normal — sigue el plan', canApply: false };
  }
  if (score >= 40) {
    return { setsDelta: -1, volumePct: null, weightPct: null,
             message: '⚡ Energía justa — te sugiero −1 set en cada ejercicio', canApply: true };
  }
  return { setsDelta: null, volumePct: 0.80, weightPct: 0.95,
           message: '😴 Día flojo — te sugiero −20% volumen y −5% peso', canApply: true };
}

// ─── Render ────────────────────────────────────────────────────────────────────
export function renderReadinessCheck(container, onComplete) {
  // Pre-selección de comida si hay datos de hoy en localStorage
  let foodPreset = null;
  try {
    const tdeeTs = parseInt(localStorage.getItem('hs_tdee_ts') || '0', 10);
    if (tdeeTs && (Date.now() - tdeeTs) < 4 * 3600 * 1000) foodPreset = '<1h';
  } catch {}

  container.innerHTML = `
    <div class="wl-readiness">
      <div class="wl-readiness-header">
        <h3 class="wl-readiness-title">Antes de empezar</h3>
        <p class="wl-readiness-sub">4 preguntas rápidas para ajustar tu sesión</p>
      </div>

      <div class="wl-readiness-questions">

        <!-- Q1: Sueño -->
        <div class="wl-rq" data-q="sleep">
          <p class="wl-rq-label">¿Cuánto dormiste anoche?</p>
          <div class="wl-rq-options">
            <button class="wl-rq-opt" data-val="<6">&lt;6h</button>
            <button class="wl-rq-opt" data-val="6-7">6-7h</button>
            <button class="wl-rq-opt" data-val="7-8">7-8h</button>
            <button class="wl-rq-opt" data-val="8+">8h+</button>
          </div>
        </div>

        <!-- Q2: Comida -->
        <div class="wl-rq" data-q="food">
          <p class="wl-rq-label">¿Has comido antes?</p>
          <div class="wl-rq-options">
            <button class="wl-rq-opt" data-val="nada">Nada</button>
            <button class="wl-rq-opt" data-val="+3h">+3h</button>
            <button class="wl-rq-opt" data-val="1-2h">1-2h</button>
            <button class="wl-rq-opt${foodPreset === '<1h' ? ' wl-rq-opt--selected' : ''}" data-val="<1h">&lt;1h</button>
          </div>
        </div>

        <!-- Q3: Pre-entreno -->
        <div class="wl-rq" data-q="preworkout">
          <p class="wl-rq-label">¿Pre-entreno hoy?</p>
          <div class="wl-rq-options">
            <button class="wl-rq-opt" data-val="no">No</button>
            <button class="wl-rq-opt" data-val="si">Sí</button>
          </div>
        </div>

        <!-- Q4: Feeling -->
        <div class="wl-rq" data-q="feeling">
          <p class="wl-rq-label">¿Cómo te sientes?</p>
          <div class="wl-rq-options">
            <button class="wl-rq-opt" data-val="mal">Mal</button>
            <button class="wl-rq-opt" data-val="normal">Normal</button>
            <button class="wl-rq-opt" data-val="bien">Bien</button>
            <button class="wl-rq-opt" data-val="top">Top</button>
          </div>
        </div>

      </div>

      <!-- Sugerencia adaptativa (aparece tras responder todo) -->
      <div class="wl-readiness-adj" id="wl-readiness-adj" style="display:none"></div>

      <div class="wl-readiness-actions">
        <button class="btn btn--primary wl-readiness-cta" id="wl-readiness-continue" disabled>
          Continuar →
        </button>
        <button class="btn--ghost wl-readiness-skip" id="wl-readiness-skip">Saltar</button>
      </div>
    </div>`;

  const answers = { sleep: null, food: foodPreset, preworkout: null, feeling: null };
  let pendingAdj = null;

  function _checkComplete() {
    const allAnswered = answers.sleep && answers.food && answers.preworkout !== null && answers.feeling;
    const btn = container.querySelector('#wl-readiness-continue');
    if (btn) btn.disabled = !allAnswered;
    if (!allAnswered) return;

    const score = calcReadinessScore({
      sleep:      answers.sleep,
      food:       answers.food,
      preworkout: answers.preworkout === 'si',
      feeling:    answers.feeling,
    });
    const adj = getReadinessAdj(score);
    pendingAdj = { score, adj };

    const adjEl = container.querySelector('#wl-readiness-adj');
    if (adjEl) {
      adjEl.style.display = '';
      adjEl.innerHTML = `
        <div class="wl-readiness-score-msg">${_esc(adj.message)}</div>
        ${adj.canApply ? `<button class="btn btn--ghost wl-readiness-apply" id="wl-readiness-apply-adj">Aplicar sugerencia</button>` : ''}`;

      container.querySelector('#wl-readiness-apply-adj')?.addEventListener('click', () => {
        const applyBtn = container.querySelector('#wl-readiness-apply-adj');
        if (applyBtn) { applyBtn.textContent = '✓ Aplicado'; applyBtn.disabled = true; }
        pendingAdj.adjAccepted = true;
      });
    }
  }

  // Delegación de clicks en opciones
  container.querySelectorAll('.wl-rq').forEach(qEl => {
    const q = qEl.dataset.q;
    qEl.querySelectorAll('.wl-rq-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        qEl.querySelectorAll('.wl-rq-opt').forEach(o => o.classList.remove('wl-rq-opt--selected'));
        opt.classList.add('wl-rq-opt--selected');
        answers[q] = opt.dataset.val;
        _checkComplete();
      });
    });
  });

  // Pre-selección visual si hay preset de comida
  if (foodPreset) {
    _checkComplete();
  }

  container.querySelector('#wl-readiness-continue')?.addEventListener('click', () => {
    const score = pendingAdj?.score ?? 65;
    const adj   = pendingAdj?.adj   ?? getReadinessAdj(65);
    const adjAccepted = pendingAdj?.adjAccepted ?? false;
    _saveReadiness({ ...answers, score, skipped: false });
    onComplete({ score, adj: adjAccepted ? adj : null, raw: answers, skipped: false });
  });

  container.querySelector('#wl-readiness-skip')?.addEventListener('click', () => {
    _saveReadiness({ sleep: null, food: null, preworkout: null, feeling: null, score: 65, skipped: true });
    onComplete({ score: 65, adj: null, raw: null, skipped: true });
  });
}

function _saveReadiness(data) {
  try {
    const record = { ...data, ts: new Date().toISOString() };
    localStorage.setItem('hs_last_readiness', JSON.stringify(record));
  } catch {}
}
