/* ============================================================
   js/dashboard/index.js — Lógica del Dashboard principal
   Extraído de app.js (Fase 5 — modularización 2026-05-23)

   Responsabilidades:
   - Saludo dinámico y fecha
   - Racha semanal
   - Welcome card (nombre + racha)
   - User chip (avatar, nivel XP)
   - Stat cards (peso, IMC, TDEE, registros)
   - Mini gráfico de peso
   - Smart Progress Projection
   - Progress insight (velocidad de cambio vs objetivo)
   - Escucha de eventos hs:weight-updated y hs:tdee-calculated

   Expone: window.Dashboard = { init, refresh }
   ============================================================ */

window.Dashboard = (function () {
  'use strict';

  function _t(key) { return (window.t && window.t(key)) || key; }

  // ── Semana ISO ─────────────────────────────────────────────
  function getWeekNumber(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  }

  // ── Racha (semanas con al menos un registro) ───────────────
  function updateStreak() {
    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    let streak = 0;
    if (entries.length) {
      const weeks = new Set();
      entries.forEach(e => {
        const d = new Date(e.date);
        weeks.add(`${d.getFullYear()}-${getWeekNumber(d)}`);
      });
      streak = weeks.size;
    }
    const el = document.getElementById('streak-count');
    if (el) el.textContent = streak;
  }

  // ── Saludo dinámico ───────────────────────────────────────
  function initDashboard() {
    const _tl   = window.t || (k => k);
    const lang  = window.getLanguage ? window.getLanguage() : 'es';
    const hour  = new Date().getHours();
    const greeting = hour < 13 ? _tl('dashboard.greet_morning')
                   : hour < 20 ? _tl('dashboard.greet_afternoon')
                   :              _tl('dashboard.greet_evening');
    const user = API?.getUser?.();
    const name = user?.display_name || 'Atleta';

    const greetEl = document.getElementById('dashboard-greeting');
    if (greetEl) greetEl.textContent = `${greeting}, ${name}`;

    const dateEl = document.getElementById('dashboard-date');
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toLocaleDateString(lang, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    }
    updateStreak();
  }

  // ── Welcome card ──────────────────────────────────────────
  function updateWelcomeCard() {
    const _tl   = window.t || (k => k);
    const user  = JSON.parse(localStorage.getItem('hs_user') || 'null');
    const hour  = new Date().getHours();
    const greet = hour < 6  ? _tl('dashboard.greet_evening')
                : hour < 13 ? _tl('dashboard.greet_morning')
                : hour < 20 ? _tl('dashboard.greet_afternoon')
                :              _tl('dashboard.greet_evening');
    const greetEl = document.getElementById('welcome-greeting');
    const nameEl  = document.getElementById('welcome-name');
    const streakEl = document.getElementById('welcome-streak');
    if (greetEl) greetEl.textContent = greet;
    if (nameEl) {
      const displayName = user?.display_name || user?.username || 'Atleta';
      nameEl.textContent = displayName;
    }
    if (streakEl) {
      const streak = JSON.parse(localStorage.getItem('hs_gamification') || 'null')?.streak_days;
      streakEl.textContent = streak != null ? `${streak} ${_tl('dashboard.days')}` : '—';
    }
  }

  // ── User chip (avatar, nivel XP) ──────────────────────────
  function getLevel(xp) {
    const _tl = window.t || (k => k);
    const levels = [
      { name: _tl('gamification.level_novato'),      min: 0     },
      { name: _tl('gamification.level_aprendiz'),    min: 500   },
      { name: _tl('gamification.level_competidor'),  min: 1500  },
      { name: _tl('gamification.level_atleta'),      min: 3000  },
      { name: _tl('gamification.level_campeon'),     min: 6000  },
      { name: _tl('gamification.level_elite'),       min: 10000 },
      { name: _tl('gamification.level_maestro'),     min: 15000 },
      { name: _tl('gamification.level_leyenda'),     min: 25000 },
    ];
    return [...levels].reverse().find(l => xp >= l.min) || levels[0];
  }

  function initUserChip() {
    const user    = API?.getUser?.();
    const nameEl  = document.getElementById('user-name');
    const levelEl = document.getElementById('user-level');
    const avatarEl = document.getElementById('user-avatar');

    if (user) {
      const display = user.display_name || user.email?.split('@')[0] || 'Atleta';
      if (nameEl)   nameEl.textContent   = display;
      if (avatarEl) avatarEl.textContent = display[0].toUpperCase();
    }

    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    const xp      = entries.length * 50;
    const level   = getLevel(xp);
    if (levelEl) levelEl.textContent = `${level.name} · ${xp} XP`;
  }

  // ── Count-up animation ─────────────────────────────────────
  function animateCountUp(el, targetText, duration) {
    duration = duration || 600;
    const match = String(targetText).match(/^([\d.]+)(.*)$/);
    if (!match) { el.textContent = targetText; return; }

    const targetNum = parseFloat(match[1]);
    const suffix    = match[2] || '';
    const isFloat   = match[1].includes('.');
    const decimals  = isFloat ? (match[1].split('.')[1] || '').length : 0;
    const start     = performance.now();

    el.classList.remove('counting');
    void el.offsetWidth;
    el.classList.add('counting');

    function tick(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = targetNum * eased;
      el.textContent = current.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
      else { el.textContent = targetText; el.classList.remove('counting'); }
    }
    requestAnimationFrame(tick);
  }

  // ── Smart Progress Projection ─────────────────────────────
  function computeProjection() {
    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    if (entries.length < 5) return null;

    const recent = entries.slice(-14);
    const t0 = new Date(recent[0].date).getTime();
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    recent.forEach(function (e) {
      const x = (new Date(e.date).getTime() - t0) / 86400000;
      const y = e.weight;
      sumX  += x; sumY  += y; sumXY += x * y; sumX2 += x * x;
    });

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 0.001) return null;

    const slope     = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    if (slope >= 0) return null;

    const user    = JSON.parse(localStorage.getItem('hs_user') || 'null');
    const latest  = recent[recent.length - 1].weight;
    const goal    = (user && user.goal_weight && user.goal_weight < latest)
      ? user.goal_weight
      : +(latest - 5).toFixed(1);

    const daysToGoal = (goal - intercept) / slope;
    const lastX = (new Date(recent[recent.length - 1].date).getTime() - t0) / 86400000;
    if (daysToGoal <= lastX) return null;

    const goalDate    = new Date(t0 + daysToGoal * 86400000);
    const ratePerWeek = +(slope * 7).toFixed(2);
    const _lang       = window.getLanguage ? window.getLanguage() : 'es';
    const _localeMap  = { es:'es-ES', en:'en-GB', fr:'fr-FR', de:'de-DE', it:'it-IT' };
    const dateStr     = goalDate.toLocaleDateString(_localeMap[_lang] || 'es-ES', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    return { goal: goal.toFixed(1), dateStr, ratePerWeek };
  }

  // ── Stat cards en tiempo real ──────────────────────────────
  function updateDashboardStats() {
    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];

    const weightEl = document.getElementById('stat-weight');
    const changeEl = document.getElementById('stat-weight-change');
    if (weightEl && entries.length) {
      const latest = entries[entries.length - 1];
      animateCountUp(weightEl, `${latest.weight.toFixed(1)} kg`, 600);

      if (entries.length > 1) {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const older = [...entries].filter(e => new Date(e.date) <= weekAgo);
        if (older.length) {
          const ref   = older[older.length - 1].weight;
          const delta = latest.weight - ref;
          const sign  = delta > 0 ? '+' : '';
          if (changeEl) {
            changeEl.textContent = `${sign}${delta.toFixed(1)} kg esta semana`;
            changeEl.style.color = delta <= 0 ? 'var(--emerald)' : 'var(--accent)';
          }
        } else {
          if (changeEl) changeEl.textContent = `${entries.length} ${window.t ? window.t('dashboard.stat_records_ph') : 'registros totales'}`;
        }
      } else {
        if (changeEl) changeEl.textContent = window.t ? window.t('dashboard.first_entry') : 'Primer registro';
      }
    }

    // Registros totales
    const recEl  = document.getElementById('stat-records');
    const recLbl = document.getElementById('stat-records-label');
    if (recEl) animateCountUp(recEl, entries.length, 500);
    if (recLbl && entries.length) {
      const weeks = new Set(entries.map(e => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${getWeekNumber(d)}`;
      }));
      const weeksKey = weeks.size === 1 ? 'dashboard.weeks_one' : 'dashboard.weeks_many';
      recLbl.textContent = (_t(weeksKey)).replace('{n}', weeks.size);
    }

    // IMC
    const heightCm = parseFloat(localStorage.getItem('hs_height_cm') || '0');
    const bmiEl    = document.getElementById('stat-bmi');
    const bmiLbl   = document.getElementById('stat-bmi-label');
    if (bmiEl && heightCm && entries.length) {
      const kg  = entries[entries.length - 1].weight;
      const m   = heightCm / 100;
      const bmi = kg / (m * m);
      animateCountUp(bmiEl, bmi.toFixed(1), 700);
      if (bmiLbl) {
        const cat = bmi < 18.5 ? _t('dashboard.bmi_underweight')
                  : bmi < 25   ? _t('dashboard.bmi_normal')
                  : bmi < 30   ? _t('dashboard.bmi_overweight')
                  : _t('dashboard.bmi_obese');
        bmiLbl.textContent = cat;
        bmiLbl.style.color = bmi >= 18.5 && bmi < 25 ? 'var(--emerald)' : 'var(--amber)';
      }
    }

    // TDEE
    const _rawTdee = localStorage.getItem('hs_last_tdee');
    if (_rawTdee === 'NaN' || _rawTdee === 'undefined') localStorage.removeItem('hs_last_tdee');
    const tdeeVal = parseFloat(localStorage.getItem('hs_last_tdee') || '0');
    const tdeeEl  = document.getElementById('stat-tdee');
    const tdeeLbl = document.getElementById('stat-tdee-label');
    if (tdeeEl && tdeeVal) {
      animateCountUp(tdeeEl, `${Math.round(tdeeVal)} kcal`, 700);
      if (tdeeLbl) {
        tdeeLbl.textContent = window.t ? window.t('dashboard.tdee_calculated') : 'TDEE calculado';
        tdeeLbl.style.color = 'var(--emerald)';
      }
    }

    renderMiniChart(entries);

    // Projection card
    const insightEl = document.getElementById('projection-insight');
    if (insightEl) {
      const proj = computeProjection();
      if (proj) {
        insightEl.style.display = 'block';
        const _pt = window.t || (k => k);
        insightEl.innerHTML = [
          '<div class="projection-card">',
            '<div class="projection-icon"></div>',
            '<div class="projection-body">',
              '<p class="projection-headline">',
                _pt('dashboard.projection_to')
                  .replace('{goal}', `<span class="projection-highlight">${proj.goal} kg</span>`)
                  .replace('{date}', `<span class="projection-highlight">${proj.dateStr}</span>`),
              '</p>',
              '<p class="projection-detail">',
                (_pt('dashboard.projection_rate')).replace('{rate}', Math.abs(proj.ratePerWeek)),
              '</p>',
            '</div>',
          '</div>',
        ].join('');
      } else {
        insightEl.style.display = 'none';
      }
    }
  }

  // ── Mini gráfico de peso ───────────────────────────────────
  function renderMiniChart(entries) {
    const canvas = document.getElementById('mini-weight-chart');
    const empty  = document.getElementById('mini-chart-empty');
    if (!canvas) return;

    if (!entries.length) {
      canvas.style.display = 'none';
      if (empty) empty.style.display = '';
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 56);
    const recent = entries.filter(e => new Date(e.date) >= cutoff);
    const data   = (recent.length ? recent : entries).slice(-20);

    canvas.style.display = '';
    if (empty) empty.style.display = 'none';

    const existing = Chart.getChart(canvas);
    if (existing) {
      // Actualizar en lugar de destruir + recrear
      existing.data.labels                  = data.map(e => e.date.slice(5));
      existing.data.datasets[0].data        = data.map(e => e.weight);
      existing.update('none');
      return;
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(e => e.date.slice(5)),
        datasets: [{
          data: data.map(e => e.weight),
          borderColor: '#c4a561',
          backgroundColor: 'rgba(196,165,97,0.12)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#c4a561',
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} kg` } },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', maxTicksLimit: 6, font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', font: { size: 11 }, callback: v => `${v} kg` } },
        },
      },
    });
  }

  // ── Progress insight card ──────────────────────────────────
  function renderProgressInsight() {
    const wrap = document.getElementById('progress-insight');
    if (!wrap) return;

    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    if (entries.length < 3) { wrap.style.display = 'none'; return; }

    const sorted  = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const latest  = sorted[sorted.length - 1];
    const oldest  = sorted[0];
    const days    = Math.max(1, (new Date(latest.date) - new Date(oldest.date)) / 86400000);
    const weeks   = days / 7;
    const delta   = latest.weight - oldest.weight;
    const rate    = weeks >= 0.5 ? delta / weeks : delta;
    const goal    = localStorage.getItem('hs_user_goal') || 'deficit_soft';
    const absRate = Math.abs(rate);
    const _it     = window.t || (k => k);
    const _msg    = (key, vals) => {
      let s = _it(key);
      if (vals) Object.entries(vals).forEach(([k, v]) => { s = s.replace('{' + k + '}', v); });
      return s;
    };

    const SVG = {
      warn:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      target:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      chart:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      trend:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
      muscle:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 6.5c1.5-1.5 3-2 5-2 3.3 0 6 2.7 6 6s-2.7 6-6 6c-2 0-3.5-.5-5-2"/><path d="M2 12h4"/></svg>',
      balance: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M8 6l4-4 4 4"/><path d="M8 6h8"/></svg>',
    };

    let icon, message, color;

    if (goal.startsWith('deficit')) {
      if (rate < -0.8)                       { icon = SVG.warn;    color = 'var(--amber)';     message = _msg('dashboard.insight_deficit_fast',    { rate: absRate.toFixed(2) }); }
      else if (rate < -0.15)                 { icon = SVG.target;  color = 'var(--emerald)';   message = _msg('dashboard.insight_deficit_ok',      { rate: absRate.toFixed(2) }); }
      else if (rate >= -0.15 && rate <= 0.1) { icon = SVG.chart;   color = 'var(--secondary)'; message = _msg('dashboard.insight_deficit_stable',  { delta: (rate >= 0 ? '+' : '') + rate.toFixed(2) }); }
      else                                   { icon = SVG.trend;   color = 'var(--accent)';    message = _msg('dashboard.insight_deficit_gaining', { rate: absRate.toFixed(2) }); }
    } else if (goal.startsWith('surplus')) {
      if (rate > 0.5)       { icon = SVG.warn;   color = 'var(--amber)';     message = _msg('dashboard.insight_surplus_fast',   { rate: absRate.toFixed(2) }); }
      else if (rate > 0.1)  { icon = SVG.muscle; color = 'var(--emerald)';   message = _msg('dashboard.insight_surplus_ok',     { rate: absRate.toFixed(2) }); }
      else                  { icon = SVG.chart;  color = 'var(--secondary)'; message = _msg('dashboard.insight_surplus_stable', { delta: (rate >= 0 ? '+' : '') + rate.toFixed(2) }); }
    } else {
      if (Math.abs(rate) <= 0.2) { icon = SVG.balance; color = 'var(--emerald)';   message = _msg('dashboard.insight_maintain_ok',    { rate: absRate.toFixed(2) }); }
      else                       { icon = SVG.chart;   color = 'var(--secondary)'; message = _msg('dashboard.insight_maintain_drift', { delta: (rate >= 0 ? '+' : '') + rate.toFixed(2) }); }
    }

    const totalStr = delta >= 0
      ? `+${delta.toFixed(1)} kg / ${Math.round(days)} d`
      : `${delta.toFixed(1)} kg / ${Math.round(days)} d`;

    wrap.style.display = '';
    wrap.innerHTML = `
      <div class="insight-card" style="--insight-color:${color}">
        <span class="insight-icon">${icon}</span>
        <div class="insight-body">
          <div class="insight-title">${_it('dashboard.insight_title')}</div>
          <div class="insight-msg">${message}</div>
        </div>
        <span class="insight-total">${totalStr}</span>
      </div>`;
  }

  // ── Escuchar actualizaciones de peso / TDEE ────────────────
  function _listenWeightUpdates() {
    window.addEventListener('hs:weight-updated', () => {
      updateStreak();
      initUserChip();
      updateDashboardStats();
      renderProgressInsight();
      renderQuickStart();
    });
    window.addEventListener('hs:tdee-calculated', () => {
      updateDashboardStats();
      renderQuickStart();
    });
    window.addEventListener('hs:workout-session-changed', () => renderQuickStart());
  }

  // ── Quick-start checklist ─────────────────────────────────────
  function renderQuickStart() {
    const container = document.getElementById('dashboard-quickstart');
    if (!container) return;

    // Resolve step states — prefer live APIs, fall back to localStorage
    function _hasWeight() {
      if (typeof WeightTracker !== 'undefined' && WeightTracker.getAll) {
        return WeightTracker.getAll().length > 0;
      }
      try {
        const raw = localStorage.getItem('hs_weight_entries');
        return !!(raw && JSON.parse(raw).length > 0);
      } catch (_) { return false; }
    }

    function _hasTDEE() {
      const raw = localStorage.getItem('hs_last_tdee');
      if (!raw || raw === 'NaN' || raw === 'undefined') return false;
      return !!parseFloat(raw);
    }

    function _hasWorkout() {
      // Correct key used by workoutSession.js → saveToLocalHistory()
      try {
        const raw = localStorage.getItem('hs_workout_sessions_local');
        if (raw) { const arr = JSON.parse(raw); return Array.isArray(arr) && arr.length > 0; }
      } catch (_) {}
      return false;
    }

    // Merge persisted state with live checks (live check can only upgrade to true)
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('hs_quickstart') || '{}'); } catch (_) {}
    const state = {
      weight:  saved.weight  || _hasWeight(),
      tdee:    saved.tdee    || _hasTDEE(),
      workout: saved.workout || _hasWorkout(),
    };

    // Persist any upgrades
    localStorage.setItem('hs_quickstart', JSON.stringify(state));

    // All done — fade out and remove
    if (state.weight && state.tdee && state.workout) {
      const existing = document.getElementById('hs-quickstart');
      if (existing) {
        existing.style.transition = 'opacity 300ms ease';
        existing.style.opacity = '0';
        setTimeout(function () { existing.remove(); }, 300);
      }
      container.style.display = 'none';
      return;
    }

    const done = [state.weight, state.tdee, state.workout].filter(Boolean).length;

    const steps = [
      {
        key:   'weight',
        icon:  state.weight ? '✓' : '⚖️',
        label: 'Registra tu peso',
        nav:   'peso',
        done:  state.weight,
      },
      {
        key:   'tdee',
        icon:  state.tdee ? '✓' : '🧮',
        label: 'Calcula tu TDEE',
        nav:   'nutricion',
        done:  state.tdee,
      },
      {
        key:     'workout',
        icon:    state.workout ? '✓' : '🏋️',
        label:   'Completa un entreno',
        nav:     'entreno',
        done:    state.workout,
      },
    ];

    const stepsHTML = steps.map(function (s) {
      const cls = s.done ? 'qs-step qs-step--done' : 'qs-step';
      return [
        '<div class="' + cls + '" data-step="' + s.key + '">',
          '<span class="qs-step-icon">' + s.icon + '</span>',
          '<span class="qs-step-label">' + s.label + '</span>',
        '</div>',
      ].join('');
    }).join('');

    container.innerHTML = [
      '<div class="qs-card" id="hs-quickstart">',
        '<div class="qs-header">',
          '<span class="qs-title">Primeros pasos</span>',
          '<span class="qs-progress">' + done + '/3</span>',
        '</div>',
        '<div class="qs-steps">',
          stepsHTML,
        '</div>',
      '</div>',
    ].join('');

    // Navigation on step click
    container.querySelectorAll('.qs-step:not(.qs-step--done)').forEach(function (el) {
      el.addEventListener('click', function () {
        const step = el.dataset.step;
        const navMap = { weight: 'peso', tdee: 'nutricion', workout: 'entreno' };
        const target = navMap[step];
        if (target) {
          const navItem = document.querySelector('[data-section="' + target + '"]');
          if (navItem) navItem.click();
        }
      });
    });
  }

  // ── First-run banner — shown when user has 0 data ─────────────
  function renderFirstRunBanner() {
    const BANNER_ID = 'hs-first-run-banner';
    if (document.getElementById(BANNER_ID)) return; // already shown

    const entries  = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    const hasTDEE  = !!localStorage.getItem('hs_last_tdee');
    const hasToken = !!localStorage.getItem('hs_access_token');

    // Only show for authenticated users with zero data
    if (!hasToken || entries.length > 0 || hasTDEE) return;

    const banner = document.createElement('div');
    banner.id        = BANNER_ID;
    banner.className = 'first-run-banner';
    banner.innerHTML = [
      '<div class="frb-icon">🏋️</div>',
      '<div class="frb-body">',
        '<p class="frb-title">¡Bienvenido a HealthStack Pro!</p>',
        '<p class="frb-sub">Registra tu primer dato para ver tu progreso aquí.</p>',
        '<div class="frb-actions">',
          '<button class="frb-btn frb-btn--primary" data-frb-nav="peso">',
            'Registrar peso →',
          '</button>',
          '<button class="frb-btn frb-btn--ghost" data-frb-nav="entreno">',
            'Crear rutina →',
          '</button>',
        '</div>',
      '</div>',
    ].join('');

    // Inject before the first stat card in the dashboard section
    const dashSection = document.getElementById('dashboard') || document.querySelector('[data-section-content="dashboard"]');
    const firstCard   = dashSection && dashSection.querySelector('.stat-card, .card, .dashboard-stats');
    if (firstCard) {
      firstCard.parentNode.insertBefore(banner, firstCard);
    } else if (dashSection) {
      dashSection.prepend(banner);
    } else {
      return; // dashboard section not in DOM yet — skip
    }

    // Navigation on CTA click
    banner.addEventListener('click', function (e) {
      const nav = e.target.closest('[data-frb-nav]');
      if (!nav) return;
      const target = nav.dataset.frbNav;
      const navItem = document.querySelector('[data-section="' + target + '"]');
      if (navItem) navItem.click();
    });

    // Self-remove when first weight entry is added
    function _removeBanner() {
      const el = document.getElementById(BANNER_ID);
      if (el) { el.classList.add('frb-exit'); setTimeout(function () { el.remove(); }, 400); }
      window.removeEventListener('hs:weight-updated', _removeBanner);
    }
    window.addEventListener('hs:weight-updated', _removeBanner);
  }

  // ── API pública ───────────────────────────────────────────
  let _initialized = false;
  function init() {
    if (_initialized) return;
    _initialized = true;
    initDashboard();
    initUserChip();
    updateWelcomeCard();
    updateDashboardStats();
    renderProgressInsight();
    _listenWeightUpdates();
    renderFirstRunBanner();
    renderQuickStart();
  }

  function refresh() {
    initUserChip();
    updateWelcomeCard();
    updateDashboardStats();
    renderProgressInsight();
  }

  // Re-render en cambio de idioma
  document.addEventListener('languagechange', () => {
    initDashboard();
    updateWelcomeCard();
    initUserChip();
  });

  return { init, refresh, updateStreak, renderProgressInsight };
})();
