# AnatomyLens v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el visor SVG anatómico en un componente multi-instancia con modo overlay (mapa de calor de fatiga/deload), toggle Vista/Atleta, y sweeps/tooltips — reemplazando el SVG artesanal de fatigueHeatmap e integrando el visor en autoDeload.

**Architecture:** Factory pattern en `svgViewer.js` (createViewer()) sustituye el singleton; `index.js` mantiene retrocompatibilidad y expone `createViewer`; `fatigueHeatmap.js` y `autoDeload.js` crean instancias independientes y las alimentan con `setOverlay()`. El contrato de datos `{ key, intensity, status, label }` está diseñado para ser emitido por `anatomyService.js` en Phase B sin cambiar el viewer.

**Tech Stack:** Vanilla JS ES modules, body-muscles@1.0.0 (CDN esm.sh), CSS custom properties, IntersectionObserver API.

---

## Contexto crítico — leer antes de empezar

### Archivos existentes relevantes

**`frontend/js/anatomyLens/svgViewer.js`** (~307 líneas) — hoy es un singleton con variables de módulo globales. Exporta `initSVGViewer`, `highlightSVG`, `resetSVG`, `destroySVGViewer`. Este plan lo reescribe completamente como factory. El `buildSVG`, `loadMuscleData`, `showLoading`, `hideLoading` y `MUSCLE_TO_IDS` se mantienen lógicamente iguales — solo cambia el contenedor de estado.

**`frontend/js/anatomyLens/index.js`** (~110 líneas) — API pública. Hoy delega al singleton. Tras este plan expone también `createViewer` sin romper la API existente.

**`frontend/js/fatigueHeatmap.js`** (161 líneas) — IIFE con `var`. Tiene `buildSVG` propio (paths toscos, no body-muscles), `getLastTrained()`, `getStatus()`, `MUSCLE_MAP`, `RECOVERY_H`, `LABELS`. La función `render()` llama a `buildSVG` y hace `root.innerHTML = ...`. Todo el SVG artesanal desaparece; los datos de recovery (`getStatus`) se transforman al formato overlay.

**`frontend/js/autoDeload.js`** (253 líneas) — IIFE con `var`. `render(root)` computa señales (`sR`, `sL`, `sP`), determina `needsDeload`, y hace `root.innerHTML = html`. Cuando `needsDeload === true` se añade el viewer anatomy.

### El formato overlay — contrato inmutable

```js
// Este formato NO cambia en Phase B. El viewer siempre recibe esto.
[
  { key: 'chest',              intensity: 0.85, status: 'recovering', label: 'Hace 1 día' },
  { key: 'pectoral_mayor_esternal', intensity: 0.9, status: 'tired', label: 'Hoy' },
  { key: 'quads',              intensity: 0.10, status: 'fresh',      label: 'Hace 4 días' },
]
// key: nombre de grupo EZ (chest/back/...) O clave muscleMap individual
// intensity: 0.0 (fresco) → 1.0 (agotado)
// status: 'fresh' | 'warming' | 'recovering' | 'tired'
// label: texto para tooltip
```

---

## File Map

| Archivo | Cambio |
|---------|--------|
| `frontend/css/anatomy-lens.css` | Añadir: toggle chip, tooltip, compact variant, sweep, color scale docs |
| `frontend/js/anatomyLens/svgViewer.js` | Reescribir como factory; añadir overlay, EZ_GROUPS, toggle, tooltip, sweep |
| `frontend/js/anatomyLens/index.js` | Añadir `export { createViewer }` y retrocompat default |
| `frontend/js/fatigueHeatmap.js` | Eliminar buildSVG, usar createViewer + setOverlay |
| `frontend/js/autoDeload.js` | Añadir viewer anatomy cuando needsDeload === true |

---

## Task 1: CSS — nuevos estilos para v2

**Files:**
- Modify: `frontend/css/anatomy-lens.css` (al final del archivo)

- [ ] **Step 1: Añadir los nuevos bloques CSS al final del archivo**

  Abrir `frontend/css/anatomy-lens.css` y AÑADIR al final (no reemplazar nada existente):

  ```css
  /* ── Vista / Atleta toggle chip ────────────────────────────────────────────── */
  .al-mode-toggle {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 20px;
    padding: 3px;
    gap: 2px;
    font-size: 11px;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    user-select: none;
    letter-spacing: 0.03em;
  }

  .al-mode-btn {
    padding: 3px 10px;
    border-radius: 16px;
    color: rgba(255, 255, 255, 0.35);
    transition: background 0.2s ease, color 0.2s ease;
    font-weight: 500;
  }

  .al-mode-btn.active {
    background: rgba(124, 107, 255, 0.25);
    color: rgba(255, 255, 255, 0.90);
  }

  /* ── Tooltip músculo (overlay mode) ─────────────────────────────────────────── */
  .al-tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(12, 12, 30, 0.92);
    border: 1px solid rgba(124, 107, 255, 0.30);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.5;
    white-space: nowrap;
    z-index: 20;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    top: 0;
    left: 0;
  }

  .al-tooltip.al-tooltip-visible {
    opacity: 1;
  }

  /* ── Compact variant: visores secundarios (fatigue, deload) ─────────────────── */
  .anatomy-lens-compact.al-svg-viewer {
    padding: 8px 6px 4px;
  }

  .anatomy-lens-compact .al-svg-chart {
    max-height: 220px;
  }

  /* ── Sweep animation: fade-in escalonado al entrar en viewport ──────────────── */
  @keyframes al-sweep-in {
    from { opacity: 0; transform: translateY(3px); }
    to   { opacity: 1; transform: translateY(0);   }
  }

  /* Aplicado temporalmente al grupo .al-muscles durante el sweep */
  .al-muscles.al-sweep [data-id] {
    opacity: 0;
    animation: al-sweep-in 0.25s ease forwards;
  }
  ```

