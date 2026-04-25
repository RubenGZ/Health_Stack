var MacroAutopilot = (function () {
  'use strict';

  // Built-in planner recipes (mirror of planner.js RECIPES, macro-relevant fields only)
  var BUILTIN = [
    {id:1,  name:'Tortilla de claras',       kcal:320, p:35, c:12, f:14},
    {id:2,  name:'Avena con frutos rojos',   kcal:380, p:14, c:62, f: 8},
    {id:3,  name:'Yogur griego + granola',   kcal:350, p:20, c:38, f:12},
    {id:4,  name:'Batido proteico',          kcal:290, p:40, c:22, f: 6},
    {id:5,  name:'Tostadas de aguacate',     kcal:420, p:12, c:45, f:22},
    {id:6,  name:'Pollo con arroz integral', kcal:520, p:48, c:58, f: 8},
    {id:7,  name:'Salmón con quinoa',        kcal:580, p:45, c:42, f:22},
    {id:8,  name:'Ensalada de atún',         kcal:380, p:38, c:18, f:16},
    {id:9,  name:'Pasta integral boloñesa',  kcal:620, p:42, c:72, f:14},
    {id:10, name:'Bowl de garbanzos',        kcal:490, p:22, c:65, f:14},
    {id:11, name:'Ternera con patata',       kcal:560, p:50, c:46, f:16},
    {id:12, name:'Buddha bowl vegano',       kcal:440, p:18, c:58, f:16},
    {id:13, name:'Merluza al horno',         kcal:320, p:40, c:10, f:12},
    {id:14, name:'Pavo con verduras',        kcal:380, p:44, c:18, f:10},
    {id:15, name:'Tortilla francesa',        kcal:260, p:22, c: 2, f:18},
    {id:16, name:'Crema de verduras',        kcal:220, p: 8, c:30, f: 8},
    {id:17, name:'Tofu salteado',            kcal:360, p:26, c:22, f:18},
    {id:18, name:'Requesón con nueces',      kcal:220, p:18, c: 8, f:12},
    {id:19, name:'Manzana con mantequilla',  kcal:240, p: 6, c:30, f:12},
    {id:20, name:'Edamame salado',           kcal:180, p:14, c:14, f: 7},
    {id:21, name:'Barrita de proteína',      kcal:200, p:20, c:20, f: 6},
    {id:22, name:'Hummus con bastones',      kcal:190, p: 8, c:22, f: 8},
    {id:23, name:'Arroz con plátano',        kcal:350, p: 6, c:78, f: 2},
    {id:24, name:'Tostada con mermelada',    kcal:280, p: 8, c:52, f: 4},
    {id:25, name:'Batido recovery',          kcal:400, p:42, c:50, f: 4},
  ];

  var DAY_NAMES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var MEAL_NAMES = ['Desayuno','Media mañana','Almuerzo','Merienda','Cena'];

  function getAllRecipes() {
    var custom = [];
    try { custom = JSON.parse(localStorage.getItem('hs_my_recipes') || '[]'); } catch (e) {}
    return BUILTIN.concat(custom.map(function (r) {
      return { id: 'c' + r.id, name: r.name, kcal: r.kcal || 0, p: r.p || 0, c: r.c || 0, f: r.f || 0 };
    }));
  }

  function getTargets() {
    try {
      var raw = JSON.parse(localStorage.getItem('hs_tdee') || 'null');
      if (raw && raw.target && raw.macros) {
        return {
          kcal: raw.target,
          p: raw.macros.proteinG,
          c: raw.macros.carbsG,
          f: raw.macros.fatG,
        };
      }
    } catch (e) {}
    return null;
  }

  function getTodayConsumed() {
    var todayName = DAY_NAMES[new Date().getDay()];
    var plan = {};
    try { plan = JSON.parse(localStorage.getItem('hs_planner') || '{}'); } catch (e) {}
    var all = getAllRecipes();
    var lookup = {};
    all.forEach(function (r) { lookup[r.id] = r; });

    var totals = { kcal: 0, p: 0, c: 0, f: 0 };
    MEAL_NAMES.forEach(function (meal) {
      var key = todayName + '-' + meal;
      var rid = plan[key];
      if (rid == null) return;
      var recipe = lookup[rid];
      if (!recipe) return;
      totals.kcal += recipe.kcal;
      totals.p    += recipe.p;
      totals.c    += recipe.c;
      totals.f    += recipe.f;
    });
    return totals;
  }

  function fitScore(remaining, recipe) {
    var dims = ['kcal','p','c','f'];
    var total = 0, count = 0;
    dims.forEach(function (k) {
      if (remaining[k] > 0) {
        var diff = Math.abs(remaining[k] - recipe[k]);
        total += Math.min(diff / remaining[k], 1);
        count++;
      }
    });
    if (!count) return 0;
    return Math.round((1 - total / count) * 100);
  }

  function getSuggestions(remaining) {
    var all = getAllRecipes();
    return all
      .map(function (r) { return { recipe: r, score: fitScore(remaining, r) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 3);
  }

  function fitClass(score) {
    if (score >= 70) return 'ap-fit-high';
    if (score >= 40) return 'ap-fit-medium';
    return 'ap-fit-low';
  }

  function renderBars(targets, consumed) {
    var rows = [
      { label: 'Calorías', key: 'kcal', unit: 'kcal', color: '#0891b2' },
      { label: 'Proteína', key: 'p',    unit: 'g',    color: '#10b981' },
      { label: 'Carbos',   key: 'c',    unit: 'g',    color: '#f59e0b' },
      { label: 'Grasas',   key: 'f',    unit: 'g',    color: '#a78bfa' },
    ];
    return '<div class="ap-macro-bars">' + rows.map(function (row) {
      var pct = targets[row.key] > 0 ? Math.min(consumed[row.key] / targets[row.key] * 100, 100) : 0;
      var color = pct >= 100 ? '#ef4444' : row.color;
      return [
        '<div class="ap-bar-row">',
          '<span class="ap-bar-label">' + row.label + '</span>',
          '<div class="ap-bar-track"><div class="ap-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + color + '"></div></div>',
          '<span class="ap-bar-val">' + Math.round(consumed[row.key]) + ' / ' + Math.round(targets[row.key]) + ' ' + row.unit + '</span>',
        '</div>',
      ].join('');
    }).join('') + '</div>';
  }

  function renderSuggestions(suggestions) {
    if (!suggestions.length) return '<p class="ap-empty">Sin recetas disponibles. Añade recetas en la sección de Nutrición.</p>';
    return '<div class="ap-suggestions">' + suggestions.map(function (s) {
      var r = s.recipe;
      return [
        '<div class="ap-card">',
          '<div class="ap-fit-score ' + fitClass(s.score) + '">' + s.score + '</div>',
          '<div class="ap-card-body">',
            '<div class="ap-card-name">' + escHtml(r.name) + '</div>',
            '<div class="ap-card-macros">' + r.kcal + ' kcal · P: ' + r.p + 'g · C: ' + r.c + 'g · G: ' + r.f + 'g</div>',
          '</div>',
        '</div>',
      ].join('');
    }).join('') + '</div>';
  }

  function render() {
    var root = document.getElementById('autopilot-root');
    if (!root) return;

    var targets = getTargets();
    if (!targets) {
      root.innerHTML = '<p class="ap-empty">Calcula tu TDEE en la pestaña de macros para activar el Autopilot.</p>';
      return;
    }

    var consumed  = getTodayConsumed();
    var remaining = {
      kcal: Math.max(0, targets.kcal - consumed.kcal),
      p:    Math.max(0, targets.p    - consumed.p),
      c:    Math.max(0, targets.c    - consumed.c),
      f:    Math.max(0, targets.f    - consumed.f),
    };

    root.innerHTML = [
      '<p class="ap-section-title">Progreso de hoy</p>',
      renderBars(targets, consumed),
      '<p class="ap-section-title">Restante: ' + Math.round(remaining.kcal) + ' kcal · P: ' + Math.round(remaining.p) + 'g · C: ' + Math.round(remaining.c) + 'g · G: ' + Math.round(remaining.f) + 'g</p>',
      '<button class="ap-suggest-btn" id="ap-suggest-btn">',
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        'Sugerir comida',
      '</button>',
      '<div id="ap-suggestions-wrapper"></div>',
    ].join('');

    document.getElementById('ap-suggest-btn').addEventListener('click', function () {
      var suggestions = getSuggestions(remaining);
      document.getElementById('ap-suggestions-wrapper').innerHTML = renderSuggestions(suggestions);
    });
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function init() { render(); }

  return { init: init };
})();
