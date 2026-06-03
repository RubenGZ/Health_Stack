// frontend/js/workout/summary-anatomy.js
// Visor anatómico para la pantalla de resumen de entreno.
// Reutiliza el mismo motor SVG de anatomyLens (createViewer + setOverlay) que
// usan Fatiga/Deload, mostrando el % de carga de cada grupo muscular trabajado.
//
// Aislado a propósito: si el CDN del visor falla (offline), cae a unas barras
// simples sin romper el resumen. Punto único de entrada: renderSummaryAnatomy().

const _esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── group (taxonomía exercises.js) → claves EZ del visor ───────────────────────
// Cada grupo reparte su "carga" entre una o varias claves EZ con un peso 0-1.
const GROUP_TO_EZ = {
  pecho:    [['chest', 1]],
  espalda:  [['back', 1]],
  hombros:  [['shoulders', 1]],
  biceps:   [['biceps', 1]],
  triceps:  [['triceps', 1]],
  brazos:   [['biceps', 0.5], ['triceps', 0.5]],
  piernas:  [['quads', 0.55], ['hamstrings', 0.25], ['glutes', 0.20]],
  gluteos:  [['glutes', 0.7], ['hamstrings', 0.3]],
  gemelos:  [['calves', 1]],
  core:     [['core', 1]],
  cardio:   [],   // sin grupo muscular concreto
};

const EZ_LABELS = {
  chest: 'Pecho', back: 'Espalda', shoulders: 'Hombros', biceps: 'Bíceps',
  triceps: 'Tríceps', quads: 'Cuádriceps', hamstrings: 'Isquios',
  glutes: 'Glúteos', core: 'Core', calves: 'Gemelos',
};

// ── Calcula la carga por grupo muscular EZ a partir de la sesión ──────────────
// Carga = Σ (sets de trabajo completados) ponderada por reparto del grupo.
// Devuelve [{ key, load, pct }] ordenado de mayor a menor.
export function computeMuscleLoad(session) {
  if (!session?.exercises?.length) return [];
  const load = {};

  session.exercises.forEach(ex => {
    const doneWorking = ex.sets.filter(s => !s.isWarmup && s.completedAt).length;
    if (!doneWorking) return;
    const group = String(ex.group || '').toLowerCase();
    const targets = GROUP_TO_EZ[group];
    if (!targets || !targets.length) {
      // grupo desconocido → cae en 'core' como aproximación neutra mínima evita
      // perder el dato, pero solo si no había nada; mejor ignorar para no mentir.
      return;
    }
    targets.forEach(([ezKey, w]) => {
      load[ezKey] = (load[ezKey] || 0) + doneWorking * w;
    });
  });

  const entries = Object.entries(load);
  if (!entries.length) return [];
  const total = entries.reduce((n, [, v]) => n + v, 0) || 1;
  return entries
    .map(([key, v]) => ({ key, load: v, pct: Math.round((v / total) * 100) }))
    .sort((a, b) => b.load - a.load);
}

// ── Fallback: barras simples (sin visor, p.ej. offline) ───────────────────────
function _renderBarsFallback(container, data) {
  if (!data.length) { container.innerHTML = ''; return; }
  const max = data[0].load;
  const bars = data.map(({ key, pct, load }) => {
    const w = Math.round((load / max) * 100);
    return `<div class="wl-muscle-row">
      <span class="wl-muscle-name">${_esc(EZ_LABELS[key] || key)}</span>
      <div class="wl-muscle-bar-wrap"><div class="wl-muscle-bar-fill" style="width:${w}%"></div></div>
      <span class="wl-muscle-count">${pct}%</span>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="wl-muscle-breakdown">
    <h4 class="wl-muscle-title">Músculos trabajados</h4>${bars}</div>`;
}

// ── Lista de % bajo el visor (numérico, accesible) ────────────────────────────
function _legendHtml(data) {
  return data.map(({ key, pct }) =>
    `<li class="wl-anat-leg-item">
       <span class="wl-anat-leg-dot" data-ez="${_esc(key)}"></span>
       <span class="wl-anat-leg-name">${_esc(EZ_LABELS[key] || key)}</span>
       <span class="wl-anat-leg-pct">${pct}%</span>
     </li>`).join('');
}

// ── Entrada pública ───────────────────────────────────────────────────────────
// container: nodo donde montar. session: S.session.
export async function renderSummaryAnatomy(container, session) {
  if (!container) return;
  const data = computeMuscleLoad(session);

  if (!data.length) { container.innerHTML = ''; return; }

  // Estructura: título + visor + leyenda de %.
  container.innerHTML = `
    <div class="wl-anat-block">
      <h4 class="wl-muscle-title">Músculos trabajados</h4>
      <div class="wl-anat-viewer" id="wl-anat-viewer"></div>
      <ul class="wl-anat-legend">${_legendHtml(data)}</ul>
    </div>`;

  const viewerEl = container.querySelector('#wl-anat-viewer');

  try {
    const mod = await import('../anatomyLens/svgViewer.js');
    const viewer = mod.createViewer();
    await viewer.init(viewerEl);

    // Sexo del modelo si está configurado (perfil) — coherente con otras vistas.
    const sex = localStorage.getItem('al_sex');
    if (sex === 'male' || sex === 'female') viewer.setSex(sex);

    // Intensidad relativa al grupo más cargado (0.18 mínimo para que el músculo
    // trabajado se vea "tibio" y no verde-frío/invisible). label = % de carga.
    const maxLoad = data[0].load || 1;
    const overlay = data.map(({ key, load, pct }) => ({
      key,
      intensity: Math.max(0.18, load / maxLoad),
      label: `${pct}% de la carga`,
    }));
    viewer.setOverlay(overlay);

    // Guardar para limpieza si el contenedor se desmonta (nueva sesión).
    container._hsAnatViewer = viewer;
  } catch (err) {
    console.warn('[summary-anatomy] visor no disponible, usando barras:', err?.message);
    _renderBarsFallback(container, data);
  }
}