- [ ] **Step 2: Verificar que el archivo no tiene errores de sintaxis**

  Abrir `frontend/index.html` en el navegador → sección Exercises → el visor debe seguir cargando igual que antes (ningún cambio JS todavía).

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/css/anatomy-lens.css
  git commit -m "feat(anatomy): CSS para toggle Vista/Atleta, tooltip, compact variant y sweep"
  ```

---

## Task 2: svgViewer.js — reescritura como factory

**Files:**
- Modify: `frontend/js/anatomyLens/svgViewer.js` (reescritura completa)

Este es el núcleo del cambio. Se mantiene toda la lógica existente (VIEWBOX, buildSVG, loadMuscleData, MUSCLE_TO_IDS) pero se envuelve en una factory `createViewer()` que gestiona su propio estado en closure.

- [ ] **Step 1: Reemplazar svgViewer.js con la versión factory**

  Reemplazar el contenido completo del archivo con:

  ```js
  // frontend/js/anatomyLens/svgViewer.js — v2
  // Factory pattern: createViewer() devuelve instancias independientes.
  // Modos: 'highlight' (ejercicios) | 'overlay' (fatiga/deload).
  // Toggle Vista/Atleta: 10 grupos EZ vs ~38 músculosindividuales.

  const SVG_NS  = 'http://www.w3.org/2000/svg';
  const VIEWBOX = '0 0 72 93';

  const COLOR_PRIMARY   = '#7c6bff';
  const COLOR_SECONDARY = '#00c8ee';
  const COLOR_BASE      = '#252545';
  const COLOR_BG        = '#9999cc';
  const STROKE_BASE     = '#31315a';
  const STROKE_ACTIVE   = '#ffffff44';
  const STROKE_PRIMARY  = '#a89aff66';

  // ── EZ groups: 10 categorías → body-muscles IDs ─────────────────────────────
  const EZ_GROUPS = {
    chest:      ['chest-upper-left','chest-upper-right','chest-lower-left','chest-lower-right'],
    back:       ['lats-upper-left','lats-upper-right','lats-mid-left','lats-mid-right',
                 'lats-lower-left','lats-lower-right','traps-upper-left','traps-upper-right',
                 'traps-mid-left','traps-mid-right','lower-back-erectors-left','lower-back-erectors-right'],
    shoulders:  ['shoulder-front-left','shoulder-front-right','shoulder-side-left','shoulder-side-right',
                 'deltoid-rear-left','deltoid-rear-right'],
    biceps:     ['biceps-left','biceps-right','forearm-left','forearm-right'],
    triceps:    ['triceps-long-left','triceps-long-right','triceps-lateral-left','triceps-lateral-right'],
    quads:      ['quads-left','quads-right'],
    hamstrings: ['hamstrings-lateral-left','hamstrings-lateral-right',
                 'hamstrings-medial-left','hamstrings-medial-right'],
    glutes:     ['gluteus-maximus-left','gluteus-maximus-right',
                 'gluteus-medius-left','gluteus-medius-right'],
    core:       ['abs-upper-left','abs-upper-right','abs-lower-left','abs-lower-right',
                 'obliques-left','obliques-right'],
    calves:     ['calves-gastroc-medial-left','calves-gastroc-medial-right',
                 'calves-gastroc-lateral-left','calves-gastroc-lateral-right',
                 'calves-soleus-left','calves-soleus-right'],
  };

  const EZ_LABELS = {
    chest:'Pecho', back:'Espalda', shoulders:'Hombros', biceps:'Bíceps',
    triceps:'Tríceps', quads:'Cuádriceps', hamstrings:'Isquiotibiales',
    glutes:'Glúteos', core:'Core', calves:'Gemelos',
  };

  // ── Muscle name mapping: muscleMap.js keys → body-muscles IDs ───────────────
  const MUSCLE_TO_IDS = {
    pectoral_mayor_esternal:    ['chest-lower-left',   'chest-lower-right'],
    pectoral_mayor_clavicular:  ['chest-upper-left',   'chest-upper-right'],
    deltoides_anterior:  ['shoulder-front-left', 'shoulder-front-right'],
    deltoides_medial:    ['shoulder-side-left',  'shoulder-side-right'],
    deltoides_posterior: ['deltoid-rear-left',   'deltoid-rear-right'],
    biceps_cabeza_larga: ['biceps-left',   'biceps-right'],
    biceps_cabeza_corta: ['biceps-left',   'biceps-right'],
    braquial:            ['biceps-left',   'biceps-right'],
    braquiorradial:      ['forearm-left',  'forearm-right'],
    triceps_cabeza_larga:   ['triceps-long-left',    'triceps-long-right'],
    triceps_cabeza_lateral: ['triceps-lateral-left', 'triceps-lateral-right'],
    triceps_cabeza_medial:  ['triceps-lateral-left', 'triceps-lateral-right'],
    dorsal_ancho: [
      'lats-upper-left','lats-upper-right','lats-mid-left','lats-mid-right',
      'lats-lower-left','lats-lower-right',
    ],
    trapecio_superior: ['traps-upper-left', 'traps-upper-right'],
    trapecio_medio:    ['traps-mid-left',   'traps-mid-right'],
    romboides_mayor:   ['traps-mid-left',   'traps-mid-right'],
    romboides_menor:   ['traps-mid-left',   'traps-mid-right'],
    erector_espinal:   ['lower-back-erectors-left', 'lower-back-erectors-right'],
    cuadrado_lumbar:   ['lower-back-ql-left',        'lower-back-ql-right'],
    recto_abdominal:      ['abs-upper-left','abs-upper-right','abs-lower-left','abs-lower-right'],
    oblicuo_externo:      ['obliques-left', 'obliques-right'],
    oblicuo_interno:      ['obliques-left', 'obliques-right'],
    transverso_abdominal: ['abs-lower-left','abs-lower-right'],
    gluteo_mayor: ['gluteus-maximus-left', 'gluteus-maximus-right'],
    gluteo_medio: ['gluteus-medius-left',  'gluteus-medius-right'],
    recto_femoral:    ['quads-left', 'quads-right'],
    vasto_lateral:    ['quads-left', 'quads-right'],
    vasto_medial:     ['quads-left', 'quads-right'],
    vasto_intermedio: ['quads-left', 'quads-right'],
    biceps_femoral: ['hamstrings-lateral-left', 'hamstrings-lateral-right'],
    semitendinoso:  ['hamstrings-medial-left',  'hamstrings-medial-right'],
    semimembranoso: ['hamstrings-medial-left',  'hamstrings-medial-right'],
    gastrocnemio_medial:  ['calves-gastroc-medial-left',  'calves-gastroc-medial-right'],
    gastrocnemio_lateral: ['calves-gastroc-lateral-left', 'calves-gastroc-lateral-right'],
    soleo:                ['calves-soleus-left',            'calves-soleus-right'],
    infraespinoso: ['deltoid-rear-left', 'deltoid-rear-right'],
    redondo_menor: ['deltoid-rear-left', 'deltoid-rear-right'],
  };

  // ── Módulo compartido: datos de body-muscles (caché por sesión) ─────────────
  let _muscleData   = null;
  let _nextInstance = 0;

  async function loadMuscleData() {
    if (_muscleData) return;
    const { MUSCLE_MAP } = await import('https://esm.sh/body-muscles@1.0.0');
    if (!MUSCLE_MAP || typeof MUSCLE_MAP !== 'object') {
      throw new Error('body-muscles: MUSCLE_MAP inválido');
    }
    _muscleData = Object.values(MUSCLE_MAP);
  }

  function showLoading(container) {
    const el = document.createElement('div');
    el.className = 'al-loading-overlay';
    el.innerHTML = `<div class="al-loading-ring"></div><span class="al-loading-text">Cargando visor…</span>`;
    container.appendChild(el);
    return el;
  }

  function hideLoading(el) {
    if (!el) return;
    el.classList.add('al-loading-done');
    setTimeout(() => el.remove(), 350);
  }

  function buildSVG(muscles, instanceId) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', VIEWBOX);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Diagrama muscular frontal y posterior');
    svg.classList.add('al-svg-chart');

    const filterId1 = `al-glow-primary-${instanceId}`;
    const filterId2 = `al-glow-secondary-${instanceId}`;

    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <filter id="${filterId1}" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="0.6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="${filterId2}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    svg.appendChild(defs);

    const sep = document.createElementNS(SVG_NS, 'line');
    sep.setAttribute('x1', '36'); sep.setAttribute('y1', '3');
    sep.setAttribute('x2', '36'); sep.setAttribute('y2', '89');
    sep.setAttribute('stroke', '#ffffff0a');
    sep.setAttribute('stroke-width', '0.25');
    svg.appendChild(sep);

    ['FRENTE', 'ESPALDA'].forEach((labelText, i) => {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', i === 0 ? '17.5' : '54');
      t.setAttribute('y', '91.5');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '2');
      t.setAttribute('fill', '#ffffff20');
      t.setAttribute('font-family', 'system-ui, sans-serif');
      t.setAttribute('letter-spacing', '0.8');
      t.textContent = labelText;
      svg.appendChild(t);
    });

    const bgGroup = document.createElementNS(SVG_NS, 'g');
    bgGroup.setAttribute('aria-hidden', 'true');
    bgGroup.style.pointerEvents = 'none';
    muscles.forEach(m => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', m.path);
      p.setAttribute('fill', COLOR_BG);
      p.style.opacity = '0.07';
      bgGroup.appendChild(p);
    });
    svg.appendChild(bgGroup);

    const interGroup = document.createElementNS(SVG_NS, 'g');
    interGroup.classList.add('al-muscles');
    muscles.forEach(m => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', m.path);
      p.setAttribute('data-id', m.id);
      p.setAttribute('fill', COLOR_BASE);
      p.setAttribute('stroke', STROKE_BASE);
      p.setAttribute('stroke-width', '0.15');
      p.style.transition = 'fill 0.35s ease, stroke 0.35s ease';
      interGroup.appendChild(p);
    });
    svg.appendChild(interGroup);

    return { svg, interGroup, filterId1, filterId2 };
  }

  // ── Interpolación de color para overlay ─────────────────────────────────────
  function overlayColor(intensity) {
    if (intensity === null || intensity === undefined) return null;
    const t = Math.max(0, Math.min(1, intensity));
    const stops = [
      { t: 0.00, r: 16,  g: 185, b: 129 },  // #10b981 fresh
      { t: 0.28, r: 34,  g: 211, b: 238 },  // #22d3ee warming
      { t: 0.58, r: 245, g: 158, b: 11  },  // #f59e0b recovering
      { t: 1.00, r: 239, g: 68,  b: 68  },  // #ef4444 tired
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].t && t <= stops[i + 1].t) { lo = stops[i]; hi = stops[i + 1]; break; }
    }
    const f  = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
    const r  = Math.round(lo.r + (hi.r - lo.r) * f);
    const g  = Math.round(lo.g + (hi.g - lo.g) * f);
    const b  = Math.round(lo.b + (hi.b - lo.b) * f);
    const a  = (0.55 + t * 0.40).toFixed(2);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ── Factory ─────────────────────────────────────────────────────────────────
  export function createViewer() {
    const instanceId   = ++_nextInstance;
    let _container     = null;
    let _svg           = null;
    let _muscleGroup   = null;
    let _filterId1     = `al-glow-primary-${instanceId}`;
    let _filterId2     = `al-glow-secondary-${instanceId}`;
    let _renderMode    = 'highlight';
    let _viewMode      = localStorage.getItem('al_view_mode') || 'vista';
    let _tooltipEl     = null;
    let _sweepDone     = false;
    let _observer      = null;
    let _lastOverlay   = null;

    // ── init ────────────────────────────────────────────────────────────────
    async function init(container) {
      _container = container;
      container.innerHTML = '';
      container.classList.add('al-svg-viewer');

      const loadingEl = showLoading(container);
      try {
        await loadMuscleData();
      } catch (err) {
        hideLoading(loadingEl);
        throw err;
      }

      const built = buildSVG(_muscleData, instanceId);
      _svg         = built.svg;
      _muscleGroup = built.interGroup;
      _filterId1   = built.filterId1;
      _filterId2   = built.filterId2;

      hideLoading(loadingEl);
      container.appendChild(_svg);
      _initTooltip();
      _initSweep();
    }

    // ── highlight (modo ejercicio — sin cambios de comportamiento) ───────────
    function highlight(primary, secondary) {
      if (!_muscleGroup || !_container) return;
      _renderMode = 'highlight';
      _removeToggle();

      _muscleGroup.querySelectorAll('[data-id]').forEach(p => {
        p.setAttribute('fill', COLOR_BASE);
        p.setAttribute('stroke', STROKE_BASE);
        p.style.filter = '';
        delete p.dataset.overlayLabel;
        delete p.dataset.overlayKey;
      });

      const secondaryIds = new Set(secondary.flatMap(n => MUSCLE_TO_IDS[n] ?? []));
      const primaryIds   = new Set(primary.flatMap(n => MUSCLE_TO_IDS[n] ?? []));

      secondaryIds.forEach(id => {
        const el = _muscleGroup.querySelector(`[data-id="${id}"]`);
        if (el) {
          el.setAttribute('fill', COLOR_SECONDARY);
          el.setAttribute('stroke', STROKE_ACTIVE);
          el.style.filter = `url(#${_filterId2})`;
        }
      });

      primaryIds.forEach(id => {
        const el = _muscleGroup.querySelector(`[data-id="${id}"]`);
        if (el) {
          el.setAttribute('fill', COLOR_PRIMARY);
          el.setAttribute('stroke', STROKE_PRIMARY);
          el.style.filter = `url(#${_filterId1})`;
        }
      });

      _container.classList.add('has-highlight');
    }

    // ── setOverlay (mapa de calor de fatiga/deload) ──────────────────────────
    function setOverlay(data) {
      if (!_muscleGroup || !_container) return;
      _renderMode  = 'overlay';
      _lastOverlay = data;
      _applyOverlay(data);
      _showToggle();
      _container.classList.add('has-highlight');
    }

    function _applyOverlay(data) {
      _muscleGroup.querySelectorAll('[data-id]').forEach(p => {
        p.setAttribute('fill', COLOR_BASE);
        p.setAttribute('stroke', STROKE_BASE);
        p.style.filter = '';
        delete p.dataset.overlayLabel;
        delete p.dataset.overlayKey;
      });

      data.forEach(({ key, intensity, label }) => {
        const color = overlayColor(intensity);
        if (!color) return;

        const ids = EZ_GROUPS[key]
          ? EZ_GROUPS[key]
          : (MUSCLE_TO_IDS[key] ?? []);

        ids.forEach(id => {
          const el = _muscleGroup.querySelector(`[data-id="${id}"]`);
          if (!el) return;
          el.setAttribute('fill', color);
          el.setAttribute('stroke', 'rgba(255,255,255,0.15)');
          el.dataset.overlayLabel = label ?? '';
          el.dataset.overlayKey   = key;
        });
      });
    }

    // ── setMode (Vista / Atleta) ─────────────────────────────────────────────
    function setMode(mode) {
      if (mode !== 'vista' && mode !== 'atleta') return;
      _viewMode = mode;
      localStorage.setItem('al_view_mode', mode);
      _updateToggleUI();
      if (_renderMode === 'overlay' && _lastOverlay) _applyOverlay(_lastOverlay);
    }

    // ── clearOverlay ─────────────────────────────────────────────────────────
    function clearOverlay() {
      if (!_muscleGroup || !_container) return;
      _muscleGroup.querySelectorAll('[data-id]').forEach(p => {
        p.setAttribute('fill', COLOR_BASE);
        p.setAttribute('stroke', STROKE_BASE);
        p.style.filter = '';
        delete p.dataset.overlayLabel;
        delete p.dataset.overlayKey;
      });
      _container.classList.remove('has-highlight');
      _renderMode  = 'highlight';
      _lastOverlay = null;
      _removeToggle();
    }

    // ── reset ────────────────────────────────────────────────────────────────
    function reset() {
      clearOverlay();
    }

    // ── destroy ──────────────────────────────────────────────────────────────
    function destroy() {
      if (_observer) { _observer.disconnect(); _observer = null; }
      if (_container) {
        _container.innerHTML = '';
        _container.classList.remove('al-svg-viewer', 'has-highlight');
      }
      _svg = _container = _muscleGroup = _tooltipEl = _lastOverlay = null;
    }

    // ── Toggle chip (Vista / Atleta) ─────────────────────────────────────────
    function _showToggle() {
      if (_container.querySelector('.al-mode-toggle')) {
        _updateToggleUI();
        return;
      }
      const toggle = document.createElement('div');
      toggle.className = 'al-mode-toggle';
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', 'Modo de visualización');
      toggle.innerHTML = `
        <span class="al-mode-btn${_viewMode === 'vista'  ? ' active' : ''}" data-mode="vista">Vista</span>
        <span class="al-mode-btn${_viewMode === 'atleta' ? ' active' : ''}" data-mode="atleta">Atleta</span>
      `;
      toggle.addEventListener('click', e => {
        const btn = e.target.closest('[data-mode]');
        if (btn) setMode(btn.dataset.mode);
      });
      _container.appendChild(toggle);
    }

    function _removeToggle() {
      _container?.querySelector('.al-mode-toggle')?.remove();
    }

    function _updateToggleUI() {
      const toggle = _container?.querySelector('.al-mode-toggle');
      if (!toggle) return;
      toggle.querySelectorAll('.al-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === _viewMode);
      });
    }

    // ── Tooltip ──────────────────────────────────────────────────────────────
    function _initTooltip() {
      _tooltipEl = document.createElement('div');
      _tooltipEl.className = 'al-tooltip';
      _container.appendChild(_tooltipEl);

      _muscleGroup.addEventListener('mousemove', e => {
        const path = e.target.closest('[data-id]');
        if (!path || !path.dataset.overlayLabel) {
          _tooltipEl.classList.remove('al-tooltip-visible');
          return;
        }
        const keyLabel = EZ_LABELS[path.dataset.overlayKey]
          ?? path.dataset.overlayKey?.replace(/_/g, ' ')
          ?? path.getAttribute('data-id');

        _tooltipEl.innerHTML = `<strong>${keyLabel}</strong><br>${path.dataset.overlayLabel}`;
        _tooltipEl.classList.add('al-tooltip-visible');

        const cr = _container.getBoundingClientRect();
        _tooltipEl.style.left = (e.clientX - cr.left + 12) + 'px';
        _tooltipEl.style.top  = (e.clientY - cr.top  - 44) + 'px';
      });

      _muscleGroup.addEventListener('mouseleave', () => {
        _tooltipEl.classList.remove('al-tooltip-visible');
      });
    }

    // ── Sweep de entrada ─────────────────────────────────────────────────────
    function _initSweep() {
      if (_sweepDone || typeof IntersectionObserver === 'undefined') return;
      _observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !_sweepDone) {
          _sweepDone = true;
          _observer.disconnect();
          _observer = null;
          _runSweep();
        }
      }, { threshold: 0.25 });
      _observer.observe(_container);
    }

    function _runSweep() {
      const paths = _muscleGroup
        ? Array.from(_muscleGroup.querySelectorAll('[data-id]'))
        : [];
      paths.forEach((p, i) => { p.style.animationDelay = `${i * 8}ms`; });
      _muscleGroup?.classList.add('al-sweep');
      setTimeout(() => {
        paths.forEach(p => { p.style.animationDelay = ''; });
        _muscleGroup?.classList.remove('al-sweep');
      }, paths.length * 8 + 350);
    }

    return { init, highlight, setOverlay, setMode, clearOverlay, reset, destroy };
  }
  ```

- [ ] **Step 2: Verificar que exercises.js sigue funcionando**

  Abrir la app → sección Exercises → hacer clic en cualquier ejercicio (ej. Press banca). El visor debe seguir resaltando músculos en púrpura/cyan. Si aparece error en consola, revisar que las funciones de `buildSVG` en el nuevo archivo son idénticas a las del original.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/svgViewer.js
  git commit -m "feat(anatomy): factory pattern createViewer() con overlay mode, EZ_GROUPS, toggle, tooltip y sweep"
  ```

