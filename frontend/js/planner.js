/* ============================================================
   planner.js — Planner de comidas (mobile-first, v2)
   Diseño: strip semanal + vista diaria + bottom sheet
   Comidas configurables entre 2 y 6 por día (defecto 4).
   ============================================================ */

const MealPlanner = (function () {
  'use strict';

  // ── Claves localStorage ───────────────────────────────────
  const LS_KEY = 'hs_planner_v2';   // { "YYYY-MM-DD": { "Desayuno": recipeId } }
  const LS_CFG = 'hs_planner_cfg';  // { mealsPerDay: 4, perDay: { "YYYY-MM-DD": 3 } }
  const LS_OLD = 'hs_planner';      // legado — se migra automáticamente

  // ── Sets de comidas por número ────────────────────────────
  const MEAL_SETS = {
    2: ['Comida', 'Cena'],
    3: ['Desayuno', 'Almuerzo', 'Cena'],
    4: ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'],
    5: ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'],
    6: ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena', 'Post-entreno'],
  };

  const MEAL_EMOJI = {
    'Desayuno':      '🌅',
    'Media mañana':  '☀️',
    'Almuerzo':      '🍽️',
    'Merienda':      '🌤️',
    'Cena':          '🌙',
    'Post-entreno':  '💪',
    'Comida':        '🍽️',
  };

  // Categoría sugerida en el catálogo según el tipo de comida
  const MEAL_TO_CAT = {
    'Desayuno':      'desayuno',
    'Media mañana':  'snack',
    'Almuerzo':      'almuerzo',
    'Merienda':      'snack',
    'Cena':          'cena',
    'Post-entreno':  'post',
    'Comida':        'almuerzo',
  };

  const CAT_LABELS = {
    'all':      'Todas',
    'desayuno': 'Desayuno',
    'almuerzo': 'Almuerzo',
    'cena':     'Cena',
    'snack':    'Snack',
    'pre':      'Pre',
    'post':     'Post',
  };

  const DAY_SHORT  = ['Do','Lu','Ma','Mi','Ju','Vi','Sá'];
  const DAY_FULL   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  const DEFAULT_MEALS = 4;
  const MIN_MEALS     = 2;
  const MAX_MEALS     = 6;

  // ── Catálogo predefinido (25 recetas) ─────────────────────
  const RECIPES = [
    { id:1,  cat:'desayuno', name:'Tortilla de claras',               kcal:320, p:35, c:12, f:14, inf:1 },
    { id:2,  cat:'desayuno', name:'Avena con frutos rojos',           kcal:380, p:14, c:62, f: 8, inf:1 },
    { id:3,  cat:'desayuno', name:'Yogur griego con granola',         kcal:350, p:20, c:38, f:12, inf:2 },
    { id:4,  cat:'desayuno', name:'Batido proteico',                  kcal:290, p:40, c:22, f: 6, inf:1 },
    { id:5,  cat:'desayuno', name:'Tostadas de aguacate',             kcal:420, p:12, c:45, f:22, inf:1 },
    { id:6,  cat:'almuerzo', name:'Pollo con arroz integral',         kcal:520, p:48, c:58, f: 8, inf:1 },
    { id:7,  cat:'almuerzo', name:'Salmón con quinoa',                kcal:580, p:45, c:42, f:22, inf:1 },
    { id:8,  cat:'almuerzo', name:'Ensalada de atún',                 kcal:380, p:38, c:18, f:16, inf:2 },
    { id:9,  cat:'almuerzo', name:'Pasta integral boloñesa',          kcal:620, p:42, c:72, f:14, inf:3 },
    { id:10, cat:'almuerzo', name:'Bowl de garbanzos',                kcal:490, p:22, c:65, f:14, inf:1 },
    { id:11, cat:'almuerzo', name:'Ternera con patata',               kcal:560, p:50, c:46, f:16, inf:2 },
    { id:12, cat:'almuerzo', name:'Buddha bowl vegano',               kcal:440, p:18, c:58, f:16, inf:1 },
    { id:13, cat:'cena',     name:'Merluza al horno',                 kcal:320, p:40, c:10, f:12, inf:1 },
    { id:14, cat:'cena',     name:'Pavo con verduras',                kcal:380, p:44, c:18, f:10, inf:1 },
    { id:15, cat:'cena',     name:'Tortilla francesa',                kcal:260, p:22, c: 2, f:18, inf:1 },
    { id:16, cat:'cena',     name:'Crema de verduras',                kcal:220, p: 8, c:30, f: 8, inf:1 },
    { id:17, cat:'cena',     name:'Tofu salteado',                    kcal:360, p:26, c:22, f:18, inf:1 },
    { id:18, cat:'snack',    name:'Requesón con nueces',              kcal:220, p:18, c: 8, f:12, inf:1 },
    { id:19, cat:'snack',    name:'Manzana con mantequilla cacahuete',kcal:240, p: 6, c:30, f:12, inf:2 },
    { id:20, cat:'snack',    name:'Edamame salado',                   kcal:180, p:14, c:14, f: 7, inf:1 },
    { id:21, cat:'snack',    name:'Barrita de proteína',              kcal:200, p:20, c:20, f: 6, inf:2 },
    { id:22, cat:'snack',    name:'Hummus con bastones',              kcal:190, p: 8, c:22, f: 8, inf:1 },
    { id:23, cat:'pre',      name:'Arroz con plátano',                kcal:350, p: 6, c:78, f: 2, inf:1 },
    { id:24, cat:'pre',      name:'Tostada con mermelada',            kcal:280, p: 8, c:52, f: 4, inf:2 },
    { id:25, cat:'post',     name:'Batido recovery',                  kcal:400, p:42, c:50, f: 4, inf:1 },
  ];

  // ── Estado ────────────────────────────────────────────────
  let plan         = {};   // { "YYYY-MM-DD": { "Desayuno": recipeId, ... } }
  let config       = { mealsPerDay: DEFAULT_MEALS, perDay: {} };
  let selectedDate = _todayStr();
  let _sheetState  = null; // { dateStr, mealName, searchQuery, catFilter } | 'cfg'
  let _macroChart  = null;

  // ── Utilidades de fecha ──────────────────────────────────
  function _todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${_p(d.getMonth()+1)}-${_p(d.getDate())}`;
  }

  function _p(n) { return String(n).padStart(2, '0'); }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${_p(d.getMonth()+1)}-${_p(d.getDate())}`;
  }

  function _mondayOf(dateStr) {
    const d   = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1; // lunes=0
    return _addDays(dateStr, -dow);
  }

  function _dayLabel(dateStr) {
    const today = _todayStr();
    const d = new Date(dateStr + 'T12:00:00');
    if (dateStr === today) return `Hoy, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
    if (dateStr === _addDays(today,  1)) return `Mañana, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
    if (dateStr === _addDays(today, -1)) return `Ayer, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
    return `${DAY_FULL[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  }

  // ── XSS ──────────────────────────────────────────────────
  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Persistencia ─────────────────────────────────────────
  function _save() {
    localStorage.setItem(LS_KEY, JSON.stringify(plan));
    localStorage.setItem(LS_CFG, JSON.stringify(config));
  }

  function _load() {
    try   { plan   = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { plan   = {}; }
    try   { config = { mealsPerDay: DEFAULT_MEALS, perDay: {}, ...JSON.parse(localStorage.getItem(LS_CFG) || '{}') }; }
    catch { config = { mealsPerDay: DEFAULT_MEALS, perDay: {} }; }
    _migrate();
  }

  // Migra formato antiguo "Lunes-Desayuno" → "YYYY-MM-DD".Desayuno
  function _migrate() {
    const old = JSON.parse(localStorage.getItem(LS_OLD) || 'null');
    if (!old || typeof old !== 'object' || !Object.keys(old).length) return;
    const OLD_DAY = { Lunes:0, Martes:1, 'Miércoles':2, Jueves:3, Viernes:4, 'Sábado':5, Domingo:6 };
    const monday  = _mondayOf(_todayStr());
    Object.entries(old).forEach(([key, rid]) => {
      const dash  = key.indexOf('-');
      const day   = key.slice(0, dash);
      const meal  = key.slice(dash + 1);
      const off   = OLD_DAY[day];
      if (off === undefined) return;
      const ds = _addDays(monday, off);
      if (!plan[ds]) plan[ds] = {};
      plan[ds][meal] = rid;
    });
    _save();
    localStorage.removeItem(LS_OLD);
  }

  // ── Meals por día ─────────────────────────────────────────
  function _mealCount(dateStr) {
    return config.perDay?.[dateStr] ?? config.mealsPerDay ?? DEFAULT_MEALS;
  }

  function _meals(dateStr) {
    return MEAL_SETS[_mealCount(dateStr)] || MEAL_SETS[DEFAULT_MEALS];
  }

  // ── Buscar receta ─────────────────────────────────────────
  function _find(id) {
    if (typeof id === 'string' && id.startsWith('user_')) {
      if (typeof MyRecipes === 'undefined') return null;
      const n = parseInt(id.replace('user_', ''));
      const r = MyRecipes.getRecipes().find(x => x.id === n);
      return r ? MyRecipes.toPlanner(r) : null;
    }
    return RECIPES.find(r => r.id === parseInt(id)) || null;
  }

  // ── Strip semanal ─────────────────────────────────────────
  function _renderStrip() {
    const el = document.getElementById('planner-week-strip');
    if (!el) return;
    const today  = _todayStr();
    const monday = _mondayOf(selectedDate);
    const selD   = new Date(selectedDate + 'T12:00:00');
    const prevMon = _addDays(monday, -7);
    const nextMon = _addDays(monday,  7);

    let daysHtml = '';
    for (let i = 0; i < 7; i++) {
      const ds = _addDays(monday, i);
      const d  = new Date(ds + 'T12:00:00');
      const meals = Object.values(plan[ds] || {}).filter(Boolean).length;
      const cls = ['ps-day',
        ds === selectedDate ? 'ps-day--active'  : '',
        ds === today        ? 'ps-day--today'   : '',
      ].filter(Boolean).join(' ');
      daysHtml += `
        <button class="${cls}" data-date="${ds}">
          <span class="ps-day-name">${DAY_SHORT[d.getDay()]}</span>
          <span class="ps-day-num">${d.getDate()}</span>
          <span class="ps-day-dot${meals ? ' ps-day-dot--filled' : ''}">${meals || ''}</span>
        </button>`;
    }

    el.innerHTML = `
      <div class="ps-header">
        <button class="ps-nav ps-nav--prev" data-date="${prevMon}">‹</button>
        <span class="ps-month">${MONTH_SHORT[selD.getMonth()].charAt(0).toUpperCase()}${MONTH_SHORT[selD.getMonth()].slice(1)} ${selD.getFullYear()}</span>
        <button class="ps-nav ps-nav--next" data-date="${nextMon}">›</button>
      </div>
      <div class="ps-days">${daysHtml}</div>`;

    el.querySelectorAll('.ps-day').forEach(btn => {
      btn.addEventListener('click', () => _selectDate(btn.dataset.date));
    });
    el.querySelectorAll('.ps-nav').forEach(btn => {
      btn.addEventListener('click', () => _selectDate(btn.dataset.date));
    });
  }

  function _selectDate(ds) {
    selectedDate = ds;
    _renderStrip();
    _renderDayView();
    _renderMacros();
  }

  // ── Vista del día ─────────────────────────────────────────
  function _renderDayView() {
    const el = document.getElementById('planner-day-view');
    if (!el) return;

    const meals    = _meals(selectedDate);
    const count    = _mealCount(selectedDate);
    const dayPlan  = plan[selectedDate] || {};
    const totalKcal = Object.values(dayPlan).reduce((s, id) => {
      const r = _find(id); return r ? s + r.kcal : s;
    }, 0);

    let html = `
      <div class="pd-header">
        <div class="pd-info">
          <span class="pd-day-label">${_dayLabel(selectedDate)}</span>
          ${totalKcal > 0 ? `<span class="pd-kcal-total">${Math.round(totalKcal).toLocaleString('es-ES')} kcal</span>` : ''}
        </div>
        <div class="pd-controls">
          <button class="pd-ctrl" id="btn-meal-minus" ${count <= MIN_MEALS ? 'disabled' : ''}>−</button>
          <span class="pd-ctrl-label">${count} comidas</span>
          <button class="pd-ctrl" id="btn-meal-plus"  ${count >= MAX_MEALS ? 'disabled' : ''}>+</button>
          <button class="pd-ctrl-cfg" id="btn-meal-cfg">⚙</button>
        </div>
      </div>
      <div class="pd-meals">`;

    meals.forEach(meal => {
      const rid    = dayPlan[meal];
      const recipe = rid ? _find(rid) : null;
      const emoji  = MEAL_EMOJI[meal] || '🍽️';
      html += `
        <div class="pd-meal card">
          <div class="pd-meal-top">
            <div class="pd-meal-label">
              <span class="pd-meal-emoji">${emoji}</span>
              <span class="pd-meal-name">${_esc(meal)}</span>
              ${recipe ? `<span class="pd-meal-kcal">${recipe.kcal} kcal</span>` : ''}
            </div>
            <button class="btn btn--ghost btn--sm pd-add-btn"
                    data-meal="${_esc(meal)}" data-date="${selectedDate}">
              ${recipe ? '↔ Cambiar' : '+ Añadir'}
            </button>
          </div>
          ${recipe ? `
          <div class="pd-recipe-row">
            <div class="pd-recipe-info">
              <span class="pd-recipe-name">${_esc(recipe.name)}</span>
              <div class="pd-recipe-macros">
                <span class="rmacro rmacro--p">P ${recipe.p}g</span>
                <span class="rmacro rmacro--c">H ${recipe.c}g</span>
                <span class="rmacro rmacro--f">G ${recipe.f}g</span>
              </div>
            </div>
            <button class="pd-remove" data-meal="${_esc(meal)}" title="Quitar">×</button>
          </div>` : ''}
        </div>`;
    });

    html += '</div>';
    el.innerHTML = html;

    // Listeners
    el.querySelectorAll('.pd-add-btn').forEach(btn => {
      btn.addEventListener('click', () => _openSheet(btn.dataset.date, btn.dataset.meal));
    });

    el.querySelectorAll('.pd-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (plan[selectedDate]) {
          delete plan[selectedDate][btn.dataset.meal];
          if (!Object.keys(plan[selectedDate]).length) delete plan[selectedDate];
        }
        _save(); _renderStrip(); _renderDayView(); _renderMacros();
      });
    });

    document.getElementById('btn-meal-minus')?.addEventListener('click', () => {
      const n = _mealCount(selectedDate);
      if (n <= MIN_MEALS) return;
      config.perDay[selectedDate] = n - 1;
      _save(); _renderDayView();
    });

    document.getElementById('btn-meal-plus')?.addEventListener('click', () => {
      const n = _mealCount(selectedDate);
      if (n >= MAX_MEALS) return;
      config.perDay[selectedDate] = n + 1;
      _save(); _renderDayView();
    });

    document.getElementById('btn-meal-cfg')?.addEventListener('click', _openCfgSheet);
  }

  // ── Bottom sheet — picker de recetas ─────────────────────
  function _openSheet(dateStr, mealName) {
    _sheetState = {
      type: 'recipe',
      dateStr,
      mealName,
      searchQuery: '',
      catFilter: MEAL_TO_CAT[mealName] || 'all',
    };
    _buildSheetContent();
    _showSheet();
  }

  function _buildSheetContent() {
    const sheet = document.getElementById('planner-bottom-sheet');
    if (!sheet || !_sheetState || _sheetState.type !== 'recipe') return;

    const { dateStr, mealName, searchQuery, catFilter } = _sheetState;
    const q = searchQuery.toLowerCase();

    const userRecs = (typeof MyRecipes !== 'undefined')
      ? MyRecipes.getRecipes().map(r => ({ ...MyRecipes.toPlanner(r), isUser: true }))
      : [];

    const filtUser = userRecs.filter(r => !q || r.name.toLowerCase().includes(q));
    const filtCat  = RECIPES.filter(r =>
      (catFilter === 'all' || r.cat === catFilter) &&
      (!q || r.name.toLowerCase().includes(q))
    );

    const card = r => `
      <button class="pbs-recipe" data-rid="${_esc(String(r.id))}">
        <div class="pbs-recipe-name">${_esc(r.name)}</div>
        <div class="pbs-recipe-meta">
          <span class="pbs-kcal">${r.kcal} kcal</span>
          <span class="rmacro rmacro--p">P ${r.p}g</span>
          <span class="rmacro rmacro--c">H ${r.c}g</span>
          <span class="rmacro rmacro--f">G ${r.f}g</span>
        </div>
      </button>`;

    const catChips = Object.entries(CAT_LABELS).map(([id, lbl]) =>
      `<button class="chip${catFilter === id ? ' chip--active' : ''}" data-cat="${id}">${_esc(lbl)}</button>`
    ).join('');

    sheet.innerHTML = `
      <div class="bs-handle"></div>
      <div class="bs-inner">
        <div class="bs-head">
          <span class="bs-title">Añadir a ${_esc(mealName)}</span>
          <button class="bs-close" id="pbs-close">×</button>
        </div>
        <input type="search" id="pbs-search" class="form-input bs-search"
               placeholder="Buscar receta…" value="${_esc(searchQuery)}" autocomplete="off">

        ${filtUser.length ? `
          <p class="pbs-section">⭐ Mis Recetas (${filtUser.length})</p>
          <div class="pbs-list">${filtUser.map(card).join('')}</div>
        ` : (q ? '' : `
          <p class="pbs-section pbs-section--empty">
            Sin recetas guardadas — créalas en <strong>Nutrición → Mis Recetas</strong>
          </p>`)}

        <p class="pbs-section">Catálogo</p>
        <div class="pbs-cat-chips">${catChips}</div>
        <div class="pbs-list">${filtCat.length
          ? filtCat.map(card).join('')
          : '<p class="pbs-empty">Sin resultados</p>'}</div>

        <button class="btn btn--ghost btn--sm btn--full pbs-create" id="pbs-create">
          + Crear nueva receta
        </button>
      </div>`;

    // Cerrar
    sheet.querySelector('#pbs-close').addEventListener('click', _closeSheet);

    // Búsqueda
    const inp = sheet.querySelector('#pbs-search');
    inp.addEventListener('input', e => {
      _sheetState.searchQuery = e.target.value.trim();
      _buildSheetContent();
      requestAnimationFrame(() => sheet.querySelector('#pbs-search')?.focus());
    });

    // Chips categoría
    sheet.querySelectorAll('.pbs-cat-chips .chip').forEach(c => {
      c.addEventListener('click', () => {
        _sheetState.catFilter = c.dataset.cat;
        _buildSheetContent();
      });
    });

    // Seleccionar receta
    sheet.querySelectorAll('.pbs-recipe').forEach(btn => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.rid;
        const rid = raw.startsWith('user_') ? raw : parseInt(raw);
        if (!plan[dateStr]) plan[dateStr] = {};
        plan[dateStr][mealName] = rid;
        _save(); _closeSheet();
        _renderStrip(); _renderDayView(); _renderMacros();
      });
    });

    // Crear receta
    sheet.querySelector('#pbs-create').addEventListener('click', () => {
      _closeSheet();
      document.querySelector('[data-section="nutricion"]')?.click();
      requestAnimationFrame(() =>
        document.querySelector('#nutrition-tabs [data-tab="misrecetas"]')?.click()
      );
    });
  }

  // ── Bottom sheet — configuración de comidas ───────────────
  function _openCfgSheet() {
    _sheetState = { type: 'cfg' };
    const sheet   = document.getElementById('planner-bottom-sheet');
    const current = _mealCount(selectedDate);

    sheet.innerHTML = `
      <div class="bs-handle"></div>
      <div class="bs-inner">
        <div class="bs-head">
          <span class="bs-title">Configurar comidas del día</span>
          <button class="bs-close" id="pbs-cfg-close">×</button>
        </div>
        <p class="pbs-cfg-hint">Elige cuántas comidas quieres planificar</p>
        <div class="pbs-cfg-grid">
          ${[2,3,4,5,6].map(n => `
            <button class="pbs-cfg-opt${n === current ? ' pbs-cfg-opt--active' : ''}" data-n="${n}">
              <span class="pbs-cfg-num">${n}</span>
              <span class="pbs-cfg-meals">${MEAL_SETS[n].join(' · ')}</span>
            </button>`).join('')}
        </div>
        <button class="btn btn--primary btn--sm btn--full" id="pbs-cfg-apply" style="margin-top:20px">
          Aplicar a hoy
        </button>
        <button class="btn btn--ghost btn--sm btn--full" id="pbs-cfg-apply-all" style="margin-top:8px">
          Aplicar a toda la semana
        </button>
      </div>`;

    _showSheet();
    sheet.querySelector('#pbs-cfg-close').addEventListener('click', _closeSheet);

    let chosen = current;
    sheet.querySelectorAll('.pbs-cfg-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        chosen = parseInt(btn.dataset.n);
        sheet.querySelectorAll('.pbs-cfg-opt').forEach(b =>
          b.classList.toggle('pbs-cfg-opt--active', parseInt(b.dataset.n) === chosen)
        );
      });
    });

    sheet.querySelector('#pbs-cfg-apply').addEventListener('click', () => {
      config.perDay[selectedDate] = chosen;
      _save(); _closeSheet(); _renderDayView();
    });

    sheet.querySelector('#pbs-cfg-apply-all').addEventListener('click', () => {
      config.mealsPerDay = chosen;
      config.perDay      = {};
      _save(); _closeSheet(); _renderStrip(); _renderDayView();
      if (typeof showToast === 'function')
        showToast(`${chosen} comidas aplicadas a toda la semana`, 'success');
    });
  }

  // ── Sheet helpers ─────────────────────────────────────────
  function _showSheet() {
    const overlay = document.getElementById('planner-sheet-overlay');
    const sheet   = document.getElementById('planner-bottom-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    requestAnimationFrame(() => sheet.querySelector('input')?.focus());
  }

  function _closeSheet() {
    const overlay = document.getElementById('planner-sheet-overlay');
    const sheet   = document.getElementById('planner-bottom-sheet');
    if (sheet)   sheet.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    _sheetState = null;
  }

  // ── Macros del día ────────────────────────────────────────
  function _renderMacros() {
    const dayPlan = plan[selectedDate] || {};
    let t = { kcal: 0, p: 0, c: 0, f: 0, n: 0 };
    Object.values(dayPlan).forEach(id => {
      const r = _find(id);
      if (r) { t.kcal += r.kcal; t.p += r.p; t.c += r.c; t.f += r.f; t.n++; }
    });

    const list = document.getElementById('planner-macro-list');
    if (!list) return;

    if (!t.kcal) {
      list.innerHTML = '<p class="pmacro-empty">Sin comidas planificadas para este día</p>';
      if (_macroChart) { _macroChart.destroy(); _macroChart = null; }
      return;
    }

    const mk   = t.p*4 + t.c*4 + t.f*9;
    const pct  = (v, m) => mk ? Math.round(v*m/mk*100) : 0;
    const pP   = pct(t.p,4), pC = pct(t.c,4), pF = pct(t.f,9);

    list.innerHTML = `
      <div class="pmacro-kcal">${Math.round(t.kcal).toLocaleString('es-ES')} <span>kcal</span></div>
      <p class="pmacro-sub">${t.n} comida${t.n!==1?'s':''} planificada${t.n!==1?'s':''}</p>
      <div class="pmacro-bars">
        <div class="pmacro-bar-row">
          <div class="pmacro-bar-label"><span class="pmacro-dot" style="background:#c4a561"></span>Proteína</div>
          <div class="pmacro-bar-track"><div class="pmacro-bar-fill" style="width:${pP}%;background:#c4a561"></div></div>
          <div class="pmacro-bar-value">${Math.round(t.p)}g <small>${pP}%</small></div>
        </div>
        <div class="pmacro-bar-row">
          <div class="pmacro-bar-label"><span class="pmacro-dot" style="background:#60a5fa"></span>Hidratos</div>
          <div class="pmacro-bar-track"><div class="pmacro-bar-fill" style="width:${pC}%;background:#60a5fa"></div></div>
          <div class="pmacro-bar-value">${Math.round(t.c)}g <small>${pC}%</small></div>
        </div>
        <div class="pmacro-bar-row">
          <div class="pmacro-bar-label"><span class="pmacro-dot" style="background:#f59e0b"></span>Grasa</div>
          <div class="pmacro-bar-track"><div class="pmacro-bar-fill" style="width:${pF}%;background:#f59e0b"></div></div>
          <div class="pmacro-bar-value">${Math.round(t.f)}g <small>${pF}%</small></div>
        </div>
      </div>`;

    const canvas = document.getElementById('planner-macro-chart');
    if (!canvas) return;
    if (_macroChart) { _macroChart.destroy(); _macroChart = null; }
    _macroChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Proteína','Hidratos','Grasa'],
        datasets: [{ data: [t.p*4, t.c*4, t.f*9], backgroundColor: ['#c4a561','#60a5fa','#f59e0b'], borderWidth: 0, hoverOffset: 6 }],
      },
      options: {
        responsive: true, cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(14,14,26,.95)', callbacks: { label: item => {
            const tot = item.dataset.data.reduce((a,b)=>a+b,0);
            return ` ${item.label}: ${tot ? ((item.parsed/tot)*100).toFixed(0) : 0}%`;
          }}},
        },
      },
    });
  }

  // ── Swipe entre días ──────────────────────────────────────
  function _initSwipe() {
    const root = document.getElementById('section-planner');
    if (!root) return;
    let x0 = 0;
    root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend',   e => {
      if (_sheetState) return; // no cambiar de día cuando el sheet está abierto
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) < 55) return;
      _selectDate(_addDays(selectedDate, dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  // ── Crear DOM del sheet ──────────────────────────────────
  function _createSheetDOM() {
    if (document.getElementById('planner-bottom-sheet')) return;

    const overlay = document.createElement('div');
    overlay.id        = 'planner-sheet-overlay';
    overlay.className = 'bottom-sheet-overlay';
    overlay.addEventListener('click', _closeSheet);
    document.body.appendChild(overlay);

    const sheet = document.createElement('div');
    sheet.id        = 'planner-bottom-sheet';
    sheet.className = 'bottom-sheet planner-bs';
    document.body.appendChild(sheet);
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    // Guard de compatibilidad: si los elementos del DOM no existen es porque
    // el Service Worker está sirviendo el HTML antiguo (mismatch de versión).
    // Mostramos un aviso y recargamos para forzar el HTML nuevo.
    if (!document.getElementById('planner-week-strip')) {
      const legacy = document.getElementById('planner-grid');
      if (legacy) {
        legacy.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">' +
          '🔄 Actualizando planner… <br><button onclick="location.reload(true)" ' +
          'style="margin-top:12px;padding:8px 18px;background:var(--hs-accent);color:#fff;' +
          'border:none;border-radius:8px;cursor:pointer;font-size:.9rem">Recargar ahora</button></div>';
      }
      // Forzar activación del nuevo Service Worker si está esperando
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
      }
      return;
    }

    _load();
    _createSheetDOM();
    _renderStrip();
    _renderDayView();
    _renderMacros();
    _initSwipe();

    // Botón "Hoy"
    document.getElementById('btn-planner-today')?.addEventListener('click', () => {
      _selectDate(_todayStr());
    });

    // Botón ⚙ del header (configura la semana)
    document.getElementById('btn-planner-cfg')?.addEventListener('click', _openCfgSheet);

    // Sincronizar cuando se crean/editan recetas de usuario
    document.addEventListener('hs:recipes-updated', () => {
      _renderDayView();
      _renderMacros();
    });

    // Navegar al planner al recibir señal de "añadir al planner"
    document.addEventListener('hs:add-to-planner', () => {
      document.querySelector('[data-section="planner"]')?.click();
    });

    // Compatibilidad con hs:timing-apply
    document.addEventListener('hs:timing-apply', e => {
      const meals = e.detail?.meals || [];
      const today = _todayStr();
      const MAP   = {
        breakfast:'Desayuno', snack1:'Media mañana', lunch:'Almuerzo',
        snack2:'Merienda', dinner:'Cena', post:'Post-entreno',
      };
      if (!plan[today]) plan[today] = {};
      meals.forEach(m => {
        const name = MAP[m.slot];
        if (!name) return;
        const hit = RECIPES.find(r => r.cat === m.slot);
        if (hit) plan[today][name] = hit.id;
      });
      _save(); _selectDate(today);
    });
  }

  return { init };
})();
