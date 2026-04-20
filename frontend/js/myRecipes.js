/* ============================================================
   myRecipes.js — Creador y gestión de recetas personalizadas
   Ingredientes desde HS_CONFIG.INGREDIENTS (142 opciones).
   Cálculo de macros en tiempo real. Persistencia localStorage.
   Las recetas se integran en el Planner via evento 'hs:recipes-updated'.
   ============================================================ */

const MyRecipes = (function () {
  'use strict';

  const LS_KEY = 'hs_my_recipes';
  const LS_NEXT_ID = 'hs_my_recipes_next_id';

  // ── Estado ─────────────────────────────────────────────────────────────────
  let recipes = [];      // {id, name, category, ingredients, instructions, rating, kcal, p, c, f, inf}
  let selectedIngredients = []; // [{id, name, grams, ...macros}]
  let editingId = null;
  let searchQuery = '';
  let catFilter = 'all';

  const CATS = [
    { id: 'all',      label: 'Todas' },
    { id: 'desayuno', label: 'Desayuno' },
    { id: 'almuerzo', label: 'Almuerzo' },
    { id: 'cena',     label: 'Cena' },
    { id: 'snack',    label: 'Snack' },
    { id: 'pre',      label: 'Pre-entreno' },
    { id: 'post',     label: 'Post-entreno' },
  ];

  const INF_LABEL = { low: '🟢 Bajo', medium: '🟡 Medio', high: '🔴 Alto' };

  // ── Persistencia ───────────────────────────────────────────────────────────
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(recipes));
    document.dispatchEvent(new CustomEvent('hs:recipes-updated', { detail: recipes }));
  }

  function load() {
    try { recipes = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { recipes = []; }
  }

  function nextId() {
    const n = parseInt(localStorage.getItem(LS_NEXT_ID) || '1000');
    localStorage.setItem(LS_NEXT_ID, String(n + 1));
    return n;
  }

  // ── Cálculo de macros ──────────────────────────────────────────────────────
  function calcMacros(items) {
    let kcal = 0, p = 0, c = 0, f = 0;
    let infScores = [];
    const infMap = { low: 1, medium: 2, high: 3 };

    items.forEach(item => {
      const factor = item.grams / 100;
      kcal += item.calories * factor;
      p    += item.protein  * factor;
      c    += item.carbs    * factor;
      f    += item.fat      * factor;
      infScores.push(infMap[item.inflammation_base] || 1);
    });

    const avgInf = infScores.length
      ? infScores.reduce((a, b) => a + b, 0) / infScores.length
      : 1;
    const inf = avgInf < 1.5 ? 'low' : avgInf < 2.3 ? 'medium' : 'high';

    return {
      kcal: Math.round(kcal),
      p: Math.round(p * 10) / 10,
      c: Math.round(c * 10) / 10,
      f: Math.round(f * 10) / 10,
      inf,
    };
  }

  // ── Render buscador de ingredientes ───────────────────────────────────────
  function renderIngredientSearch() {
    const searchEl = document.getElementById('ing-search');
    const resultsEl = document.getElementById('ing-results');
    if (!searchEl || !resultsEl) return;

    const q = searchEl.value.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }

    const ingredients = window.HS_CONFIG ? HS_CONFIG.INGREDIENTS : [];
    const filtered = ingredients.filter(i =>
      i.name.toLowerCase().includes(q) &&
      !selectedIngredients.find(s => s.id === i.id)
    ).slice(0, 8);

    if (!filtered.length) {
      resultsEl.innerHTML = '<div class="ing-no-result">Sin resultados</div>';
      return;
    }

    resultsEl.innerHTML = filtered.map(i => `
      <div class="ing-result-item" data-id="${i.id}">
        <span class="ing-result-name">${i.name}</span>
        <span class="ing-result-macros">${i.protein}p · ${i.carbs}h · ${i.fat}g · ${i.calories} kcal <small>/100g</small></span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.ing-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const ing = ingredients.find(i => i.id === parseInt(el.dataset.id));
        if (!ing) return;
        selectedIngredients.push({ ...ing, grams: 100 });
        searchEl.value = '';
        resultsEl.innerHTML = '';
        renderSelectedIngredients();
        updateMacroPreview();
      });
    });
  }

  // ── Render ingredientes seleccionados ─────────────────────────────────────
  function renderSelectedIngredients() {
    const list = document.getElementById('selected-ingredients');
    if (!list) return;

    if (!selectedIngredients.length) {
      list.innerHTML = '<p class="ing-empty">Busca y añade ingredientes arriba</p>';
      return;
    }

    list.innerHTML = selectedIngredients.map((ing, idx) => `
      <div class="sel-ing-row">
        <span class="sel-ing-name">${ing.name}</span>
        <div class="sel-ing-controls">
          <button class="sel-ing-step" data-idx="${idx}" data-delta="-25" title="−25 g">−</button>
          <input type="number" class="sel-ing-grams" data-idx="${idx}"
                 value="${ing.grams}" min="1" max="5000" step="25">
          <span class="sel-ing-unit">g</span>
          <button class="sel-ing-step" data-idx="${idx}" data-delta="25" title="+25 g">+</button>
          <span class="sel-ing-macro">${Math.round(ing.protein * ing.grams / 100)}p · ${Math.round(ing.carbs * ing.grams / 100)}h · ${Math.round(ing.fat * ing.grams / 100)}g</span>
          <button class="sel-ing-remove" data-idx="${idx}" title="Quitar">×</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.sel-ing-grams').forEach(input => {
      input.addEventListener('input', e => {
        const idx = parseInt(e.target.dataset.idx);
        const val = Math.max(1, parseFloat(e.target.value) || 1);
        selectedIngredients[idx].grams = val;
        updateMacroPreview();
        // Solo actualiza los macros del propio row sin re-renderizar todo
        const row = e.target.closest('.sel-ing-row');
        const macroEl = row?.querySelector('.sel-ing-macro');
        if (macroEl) {
          const ing = selectedIngredients[idx];
          macroEl.textContent = `${Math.round(ing.protein * val / 100)}p · ${Math.round(ing.carbs * val / 100)}h · ${Math.round(ing.fat * val / 100)}g`;
        }
      });
      // Actualizar al perder el foco (por si se borra el campo)
      input.addEventListener('blur', e => {
        const idx = parseInt(e.target.dataset.idx);
        if (!e.target.value || parseFloat(e.target.value) < 1) {
          selectedIngredients[idx].grams = 25;
          e.target.value = 25;
          renderSelectedIngredients();
          updateMacroPreview();
        }
      });
    });

    list.querySelectorAll('.sel-ing-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx   = parseInt(btn.dataset.idx);
        const delta = parseInt(btn.dataset.delta);
        const cur   = selectedIngredients[idx].grams;
        selectedIngredients[idx].grams = Math.max(25, cur + delta);
        renderSelectedIngredients();
        updateMacroPreview();
      });
    });

    list.querySelectorAll('.sel-ing-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        selectedIngredients.splice(idx, 1);
        renderSelectedIngredients();
        updateMacroPreview();
      });
    });
  }

  // ── Actualizar preview de macros en tiempo real ────────────────────────────
  function updateMacroPreview() {
    const preview = document.getElementById('recipe-macro-preview');
    if (!preview) return;

    if (!selectedIngredients.length) {
      preview.innerHTML = '<span class="macro-preview-empty">Añade ingredientes para ver los macros</span>';
      return;
    }

    const m = calcMacros(selectedIngredients);
    preview.innerHTML = `
      <div class="macro-preview-grid">
        <div class="mpg-item mpg-kcal">
          <span class="mpg-val">${m.kcal}</span>
          <span class="mpg-label">kcal</span>
        </div>
        <div class="mpg-item mpg-p">
          <span class="mpg-val">${m.p}g</span>
          <span class="mpg-label">Proteína</span>
        </div>
        <div class="mpg-item mpg-c">
          <span class="mpg-val">${m.c}g</span>
          <span class="mpg-label">Hidratos</span>
        </div>
        <div class="mpg-item mpg-f">
          <span class="mpg-val">${m.f}g</span>
          <span class="mpg-label">Grasa</span>
        </div>
        <div class="mpg-item mpg-inf">
          <span class="mpg-val">${INF_LABEL[m.inf]}</span>
          <span class="mpg-label">Inflamación</span>
        </div>
      </div>
    `;
  }

  // ── Render estrellas de valoración ─────────────────────────────────────────
  function renderStars(containerId, currentRating) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = Array.from({ length: 5 }, (_, i) => `
      <span class="star${i < currentRating ? ' star--on' : ''}" data-val="${i + 1}">★</span>
    `).join('');
    el.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.val);
        el.dataset.rating = val;
        el.querySelectorAll('.star').forEach((s, i) => {
          s.classList.toggle('star--on', i < val);
        });
      });
    });
    el.dataset.rating = currentRating;
  }

  // ── Guardar receta ─────────────────────────────────────────────────────────
  function saveRecipe() {
    const nameEl = document.getElementById('recipe-name-input');
    const catEl  = document.getElementById('recipe-cat-select');
    const instEl = document.getElementById('recipe-instructions');
    const ratingEl = document.getElementById('recipe-stars');

    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); alert('Introduce un nombre para la receta.'); return; }
    if (!selectedIngredients.length) { alert('Añade al menos un ingrediente.'); return; }

    const m = calcMacros(selectedIngredients);
    const recipe = {
      id: editingId ?? nextId(),
      name,
      category: catEl?.value || 'almuerzo',
      ingredients: selectedIngredients.map(i => ({
        id: i.id, name: i.name, grams: i.grams,
      })),
      instructions: instEl?.value.trim() || '',
      rating: parseInt(ratingEl?.dataset.rating || '5'),
      kcal: m.kcal,
      p: m.p, c: m.c, f: m.f,
      inf: m.inf,
      createdAt: editingId
        ? (recipes.find(r => r.id === editingId)?.createdAt || Date.now())
        : Date.now(),
    };

    if (editingId !== null) {
      const idx = recipes.findIndex(r => r.id === editingId);
      if (idx !== -1) recipes[idx] = recipe;
    } else {
      recipes.unshift(recipe);
    }

    save();
    resetForm();
    renderGrid();
    showToast(`✅ Receta "${name}" guardada`);
  }

  // ── Reset formulario ───────────────────────────────────────────────────────
  function resetForm() {
    editingId = null;
    selectedIngredients = [];
    const fields = ['recipe-name-input', 'recipe-instructions'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const cat = document.getElementById('recipe-cat-select');
    if (cat) cat.value = 'almuerzo';
    renderSelectedIngredients();
    updateMacroPreview();
    renderStars('recipe-stars', 5);
    document.getElementById('recipe-form-title')?.textContent
      && (document.getElementById('recipe-form-title').textContent = 'Nueva Receta');
    document.getElementById('recipe-save-btn')
      && (document.getElementById('recipe-save-btn').textContent = '💾 Guardar receta');
  }

  // ── Editar receta ──────────────────────────────────────────────────────────
  function editRecipe(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;

    editingId = id;
    const ingredients = window.HS_CONFIG ? HS_CONFIG.INGREDIENTS : [];

    selectedIngredients = rec.ingredients.map(ri => {
      const full = ingredients.find(i => i.id === ri.id) || {};
      return { ...full, ...ri };
    });

    document.getElementById('recipe-name-input').value = rec.name;
    document.getElementById('recipe-cat-select').value = rec.category;
    document.getElementById('recipe-instructions').value = rec.instructions || '';
    renderStars('recipe-stars', rec.rating);
    renderSelectedIngredients();
    updateMacroPreview();

    document.getElementById('recipe-form-title').textContent = 'Editar Receta';
    document.getElementById('recipe-save-btn').textContent = '💾 Actualizar receta';

    // Scroll al formulario
    document.getElementById('recipe-creator-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Eliminar receta ────────────────────────────────────────────────────────
  function deleteRecipe(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;
    if (!confirm(`¿Eliminar la receta "${rec.name}"?`)) return;
    recipes = recipes.filter(r => r.id !== id);
    if (editingId === id) resetForm();
    save();
    renderGrid();
  }

  // ── Render grid de recetas guardadas ──────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('my-recipes-grid');
    if (!grid) return;

    let filtered = recipes.filter(r => {
      const catOk = catFilter === 'all' || r.category === catFilter;
      const searchOk = !searchQuery || r.name.toLowerCase().includes(searchQuery);
      return catOk && searchOk;
    });

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="recipes-empty-state">
          <div class="empty-icon">📋</div>
          <h3>Aún no tienes recetas guardadas</h3>
          <p>Usa el formulario de abajo para crear tu primera receta personalizada.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(r => `
      <div class="my-recipe-card" data-id="${r.id}">
        <div class="mrc-header">
          <span class="mrc-cat">${r.category}</span>
          <div class="mrc-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
        </div>
        <h3 class="mrc-name">${r.name}</h3>
        <div class="mrc-macros">
          <span class="mrc-kcal">${r.kcal} kcal</span>
          <span class="rmacro rmacro--p">P ${r.p}g</span>
          <span class="rmacro rmacro--c">H ${r.c}g</span>
          <span class="rmacro rmacro--f">G ${r.f}g</span>
          <span class="inf-dot inf-${r.inf === 'low' ? 1 : r.inf === 'medium' ? 2 : 4}"
                title="Inflamación: ${r.inf}"></span>
        </div>
        <p class="mrc-ing-count">${r.ingredients.length} ingrediente${r.ingredients.length !== 1 ? 's' : ''}</p>
        <div class="mrc-actions">
          <button class="btn btn--ghost btn--sm mrc-btn-edit" data-id="${r.id}">✏️ Editar</button>
          <button class="btn btn--ghost btn--sm mrc-btn-planner" data-id="${r.id}" title="Añadir al Planner">
            📅 Planner
          </button>
          <button class="btn btn--ghost btn--sm mrc-btn-delete" data-id="${r.id}" title="Eliminar">🗑</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.mrc-btn-edit').forEach(btn =>
      btn.addEventListener('click', () => editRecipe(parseInt(btn.dataset.id)))
    );
    grid.querySelectorAll('.mrc-btn-delete').forEach(btn =>
      btn.addEventListener('click', () => deleteRecipe(parseInt(btn.dataset.id)))
    );
    grid.querySelectorAll('.mrc-btn-planner').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = recipes.find(r => r.id === parseInt(btn.dataset.id));
        if (!rec) return;
        document.dispatchEvent(new CustomEvent('hs:add-to-planner', { detail: rec }));
        showToast(`📅 "${rec.name}" lista para arrastrar al Planner`);
      });
    });
  }

  // ── Filter tabs ────────────────────────────────────────────────────────────
  function renderFilterTabs() {
    const wrap = document.getElementById('my-recipes-filter-tabs');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(c => `
      <button class="chip${catFilter === c.id ? ' chip--active' : ''}" data-cat="${c.id}">${c.label}</button>
    `).join('');
    wrap.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        catFilter = btn.dataset.cat;
        renderFilterTabs();
        renderGrid();
      });
    });
  }

  // ── Toast notification ─────────────────────────────────────────────────────
  function showToast(msg) {
    let t = document.getElementById('hs-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'hs-toast';
      t.className = 'hs-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('hs-toast--visible');
    setTimeout(() => t.classList.remove('hs-toast--visible'), 2800);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    load();
    renderFilterTabs();
    renderGrid();
    renderSelectedIngredients();
    updateMacroPreview();
    renderStars('recipe-stars', 5);

    document.getElementById('ing-search')?.addEventListener('input', renderIngredientSearch);
    document.getElementById('ing-search')?.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.getElementById('ing-results').innerHTML = '';
        e.target.value = '';
      }
    });

    document.getElementById('recipe-save-btn')?.addEventListener('click', saveRecipe);
    document.getElementById('recipe-cancel-btn')?.addEventListener('click', resetForm);

    document.getElementById('my-recipes-search')?.addEventListener('input', e => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderGrid();
    });

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', e => {
      const searchEl = document.getElementById('ing-search');
      const resultsEl = document.getElementById('ing-results');
      if (resultsEl && searchEl && !searchEl.contains(e.target) && !resultsEl.contains(e.target)) {
        resultsEl.innerHTML = '';
      }
    });
  }

  // ── API pública (usada por planner.js) ────────────────────────────────────
  return {
    init,
    getRecipes: () => recipes,
    // Convierte una receta de usuario al formato de RECIPES del planner
    toPlanner: (rec) => ({
      id: `user_${rec.id}`,
      cat: rec.category,
      name: rec.name,
      kcal: rec.kcal,
      p: rec.p,
      c: rec.c,
      f: rec.f,
      inf: rec.inf === 'low' ? 1 : rec.inf === 'medium' ? 2 : 4,
      desc: `Receta personalizada · ${rec.ingredients.length} ingredientes`,
      isUserRecipe: true,
    }),
  };
})();