---

## Task 3: index.js — exponer createViewer

**Files:**
- Modify: `frontend/js/anatomyLens/index.js`

- [ ] **Step 1: Añadir el import y re-export de createViewer**

  Abrir `frontend/js/anatomyLens/index.js`. En la línea de imports al inicio del archivo, el estado actual es:

  ```js
  import { resolveExercise } from './muscleMap.js';
  import { renderLegend, clearLegend } from './legend.js';
  import { initSVGViewer, highlightSVG, resetSVG, destroySVGViewer } from './svgViewer.js';
  ```

  Reemplazar esas tres líneas de imports con:

  ```js
  import { resolveExercise } from './muscleMap.js';
  import { renderLegend, clearLegend } from './legend.js';
  import { createViewer as _createViewer } from './svgViewer.js';
  ```

  **Nota:** `initSVGViewer`, `highlightSVG`, `resetSVG`, `destroySVGViewer` ya no existen — el nuevo svgViewer.js solo exporta `createViewer`. El singleton interno de index.js debe re-crearse.

- [ ] **Step 2: Actualizar el singleton interno y las funciones de la API pública**

  El cuerpo de `index.js` crea un singleton para exercises.js. Reemplazar el archivo completo con:

  ```js
  // frontend/js/anatomyLens/index.js
  // API pública — el único archivo que exercises.js necesita importar.
  // Visor anatómico SVG estilo Hevy: front + back, body-muscles library.
  // Expone createViewer para instancias adicionales (fatigueHeatmap, autoDeload).

  import { resolveExercise } from './muscleMap.js';
  import { renderLegend, clearLegend } from './legend.js';
  import { createViewer as _createViewer } from './svgViewer.js';

  // Re-export para módulos externos que necesiten instancias propias
  export { _createViewer as createViewer };

  // ── Singleton para exercises.js (retrocompatibilidad total) ─────────────────
  let _initPromise      = null;
  let _initialized      = false;
  let _pendingHighlight = null;
  let _viewer           = null;

  async function init(container) {
    if (_initPromise) return _initPromise;
    if (_initialized) return;
    _initPromise = _doInit(container);
    try {
      await _initPromise;
    } finally {
      _initPromise = null;
    }
  }

  async function _doInit(container) {
    try {
      _viewer = _createViewer();
      await _viewer.init(container);
      _initialized = true;

      if (_pendingHighlight) {
        const { id, muscles } = _pendingHighlight;
        _pendingHighlight = null;
        await highlight(id, muscles);
      }
    } catch (err) {
      console.error('[AnatomyLens] SVG init failed:', err);
      _initialized = false;
      throw err;
    }
  }

  async function highlight(exerciseId, dbMuscles = []) {
    if (!_initialized) {
      _pendingHighlight = { id: exerciseId, muscles: dbMuscles };
      return;
    }
    try {
      const { primary, secondary } = resolveExercise(exerciseId, dbMuscles);
      _viewer.highlight(primary, secondary);
      renderLegend(primary, secondary);
    } catch (err) {
      console.warn('[AnatomyLens] highlight skipped:', err.message);
    }
  }

  async function reset() {
    if (_viewer) _viewer.reset();
    clearLegend();
    const hint = document.getElementById('anatomy-hint');
    if (hint) hint.style.display = '';
  }

  async function destroy() {
    clearLegend();
    if (_viewer) { _viewer.destroy(); _viewer = null; }
    _initialized      = false;
    _initPromise      = null;
    _pendingHighlight = null;
  }

  // ── Debug API ───────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.__anatomyLens = {
      highlight: (id) => highlight(id, []),
      reset,
      getState: () => _initialized ? 'READY' : (_initPromise ? 'LOADING' : 'UNINITIALIZED'),
    };
  }

  export default { init, highlight, reset, destroy };
  ```

