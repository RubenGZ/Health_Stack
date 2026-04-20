/* ============================================================
   gamification.js — Sistema XP, niveles, badges y desafíos semanales
   ============================================================ */

const Gamification = (function () {
  'use strict';

  const LS_KEY      = 'hs_gami';
  const LS_CHALL    = 'hs_challenges';

  // ── Niveles ───────────────────────────────────────────────
  const LEVELS = [
    { level: 1, name: 'Novato',     min: 0,     color: '#94a3b8', icon: '🌱' },
    { level: 2, name: 'Aprendiz',   min: 500,   color: '#10b981', icon: '⚡' },
    { level: 3, name: 'Competidor', min: 1500,  color: '#3b82f6', icon: '🔵' },
    { level: 4, name: 'Atleta',     min: 3000,  color: '#6c63ff', icon: '🏅' },
    { level: 5, name: 'Campeón',    min: 6000,  color: '#f59e0b', icon: '🏆' },
    { level: 6, name: 'Élite',      min: 10000, color: '#ff6584', icon: '💎' },
    { level: 7, name: 'Maestro',    min: 15000, color: '#a78bfa', icon: '⭐' },
    { level: 8, name: 'Leyenda',    min: 25000, color: '#00d2ff', icon: '👑' },
  ];

  // ── Acciones con XP ───────────────────────────────────────
  const XP_ACTIONS = {
    weight:    { xp: 50,  label: 'Registro de peso',      once: false },
    tdee:      { xp: 100, label: 'Calcular TDEE',         once: true  },
    routine:   { xp: 150, label: 'Generar rutina',         once: false },
    planner:   { xp: 75,  label: 'Completar semana en planner', once: false },
    post:      { xp: 30,  label: 'Publicar en comunidad', once: false },
    login:     { xp: 10,  label: 'Sesión diaria',         once: true  },
  };

  // ── Badges ────────────────────────────────────────────────
  const BADGES = [
    { id: 'first_weight',  icon: '⚖️',  name: 'Primer paso',       desc: 'Añade tu primer registro de peso',        cond: s => s.weightCount >= 1 },
    { id: 'weight_5',      icon: '📈',  name: 'En racha',          desc: '5 registros de peso',                     cond: s => s.weightCount >= 5 },
    { id: 'weight_30',     icon: '🗓',  name: 'Constancia de acero',desc: '30 registros de peso',                   cond: s => s.weightCount >= 30 },
    { id: 'tdee_calc',     icon: '🧮',  name: 'Científico del gym', desc: 'Calcula tu TDEE por primera vez',         cond: s => s.tdeeCalc },
    { id: 'first_routine', icon: '📋',  name: 'Plan maestro',       desc: 'Genera tu primera rutina',               cond: s => s.routineCount >= 1 },
    { id: 'level_2',       icon: '⚡',  name: 'Aprendiz',           desc: 'Alcanza el nivel 2',                     cond: s => s.xp >= 500 },
    { id: 'level_4',       icon: '🏅',  name: 'Atleta',             desc: 'Alcanza el nivel 4',                     cond: s => s.xp >= 3000 },
    { id: 'level_6',       icon: '💎',  name: 'Élite',              desc: 'Alcanza el nivel 6',                     cond: s => s.xp >= 10000 },
    { id: 'level_8',       icon: '👑',  name: 'Leyenda',            desc: 'Alcanza el nivel máximo',                cond: s => s.xp >= 25000 },
    { id: 'planner_7',     icon: '🍽',  name: 'Chef del fitness',   desc: 'Completa una semana entera en el planner',cond: s => s.plannerWeeks >= 1 },
    { id: 'community',     icon: '🤝',  name: 'Social',             desc: 'Publica por primera vez en la comunidad', cond: s => s.postCount >= 1 },
    { id: 'xp_1000',       icon: '💯',  name: 'Millar de XP',       desc: 'Acumula 1000 XP',                        cond: s => s.xp >= 1000 },
  ];

  // ── Desafíos semanales (pool) ─────────────────────────────
  const CHALLENGE_POOL = [
    { id: 'c1',  icon: '⚖️', name: 'Pesarme 3 días esta semana',     target: 3,  unit: 'registros',  action: 'weight'  },
    { id: 'c2',  icon: '🥗', name: 'Planificar 5 comidas en el planner', target: 5, unit: 'comidas', action: 'planner' },
    { id: 'c3',  icon: '🏋', name: 'Generar o revisar mi rutina',     target: 1,  unit: 'rutinas',   action: 'routine' },
    { id: 'c4',  icon: '💬', name: 'Publicar en la comunidad',        target: 1,  unit: 'posts',     action: 'post'    },
    { id: 'c5',  icon: '🧮', name: 'Actualizar mis macros objetivo',  target: 1,  unit: 'cálculos',  action: 'tdee'    },
    { id: 'c6',  icon: '📈', name: '5 registros de peso esta semana', target: 5,  unit: 'registros', action: 'weight'  },
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

    // Si es once=true y ya se realizó, no dar más XP
    if (cfg.once) {
      if (action === 'tdee'    && state.tdeeCalc)    return;
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
    showXPToast(cfg.xp, cfg.label);
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
          showBadgeToast({ icon: '🏆', name: '¡Desafío completado!', desc: `${c.name} — +200 XP bonus` });
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
    setText('gami-level-name',  `${lv.icon} ${lv.name}`);
    setText('gami-xp-label',    `${state.xp} XP total`);
    setText('gami-xp-current',  `${state.xp} XP`);
    setText('gami-xp-next',     next ? `${next.min} XP — ${next.name}` : 'Nivel máximo');

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
    if (weekLabel) weekLabel.textContent = `Semana ${getWeek(now)}`;
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
              ${c.done ? '<span class="challenge-done-tag">✓ Completado</span>' : '<span>+200 XP al completar</span>'}
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
