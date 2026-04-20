/* ============================================================
   planner.js — Planner semanal de comidas con drag & drop
   Base de datos de 25 recetas. Macros totales Chart.js.
   ============================================================ */

const MealPlanner = (function () {
  'use strict';

  const LS_KEY = 'hs_planner';

  // ── Base de datos de recetas ───────────────────────────────
  const RECIPES = [
    // Desayuno
    { id:1,  cat:'desayuno', name:'Tortilla de claras',       kcal:320, p:35, c:12, f:14, inf:1, desc:'4 claras + 1 yema, espinacas, pimiento' },
    { id:2,  cat:'desayuno', name:'Avena con frutos rojos',   kcal:380, p:14, c:62, f: 8, inf:1, desc:'80g avena, 150g frutos rojos, 10g nueces' },
    { id:3,  cat:'desayuno', name:'Yogur griego + granola',   kcal:350, p:20, c:38, f:12, inf:2, desc:'200g yogur griego, 40g granola, miel' },
    { id:4,  cat:'desayuno', name:'Batido proteico',          kcal:290, p:40, c:22, f: 6, inf:1, desc:'2 scoops proteína, leche desnatada, plátano' },
    { id:5,  cat:'desayuno', name:'Tostadas de aguacate',     kcal:420, p:12, c:45, f:22, inf:1, desc:'2 rebanadas pan integral, 1 aguacate, huevo pochado' },
    // Almuerzo
    { id:6,  cat:'almuerzo', name:'Pollo con arroz integral', kcal:520, p:48, c:58, f: 8, inf:1, desc:'200g pechuga, 150g arroz, verduras al vapor' },
    { id:7,  cat:'almuerzo', name:'Salmón con quinoa',        kcal:580, p:45, c:42, f:22, inf:1, desc:'200g salmón, 120g quinoa, espárragos' },
    { id:8,  cat:'almuerzo', name:'Ensalada de atún',         kcal:380, p:38, c:18, f:16, inf:2, desc:'200g atún en agua, lechuga, tomate, AOVE' },
    { id:9,  cat:'almuerzo', name:'Pasta integral boloñesa',  kcal:620, p:42, c:72, f:14, inf:3, desc:'150g pasta integral, 200g carne picada magra, tomate' },
    { id:10, cat:'almuerzo', name:'Bowl de garbanzos',        kcal:490, p:22, c:65, f:14, inf:1, desc:'200g garbanzos, zanahoria, cúrcuma, limón' },
    { id:11, cat:'almuerzo', name:'Ternera con patata',       kcal:560, p:50, c:46, f:16, inf:2, desc:'200g ternera magra, 200g patata, brócoli' },
    { id:12, cat:'almuerzo', name:'Buddha bowl vegano',       kcal:440, p:18, c:58, f:16, inf:1, desc:'Quinoa, edamame, zanahoria, aguacate, tahini' },
    // Cena
    { id:13, cat:'cena',     name:'Merluza al horno',         kcal:320, p:40, c:10, f:12, inf:1, desc:'250g merluza, limón, ajo, pimientos' },
    { id:14, cat:'cena',     name:'Pavo con verduras',        kcal:380, p:44, c:18, f:10, inf:1, desc:'220g pechuga pavo, calabacín, berenjena, tomate cherry' },
    { id:15, cat:'cena',     name:'Tortilla francesa',        kcal:260, p:22, c: 2, f:18, inf:1, desc:'3 huevos, sal, AOVE, ensalada verde' },
    { id:16, cat:'cena',     name:'Crema de verduras',        kcal:220, p: 8, c:30, f: 8, inf:1, desc:'Calabaza, zanahoria, puerro, nata ligera' },
    { id:17, cat:'cena',     name:'Tofu salteado',            kcal:360, p:26, c:22, f:18, inf:1, desc:'200g tofu firme, bok choy, soja baja en sodio, jengibre' },
    // Snack
    { id:18, cat:'snack',    name:'Requesón con nueces',      kcal:220, p:18, c: 8, f:12, inf:1, desc:'150g requesón, 20g nueces, canela' },
    { id:19, cat:'snack',    name:'Manzana con mantequilla cacahuete', kcal:240, p: 6, c:30, f:12, inf:2, desc:'1 manzana mediana, 1 tbsp mantequilla cacahuete natural' },
    { id:20, cat:'snack',    name:'Edamame salado',           kcal:180, p:14, c:14, f: 7, inf:1, desc:'150g edamame al vapor con sal marina' },
    { id:21, cat:'snack',    name:'Barrita de proteína',      kcal:200, p:20, c:20, f: 6, inf:2, desc:'Barrita comercial baja en azúcar' },
    { id:22, cat:'snack',    name:'Hummus con bastones',      kcal:190, p: 8, c:22, f: 8, inf:1, desc:'80g hummus, zanahoria y apio en bastones' },
    // Pre-entreno
    { id:23, cat:'pre',      name:'Arroz con plátano',        kcal:350, p: 6, c:78, f: 2, inf:1, desc:'100g arroz blanco, 1 plátano maduro' },
    { id:24, cat:'pre',      name:'Tostada con mermelada',    kcal:280, p: 8, c:52, f: 4, inf:2, desc:'2 tostadas pan blanco, mermelada sin azúcar, proteína whey' },
    // Post-entreno
    { id:25, cat:'post',     name:'Batido recovery',          kcal:400, p:42, c:50, f: 4, inf:1, desc:'2 scoops whey, 50g dextrose, creatina, agua' },
  ];

  const CATS = [
    { id: 'all',      label: 'Todas' },
    { id: 'desayuno', label: 'Desayuno' },
    { id: 'almuerzo', label: 'Almuerzo' },
    { id: 'cena',     label: 'Cena' },
    { id: 'snack',    label: 'Snack' },
    { id: 'pre',      label: 'Pre-entreno' },
    { id: 'post',     label: 'Post-entreno' },
  ];

  const DAYS   = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const MEALS  = ['Desayuno','Media mañana','Almuerzo','Merienda','Cena'];

  // ── Estado ────────────────────────────────────────────────
  let plan    = {};  // { 'Lunes-Desayuno': recipeId, ... }
  let catFilter = 'all';
  let searchQuery = '';
  let macroChartInst = null;

  // ── Persistencia ──────────────────────────────────────────
  function save()   { localStorage.setItem(LS_KEY, JSON.stringify(plan)); }
  function load()   {
    try { plan = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { plan = {}; }
  }

  // ── Recetas filtradas ─────────────────────────────────────
  function filteredRecipes() {
    return RECIPES.filter(r => {
      const catOk    = catFilter === 'all' || r.cat === catFilter;
      const searchOk = !searchQuery || r.name.toLowerCase().includes(searchQuery);
      return catOk && searchOk;
    });
  }

  // ── Render filtros recetas ────────────────────────────────
  function renderCatTabs() {
    const wrap = document.getElementById('recipe-filter-tabs');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(c => `
      <button class="chip${catFilter === c.id ? ' chip--active' : ''}" data-cat="${c.id}">${c.label}</button>
    `).join('');
    wrap.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        catFilter = btn.dataset.cat;
        renderCatTabs();
        renderRecipes();
      });
    });
  }

  // ── Render lista de recetas (draggable) ───────────────────
  function renderRecipes() {
    const list = document.getElementById('recipes-list');
    if (!list) return;
    const items = filteredRecipes();
    list.innerHTML = items.map(r => `
      <div class="recipe-item" draggable="true" data-recipe-id="${r.id}"
           title="${r.desc}">
        <div class="recipe-item-header">
          <span class="recipe-name">${r.name}</span>
          <span class="recipe-kcal">${r.kcal} kcal</span>
        </div>
        <div class="recipe-macros">
          <span class="rmacro rmacro--p">P ${r.p}g</span>
          <span class="rmacro rmacro--c">H ${r.c}g</span>
          <span class="rmacro rmacro--f">G ${r.f}g</span>
          <span class="inf-dot inf-${r.inf}" title="Índice inflamatorio ${r.inf}/5"></span>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.recipe-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', el.dataset.recipeId);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
  }

  // ── Render grid semanal ───────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('planner-grid');
    if (!grid) return;

    let html = '<div class="planner-head-row">';
    html += '<div class="planner-cell planner-cell--corner"></div>';
    DAYS.forEach(d => { html += `<div class="planner-cell planner-cell--day">${d}</div>`; });
    html += '</div>';

    MEALS.forEach(meal => {
      html += '<div class="planner-meal-row">';
      html += `<div class="planner-cell planner-cell--meal">${meal}</div>`;
      DAYS.forEach(day => {
        const key    = `${day}-${meal}`;
        const recId  = plan[key];
        const rec    = recId ? findRecipe(recId) : null;
        html += `
          <div class="planner-cell planner-cell--slot${rec ? ' filled' : ''}"
               data-key="${key}" data-day="${day}" data-meal="${meal}">
            ${rec
              ? `<div class="slot-recipe" data-key="${key}">
                   <span class="slot-name">${rec.name}</span>
                   <span class="slot-kcal">${rec.kcal} kcal</span>
                   <button class="slot-remove" data-key="${key}" title="Quitar">×</button>
                 </div>`
              : '<div class="slot-empty">+</div>'}
          </div>`;
      });
      html += '</div>';
    });

    grid.innerHTML = html;

    // Drop zones
    grid.querySelectorAll('.planner-cell--slot').forEach(cell => {
      cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const raw = e.dataTransfer.getData('text/plain');
        // Support both numeric IDs (predefined) and "user_XXXX" (custom recipes)
        const recipeId = raw.startsWith('user_') ? raw : parseInt(raw);
        if (recipeId) {
          plan[cell.dataset.key] = recipeId;
          save();
          renderGrid();
          renderMacros();
        }
      });
    });

    // Botones quitar
    grid.querySelectorAll('.slot-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        delete plan[btn.dataset.key];
        save();
        renderGrid();
        renderMacros();
      });
    });
  }

  // ── Calcular y mostrar macros semanales ───────────────────
  function renderMacros() {
    let totals = { kcal: 0, p: 0, c: 0, f: 0 };
    Object.values(plan).forEach(recId => {
      const r = findRecipe(recId);
      if (r) { totals.kcal += r.kcal; totals.p += r.p; totals.c += r.c; totals.f += r.f; }
    });

    // Redondear para evitar errores de coma flotante
    const r1 = v => Math.round(v * 10) / 10;

    const listEl = document.getElementById('planner-macro-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="pmacro-row"><span>Calorías totales</span><strong>${Math.round(totals.kcal)} kcal</strong></div>
        <div class="pmacro-row"><span style="color:#6c63ff">Proteína</span><strong>${r1(totals.p)} g</strong></div>
        <div class="pmacro-row"><span style="color:#00d2ff">Hidratos</span><strong>${r1(totals.c)} g</strong></div>
        <div class="pmacro-row"><span style="color:#f59e0b">Grasa</span><strong>${r1(totals.f)} g</strong></div>
      `;
    }

    const canvas = document.getElementById('planner-macro-chart');
    if (!canvas) return;
    if (macroChartInst) { macroChartInst.destroy(); macroChartInst = null; }
    if (!totals.kcal) return;

    macroChartInst = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Proteína', 'Hidratos', 'Grasa'],
        datasets: [{
          data: [totals.p * 4, totals.c * 4, totals.f * 9],
          backgroundColor: ['#6c63ff', '#00d2ff', '#f59e0b'],
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: { legend: { display: false } },
      },
    });
  }

  // ── Render recetas de usuario como draggable ───────────────
  function renderUserRecipes() {
    const list = document.getElementById('my-recipes-list-planner');
    if (!list) return;

    const userRecipes = (typeof MyRecipes !== 'undefined' ? MyRecipes.getRecipes() : []);
    if (!userRecipes.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem;padding:12px 0">Crea recetas en la sección Timing → Mis Recetas</p>';
      return;
    }

    list.innerHTML = userRecipes.map(r => {
      const plannerRec = MyRecipes.toPlanner(r);
      return `
        <div class="recipe-item" draggable="true" data-recipe-id="${plannerRec.id}"
             title="${plannerRec.desc}">
          <div class="recipe-item-header">
            <span class="recipe-name">${plannerRec.name}</span>
            <span class="recipe-kcal">${plannerRec.kcal} kcal</span>
          </div>
          <div class="recipe-macros">
            <span class="rmacro rmacro--p">P ${plannerRec.p}g</span>
            <span class="rmacro rmacro--c">H ${plannerRec.c}g</span>
            <span class="rmacro rmacro--f">G ${plannerRec.f}g</span>
            <span class="inf-dot inf-${plannerRec.inf}" title="Índice inflamatorio"></span>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.recipe-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', el.dataset.recipeId);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
  }

  // ── Buscar receta por ID (predefinida o usuario) ───────────
  function findRecipe(id) {
    // ID de string type 'user_XXXX' son recetas personalizadas
    if (typeof id === 'string' && id.startsWith('user_')) {
      if (typeof MyRecipes === 'undefined') return null;
      const numId = parseInt(id.replace('user_', ''));
      const rec = MyRecipes.getRecipes().find(r => r.id === numId);
      return rec ? MyRecipes.toPlanner(rec) : null;
    }
    return RECIPES.find(r => r.id === parseInt(id));
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    load();
    renderCatTabs();
    renderRecipes();
    renderGrid();
    renderMacros();

    document.getElementById('recipe-search')?.addEventListener('input', e => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderRecipes();
    });

    document.getElementById('btn-clear-planner')?.addEventListener('click', () => {
      if (confirm('¿Limpiar toda la semana?')) {
        plan = {};
        save();
        renderGrid();
        renderMacros();
      }
    });

    // ── Tab switcher: Predefinidas / Mis Recetas ─────────────
    document.getElementById('planner-recipe-tabs')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-ptab]');
      if (!tab) return;
      const ptab = tab.dataset.ptab;
      document.querySelectorAll('[data-ptab]').forEach(b =>
        b.classList.toggle('stab--active', b.dataset.ptab === ptab)
      );
      document.getElementById('panel-predefined').style.display  = ptab === 'predefined'  ? '' : 'none';
      document.getElementById('panel-myrecipes').style.display   = ptab === 'myrecipes'   ? '' : 'none';
      if (ptab === 'myrecipes') renderUserRecipes();
    });

    // ── Actualizar panel mis recetas cuando se guarda una ────
    document.addEventListener('hs:recipes-updated', () => {
      const isMyTab = document.querySelector('[data-ptab="myrecipes"]')?.classList.contains('stab--active');
      if (isMyTab) renderUserRecipes();
    });

    // ── Botón "Crear nueva receta" → navega a Nutrición > Mis Recetas ──
    document.getElementById('btn-crear-receta')?.addEventListener('click', e => {
      e.preventDefault();
      // Activar sección Nutrición
      document.querySelector('[data-section="nutricion"]')?.click();
      // Activar tab Mis Recetas dentro de Nutrición
      requestAnimationFrame(() => {
        document.querySelector('#nutrition-tabs [data-tab="misrecetas"]')?.click();
        document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // ── hs:add-to-planner → marcar receta como "lista para arrastrar" ──
    document.addEventListener('hs:add-to-planner', () => {
      // Activar planner y abrir pestaña Mis Recetas para que el usuario arrastre
      document.querySelector('[data-section="planner"]')?.click();
      requestAnimationFrame(() => {
        document.querySelector('#planner-recipe-tabs [data-ptab="myrecipes"]')?.click();
      });
    });

    // ── Aplicar horario del Timing Planner al planner ────────
    document.addEventListener('hs:timing-apply', e => {
      const meals = e.detail?.meals || [];
      const TODAY = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
      const mealSlotMap = {
        breakfast: 'Desayuno', snack1: 'Media mañana', lunch: 'Almuerzo',
        snack2: 'Merienda',    dinner: 'Cena',          pre: 'Media mañana', post: 'Desayuno',
      };
      meals.forEach(meal => {
        const mealSlot = mealSlotMap[meal.slot] || MEALS[0];
        const key = `${TODAY}-${mealSlot}`;
        // Buscar receta predefinida que coincida
        const match = RECIPES.find(r =>
          r.cat === meal.slot ||
          r.name.toLowerCase().includes(meal.slot)
        );
        if (match) plan[key] = match.id;
      });
      save();
      renderGrid();
      renderMacros();
    });
  }

  return { init };
})();