- [ ] **Step 3: Verificar retrocompatibilidad**

  Abrir la app → sección Exercises → clic en varios ejercicios → verificar que el visor resalta músculos y la leyenda aparece. Abrir consola: `window.__anatomyLens.getState()` debe devolver `'READY'`. No debe haber errores.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/js/anatomyLens/index.js
  git commit -m "feat(anatomy): exponer createViewer desde index.js manteniendo retrocompat"
  ```

---

## Task 4: fatigueHeatmap.js — reemplazar SVG artesanal con overlay viewer

**Files:**
- Modify: `frontend/js/fatigueHeatmap.js`

El objetivo: eliminar `buildSVG` (el SVG artesanal con paths toscos) y reemplazar la sección de rendering SVG en `render()` por un viewer AnatomyLens con overlay. La lista de recovery (`fatigue-list`) se mantiene intacta — solo cambia el visor visual.

- [ ] **Step 1: Eliminar la función buildSVG completa**

  Localizar y eliminar la función `buildSVG` (líneas 65–97 aproximadamente). Es la función que genera un SVG con paths hardcodeados para front y back. Se elimina completamente — el nuevo viewer usa body-muscles.

  ```js
  // ELIMINAR completamente este bloque (líneas 65–97 aprox):
  function buildSVG(muscles, side) {
    var zones;
    if (side === 'front') {
      // ...
    } else {
      // ...
    }
    // ...
  }
  ```

- [ ] **Step 2: Reemplazar la función render() completa**

  Localizar la función `render()` (línea 99) y reemplazarla completa:

  ```js
  async function render() {
    var root = document.getElementById('fatigue-root');
    if (!root) return;

    var lastTrained = getLastTrained();
    var muscles     = {};
    Object.keys(MUSCLE_MAP).forEach(function (m) {
      muscles[m] = getStatus(m, lastTrained);
    });

    var hasData = Object.keys(lastTrained).length > 0;
    if (!hasData) {
      root.innerHTML = '<p class="fatigue-empty">Añade registros en Records 1RM para ver tu estado de recuperación muscular.</p>';
      return;
    }

    // Lista de recovery — se mantiene igual que antes
    var listHTML = '<div class="fatigue-list">'
      + Object.keys(LABELS).map(function (m) {
          var s       = muscles[m];
          var pctText = s.pct !== null ? s.pct + '% recuperado' : 'Sin datos';
          return '<div class="fatigue-item">'
            + '<div class="fatigue-item-dot" style="background:' + s.color + '"></div>'
            + '<div class="fatigue-item-body">'
            + '<div class="fatigue-item-name">' + LABELS[m] + '</div>'
            + '<div class="fatigue-item-sub">' + s.label + '</div>'
            + '</div>'
            + '<div class="fatigue-item-pct">' + pctText + '</div>'
            + '</div>';
        }).join('')
      + '</div>';

    // Layout: viewer AnatomyLens | lista de recovery
    root.innerHTML = '<div class="fatigue-layout">'
      + '<div><div id="fatigue-anatomy-wrap" class="anatomy-lens-container anatomy-lens-compact"></div></div>'
      + '<div>' + listHTML + '</div>'
      + '</div>';

    // Montar AnatomyLens overlay (async, silently degrade si CDN falla)
    try {
      var mod    = await import('./anatomyLens/index.js');
      var viewer = mod.createViewer();
      await viewer.init(document.getElementById('fatigue-anatomy-wrap'));

      var overlayData = Object.keys(RECOVERY_H).map(function (muscle) {
        var s = getStatus(muscle, lastTrained);
        if (s.pct === null) return null;
        return {
          key:       muscle,
          intensity: (100 - s.pct) / 100,
          status:    s.pct >= 100 ? 'fresh'
                   : s.pct >= 75  ? 'warming'
                   : s.pct >= 50  ? 'recovering' : 'tired',
          label:     s.label,
        };
      }).filter(Boolean);

      viewer.setOverlay(overlayData);
    } catch (e) {
      console.warn('[FatigueHeatmap] AnatomyLens overlay failed:', e);
      // Degradación silenciosa — la lista de recovery sigue visible
    }
  }
  ```

- [ ] **Step 3: Actualizar init() para que llame render() como async**

  Localizar `function init() { render(); }` (línea 158) y reemplazar con:

  ```js
  function init() { render().catch(function(e) { console.warn('[FatigueHeatmap] render failed:', e); }); }
  ```

- [ ] **Step 4: Verificar en la app**

  Abrir la app → sección Fatigue Heatmap → debe aparecer el visor SVG body-muscles con músculos coloreados en el degradado verde→rojo según el estado de recovery. Si no hay datos de PR en localStorage, debe mostrar el mensaje "Añade registros…". El toggle Vista/Atleta debe aparecer en la esquina del visor.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/js/fatigueHeatmap.js
  git commit -m "feat(fatigue): reemplazar SVG artesanal con AnatomyLens overlay mode"
  ```

