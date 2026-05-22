// frontend/js/workoutHistory.js
import * as ORM from './oneRepMax.js';
import * as PR  from './workoutPR.js';

export async function init(container) {
  const _wht = window.t || (k => k);
  container.innerHTML = '<p class="wl-history-empty" style="opacity:0.5">' + _wht('workout.loading') + '</p>';

  const token =
    localStorage.getItem('hs_access_token') ||
    sessionStorage.getItem('hs_access_token');
  let sessions = [];

  if (token) {
    try {
      const resp = await fetch('/api/v1/workout/sessions?page=1&per_page=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        sessions = (data.sessions || []).map(s => ({
          id: s.id,
          startedAt: s.started_at,
          durationSecs: s.duration_secs,
          totalVolumeKg: s.total_volume_kg,
          exercises: (s.exercises || []).map(name => ({
            name,
            key: name.toLowerCase().replace(/\s+/g, '_'),
            sets: [],
          })),
        }));
      }
    } catch {
      // ignorar — fallback a local
    }
  }

  // Fallback: localStorage si el backend no devuelve datos
  if (!sessions.length) {
    const { getLocalSessions } = await import('./workoutSession.js');
    sessions = getLocalSessions().slice(0, 20);
  }

  if (!sessions.length) {
    container.innerHTML = '<p class="wl-history-empty">' + _wht('workout.empty') + '</p>';
    return;
  }

  container.innerHTML = `
    <div class="wl-history-tabs">
      <button class="wl-htab wl-htab--active" data-tab="history">Historial</button>
      <button class="wl-htab" data-tab="calculator">Calculadora 1RM</button>
    </div>

    <div id="wl-htab-history">
      <div class="wl-history-actions">
        <button class="wl-export-btn" id="wl-export-btn">Exportar mis datos</button>
      </div>
      <h3 class="wl-history-title">${_wht('workout.history_title')}</h3>
      <div class="wl-session-list">${sessions.map(sessionCard).join('')}</div>
      <div class="wl-chart-section">
        <label class="wl-chart-label">${_wht('workout.chart_label')}</label>
        <canvas id="wl-chart" class="wl-chart" height="160"></canvas>
      </div>
    </div>

    <div id="wl-htab-calculator" style="display:none">
      ${buildCalculatorHTML()}
    </div>`;

  drawVolumeChart(container, sessions);
  initCalculator(container);
  initExport(container, sessions);

  // Tab switching
  container.querySelectorAll('.wl-htab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.wl-htab').forEach(b => b.classList.remove('wl-htab--active'));
      btn.classList.add('wl-htab--active');
      const tab = btn.dataset.tab;
      container.querySelector('#wl-htab-history').style.display    = tab === 'history'    ? '' : 'none';
      container.querySelector('#wl-htab-calculator').style.display = tab === 'calculator' ? '' : 'none';
    });
  });
}

