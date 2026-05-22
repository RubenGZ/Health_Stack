/* ============================================================
   app.js — Router SPA, estado global e inicialización
   Punto de entrada principal. Coordina todos los módulos.
   ============================================================ */

(function () {
  'use strict';

  function _t(key) { return (window.t && window.t(key)) || key; }

  // ── Navegación SPA ─────────────────────────────────────────
  const SECTIONS = [
    'dashboard','peso','nutricion','ejercicios',
    'rutinas','planner','gamificacion',
    'suplementos','timing','records','receipt','fatigue','plateau','deload','bodycomp','sessionreplay','workout','ranked','rehab',
  ];

  // ── Historia de navegación (back button móvil) ─────────────
  const _navHistory = [];
  let _currentSection = null;

  function _updateBackBtn() {
    const backBtn  = document.getElementById('mobile-back-btn');
    const header   = document.getElementById('mobile-header');
    if (!backBtn || !header) return;
    const canGoBack = _navHistory.length > 0;
    backBtn.style.display = canGoBack ? 'flex' : 'none';
    header.classList.toggle('has-back', canGoBack);
  }

  function _goBack() {
    if (_navHistory.length === 0) return;
    const prev = _navHistory.pop();
    navigateTo(prev, true /* isBack */);
  }

  function navigateTo(sectionId, isBack) {
    // ── Plan gate ───────────────────────────────────────────
    if (typeof Plan !== 'undefined' && !Plan.can(sectionId)) {
      Plan.showUpgradeModal(sectionId, function () {
        // Called after user activates demo mode → retry navigation
        navigateTo(sectionId);
      });
      return;
    }

    // ── Gestión del historial (back button) ─────────────────
    if (!isBack && _currentSection && _currentSection !== sectionId) {
      _navHistory.push(_currentSection);
      // Limitar historial a 10 entradas para no acumular
      if (_navHistory.length > 10) _navHistory.shift();
    }
    _currentSection = sectionId;
    _updateBackBtn();

    // Ocultar todas las secciones
    SECTIONS.forEach(id => {
      const el = document.getElementById(`section-${id}`);
      if (el) { el.classList.remove('active'); el.classList.remove('section--visible'); }
    });

    // Activar la sección destino
    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Añadir clase de transición en el siguiente frame para que el navegador la pinte
      requestAnimationFrame(() => target.classList.add('section--visible'));
    }

    // Actualizar nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Actualizar hash sin recargar
    history.replaceState(null, '', `#${sectionId}`);

    // Sync mobile section title
    const mobileTitle = document.getElementById('mobile-section-title');
    if (mobileTitle) {
      const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"] .nav-label`);
      mobileTitle.textContent = navItem ? navItem.textContent : sectionId;
    }

    // Notify listeners (e.g. aiInsights, widgets) of section change
    window.dispatchEvent(new CustomEvent('hs:section-changed', { detail: { section: sectionId } }));

    // Si es la sección de peso, re-renderizar el gráfico
    // (necesario si el canvas estaba oculto cuando se creó el chart)
    if (sectionId === 'peso' && typeof WeightTracker !== 'undefined') {
      setTimeout(() => WeightTracker.renderAll(), 50);
    }
    if (sectionId === 'records' && typeof Records !== 'undefined') {
      Records.init();
    }
    if (sectionId === 'receipt' && typeof AthleteReceipt !== 'undefined') {
      AthleteReceipt.init();
    }
    if (sectionId === 'fatigue' && typeof FatigueHeatmap !== 'undefined') {
      FatigueHeatmap.init();
    }
    if (sectionId === 'plateau' && typeof PlateauRadar !== 'undefined') {
      PlateauRadar.init();
    }
    if (sectionId === 'deload' && typeof AutoDeload !== 'undefined') {
      AutoDeload.init();
    }
    if (sectionId === 'bodycomp' && typeof BodyCompForecast !== 'undefined') {
      BodyCompForecast.init();
    }
    if (sectionId === 'sessionreplay' && typeof SessionReplay !== 'undefined') {
      SessionReplay.init();
    }
    if (sectionId === 'workout') {
      const loggerRoot = document.getElementById('workout-logger-root');
      const historyRoot = document.getElementById('workout-history-root');
      // Siempre re-init: el logger necesita releer el draft (puede haber cambiado desde Rutinas)
      if (loggerRoot && typeof WorkoutLogger !== 'undefined') {
        WorkoutLogger.init(loggerRoot);
        loggerRoot.dataset.initialized = 'true';
      }
      if (historyRoot && typeof WorkoutHistory !== 'undefined') {
        WorkoutHistory.init(historyRoot);
      }
    }
    if (sectionId === 'ranked') {
      const rankedRoot = document.getElementById('ranked-root');
      if (rankedRoot && typeof RankedModule !== 'undefined') {
        RankedModule.init(rankedRoot);
      }
    }
    // Suplementos: re-inicializar si el grid está vacío o aún muestra "Cargando"
    if (sectionId === 'suplementos' && typeof Supplements !== 'undefined') {
      const sg = document.getElementById('suppl-grid');
      if (sg && (!sg.children.length || sg.querySelector('.suppl-loading'))) {
        Supplements.init();
      }
    }
    // Ejercicios: re-renderizar al navegar (por si cambia el viewport)
    if (sectionId === 'ejercicios' && typeof Exercises !== 'undefined') {
      Exercises.refreshLayout?.();
    }
    // Rutinas: re-init wizard al navegar a la sección (listeners se pierden si DOM fue modificado)
    if (sectionId === 'rutinas' && typeof RoutineGenerator !== 'undefined') {
      RoutineGenerator.init();
    }

    // ── FAB de rest timer: solo visible en sección workout o con sesión activa ──
    const _fab = document.getElementById('rest-timer-fab');
    if (_fab) {
      const _hasActiveSession = Boolean(localStorage.getItem('hs_workout_active'));
      if (sectionId === 'workout' || _hasActiveSession) {
        _fab.style.display = '';
      } else {
        _fab.style.display = 'none';
      }
    }
  }

  function initNavigation() {
    // Clics en nav items de sidebar
    document.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const section = el.dataset.section;
        if (!el.classList.contains('nav-item--soon') && !el.classList.contains('quick-card--soon')) {
          navigateTo(section);
        }
      });
    });

    // Macro Autopilot tab — gate for Pro
    const autoTab = document.querySelector('.stab[data-tab="autopilot"]');
    if (autoTab) {
      autoTab.addEventListener('click', function (e) {
        if (typeof Plan !== 'undefined' && !Plan.isPro()) {
          e.stopImmediatePropagation();
          Plan.showUpgradeModal('autopilot', function () {
            autoTab.click();
          });
        }
      }, true); // capture phase so it fires before the tab switcher
    }

    // Botón atrás en mobile header
    const backBtn = document.getElementById('mobile-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', _goBack);
    }

    // Leer hash inicial — si es 'admin' redirige a la SPA de admin
    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin') { location.href = '/admin'; return; }
    const initial = SECTIONS.includes(hash) ? hash : 'dashboard';
    navigateTo(initial);
  }

  // ── Dashboard: saludo dinámico ─────────────────────────────
  function initDashboard() {
    const _t     = window.t || (k => k);
    const lang   = window.getLanguage ? window.getLanguage() : 'es';
    const hour   = new Date().getHours();
    const greeting = hour < 13 ? _t('dashboard.greet_morning')
                   : hour < 20 ? _t('dashboard.greet_afternoon')
                   :              _t('dashboard.greet_evening');
    const user   = API?.getUser?.();
    const name   = user?.display_name || 'Atleta';

    const greetEl = document.getElementById('dashboard-greeting');
    if (greetEl) greetEl.textContent = `${greeting}, ${name}`;

    const dateEl = document.getElementById('dashboard-date');
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toLocaleDateString(lang, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    }

    // Racha (días consecutivos con registros de peso)
    updateStreak();
  }

  // ── Racha ──────────────────────────────────────────────────
  function updateStreak() {
    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    let streak = 0;

    if (entries.length) {
      // Contar semanas con al menos un registro (más realista que días consecutivos)
      const weeks = new Set();
      entries.forEach(e => {
        const d = new Date(e.date);
        const week = `${d.getFullYear()}-${getWeekNumber(d)}`;
        weeks.add(week);
      });
      streak = weeks.size;
    }

    const el = document.getElementById('streak-count');
    if (el) el.textContent = streak;
  }

  function getWeekNumber(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  }

  // ── Welcome card ───────────────────────────────────────────
  function updateWelcomeCard() {
    const _t  = window.t || (k => k);
    const user = JSON.parse(localStorage.getItem('hs_user') || 'null');
    const hour = new Date().getHours();
    const greet = hour < 6  ? _t('dashboard.greet_evening')
                : hour < 13 ? _t('dashboard.greet_morning')
                : hour < 20 ? _t('dashboard.greet_afternoon')
                :              _t('dashboard.greet_evening');
    const greetEl = document.getElementById('welcome-greeting');
    const nameEl  = document.getElementById('welcome-name');
    const streakEl = document.getElementById('welcome-streak');
    if (greetEl) greetEl.textContent = greet;
    if (nameEl && user?.username) nameEl.textContent = user.username;
    if (streakEl) {
      const streak = JSON.parse(localStorage.getItem('hs_gamification') || 'null')?.streak_days;
      streakEl.textContent = streak != null ? `${streak} ${_t('dashboard.days')}` : '—';
    }
  }

  // ── User chip ──────────────────────────────────────────────
  function initUserChip() {
    const user = API?.getUser?.();
    const nameEl  = document.getElementById('user-name');
    const levelEl = document.getElementById('user-level');
    const avatarEl= document.getElementById('user-avatar');

    if (user) {
      const display = user.display_name || user.email?.split('@')[0] || 'Atleta';
      if (nameEl)  nameEl.textContent  = display;
      if (avatarEl) avatarEl.textContent = display[0].toUpperCase();
    }

    // XP ficticio basado en número de registros de peso
    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    const xp      = entries.length * 50;
    const level   = getLevel(xp);
    if (levelEl) levelEl.textContent = `${level.name} · ${xp} XP`;
  }

  function getLevel(xp) {
    const _t = window.t || (k => k);
    const levels = [
      { name: _t('gamification.level_novato'),      min: 0    },
      { name: _t('gamification.level_aprendiz'),    min: 500  },
      { name: _t('gamification.level_competidor'),  min: 1500 },
      { name: _t('gamification.level_atleta'),      min: 3000 },
      { name: _t('gamification.level_campeon'),     min: 6000 },
      { name: _t('gamification.level_elite'),       min: 10000},
      { name: _t('gamification.level_maestro'),     min: 15000},
      { name: _t('gamification.level_leyenda'),     min: 25000},
    ];
    return [...levels].reverse().find(l => xp >= l.min) || levels[0];
  }

  // ── Section tabs (Nutrición, etc.) ────────────────────────
  function initSectionTabs() {
    // Tabs dentro de Nutrición
    document.getElementById('nutrition-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.stab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll('#nutrition-tabs .stab').forEach(b =>
        b.classList.toggle('stab--active', b.dataset.tab === tab)
      );
      document.querySelectorAll('#section-nutricion .stab-content').forEach(c =>
        c.classList.toggle('stab-content--active', c.id === `stab-${tab}`)
      );
      // Re-render del contenido al activar cada tab
      if (tab === 'macroinfo' && typeof Supplements !== 'undefined') {
        // Re-render en la sección Nutrición
        const macroGrid = document.getElementById('macro-info-grid');
        if (macroGrid && !macroGrid.children.length) Supplements.init();
      }
      if (tab === 'autopilot' && typeof MacroAutopilot !== 'undefined') {
        MacroAutopilot.init();
      }
    });
  }

  // ── Count-up animation utility ────────────────────────────
  function animateCountUp(el, targetText, duration = 600) {
    // Extract numeric part and suffix
    const match = String(targetText).match(/^([\d.]+)(.*)$/);
    if (!match) { el.textContent = targetText; return; }

    const targetNum = parseFloat(match[1]);
    const suffix    = match[2] || '';
    const isFloat   = match[1].includes('.');
    const decimals  = isFloat ? (match[1].split('.')[1] || '').length : 0;
    const start     = performance.now();
    const from      = 0;

    // Trigger CSS pulse
    el.classList.remove('counting');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('counting');

    function tick(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = from + (targetNum - from) * eased;
      el.textContent = current.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
      else { el.textContent = targetText; el.classList.remove('counting'); }
    }

    requestAnimationFrame(tick);
  }

  function computeProjection() {
    var entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    if (entries.length < 5) return null;

    var recent = entries.slice(-14);
    var t0 = new Date(recent[0].date).getTime();
    var n = recent.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    recent.forEach(function (e) {
      var x = (new Date(e.date).getTime() - t0) / 86400000;
      var y = e.weight;
      sumX  += x;
      sumY  += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    var denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 0.001) return null;

    var slope     = (n * sumXY - sumX * sumY) / denom;
    var intercept = (sumY - slope * sumX) / n;

    if (slope >= 0) return null;

    var user   = JSON.parse(localStorage.getItem('hs_user') || 'null');
    var latest = recent[recent.length - 1].weight;
    var goal   = (user && user.goal_weight && user.goal_weight < latest)
      ? user.goal_weight
      : +(latest - 5).toFixed(1);

    var daysToGoal = (goal - intercept) / slope;
    var lastX = (new Date(recent[recent.length - 1].date).getTime() - t0) / 86400000;
    if (daysToGoal <= lastX) return null;

    var goalDate   = new Date(t0 + daysToGoal * 86400000);
    var ratePerWeek = +(slope * 7).toFixed(2);
    var _lang      = window.getLanguage ? window.getLanguage() : 'es';
    var _localeMap = { es:'es-ES', en:'en-GB', fr:'fr-FR', de:'de-DE', it:'it-IT' };
    var dateStr    = goalDate.toLocaleDateString(_localeMap[_lang] || 'es-ES', { day:'numeric', month:'short', year:'numeric' });

    return { goal: goal.toFixed(1), dateStr: dateStr, ratePerWeek: ratePerWeek };
  }

  // ── Dashboard: métricas en tiempo real ────────────────────
  function updateDashboardStats() {
    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];

    // Peso actual y cambio vs semana pasada
    const weightEl  = document.getElementById('stat-weight');
    const changeEl  = document.getElementById('stat-weight-change');
    if (weightEl && entries.length) {
      const latest = entries[entries.length - 1];
      animateCountUp(weightEl, `${latest.weight.toFixed(1)} kg`, 600);

      if (entries.length > 1) {
        // Último registro vs hace 7 días
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const older = [...entries].filter(e => new Date(e.date) <= weekAgo);
        if (older.length) {
          const ref    = older[older.length - 1].weight;
          const delta  = latest.weight - ref;
          const sign   = delta > 0 ? '+' : '';
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
    const _wt = window.t || (k => k);
    const recEl = document.getElementById('stat-records');
    if (recEl) animateCountUp(recEl, entries.length, 500);
    const recLbl = document.getElementById('stat-records-label');
    if (recLbl && entries.length) {
      const weeks = new Set(entries.map(e => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${getWeekNumber(d)}`;
      }));
      const weeksKey = weeks.size === 1 ? 'dashboard.weeks_one' : 'dashboard.weeks_many';
      recLbl.textContent = _wt(weeksKey).replace('{n}', weeks.size);
    }

    // IMC — necesita altura guardada por onboarding o TDEE
    const heightCm = parseFloat(localStorage.getItem('hs_height_cm') || '0');
    const bmiEl    = document.getElementById('stat-bmi');
    const bmiLbl   = document.getElementById('stat-bmi-label');
    if (bmiEl && heightCm && entries.length) {
      const kg  = entries[entries.length - 1].weight;
      const m   = heightCm / 100;
      const bmi = kg / (m * m);
      animateCountUp(bmiEl, bmi.toFixed(1), 700);
      if (bmiLbl) {
        const _bt = window.t || (k => k);
        const cat = bmi < 18.5 ? _bt('dashboard.bmi_underweight')
                  : bmi < 25   ? _bt('dashboard.bmi_normal')
                  : bmi < 30   ? _bt('dashboard.bmi_overweight')
                  : _bt('dashboard.bmi_obese');
        bmiLbl.textContent  = cat;
        bmiLbl.style.color  = bmi >= 18.5 && bmi < 25 ? 'var(--emerald)' : 'var(--amber)';
      }
    }

    // TDEE — guardado por macroCalc.js o onboarding
    // Sanear valor "NaN" que pudo quedar de versiones anteriores
    const _rawTdee = localStorage.getItem('hs_last_tdee');
    if (_rawTdee === 'NaN' || _rawTdee === 'undefined') localStorage.removeItem('hs_last_tdee');
    const tdeeVal = parseFloat(localStorage.getItem('hs_last_tdee') || '0');
    const tdeeEl  = document.getElementById('stat-tdee');
    const tdeeLbl = document.getElementById('stat-tdee-label');
    if (tdeeEl && tdeeVal) {
      animateCountUp(tdeeEl, `${Math.round(tdeeVal)} kcal`, 700);
      if (tdeeLbl) { tdeeLbl.textContent = window.t ? window.t('dashboard.tdee_calculated') : 'TDEE calculado'; tdeeLbl.style.color = 'var(--emerald)'; }
    }

    // Mini gráfico de peso
    renderMiniChart(entries);

    // Smart Progress Projection
    var insightEl = document.getElementById('projection-insight');
    if (insightEl) {
      var proj = computeProjection();
      if (proj) {
        insightEl.style.display = 'block';
        insightEl.innerHTML = [
          '<div class="projection-card">',
            '<div class="projection-icon"></div>',
            '<div class="projection-body">',
              '<p class="projection-headline">',
                (function(){
                  var _pt = window.t || (k=>k);
                  return _pt('dashboard.projection_to')
                    .replace('{goal}', '<span class="projection-highlight">' + proj.goal + ' kg</span>')
                    .replace('{date}', '<span class="projection-highlight">' + proj.dateStr + '</span>');
                })(),
              '</p>',
              '<p class="projection-detail">',
                (function(){
                  var _pr = window.t || (k=>k);
                  return _pr('dashboard.projection_rate').replace('{rate}', Math.abs(proj.ratePerWeek));
                })(),
              '</p>',
            '</div>',
          '</div>',
        ].join('');
      } else {
        insightEl.style.display = 'none';
      }
    }
  }

  function renderMiniChart(entries) {
    const canvas = document.getElementById('mini-weight-chart');
    const empty  = document.getElementById('mini-chart-empty');
    if (!canvas) return;

    if (!entries.length) {
      canvas.style.display  = 'none';
      if (empty) empty.style.display = '';
      return;
    }

    // Filtrar últimas 8 semanas
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 56);
    const recent = entries.filter(e => new Date(e.date) >= cutoff);
    const data   = (recent.length ? recent : entries).slice(-20);

    canvas.style.display  = '';
    if (empty) empty.style.display = 'none';

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(e => e.date.slice(5)),   // MM-DD
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
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} kg` } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', maxTicksLimit: 6, font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', font: { size: 11 }, callback: v => `${v} kg` } },
        },
      },
    });
  }

  // ── Progress insight card ─────────────────────────────────
  function renderProgressInsight() {
    const wrap = document.getElementById('progress-insight');
    if (!wrap) return;

    const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    if (entries.length < 3) { wrap.style.display = 'none'; return; }

    // Necesitamos al menos 2 semanas de datos para un insight útil
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const latest  = sorted[sorted.length - 1];
    const oldest  = sorted[0];
    const days    = Math.max(1, (new Date(latest.date) - new Date(oldest.date)) / 86400000);
    const weeks   = days / 7;
    const delta   = latest.weight - oldest.weight;
    const rate    = weeks >= 0.5 ? delta / weeks : delta;  // kg/semana
    const goal    = localStorage.getItem('hs_user_goal') || 'deficit_soft';

    // Insight text y color
    let icon, message, color;
    const absRate = Math.abs(rate);
    const _it = window.t || (k => k);
    const _msg = (key, vals) => {
      let s = _it(key);
      if (vals) Object.entries(vals).forEach(([k,v]) => { s = s.replace('{'+k+'}', v); });
      return s;
    };

    const _svgWarn    = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const _svgTarget  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    const _svgChart   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
    const _svgTrend   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';
    const _svgMuscle  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 6.5c1.5-1.5 3-2 5-2 3.3 0 6 2.7 6 6s-2.7 6-6 6c-2 0-3.5-.5-5-2"/><path d="M2 12h4"/></svg>';
    const _svgBalance = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M8 6l4-4 4 4"/><path d="M8 6h8"/></svg>';

    if (goal.startsWith('deficit')) {
      if (rate < -0.8) {
        icon = _svgWarn; color = 'var(--amber)';
        message = _msg('dashboard.insight_deficit_fast', { rate: absRate.toFixed(2) });
      } else if (rate < -0.15) {
        icon = _svgTarget; color = 'var(--emerald)';
        message = _msg('dashboard.insight_deficit_ok', { rate: absRate.toFixed(2) });
      } else if (rate >= -0.15 && rate <= 0.1) {
        icon = _svgChart; color = 'var(--secondary)';
        message = _msg('dashboard.insight_deficit_stable', { delta: (rate >= 0 ? '+' : '') + rate.toFixed(2) });
      } else {
        icon = _svgTrend; color = 'var(--accent)';
        message = _msg('dashboard.insight_deficit_gaining', { rate: absRate.toFixed(2) });
      }
    } else if (goal.startsWith('surplus')) {
      if (rate > 0.5) {
        icon = _svgWarn; color = 'var(--amber)';
        message = _msg('dashboard.insight_surplus_fast', { rate: absRate.toFixed(2) });
      } else if (rate > 0.1) {
        icon = _svgMuscle; color = 'var(--emerald)';
        message = _msg('dashboard.insight_surplus_ok', { rate: absRate.toFixed(2) });
      } else {
        icon = _svgChart; color = 'var(--secondary)';
        message = _msg('dashboard.insight_surplus_stable', { delta: (rate >= 0 ? '+' : '') + rate.toFixed(2) });
      }
    } else {
      // Mantener
      if (Math.abs(rate) <= 0.2) {
        icon = _svgBalance; color = 'var(--emerald)';
        message = _msg('dashboard.insight_maintain_ok', { rate: absRate.toFixed(2) });
      } else {
        icon = _svgChart; color = 'var(--secondary)';
        message = _msg('dashboard.insight_maintain_drift', { delta: (rate >= 0 ? '+' : '') + rate.toFixed(2) });
      }
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

  // ── PWA Install Prompt ─────────────────────────────────────
  let _deferredInstallPrompt = null;

  // Detecta iOS Safari (no Chrome en iOS, no Android)
  function _isIosSafari() {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    // En iOS, Chrome/Firefox incluyen "CriOS" o "FxiOS"
    const isSafari = isIos && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    // No mostrar si ya está instalada como PWA (standalone)
    const isStandalone = window.navigator.standalone === true;
    return isSafari && !isStandalone;
  }

  function initPWAInstall() {
    // Android / Chrome desktop: banner nativo
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredInstallPrompt = e;
      showInstallBanner();
    });

    window.addEventListener('appinstalled', () => {
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'none';
    });

    // iOS Safari: no hay beforeinstallprompt — mostramos guía manual
    if (_isIosSafari()) {
      showInstallBanner();
    }
  }

  function showInstallBanner() {
    // No mostrar si ya fue descartado en esta sesión
    if (sessionStorage.getItem('hs_pwa_dismissed')) return;
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    const _t = window.t || (k => k);
    const isIos = _isIosSafari();

    if (isIos) {
      // Banner iOS: guía visual con el icono de Share de Safari
      banner.innerHTML = `
        <div class="pwa-banner pwa-banner--ios">
          <span class="pwa-icon"></span>
          <div class="pwa-info">
            <strong>${_t('pwa.install_title')}</strong>
            <small>
              Toca <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin:0 2px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              <strong>Compartir</strong> → <strong>Añadir a inicio</strong>
            </small>
          </div>
          <button class="pwa-dismiss" id="pwa-dismiss" title="${_t('pwa.close')}">✕</button>
        </div>
        <div class="pwa-ios-arrow">▼</div>`;
    } else {
      banner.innerHTML = `
        <div class="pwa-banner">
          <span class="pwa-icon"></span>
          <div class="pwa-info">
            <strong>${_t('pwa.install_title')}</strong>
            <small>${_t('pwa.install_desc')}</small>
          </div>
          <button class="btn btn--primary btn--sm" id="pwa-install-btn">${_t('pwa.install_btn')}</button>
          <button class="pwa-dismiss" id="pwa-dismiss" title="${_t('pwa.close')}">✕</button>
        </div>`;
    }

    banner.style.display = '';

    document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
      if (!_deferredInstallPrompt) return;
      _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        banner.style.display = 'none';
      }
      _deferredInstallPrompt = null;
    });

    document.getElementById('pwa-dismiss')?.addEventListener('click', () => {
      banner.style.display = 'none';
      sessionStorage.setItem('hs_pwa_dismissed', '1');
    });
  }

  // ── Banner patrocinador ────────────────────────────────────
  function renderSponsorBanner() {
    const banner = document.getElementById('sponsor-banner');
    if (!banner || typeof HS_CONFIG === 'undefined') return;
    const sp = HS_CONFIG.SPONSOR;
    if (!sp || !sp.active) return;

    banner.innerHTML = `
      <a class="sponsor-card" href="${sp.url}" target="_blank" rel="sponsored noopener">
        <span class="sponsor-logo">${sp.logo}</span>
        <div class="sponsor-info">
          <span class="sponsor-label">${_t('sponsor.recommended')}</span>
          <strong>${sp.name}</strong>
          <small>${sp.tagline}</small>
        </div>
        <span class="sponsor-cta">${_t('sponsor.see_offers')}</span>
      </a>`;
  }

  // ── Escuchar actualización de pesos ───────────────────────
  function listenWeightUpdates() {
    window.addEventListener('hs:weight-updated', () => {
      updateStreak();
      initUserChip();
      updateDashboardStats();
      renderProgressInsight();
    });
    // También actualizar si el TDEE cambia
    window.addEventListener('hs:tdee-calculated', () => updateDashboardStats());
  }

  // ── Init global ───────────────────────────────────────────
  function init() {
    initNavigation();
    initDashboard();

    // Inicializar módulos
    if (typeof WeightTracker      !== 'undefined') WeightTracker.init();
    if (typeof MacroCalc          !== 'undefined') MacroCalc.init();
    if (typeof Exercises          !== 'undefined') Exercises.init();
    if (typeof RoutineGenerator   !== 'undefined') RoutineGenerator.init();
    if (typeof MealPlanner        !== 'undefined') MealPlanner.init();
    if (typeof Gamification       !== 'undefined') Gamification.init();
    if (typeof Chatbot            !== 'undefined') Chatbot.init();
    if (typeof Community          !== 'undefined') Community.init();
    if (typeof Supplements        !== 'undefined') Supplements.init();
    if (typeof MyRecipes          !== 'undefined') MyRecipes.init();
    if (typeof TimingPlanner      !== 'undefined') TimingPlanner.init();
    // Onboarding al final — solo si el usuario está autenticado.
    // Si no hay token (flujo login/registro), no lanzar el wizard.
    if (typeof Onboarding !== 'undefined') {
      const _hasToken = Boolean(localStorage.getItem('hs_access_token'));
      if (_hasToken) {
        const _obUser = (typeof API !== 'undefined') ? API.getUser?.() : null;
        const _obServerDone = _obUser ? _obUser.onboarding_completed : undefined;
        Onboarding.init(_obServerDone);
      }
    }

    // Re-check onboarding después del login exitoso
    window.addEventListener('hs:login', function () {
      if (typeof Onboarding === 'undefined') return;
      const u = (typeof API !== 'undefined') ? API.getUser?.() : null;
      if (!u) return; // usuario no disponible aún
      const hasTDEE = localStorage.getItem('hs_tdee');
      if (u.onboarding_completed === false || !hasTDEE) {
        Onboarding.init(false); // force show
      }
    });

    // ── IntersectionObserver — card scroll reveal ─────────────
    if ('IntersectionObserver' in window) {
      const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const delay = Math.min(i, 5) * 60; // stagger 60ms, máx 5 cards
            setTimeout(() => {
              entry.target.classList.add('card--revealed');
            }, delay);
            cardObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08 });

      // Observar todas las cards del documento
      document.querySelectorAll('.card').forEach(card => {
        card.classList.add('card--will-reveal');
        cardObserver.observe(card);
      });

      // Re-observar cards dentro de secciones al navegar (pueden cargarse dinámicamente)
      window.addEventListener('hs:section-changed', function () {
        setTimeout(() => {
          document.querySelectorAll('.card:not(.card--will-reveal)').forEach(card => {
            card.classList.add('card--will-reveal');
            cardObserver.observe(card);
          });
        }, 50);
      });
    }

    initUserChip();
    updateWelcomeCard();
    listenWeightUpdates();
    initSectionTabs();
    updateDashboardStats();
    if (typeof Readiness !== 'undefined') Readiness.init();
    if (typeof RestTimer !== 'undefined') RestTimer.init();
    renderProgressInsight();
    renderSponsorBanner();
    initPWAInstall();

    // Plan gating — must run after DOM is ready
    if (typeof Plan !== 'undefined') Plan.init();

    if (typeof RehabLogger !== 'undefined') RehabLogger.mount('rehab-root');

    // API backend monitor — after Plan so _applyPlanFromUser can access Plan methods
    if (typeof API !== 'undefined') API.init();

    // Gate RestTimer FAB click directly (shows modal if not Pro)
    const fab = document.getElementById('rest-timer-fab');
    if (fab) {
      fab.addEventListener('click', function (e) {
        if (typeof Plan !== 'undefined' && !Plan.isPro()) {
          e.stopImmediatePropagation();
          Plan.showUpgradeModal('restimer');
        }
      }, true); // capture before restTimer.js listener

      // Ocultar FAB por defecto — solo se muestra en sección workout o con sesión activa
      const _initialSection = window.location.hash.replace('#', '') || 'dashboard';
      const _hasActiveSession = Boolean(localStorage.getItem('hs_workout_active'));
      if (_initialSection !== 'workout' && !_hasActiveSession) {
        fab.style.display = 'none';
      }
    }

    // Escuchar cambio de sesión activa para mostrar/ocultar FAB
    window.addEventListener('hs:workout-session-changed', function () {
      const _fab2 = document.getElementById('rest-timer-fab');
      if (!_fab2) return;
      const _currentSection = window.location.hash.replace('#', '') || 'dashboard';
      const _active = Boolean(localStorage.getItem('hs_workout_active'));
      if (_currentSection === 'workout' || _active) {
        _fab2.style.display = '';
      } else {
        _fab2.style.display = 'none';
      }
    });

    // ── Botón circular de feedback en sección Perfil ──────────
    const perfilFeedbackBtn = document.getElementById('perfil-feedback-btn');
    if (perfilFeedbackBtn) {
      perfilFeedbackBtn.addEventListener('click', () => {
        if (typeof FeedbackWidget !== 'undefined' && FeedbackWidget.open) {
          FeedbackWidget.open();
        }
      });
    }

    // ── Getting Started empty state ───────────────────────────
    _initGettingStarted();

    // ── Beta mode UI ─────────────────────────────────────────
    _initBetaModeUI();

    console.log('%c HealthStack Pro v2.0 ', 'background:#c4a561;color:white;padding:4px 8px;border-radius:4px;font-weight:bold');
  }

  function _initGettingStarted() {
    const widget = document.getElementById('getting-started');
    const cpWidget = document.getElementById('consistency-progress-widget');
    if (!widget) return;

    function _updateState() {
      const hasWeight   = Boolean(localStorage.getItem('hs_weight_entries'));
      const hasWorkout  = Boolean(localStorage.getItem('hs_workout_active') || localStorage.getItem('hs_session_count'));
      const sessionCount = parseInt(localStorage.getItem('hs_session_count') || '0', 10);

      // Show getting-started only when no weight data and no sessions
      const isEmpty = !hasWeight && sessionCount === 0;
      widget.style.display = isEmpty ? 'block' : 'none';

      // Show consistency widget after first session
      if (cpWidget) {
        cpWidget.style.display = sessionCount > 0 ? 'block' : 'none';
        if (typeof Plan !== 'undefined') Plan.applyPhasedNav(); // also updates widget
      }
    }

    _updateState();
    // Re-check when user comes back to dashboard
    window.addEventListener('hs:section-changed', function(e) {
      if (e.detail && e.detail.section === 'dashboard') _updateState();
    });
    // Re-check after workout session saved
    window.addEventListener('hs:workout-session-changed', _updateState);
  }

  function _initBetaModeUI() {
    const btn   = document.getElementById('beta-mode-btn');
    const label = document.getElementById('beta-mode-label');
    const badge = document.getElementById('beta-mode-badge');
    if (!btn || !label) return;

    function _refreshUI() {
      const on = typeof Plan !== 'undefined' && Plan.isBeta();
      if (label) label.textContent = on ? 'Desactivar modo beta' : 'Activar modo beta';
      if (badge) badge.style.display = on ? '' : 'none';
    }

    _refreshUI();

    // Expose global toggle for onclick handler in HTML
    window._toggleBetaMode = function() {
      if (typeof Plan === 'undefined') return;
      if (Plan.isBeta()) { Plan.disableBeta(); } else { Plan.enableBeta(); }
      _refreshUI();
    };
  }

  // ── Google OAuth callback handler ────────────────────────
  // El backend redirige a /?auth=google#access_token=...&refresh_token=...
  // Leemos el hash, guardamos los tokens y limpiamos la URL
  function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const access  = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (!access || !refresh) return;

    // Guardar tokens como lo haría un login normal
    localStorage.setItem('hs_access_token',  access);
    localStorage.setItem('hs_refresh_token', refresh);

    // Obtener perfil del usuario y guardarlo
    fetch(`${location.protocol}//${location.host}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${access}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (user) localStorage.setItem('hs_user', JSON.stringify(user));
      })
      .catch(() => {})
      .finally(() => {
        // Limpiar hash y query string de la URL sin recargar
        history.replaceState(null, '', '/');
        // Recargar la UI de autenticación
        if (typeof API !== 'undefined') API.checkBackend?.();
        initUserChip();
        updateWelcomeCard();
      });
  }

  // ── Deep-link desde la landing ───────────────────────────
  // La landing redirige a /?action=register o /?action=login.
  // Abrimos el modal correcto automáticamente y limpiamos la URL.
  function handleLandingBridge() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action !== 'register' && action !== 'login') return;

    // Limpiar ?action= de la URL sin recargar
    const clean = window.location.pathname + window.location.hash;
    history.replaceState(null, '', clean);

    // Esperar a que Auth.js esté listo (se carga después de app.js)
    const openWhenReady = () => {
      if (typeof Auth !== 'undefined' && typeof Auth.open === 'function') {
        Auth.open(action);
      } else {
        setTimeout(openWhenReady, 80);
      }
    };
    // Pequeño delay para que la UI termine de pintar
    setTimeout(openWhenReady, 200);
  }

  // Arrancar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { handleOAuthCallback(); handleLandingBridge(); init(); });
  } else {
    handleOAuthCallback();
    handleLandingBridge();
    init();
  }

  // Re-render greeting when language changes
  document.addEventListener('languagechange', () => { initDashboard(); updateWelcomeCard(); initUserChip(); });

  // ── Admin nav visibility ──────────────────────────────────
  // Muestra el link "Admin Panel" en el sidebar solo si el JWT
  // contiene role === 'admin'. Se recalcula en login/logout.
  function syncAdminNav() {
    const link = document.getElementById('nav-admin-link');
    const sep  = document.getElementById('nav-admin-separator');
    if (!link || !sep) return;
    let isAdmin = false;
    try {
      const raw = localStorage.getItem('hs_access_token');
      if (raw) {
        const payload = JSON.parse(atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        isAdmin = payload.role === 'admin';
      }
    } catch (e) { /* token malformado o ausente */ }
    const display = isAdmin ? '' : 'none';
    link.style.display = display;
    sep.style.display  = display;
  }

  // Ejecutar en carga inicial y en cada cambio de sesión
  syncAdminNav();
  window.addEventListener('hs:login',  syncAdminNav);
  window.addEventListener('hs:logout', syncAdminNav);

  // Exponer navigateTo globalmente para mobileNav.js y otros módulos externos
  window.navigateTo = navigateTo;

  // ── Theme Manager: inicializar picker en sidebar ──────────────
  if (typeof ThemeManager !== 'undefined') {
    ThemeManager.init();
    ThemeManager.renderPicker(document.getElementById('theme-picker-root'));
  }
})();