---

## Task 5: autoDeload.js — añadir viewer anatomy cuando dispara la señal

**Files:**
- Modify: `frontend/js/autoDeload.js`

Cuando `needsDeload === true` (2+ señales activas), se añade un viewer compacto que muestra qué grupos musculares contribuyeron a la señal. Si `needsDeload === false`, no se muestra el viewer.

- [ ] **Step 1: Añadir la función renderDeloadAnatomy()**

  Añadir esta función antes de la función `render(root)` (antes de la línea 159):

  ```js
  // Muestra visor anatomy con los grupos musculares que contribuyeron al deload
  // sR, sL, sP son los objetos de señal con .fires boolean
  function renderDeloadAnatomy(container, sR, sL, sP) {
    import('./anatomyLens/index.js').then(function (mod) {
      var viewer = mod.createViewer();
      viewer.init(container).then(function () {
        var overlayData = [];

        // sR (readiness bajo) → fatiga sistémica general: grupos principales
        if (sR.fires) {
          ['back', 'quads', 'chest', 'shoulders'].forEach(function (g) {
            overlayData.push({ key: g, intensity: 0.80, status: 'tired', label: 'Fatiga sistémica' });
          });
        }

        // sL (caída de carga semanal) → grupos de empuje y tirón
        if (sL.fires) {
          ['chest', 'back', 'shoulders'].forEach(function (g) {
            var ex = overlayData.find(function (d) { return d.key === g; });
            if (!ex) overlayData.push({ key: g, intensity: 0.65, status: 'recovering', label: 'Caída de carga' });
            else { ex.intensity = Math.min(1, ex.intensity + 0.10); ex.label = 'Fatiga + caída de carga'; }
          });
        }

        // sP (estancamiento 1RM) → grupos compuestos principales
        if (sP.fires) {
          ['quads', 'back', 'glutes'].forEach(function (g) {
            var ex = overlayData.find(function (d) { return d.key === g; });
            if (!ex) overlayData.push({ key: g, intensity: 0.70, status: 'tired', label: 'Estancamiento detectado' });
            else { ex.intensity = Math.min(1, ex.intensity + 0.15); }
          });
        }

        if (overlayData.length) viewer.setOverlay(overlayData);
      }).catch(function () {});
    }).catch(function () {});
  }
  ```

