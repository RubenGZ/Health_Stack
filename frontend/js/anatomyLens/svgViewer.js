// frontend/js/anatomyLens/svgViewer.js — v2
// Factory pattern: createViewer() devuelve instancias independientes.
// Modos: 'highlight' (ejercicios) | 'overlay' (fatiga/deload).
// Toggle Vista/Atleta: 10 grupos EZ vs ~38 músculos individuales.

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