// ─── Export JSON ──────────────────────────────────────────────────────────────
function initExport(container, sessions) {
  container.querySelector('#wl-export-btn')?.addEventListener('click', () => {
    let prs = {};
    try { prs = JSON.parse(localStorage.getItem('hs_prs') || '{}'); } catch {}
    const data = {
      export_date: new Date().toISOString(),
      app: 'HealthStack Pro',
      sessions,
      prs,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `healthstack-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ─── 1RM Calculator standalone ────────────────────────────────────────────────
function buildCalculatorHTML() {
  return `
    <div class="wl-calc">
      <div class="wl-calc-inputs">
        <div class="wl-calc-field">
          <label class="wl-calc-label">Ejercicio</label>
          <input type="text" id="wl-calc-exercise" class="wl-input wl-calc-ex-input"
            placeholder="Buscar ejercicio..." autocomplete="off" />
          <div id="wl-calc-ex-results" class="wl-calc-ex-results"></div>
        </div>
        <div class="wl-calc-row">
          <div class="wl-calc-field">
            <label class="wl-calc-label">Peso (kg)</label>
            <input type="number" id="wl-calc-weight" class="wl-input wl-input-num" min="0" step="0.5" placeholder="80" />
          </div>
          <div class="wl-calc-field">
            <label class="wl-calc-label">Reps</label>
            <input type="number" id="wl-calc-reps" class="wl-input wl-input-num" min="1" max="20" placeholder="8" />
          </div>
        </div>
        <div class="wl-calc-formula">
          <label class="wl-calc-label">Fórmula</label>
          <div class="wl-calc-formula-btns">
            <button class="wl-formula-btn wl-formula-btn--active" data-formula="best">Promedio</button>
            <button class="wl-formula-btn" data-formula="epley">Epley</button>
            <button class="wl-formula-btn" data-formula="brzycki">Brzycki</button>
          </div>
        </div>
      </div>

      <div id="wl-calc-result" class="wl-calc-result" style="display:none">
        <div class="wl-calc-1rm-hero">
          <span class="wl-calc-1rm-val" id="wl-calc-1rm-val">—</span>
          <span class="wl-calc-1rm-lbl">1RM estimado</span>
        </div>
        <div id="wl-calc-table" class="wl-calc-table"></div>
        <canvas id="wl-calc-chart" class="wl-calc-chart" height="140"></canvas>
        <div id="wl-calc-progress" class="wl-calc-progress-note"></div>
      </div>

      <!-- Plate Calculator -->
      <div class="wl-plate-calc">
        <h4 class="wl-plate-title">Plate Calculator</h4>
        <div class="wl-plate-row">
          <div class="wl-plate-bar-btns">
            <button class="wl-bar-btn wl-bar-btn--active" data-bar="20">Olímpica 20kg</button>
            <button class="wl-bar-btn" data-bar="15">Estándar 15kg</button>
            <button class="wl-bar-btn" data-bar="10">Curl 10kg</button>
          </div>
          <div class="wl-calc-field">
            <label class="wl-calc-label">Peso objetivo (kg)</label>
            <input type="number" id="wl-plate-target" class="wl-input wl-input-num" min="0" step="2.5" placeholder="102.5" />
          </div>
        </div>
        <div id="wl-plate-result" class="wl-plate-result"></div>
      </div>
    </div>`;
}

function initCalculator(container) {
  const weightInp   = container.querySelector('#wl-calc-weight');
  const repsInp     = container.querySelector('#wl-calc-reps');
  const exInp       = container.querySelector('#wl-calc-exercise');
  const exResults   = container.querySelector('#wl-calc-ex-results');
  const resultDiv   = container.querySelector('#wl-calc-result');
  const oneRMVal    = container.querySelector('#wl-calc-1rm-val');
  const tableDiv    = container.querySelector('#wl-calc-table');
  const chartCanvas = container.querySelector('#wl-calc-chart');
  const progressDiv = container.querySelector('#wl-calc-progress');
  const plateTarget = container.querySelector('#wl-plate-target');
  const plateResult = container.querySelector('#wl-plate-result');

  let _formula    = 'best';
  let _exerciseKey = null;
  let _barKg       = 20;

  // Exercise autocomplete
  exInp?.addEventListener('input', () => {
    const q = exInp.value.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!q) { exResults.innerHTML = ''; return; }
    const db = (typeof Exercises !== 'undefined' && Exercises.getDB) ? Exercises.getDB() : [];
    const hits = db.filter(ex => ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)).slice(0, 6);
    exResults.innerHTML = hits.map(ex =>
      `<button class="wl-calc-ex-item" data-key="${ex.key || ex.name.toLowerCase().replace(/\s+/g,'_')}" data-name="${ex.name}">${ex.name}</button>`
    ).join('');
    exResults.querySelectorAll('.wl-calc-ex-item').forEach(btn => {
      btn.addEventListener('click', () => {
        exInp.value    = btn.dataset.name;
        _exerciseKey   = btn.dataset.key;
        exResults.innerHTML = '';
        // pre-fill con mejor set histórico
        const hist = ORM.getHistory(_exerciseKey);
        if (hist.length) {
          const best = hist.reduce((b, e) => e.oneRM > (b?.oneRM ?? 0) ? e : b, null);
          if (best) { weightInp.value = best.weightKg; repsInp.value = best.reps; }
        }
        _recalc();
      });
    });
  });

  // Formula buttons
  container.querySelectorAll('.wl-formula-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.wl-formula-btn').forEach(b => b.classList.remove('wl-formula-btn--active'));
      btn.classList.add('wl-formula-btn--active');
      _formula = btn.dataset.formula;
      _recalc();
    });
  });

  // Bar buttons
  container.querySelectorAll('.wl-bar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.wl-bar-btn').forEach(b => b.classList.remove('wl-bar-btn--active'));
      btn.classList.add('wl-bar-btn--active');
      _barKg = parseInt(btn.dataset.bar);
      _renderPlate();
    });
  });

  weightInp?.addEventListener('input', _recalc);
  repsInp?.addEventListener('input',   _recalc);
  plateTarget?.addEventListener('input', _renderPlate);

  function _recalc() {
    const kg   = parseFloat(weightInp?.value);
    const reps = parseInt(repsInp?.value);
    if (!kg || !reps || kg <= 0 || reps <= 0) { resultDiv.style.display = 'none'; return; }

    let orm = null;
    if (_formula === 'epley')   orm = ORM.epley(kg, reps);
    else if (_formula === 'brzycki') orm = ORM.brzycki(kg, reps);
    else orm = ORM.best1RM(kg, reps);

    if (!orm) { resultDiv.style.display = 'none'; return; }
    orm = Math.round(orm * 10) / 10;

    resultDiv.style.display = '';
    oneRMVal.textContent = `${orm} kg`;

    // Tabla
    const rows = ORM.buildTable(kg, reps);
    tableDiv.innerHTML = rows.map(r => `
      <div class="wl-calc-row-item${r.isCurrent ? ' wl-calc-row-current' : ''}">
        <span class="wl-calc-n">${r.n} RM</span>
        <span class="wl-calc-kg">${r.kg} kg</span>
        <span class="wl-calc-zone" style="color:${r.zone.color}">${r.zone.label}</span>
      </div>`).join('');

    // Gráfico de evolución si hay ejercicio seleccionado
    if (_exerciseKey) {
      const hist = ORM.getHistory(_exerciseKey);
      _drawOrmChart(chartCanvas, hist, orm);
      if (hist.length >= 2) {
        const first = hist[0].oneRM, last = orm;
        const delta = Math.round((last - first) * 10) / 10;
        const pct   = Math.round(((last - first) / first) * 100);
        progressDiv.textContent = delta > 0
          ? `Progreso: +${delta} kg (+${pct}%) desde el inicio`
          : delta < 0 ? `Variación: ${delta} kg (${pct}%)` : 'Sin variación registrada';
      } else {
        progressDiv.textContent = '';
      }
      chartCanvas.style.display = '';
    } else {
      chartCanvas.style.display = 'none';
      progressDiv.textContent   = '';
    }

    // Plate calc sincronizado
    if (!plateTarget.value && kg) plateTarget.value = kg;
    _renderPlate();
  }

  function _renderPlate() {
    const target = parseFloat(plateTarget?.value);
    if (!target || target <= 0) { plateResult.innerHTML = ''; return; }
    const { achievable, plates, totalKg } = ORM.plateCalc(target, _barKg);
    if (achievable && plates.length) {
      const platesStr = plates.map(p => `${p.count}× ${p.kg} kg`).join('  +  ');
      plateResult.innerHTML = `
        <div class="wl-plate-plates">Cada lado: <strong>${platesStr}</strong></div>
        <div class="wl-plate-total">Total: <strong>${totalKg} kg</strong></div>`;
    } else if (achievable && !plates.length) {
      plateResult.innerHTML = `<div class="wl-plate-total">Solo barra: <strong>${_barKg} kg</strong></div>`;
    } else {
      const { below, above } = ORM.plateCalcNearest(target, _barKg);
      const belowStr = below ? `${below.totalKg} kg` : '—';
      const aboveStr = above ? `${above.totalKg} kg` : '—';
      plateResult.innerHTML = `
        <div class="wl-plate-nearest">No alcanzable exactamente · Más cercanos: <strong>${belowStr}</strong> / <strong>${aboveStr}</strong></div>`;
    }
  }
}

function _drawOrmChart(canvas, history, currentOrm) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 340;
  canvas.width = W;
  const H = 140, PAD = 36;

  const points = [...history.map(h => ({ date: new Date(h.date), val: h.oneRM })),
                  { date: new Date(), val: currentOrm }];
  if (points.length < 2) { ctx.clearRect(0, 0, W, H); return; }

  const maxVal = Math.max(...points.map(p => p.val));
  const minVal = Math.min(...points.map(p => p.val));
  const range  = maxVal - minVal || 1;
  const toX = i => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD - ((v - minVal) / range) * (H - PAD * 2);

  ctx.clearRect(0, 0, W, H);
  ctx.beginPath(); ctx.strokeStyle = '#6c63ff'; ctx.lineWidth = 2;
  points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p.val)) : ctx.lineTo(toX(i), toY(p.val)));
  ctx.stroke();

  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    ctx.beginPath();
    ctx.arc(toX(i), toY(p.val), isLast ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isLast ? '#f59e0b' : '#6c63ff';
    ctx.fill();
    if (isLast) {
      ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 11px system-ui';
      ctx.fillText(`${p.val} kg`, toX(i) - 18, toY(p.val) - 8);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '10px system-ui';
    const lbl = p.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    ctx.fillText(lbl, toX(i) - 12, H - 6);
  });
}

function sessionCard(s) {
  const _LOCALE_MAP = { es:'es-ES', en:'en-GB', fr:'fr-FR', de:'de-DE', it:'it-IT' };
  const _lang = window.getLanguage ? window.getLanguage() : 'es';
  const _locale = _LOCALE_MAP[_lang] || 'es-ES';
  const date = new Date(s.startedAt).toLocaleDateString(_locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const duration = s.durationSecs ? `${Math.round(s.durationSecs / 60)} min` : '';
  const volume = s.totalVolumeKg ? `${s.totalVolumeKg.toLocaleString('es-ES')} kg` : '';
  const exNames = (s.exercises || []).map(e => e.name).join(', ');
  return `<div class="wl-session-card">
    <span class="wl-sc-date">${date}</span>
    <span class="wl-sc-exercises">${exNames}</span>
    <span class="wl-sc-meta">${[duration, volume].filter(Boolean).join(' · ')}</span>
  </div>`;
}

function drawVolumeChart(container, sessions) {
  const canvas = container.querySelector('#wl-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 360;
  canvas.width = W;
  const H = 160, PAD = 36;

  const points = sessions
    .filter(s => s.totalVolumeKg > 0)
    .map(s => ({ date: new Date(s.startedAt), val: Math.round(s.totalVolumeKg) }))
    .reverse();

  ctx.clearRect(0, 0, W, H);

  if (points.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px system-ui';
    ctx.fillText((window.t && window.t('workout.chart_min')) || 'Need ≥2 sessions to see the chart.', 16, 80);
    return;
  }

  const maxVal = Math.max(...points.map(p => p.val));
  const minVal = Math.min(...points.map(p => p.val));
  const range = maxVal - minVal || 1;
  const toX = i => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD - ((v - minVal) / range) * (H - PAD * 2);

  // Línea de progresión
  ctx.beginPath();
  ctx.strokeStyle = '#7c6bff';
  ctx.lineWidth = 2;
  points.forEach((p, i) =>
    i === 0 ? ctx.moveTo(toX(i), toY(p.val)) : ctx.lineTo(toX(i), toY(p.val))
  );
  ctx.stroke();

  // Puntos + etiquetas
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(p.val), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6bff';
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px system-ui';
    ctx.fillText(`${p.val}kg`, toX(i) - 14, toY(p.val) - 8);

    const _lm2 = { es:'es-ES', en:'en-GB', fr:'fr-FR', de:'de-DE', it:'it-IT' };
    const _l2 = _lm2[window.getLanguage ? window.getLanguage() : 'es'] || 'es-ES';
    const label = p.date.toLocaleDateString(_l2, { day: 'numeric', month: 'short' });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(label, toX(i) - 14, H - 8);
  });
}