- [ ] **Step 2: Añadir el contenedor anatomy y la llamada en render()**

  Dentro de la función `render(root)`, localizar la línea `root.innerHTML = html;` (línea 222 aprox) y **después** de ella añadir:

  ```js
    root.innerHTML = html;  // ← línea ya existente, no cambiar

    // Añadir viewer anatomy compacto si el deload está activo
    if (needsDeload) {
      var anatomyWrap = document.createElement('div');
      anatomyWrap.className = 'anatomy-lens-container anatomy-lens-compact';
      anatomyWrap.style.marginTop = '16px';
      root.appendChild(anatomyWrap);
      renderDeloadAnatomy(anatomyWrap, sR, sL, sP);
    }
  ```

  **Nota:** `sR`, `sL`, `sP` y `needsDeload` ya están definidos en `render()` en las líneas anteriores — no hace falta redefinirlos.

- [ ] **Step 3: Verificar en la app**

  Para probar sin datos reales, abrir consola en la sección Auto-Deload y ejecutar:

  ```js
  // Simular 3 señales activas para ver el anatomy viewer
  localStorage.setItem('hs_weight_entries', JSON.stringify([
    { date: new Date(Date.now() - 20*86400000).toISOString(), value: 75 },
    { date: new Date(Date.now() - 15*86400000).toISOString(), value: 75 },
    { date: new Date(Date.now() - 10*86400000).toISOString(), value: 75 },
  ]));
  AutoDeload.init();
  ```

  Debe aparecer el estado "Deload recomendado" con el visor anatomy debajo mostrando grupos musculares en rojo/ámbar.

  Para limpiar: `localStorage.removeItem('hs_weight_entries'); AutoDeload.init();`

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/js/autoDeload.js
  git commit -m "feat(deload): añadir visor anatomy compacto cuando se activan 2+ señales de deload"
  ```

---

## Task 6: Documentar en ARCHITECTURE.md

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Localizar la sección frontend en ARCHITECTURE.md y añadir subsección AnatomyLens**

  Buscar en `ARCHITECTURE.md` la sección que describe el frontend o los módulos JS. Añadir la siguiente subsección en el lugar apropiado:

  ````markdown
  ### AnatomyLens — Visor Anatómico SVG

  **Ubicación:** `frontend/js/anatomyLens/` (4 archivos)

  **Stack:** body-muscles@1.0.0 (CDN esm.sh), vanilla JS ES modules, sin WebGL.

  #### Arquitectura actual (Phase A)

  ```
  exercises.js ──import──► index.js (default singleton)──► svgViewer.createViewer()
                                                             └── highlight(primary, secondary)

  fatigueHeatmap.js ──import──► index.js (createViewer) ──► instance.setOverlay(data)
  autoDeload.js     ──import──► index.js (createViewer) ──► instance.setOverlay(data)
  ```

  #### API pública (`index.js`)

  | Export | Uso |
  |--------|-----|
  | `default` | Singleton para exercises.js — `{ init, highlight, reset, destroy }` |
  | `createViewer()` | Factory para instancias adicionales — devuelve `{ init, highlight, setOverlay, setMode, clearOverlay, reset, destroy }` |

  #### Formato overlay — contrato inmutable

  ```js
  // Este formato NO cambia en Phase B.
  [{ key: 'chest', intensity: 0.85, status: 'recovering', label: 'Hace 1 día' }]
  // key: grupo EZ (chest/back/...) o clave muscleMap individual
  // intensity: 0.0 (fresco) → 1.0 (agotado)
  // status: 'fresh' | 'warming' | 'recovering' | 'tired'
  ```

  #### Modos de renderizado

  - **highlight** — ejercicios: primario (púrpura) + secundario (cyan). Sin toggle Vista/Atleta.
  - **overlay** — fatiga/deload: mapa de calor continuo verde→rojo. Toggle Vista/Atleta visible.

  #### Toggle Vista / Atleta

  - **Vista** — 10 grupos musculares (chest, back, shoulders…). Persiste en `localStorage('al_view_mode')`.
  - **Atleta** — ~38 músculos individuales de body-muscles. Tooltip con nombre + métrica en hover.

  #### Phase B — anatomyService.js (post workout logging)

  Cuando el módulo de workout logging esté implementado, añadir `frontend/js/anatomyLens/anatomyService.js`:

  ```
  workoutSession.js  →  anatomyService.recordSession(muscles, volume, date)
  anatomyService.js  →  computa recovery %, volumen semanal, señal de fatiga por músculo
  anatomyService.js  →  emite { key, intensity, status, label }[]
  fatigueHeatmap.js  →  anatomyService.getRecoveryOverlay()  →  viewer.setOverlay()
  autoDeload.js      →  anatomyService.getStressOverlay()    →  viewer.setOverlay()
  ```

  **El viewer no toca ninguna línea.** El contrato de datos es idéntico. Migrar Phase A → B
  consiste en reemplazar el cálculo local en cada módulo por una llamada al servicio.

  #### anatomyService.js (Phase B) — API prevista

  ```js
  anatomyService.recordSession(sessionData)    // ingesta workout logging
  anatomyService.getRecoveryOverlay(options)   // recovery % por músculo
  anatomyService.getVolumeOverlay(weekOffset)  // volumen semanal
  anatomyService.getStressOverlay()            // señal de deload por músculo
  ```
  ````

- [ ] **Step 2: Commit**

  ```bash
  git add ARCHITECTURE.md
  git commit -m "docs: documentar AnatomyLens v2 con Phase B roadmap en ARCHITECTURE.md"
  ```

---

## Verificación final

- [ ] Sección Exercises: clic en ejercicios → músculos resaltados en púrpura/cyan, leyenda actualizada, hint se oculta/restaura. Sin toggle visible.
- [ ] Sección Fatigue Heatmap: visor SVG body-muscles con degradado de recovery. Toggle Vista/Atleta visible. Tooltip en hover. Lista de recovery intacta a la derecha.
- [ ] Sección Auto-Deload: cuando 2+ señales activas, viewer compacto aparece debajo de las señales con grupos musculares en rojo/ámbar según qué señales dispararon.
- [ ] Sin errores en consola en ninguna sección.
- [ ] Abrir dos secciones simultáneamente en desktop: los dos viewers son independientes (colores distintos, sin interferencia).
