/* ============================================================
   app.js — Router SPA, estado global e inicialización
   Punto de entrada principal. Coordina todos los módulos.
   ============================================================ */

(function () {
  'use strict';

  // ── Navegación SPA ─────────────────────────────────────────
  const SECTIONS = [
    'dashboard','peso','nutricion','ejercicios',
    'rutinas','planner','gamificacion','comunidad',
    'suplementos','timing','records','receipt','fatigue','plateau','deload','bodycomp','sessionreplay',
  ];

  function navigateTo(sectionId) {
    // Ocultar todas las secciones
    SECTIONS.forEach(id => {
      const el = document.getElementById(`section-${id}`);
      if (el) el.classList.remove('active');
    });

    // Activar la sección destino
    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // Leer hash inicial
    const hash = window.location.hash.replace('#', '');
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
    const user = JSON.parse(localStorage.getItem('hs_user') || 'null');
    const hour = new Date().getHours();
    const greet = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const greetEl = document.getElementById('welcome-greeting');
    const nameEl  = document.getElementById('welcome-name');
    const streakEl = document.getElementById('welcome-streak');
    if (greetEl) greetEl.textContent = greet;
    if (nameEl && user?.username) nameEl.textContent = user.username;
    if (streakEl) {
      const streak = JSON.parse(localStorage.getItem('hs_gamification') || 'null')?.streak_days;
      streakEl.textContent = streak != null ? `${streak} días` : '—';
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
    const levels = [
      { name: 'Novato',      min: 0    },
      { name: 'Aprendiz',    min: 500  },
      { name: 'Competidor',  min: 1500 },
      { name: 'Atleta',      min: 3000 },
      { name: 'Campeón',     min: 6000 },
      { name: 'Élite',       min: 10000},
      { name: 'Maestro',     min: 15000},
      { name: 'Leyenda',     min: 25000},
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
    var months     = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var dateStr    = goalDate.getDate() + ' ' + months[goalDate.getMonth()] + ' ' + goalDate.getFullYear();

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
          if (changeEl) changeEl.textContent = `${entries.length} registros totales`;
        }
      } else {
        if (changeEl) changeEl.textContent = 'Primer registro';
      }
    }

    // Registros totales
    const recEl = document.getElementById('stat-records');
    if (recEl) animateCountUp(recEl, entries.length, 500);
    const recLbl = document.getElementById('stat-records-label');
    if (recLbl && entries.length) {
      const weeks = new Set(entries.map(e => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${getWeekNumber(d)}`;
      }));
      recLbl.textContent = `${weeks.size} semana${weeks.size !== 1 ? 's' : ''} con datos`;
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
        const cat = bmi < 18.5 ? 'Bajo peso'
                  : bmi < 25   ? 'Normopeso'
                  : bmi < 30   ? 'Sobrepeso'
                  : 'Obesidad';
        bmiLbl.textContent  = cat;
        bmiLbl.style.color  = bmi >= 18.5 && bmi < 25 ? 'var(--emerald)' : 'var(--amber)';
      }
    }

    // TDEE — guardado por macroCalc.js o onboarding
    const tdeeVal = parseFloat(localStorage.getItem('hs_last_tdee') || '0');
    const tdeeEl  = document.getElementById('stat-tdee');
    const tdeeLbl = document.getElementById('stat-tdee-label');
    if (tdeeEl && tdeeVal) {
      animateCountUp(tdeeEl, `${Math.round(tdeeVal)} kcal`, 700);
      if (tdeeLbl) { tdeeLbl.textContent = 'TDEE calculado'; tdeeLbl.style.color = 'var(--emerald)'; }
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
            '<div class="projection-icon">📈</div>',
            '<div class="projection-body">',
              '<p class="projection-headline">',
                'A este ritmo llegarás a <span class="projection-highlight">' + proj.goal + ' kg</span>',
                ' el <span class="projection-highlight">' + proj.dateStr + '</span>',
              '</p>',
              '<p class="projection-detail">',
                'Perdiendo ~' + Math.abs(proj.ratePerWeek) + ' kg/semana · basado en tus últimos registros',
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
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.12)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#6c63ff',
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

    if (goal.startsWith('deficit')) {
      if (rate < -0.8) {
        icon = '⚠️'; color = 'var(--amber)';
        message = `Estás perdiendo <strong>${absRate.toFixed(2)} kg/sem</strong> — ritmo algo rápido. Considera aumentar 100-150 kcal para preservar músculo.`;
      } else if (rate < -0.15) {
        icon = '🎯'; color = 'var(--emerald)';
        message = `Perdiendo <strong>${absRate.toFixed(2)} kg/sem</strong> — ritmo óptimo para déficit. ¡Sigue así!`;
      } else if (rate >= -0.15 && rate <= 0.1) {
        icon = '📊'; color = 'var(--secondary)';
        message = `Peso estable (${rate >= 0 ? '+' : ''}${rate.toFixed(2)} kg/sem). Si tu objetivo es perder, prueba reducir 150-200 kcal o añadir cardio.`;
      } else {
        icon = '📈'; color = 'var(--accent)';
        message = `Ganando <strong>${absRate.toFixed(2)} kg/sem</strong>. Revisa tu balance calórico si quieres bajar de peso.`;
      }
    } else if (goal.startsWith('surplus')) {
      if (rate > 0.5) {
        icon = '⚠️'; color = 'var(--amber)';
        message = `Ganando <strong>${absRate.toFixed(2)} kg/sem</strong> — ritmo algo rápido. Podrías acumular más grasa. Reduce 100-150 kcal.`;
      } else if (rate > 0.1) {
        icon = '💪'; color = 'var(--emerald)';
        message = `Ganando <strong>${absRate.toFixed(2)} kg/sem</strong> — bulk limpio perfecto. ¡Sigue así!`;
      } else {
        icon = '📊'; color = 'var(--secondary)';
        message = `Peso casi estable (${rate >= 0 ? '+' : ''}${rate.toFixed(2)} kg/sem). Si quieres ganar masa, añade 100-200 kcal.`;
      }
    } else {
      // Mantener
      if (Math.abs(rate) <= 0.2) {
        icon = '⚖️'; color = 'var(--emerald)';
        message = `Peso muy estable (<strong>±${absRate.toFixed(2)} kg/sem</strong>). ¡Mantenimiento perfecto!`;
      } else {
        icon = '📊'; color = 'var(--secondary)';
        message = `Variación de <strong>${rate >= 0 ? '+' : ''}${rate.toFixed(2)} kg/sem</strong>. Ajusta tu ingesta si quieres más estabilidad.`;
      }
    }

    const totalStr = delta >= 0
      ? `+${delta.toFixed(1)} kg en ${Math.round(days)} días`
      : `${delta.toFixed(1)} kg en ${Math.round(days)} días`;

    wrap.style.display = '';
    wrap.innerHTML = `
      <div class="insight-card" style="--insight-color:${color}">
        <span class="insight-icon">${icon}</span>
        <div class="insight-body">
          <div class="insight-title">Análisis de tu progreso</div>
          <div class="insight-msg">${message}</div>
        </div>
        <span class="insight-total">${totalStr}</span>
      </div>`;
  }

  // ── PWA Install Prompt ─────────────────────────────────────
  let _deferredInstallPrompt = null;

  function initPWAInstall() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredInstallPrompt = e;
      showInstallBanner();
    });

    window.addEventListener('appinstalled', () => {
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'none';
    });
  }

  function showInstallBanner() {
    // No mostrar si ya fue descartado en esta sesión
    if (sessionStorage.getItem('hs_pwa_dismissed')) return;
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    banner.innerHTML = `
      <div class="pwa-banner">
        <span class="pwa-icon">📲</span>
        <div class="pwa-info">
          <strong>Instala HealthStack Pro</strong>
          <small>Acceso offline, carga instantánea y sin navegador</small>
        </div>
        <button class="btn btn--primary btn--sm" id="pwa-install-btn">Instalar</button>
        <button class="pwa-dismiss" id="pwa-dismiss" title="Cerrar">✕</button>
      </div>`;

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
          <span class="sponsor-label">Colaborador oficial</span>
          <strong>${sp.name}</strong>
          <small>${sp.tagline}</small>
        </div>
        <span class="sponsor-cta">Ver ofertas →</span>
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
    // Onboarding al final — necesita que todos los módulos estén listos para pre-rellenarlos
    if (typeof Onboarding         !== 'undefined') Onboarding.init();

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

    console.log('%c HealthStack Pro v2.0 ', 'background:#6c63ff;color:white;padding:4px 8px;border-radius:4px;font-weight:bold');
  }

  // Arrancar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-render greeting when language changes
  document.addEventListener('languagechange', () => initDashboard());
})();
