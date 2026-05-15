// frontend/js/anatomyLens/legend.js
// Renders a legend in #anatomy-legend showing primary (purple) and secondary (cyan) muscles.
// Uses al- prefixed classes to avoid collision with main.css .legend-dot.

// Display name mapping: mesh key → human-readable Spanish name
const MUSCLE_LABELS = {
  'pectoral_mayor_esternal':    'Pecho mayor (esternal)',
  'pectoral_mayor_clavicular':  'Pecho mayor (clavicular)',
  'deltoides_anterior':         'Deltoides anterior',
  'deltoides_medial':           'Deltoides medial',
  'deltoides_posterior':        'Deltoides posterior',
  'biceps_cabeza_larga':        'Bíceps',
  'biceps_cabeza_corta':        'Bíceps (cabeza corta)',
  'braquial':                   'Braquial',
  'braquiorradial':             'Braquiorradial',
  'triceps_cabeza_larga':       'Tríceps (larga)',
  'triceps_cabeza_lateral':     'Tríceps (lateral)',
  'triceps_cabeza_medial':      'Tríceps (medial)',
  'dorsal_ancho':               'Dorsal ancho',
  'trapecio_superior':          'Trapecio',
  'trapecio_medio':             'Trapecio medio',
  'romboides_mayor':            'Romboides',
  'romboides_menor':            'Romboides menor',
  'erector_espinal':            'Erector espinal',
  'cuadrado_lumbar':            'Cuadrado lumbar',
  'recto_abdominal':            'Recto abdominal',
  'oblicuo_externo':            'Oblicuos',
  'oblicuo_interno':            'Oblicuo interno',
  'transverso_abdominal':       'Transverso abdominal',
  'gluteo_mayor':               'Glúteo mayor',
  'gluteo_medio':               'Glúteo medio',
  'recto_femoral':              'Cuádriceps',
  'vasto_lateral':              'Vasto lateral',
  'vasto_medial':               'Vasto medial',
  'vasto_intermedio':           'Vasto intermedio',
  'biceps_femoral':             'Isquiotibiales',
  'semitendinoso':              'Semitendinoso',
  'semimembranoso':             'Semimembranoso',
  'gastrocnemio_medial':        'Gemelo medial',
  'gastrocnemio_lateral':       'Gemelo lateral',
  'soleo':                      'Sóleo',
  'infraespinoso':              'Infraespinoso',
  'redondo_menor':              'Redondo menor',
};

function label(key) { return MUSCLE_LABELS[key] ?? key.replace(/_/g, ' '); }

function dedupe(arr) { return [...new Set(arr)]; }

/**
 * Render legend into #anatomy-legend with fade-in.
 * @param {string[]} primary - muscle names
 * @param {string[]} secondary
 */
export function renderLegend(primary, secondary) {
  const el = document.getElementById('anatomy-legend');
  if (!el) return;

  const primaryLabels = dedupe(primary.map(label));
  const secondaryLabels = dedupe(secondary.map(label));

  el.innerHTML = `
    <div class="anatomy-legend-3d">
      ${primaryLabels.length ? `
        <div class="al-legend-group">
          <span class="al-legend-dot primary"></span>
          <span>${primaryLabels.join(' · ')}</span>
        </div>
      ` : ''}
      ${secondaryLabels.length ? `
        <div class="al-legend-group">
          <span class="al-legend-dot secondary"></span>
          <span>${secondaryLabels.join(' · ')}</span>
        </div>
      ` : ''}
    </div>
  `;

  // Fade in after paint
  requestAnimationFrame(() => {
    el.querySelector('.anatomy-legend-3d')?.classList.add('al-visible');
  });
}

/** Clear the legend */
export function clearLegend() {
  const el = document.getElementById('anatomy-legend');
  if (el) el.innerHTML = '';
}
