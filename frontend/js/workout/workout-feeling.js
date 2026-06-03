// frontend/js/workout/workout-feeling.js
// Auto-percepción del entreno (1-5). El usuario marca cómo se ha sentido; se
// guarda en el historial local y se antepone a las notas del coach IA para que
// la percepción del usuario module el análisis ("percepción IA").
//
// Aislado: un único punto de entrada renderFeelingSelector(container).

const LEVELS = [
  { v: 1, emoji: '😫', label: 'Muy duro' },
  { v: 2, emoji: '😕', label: 'Flojo' },
  { v: 3, emoji: '😐', label: 'Normal' },
  { v: 4, emoji: '🙂', label: 'Bien' },
  { v: 5, emoji: '🔥', label: 'Genial' },
];

const SS_KEY = 'hs_last_feeling';

// Persiste la percepción en el último registro del historial local.
function _persistToHistory(level) {
  try {
    const sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]');
    if (!sessions.length) return;
    // saveToLocalHistory inserta el más reciente al principio (unshift); si no,
    // tomamos el de mayor startedAt como salvaguarda.
    let idx = 0;
    if (sessions.length > 1) {
      let maxTs = -Infinity;
      sessions.forEach((s, i) => {
        const ts = new Date(s.startedAt || 0).getTime();
        if (ts > maxTs) { maxTs = ts; idx = i; }
      });
    }
    sessions[idx].feeling = level.v;
    sessions[idx].feelingLabel = level.label;
    localStorage.setItem('hs_workout_sessions_local', JSON.stringify(sessions));
  } catch (e) {
    console.warn('[workout-feeling] persist failed:', e?.message);
  }
}

// Lee la percepción guardada para esta sesión (para preseleccionar al re-render).
export function getLastFeeling() {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); }
  catch { return null; }
}

// Texto para anteponer a las notas del coach IA.
export function feelingNotePrefix() {
  const f = getLastFeeling();
  if (!f) return '';
  return `Percepción del usuario: ${f.label} (${f.v}/5).`;
}

export function renderFeelingSelector(container) {
  if (!container) return;
  const saved = getLastFeeling();

  container.innerHTML = `
    <div class="wl-feeling">
      <span class="wl-feeling-q">¿Cómo te has sentido en este entreno?</span>
      <div class="wl-feeling-opts" role="radiogroup" aria-label="Percepción del entreno">
        ${LEVELS.map(l => `
          <button type="button" class="wl-feeling-opt${saved?.v === l.v ? ' wl-feeling-opt--active' : ''}"
            role="radio" aria-checked="${saved?.v === l.v ? 'true' : 'false'}"
            data-v="${l.v}" data-label="${l.label}" title="${l.label}">
            <span class="wl-feeling-emoji" aria-hidden="true">${l.emoji}</span>
            <span class="wl-feeling-lbl">${l.label}</span>
          </button>`).join('')}
      </div>
    </div>`;

  const opts = container.querySelectorAll('.wl-feeling-opt');
  container.querySelector('.wl-feeling-opts').addEventListener('click', e => {
    const btn = e.target.closest('.wl-feeling-opt');
    if (!btn) return;
    const v = parseInt(btn.dataset.v, 10);
    const level = LEVELS.find(l => l.v === v);
    if (!level) return;

    opts.forEach(o => {
      const on = o === btn;
      o.classList.toggle('wl-feeling-opt--active', on);
      o.setAttribute('aria-checked', on ? 'true' : 'false');
    });

    try { sessionStorage.setItem(SS_KEY, JSON.stringify({ v: level.v, label: level.label })); } catch {}
    _persistToHistory(level);
    window.haptic?.light?.();
    window.dispatchEvent(new CustomEvent('hs:workout-feeling-set', { detail: { value: level.v } }));
  });
}
