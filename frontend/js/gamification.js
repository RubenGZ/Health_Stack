/* ============================================================
   gamification.js — Sistema XP, niveles, badges y desafíos semanales
   ============================================================ */

const Gamification = (function () {
  'use strict';

  function _t(key) { return (window.t && window.t(key)) || key; }

  const LS_KEY      = 'hs_gami';
  const LS_CHALL    = 'hs_challenges';

  // ── Niveles ───────────────────────────────────────────────
  const LEVELS = [
    { level: 1, nameKey: 'gamification.level_novato',     min: 0,     color: '#94a3b8', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V12M12 12C12 7 7 4 2 5c0 5 3 9 10 7M12 12c0-5 5-8 10-7 0 5-3 9-10 7"/></svg>' },
    { level: 2, nameKey: 'gamification.level_aprendiz',   min: 500,   color: '#10b981', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
    { level: 3, nameKey: 'gamification.level_competidor', min: 1500,  color: '#3b82f6', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>' },
    { level: 4, nameKey: 'gamification.level_atleta',     min: 3000,  color: '#6c63ff', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' },
    { level: 5, nameKey: 'gamification.level_campeon',    min: 6000,  color: '#f59e0b', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>' },
    { level: 6, nameKey: 'gamification.level_elite',      min: 10000, color: '#ff6584', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>' },
    { level: 7, nameKey: 'gamification.level_maestro',    min: 15000, color: '#a78bfa', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
    { level: 8, nameKey: 'gamification.level_leyenda',    min: 25000, color: '#00d2ff', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>' },
  ];

  // ── Acciones con XP ───────────────────────────────────────
  const XP_ACTIONS = {
    weight:    { xp: 50,  labelKey: 'gamification.xp_weight',  once: false },
    tdee:      { xp: 100, labelKey: 'gamification.xp_tdee',    once: true  },
    routine:   { xp: 150, labelKey: 'gamification.xp_routine', once: false },
    planner:   { xp: 75,  labelKey: 'gamification.xp_planner', once: false },
    post:      { xp: 30,  labelKey: 'gamification.xp_post',    once: false },
    login:     { xp: 10,  labelKey: 'gamification.xp_login',   once: true  },
  };

  // ── Badges ────────────────────────────────────────────────
  const BADGES = [
    { id: 'first_weight',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>', name: 'Primer paso',       desc: 'Añade tu primer registro de peso',        cond: s => s.weightCount >= 1 },
    { id: 'weight_5',      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>', name: 'En racha',          desc: '5 registros de peso',                     cond: s => s.weightCount >= 5 },
    { id: 'weight_30',     icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', name: 'Constancia de acero',desc: '30 registros de peso',                   cond: s => s.weightCount >= 30 },
    { id: 'tdee_calc',     icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>', name: 'Científico del gym', desc: 'Calcula tu TDEE por primera vez',         cond: s => s.tdeeCalc },
    { id: 'first_routine', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', name: 'Plan maestro',       desc: 'Genera tu primera rutina',               cond: s => s.routineCount >= 1 },
    { id: 'level_2',       icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', name: 'Aprendiz',           desc: 'Alcanza el nivel 2',                     cond: s => s.xp >= 500 },
    { id: 'level_4',       icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', name: 'Atleta',             desc: 'Alcanza el nivel 4',                     cond: s => s.xp >= 3000 },
    { id: 'level_6',       icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>', name: 'Élite',              desc: 'Alcanza el nivel 6',                     cond: s => s.xp >= 10000 },
    { id: 'level_8',       icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>', name: 'Leyenda',            desc: 'Alcanza el nivel máximo',                cond: s => s.xp >= 25000 },
    { id: 'planner_7',     icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>', name: 'Chef del fitness',   desc: 'Completa una semana entera en el planner',cond: s => s.plannerWeeks >= 1 },
    { id: 'community',     icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', name: 'Social',             desc: 'Publica por primera vez en la comunidad', cond: s => s.postCount >= 1 },
    { id: 'xp_1000',       icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', name: 'Millar de XP',       desc: 'Acumula 1000 XP',                        cond: s => s.xp >= 1000 },
  ];

  // ── Desafíos semanales (pool) ─────────────────────────────
  const CHALLENGE_POOL = [
    { id: 'c1',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>', name: 'Pesarme 3 días esta semana',     target: 3,  unit: 'registros',  action: 'weight'  },
    { id: 'c2',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>', name: 'Planificar 5 comidas en el planner', target: 5, unit: 'comidas', action: 'planner' },
    { id: 'c3',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 5H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2"/><path d="M18 5h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2"/><line x1="6" y1="8" x2="18" y2="8"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><path d="M12 15v4M9 19h6"/></svg>', name: 'Generar o revisar mi rutina',     target: 1,  unit: 'rutinas',   action: 'routine' },
    { id: 'c4',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', name: 'Publicar en la comunidad',        target: 1,  unit: 'posts',     action: 'post'    },
    { id: 'c5',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>', name: 'Actualizar mis macros objetivo',  target: 1,  unit: 'cálculos',  action: 'tdee'    },
    { id: 'c6',  icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>', name: '5 registros de peso esta semana', target: 5,  unit: 'registros', action: 'weight'  },
  ];

  // ── Estado ────────────────────────────────────────────────
  let state = {
    xp:           0,
    weightCount:  0,
    tdeeCalc:     false,
    routineCount: 0,
    plannerWeeks: 0,
    postCount:    0,
    earnedBadges: [],
    lastLogin:    null,
  };

  let weekChallenges = []; // desafíos activos esta semana

  // ── Persistencia ──────────────────────────────────────────
  function saveState()  { localStorage.setItem(LS_KEY,   JSON.stringify(state)); }
  function loadState()  {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (s) state = { ...state, ...s };
    } catch { /* ignorar */ }
  }
  function saveChall()  { localStorage.setItem(LS_CHALL, JSON.stringify(weekChallenges)); }
  function loadChall()  {
    try {
      const c = JSON.parse(localStorage.getItem(LS_CHALL) || 'null');
      if (c) weekChallenges = c;
    } catch { /* ignorar */ }
  }

  // ── Nivel actual ──────────────────────────────────────────
  function getLevel(xp) {
    return [...LEVELS].reverse().find(l => xp >= l.min) || LEVELS[0];
  }

  function getNextLevel(xp) {
    return LEVELS.find(l => l.min > xp) || null;
  }

  // ── Añadir XP ─────────────────────────────────────────────
  function addXP(action) {
    const cfg = XP_ACTIONS[action];
    if (!cfg) return;

    // Si es once=true, comprobar que no se haya otorgado ya
    if (cfg.once) {
      if (action === 'tdee'  && state.tdeeCalc)    return;
      // login: el guard de lastLogin en init() es suficiente para el flujo normal,
      // pero si addXP('login') se llama directamente desde otro lugar usamos el mismo guard
      if (action === 'login') {
        const today = new Date().toDateString();
        if (state.lastLogin === today) return;
      }
    }

    // Actualizar contadores de estado
    if (action === 'weight')  state.weightCount++;
    if (action === 'tdee')    state.tdeeCalc = true;
    if (action === 'routine') state.routineCount++;
    if (action === 'planner') state.plannerWeeks++;
    if (action === 'post')    state.postCount++;

    state.xp += cfg.xp;
    saveState();

    // Actualizar desafíos
    updateChallenges(action);

    // Comprobar badges nuevos
    checkBadges();

    // Actualizar UI
    render();

    // Actualizar XP en sidebar (app.js lo hace pero reforzamos)
    window.dispatchEvent(new CustomEvent('hs:xp-updated', { detail: { xp: state.xp } }));

    // Mostrar toast XP
    showXPToast(cfg.xp, _t(cfg.labelKey));
  }

  // ── Toast de XP ──────────────────────────────────────────
  function showXPToast(xp, label) {
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.innerHTML = `<span class="xp-toast-icon">+${xp} XP</span><span>${label}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 400); }, 2500);
  }

  // ── Comprobar badges ──────────────────────────────────────
  function checkBadges() {
    BADGES.forEach(b => {
      if (!state.earnedBadges.includes(b.id) && b.cond(state)) {
        state.earnedBadges.push(b.id);
        saveState();
        showBadgeToast(b);
      }
    });
  }

  function showBadgeToast(badge) {
    const toast = document.createElement('div');
    toast.className = 'badge-toast';
    toast.innerHTML = `<span>${badge.icon}</span><div><strong>${badge.name}</strong><br><small>${badge.desc}</small></div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 500); }, 3500);
  }

  // ── Desafíos semanales ────────────────────────────────────
  function initChallenges() {
    loadChall();
    const now      = new Date();
    const weekKey  = `${now.getFullYear()}-W${getWeek(now)}`;

    // Comprobar si los desafíos son de esta semana
    if (!weekChallenges.length || weekChallenges[0]?.weekKey !== weekKey) {
      // Seleccionar 3 desafíos aleatorios del pool
      const shuffled = [...CHALLENGE_POOL].sort(() => Math.random() - 0.5);
      weekChallenges = shuffled.slice(0, 3).map(c => ({
        ...c,
        progress: 0,
        done: false,
        weekKey,
      }));
      saveChall();
    }
  }

  function updateChallenges(action) {
    weekChallenges.forEach(c => {
      if (!c.done && c.action === action) {
        c.progress = Math.min(c.progress + 1, c.target);
        if (c.progress >= c.target) {
          c.done = true;
          state.xp += 200; // bonus por completar desafío
          saveState();
          showBadgeToast({ icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>', name: _t('gamification.challenge_done_title'), desc: `${c.name} — +200 XP bonus` });
        }
      }
    });
    saveChall();
  }

  function getWeek(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  }

  // ── Render UI ─────────────────────────────────────────────
  function render() {
    const lv   = getLevel(state.xp);
    const next = getNextLevel(state.xp);

    // Level hero
    setText('gami-level-badge', lv.level);
    setText('gami-level-name',  `${lv.icon} ${_t(lv.nameKey)}`);
    setText('gami-xp-label',    `${state.xp} XP`);
    setText('gami-xp-current',  `${state.xp} XP`);
    setText('gami-xp-next',     next ? `${next.min} XP — ${_t(next.nameKey)}` : _t('gamification.max_level'));

    const fill = document.getElementById('gami-xp-fill');
    if (fill) {
      const pct = next
        ? Math.min(100, ((state.xp - lv.min) / (next.min - lv.min)) * 100)
        : 100;
      fill.style.width = `${pct}%`;
      fill.style.background = lv.color;
    }

    // Racha desde WeightTracker
    const entries   = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    const weeks     = new Set(entries.map(e => {
      const d = new Date(e.date);
      return `${d.getFullYear()}-${getWeek(d)}`;
    }));
    setText('gami-streak',          weeks.size);
    setText('gami-badges-count',    state.earnedBadges.length);

    const doneChallenges = weekChallenges.filter(c => c.done).length;
    setText('gami-challenges-done', doneChallenges);

    // Badges grid
    renderBadges();

    // Desafíos
    renderChallenges();

    // Semana label
    const now = new Date();
    const weekLabel = document.getElementById('gami-week-label');
    if (weekLabel) weekLabel.textContent = _t('gamification.week_label').replace('{n}', getWeek(now));
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderBadges() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;

    const earnedEl = document.getElementById('gami-badges-earned');
    if (earnedEl) earnedEl.textContent = `${state.earnedBadges.length} / ${BADGES.length}`;

    grid.innerHTML = BADGES.map(b => {
      const earned = state.earnedBadges.includes(b.id);
      return `
        <div class="badge-item${earned ? ' earned' : ''}" title="${b.desc}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${b.desc}</div>
          ${earned ? '<div class="badge-check">✓</div>' : ''}
        </div>`;
    }).join('');
  }

  function renderChallenges() {
    const list = document.getElementById('challenges-list');
    if (!list) return;
    list.innerHTML = weekChallenges.map(c => {
      const pct = Math.min(100, (c.progress / c.target) * 100);
      return `
        <div class="challenge-item${c.done ? ' done' : ''}">
          <div class="challenge-icon">${c.icon}</div>
          <div class="challenge-info">
            <div class="challenge-name">${c.name}</div>
            <div class="challenge-progress-bar">
              <div class="challenge-fill" style="width:${pct}%"></div>
            </div>
            <div class="challenge-meta">
              <span>${c.progress} / ${c.target} ${c.unit}</span>
              ${c.done ? `<span class="challenge-done-tag">${_t('gamification.challenge_completed_tag')}</span>` : `<span>${_t('gamification.challenge_xp_hint')}</span>`}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Sincronizar con eventos de otros módulos ───────────────
  function listenEvents() {
    // Cuando se añade un peso
    window.addEventListener('hs:weight-updated', () => {
      addXP('weight');
    });
    // Cuando se calcula TDEE (macroCalc.js puede disparar esto)
    window.addEventListener('hs:tdee-calculated', () => {
      addXP('tdee');
    });
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    loadState();
    initChallenges();

    // Sincronizar contadores con WeightTracker si ya hay datos
    if (typeof WeightTracker !== 'undefined') {
      const entries = WeightTracker.getAll();
      if (entries.length > state.weightCount) {
        // Hay registros previos no contados — ajustar sin dar XP duplicado
        state.weightCount = entries.length;
        state.xp = Math.max(state.xp, entries.length * 50);
        saveState();
      }
    }

    checkBadges();
    render();
    listenEvents();
    document.addEventListener('languagechange', render);

    // Login diario
    const today = new Date().toDateString();
    if (state.lastLogin !== today) {
      state.lastLogin = today;
      addXP('login');
    }
  }

  // ── API pública ───────────────────────────────────────────
  return { init, addXP, getLevel, getState: () => ({ ...state }) };
})();
