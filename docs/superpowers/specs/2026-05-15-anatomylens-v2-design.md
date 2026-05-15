# AnatomyLens v2 — Overlay API, Vista/Atleta, Multi-instancia

> **Para agentes:** implementar con `superpowers:subagent-driven-development`.
> Plan en `docs/superpowers/plans/2026-05-15-anatomylens-v2.md`

**Objetivo:** Convertir el visor anatómico SVG en un componente reutilizable multi-instancia
con modo overlay (mapa de calor de fatiga/deload) e integración en fatigueHeatmap y autoDeload.
Toggle Vista/Atleta para usuarios genéricos vs. fitness avanzado.

**Stack:** Vanilla JS ES modules, body-muscles@1.0.0 (CDN esm.sh), CSS custom properties.

---

## Contexto actual

`frontend/js/anatomyLens/` tiene 4 archivos:
- `svgViewer.js` — singleton con estado de módulo global. Soporta `highlightSVG` + `resetSVG`.
- `index.js` — API pública que delega al singleton.
- `muscleMap.js` — 33 ejercicios → músculos primarios/secundarios.
- `legend.js` — leyenda con nombres en español.

`fatigueHeatmap.js` tiene un SVG dibujado a mano (paths toscos, 10 grupos musculares).
`autoDeload.js` no tiene visor anatómico — muestra solo texto cuando dispara.

---

## Diseño

### 1. Factory pattern en svgViewer.js

Reemplazar el singleton por una función constructora que devuelve una instancia
con estado local. Esto permite múltiples viewers en la misma página sin interferencias.

```js
// svgViewer.js
export function createViewer(options = {}) {
  let _container   = null;
  let _svg         = null;
  let _muscleGroup = null;
  let _filterId1   = null;
  let _filterId2   = null;
  let _instanceId  = 0;
  let _renderMode  = 'highlight';   // 'highlight' | 'overlay'
  let _viewMode    = 'vista';        // 'vista' | 'atleta'  (persiste en localStorage)

  return { init, highlight, setOverlay, setMode, clearOverlay, reset, destroy };
}
```

`index.js` mantiene retrocompatibilidad con exercises.js exportando un default singleton,
y expone `createViewer` para nuevas instancias:

```js
// index.js
import { createViewer } from './svgViewer.js';
const _default = createViewer();
export default { init, highlight, reset, destroy };   // exercises.js no cambia
export { createViewer };                               // fatigueHeatmap, autoDeload
```

---

### 2. API de overlay

```js
viewer.setOverlay(data)
```

`data` es un array de objetos con este contrato (idéntico a lo que anatomyService.js
emitirá en Phase B — no cambia cuando se añada el servicio central):

```js
[
  { key: 'chest',              intensity: 0.85, status: 'recovering', label: 'Hace 1 día'        },
  { key: 'pectoral_mayor_esternal', intensity: 0.90, status: 'tired', label: 'Hoy'              },
  { key: 'quads',              intensity: 0.10, status: 'fresh',      label: 'Hace 4 días'       },
]
```

- `key` — nombre de grupo EZ (chest, back…) o clave individual muscleMap (pectoral_mayor_esternal…)
- `intensity` — 0.0 (fresco) → 1.0 (agotado). Continuo, no discreto.
- `status` — `'fresh' | 'warming' | 'recovering' | 'tired'` — determina el color base
- `label` — texto para el tooltip (tiempo, porcentaje, mensaje)

El viewer detecta si `key` es un grupo EZ y lo expande a sus IDs de body-muscles. Si es una
clave individual la usa directamente. Esto permite mezclar granularidades en el mismo array.

---

### 3. Toggle Vista / Atleta

Aparece en la esquina superior derecha del viewer cuando `renderMode === 'overlay'`.
No aparece en modo highlight (ejercicios) — en ese contexto el toggle es irrelevante.

- **Vista** — colorea los 10 grupos musculares de fatigueHeatmap (chest, back, shoulders…).
  Un click en el chip expande a qué músculos individuales forman ese grupo.
- **Atleta** — colorea los ~38 paths individuales de body-muscles directamente.
  Tooltip al hacer hover/tap: nombre del músculo + label del dato.

Persistido en `localStorage` bajo la clave `al_view_mode`.

#### Mapa EZ grupos → body-muscles IDs

| Grupo EZ    | IDs body-muscles                                                                  |
|-------------|-----------------------------------------------------------------------------------|
| chest       | chest-upper-left/right, chest-lower-left/right                                    |
| back        | lats-upper/mid/lower-left/right, traps-upper/mid-left/right, lower-back-erectors-left/right |
| shoulders   | shoulder-front/side-left/right, deltoid-rear-left/right                           |
| biceps      | biceps-left/right, forearm-left/right                                             |
| triceps     | triceps-long/lateral-left/right                                                   |
| quads       | quads-left/right                                                                  |
| hamstrings  | hamstrings-lateral/medial-left/right                                              |
| glutes      | gluteus-maximus/medius-left/right                                                 |
| core        | abs-upper/lower-left/right, obliques-left/right                                   |
| calves      | calves-gastroc-medial/lateral-left/right, calves-soleus-left/right                |

---

### 4. Escala de color overlay

Color interpolado según `intensity` (0–1), usando el `status` como punto de referencia:

| Status      | Color          | Hex       | Cuándo                    |
|-------------|----------------|-----------|---------------------------|
| fresh       | verde          | `#10b981` | intensity ≤ 0.15          |
| warming     | cyan           | `#22d3ee` | 0.15 < intensity ≤ 0.40   |
| recovering  | ámbar          | `#f59e0b` | 0.40 < intensity ≤ 0.70   |
| tired       | rojo           | `#ef4444` | intensity > 0.70          |
| sin datos   | gris base      | `#252545` | intensity === null        |

El color se interpola linealmente entre los puntos de corte usando `lerp` en RGB.
`opacity` también varía: `0.6 + intensity * 0.4` — los músculos más cargados son más opacos.

---

### 5. Diferenciación visual respecto a Hevy

**Sweep de entrada** — cuando el contenedor entra en viewport (IntersectionObserver),
los paths hacen fade-in con delay escalonado de 8ms/path (body paths, no foreground paths).
Solo en la primera vez que el viewer es visible en la sesión.

**Tooltip en modo Atleta** — en desktop: `mouseover` sobre path activo muestra chip flotante
`{ nombre del músculo + label }`. En mobile: primer tap muestra tooltip, segundo tap navega.
Implementado como un `<div class="al-tooltip">` absoluto posicionado con las coords del SVG.

**Intensidad continua** — el color no salta entre 4 estados; se interpola suavemente.
Hevy usa colores fijos; esto se siente como un instrumento de medición real.

---

### 6. Integración fatigueHeatmap.js

El SVG artesanal de `fatigueHeatmap.js` desaparece. El módulo:

1. Crea un viewer con `createViewer()`
2. Lo inicializa en el contenedor `#fatigue-anatomy-container` (nuevo en index.html)
3. Transforma sus datos de recovery al formato overlay:

```js
import { createViewer } from './anatomyLens/index.js';

const fatigueViewer = createViewer();
await fatigueViewer.init(document.getElementById('fatigue-anatomy-container'));

const overlayData = Object.keys(RECOVERY_H).map(muscle => {
  const { pct, label } = getStatus(muscle, lastTrained);
  return {
    key:       muscle,
    intensity: pct != null ? (100 - pct) / 100 : null,
    status:    pct >= 100 ? 'fresh'
             : pct >= 75  ? 'warming'
             : pct >= 50  ? 'recovering' : 'tired',
    label,
  };
});

fatigueViewer.setOverlay(overlayData);
```

El SVG artesanal existente y su CSS se eliminan de `fatigueHeatmap.js`.

---

### 7. Integración autoDeload.js

Cuando `shouldDeload === true` y se renderiza la recomendación de descarga, se monta
un viewer compacto que muestra los grupos musculares que contribuyeron a las señales:

```js
import { createViewer } from './anatomyLens/index.js';

async function renderDeloadAnatomy(signals) {
  const container = document.getElementById('deload-anatomy-container');
  if (!container) return;

  const viewer = createViewer();
  await viewer.init(container);

  // signals: { chest: 0.9, back: 0.8, quads: 0.6, ... }
  const overlayData = Object.entries(signals).map(([key, intensity]) => ({
    key,
    intensity,
    status: intensity > 0.7 ? 'tired' : intensity > 0.4 ? 'recovering' : 'warming',
    label:  intensity > 0.7 ? 'Sobrecarga' : 'Volumen alto',
  }));

  viewer.setOverlay(overlayData);
}
```

Los grupos no implicados aparecen en gris base — el contraste visual comunica
exactamente qué músulos causaron la necesidad de descanso.

---

### 8. Cambios en index.html

Dos nuevos contenedores:

```html
<!-- En la sección fatigue heatmap, reemplaza el SVG artesanal actual -->
<div id="fatigue-anatomy-container" class="anatomy-lens-container anatomy-lens-compact"></div>

<!-- En la sección autoDeload, cuando dispara la señal -->
<div id="deload-anatomy-container" class="anatomy-lens-container anatomy-lens-compact"></div>
```

`.anatomy-lens-compact` — variante CSS que reduce el padding y el tamaño del visor para
contextos secundarios (fatigue panel, deload card). Mismo SVG, menos espacio en pantalla.

---

### 9. CSS nuevo en anatomy-lens.css

```css
/* Toggle Vista / Atleta */
.al-mode-toggle { ... }
.al-mode-toggle[data-mode="vista"] .al-mode-atleta { opacity: 0.4; }
.al-mode-toggle[data-mode="atleta"] .al-mode-vista { opacity: 0.4; }

/* Tooltip músculo */
.al-tooltip { position: absolute; pointer-events: none; ... }

/* Compact variant */
.anatomy-lens-compact { padding: 8px 6px 4px; }

/* Sweep animation */
@keyframes al-sweep-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
```

---

## Roadmap Phase B — anatomyService.js

**Cuándo:** cuando el módulo de workout logging (workout sessions + historial) esté implementado.

**Qué cambia:** se añade `frontend/js/anatomyLens/anatomyService.js`. Los módulos dejan
de calcular su propio overlay y se suscriben al servicio.

```
Phase A (hoy):
  fatigueHeatmap.js  →  calcula overlay  →  fatigueViewer.setOverlay()
  autoDeload.js      →  calcula overlay  →  deloadViewer.setOverlay()

Phase B (post workout logging):
  workoutSession.js  →  anatomyService.recordSession(muscles, volume, date)
  health.js          →  anatomyService → computa recovery por músculo
  anatomyService.js  →  emite { key, intensity, status, label }[]
  fatigueHeatmap.js  →  anatomyService.getRecoveryOverlay()  →  viewer.setOverlay()
  autoDeload.js      →  anatomyService.getStressOverlay()    →  viewer.setOverlay()
```

**El contrato de datos no cambia.** El formato `{ key, intensity, status, label }` que
cada módulo produce hoy manualmente es idéntico a lo que anatomyService emitirá.
Migrar Phase A → Phase B = reemplazar el cálculo local por una llamada al servicio.
El viewer no toca una sola línea.

**`anatomyService.js` en Phase B tendrá:**
- `recordSession(sessionData)` — ingesta de datos de workout logging
- `getRecoveryOverlay(options)` — recovery % por músculo con la curva de recuperación
- `getVolumeOverlay(weekOffset)` — volumen semanal por músculo (para planificación)
- `getStressOverlay()` — músculos que acumularon señal de deload

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `frontend/js/anatomyLens/svgViewer.js` | Refactor a factory, overlay mode, EZ→grupos map, tooltip, sweep |
| `frontend/js/anatomyLens/index.js` | Export `createViewer`, retrocompatibilidad default |
| `frontend/css/anatomy-lens.css` | Toggle chip, tooltip, compact variant, sweep animation, color scale |
| `frontend/js/fatigueHeatmap.js` | Eliminar SVG artesanal, importar createViewer, transformar datos |
| `frontend/js/autoDeload.js` | Añadir renderDeloadAnatomy() con createViewer |
| `frontend/index.html` | Dos nuevos contenedores #fatigue-anatomy-container, #deload-anatomy-container |
| `ARCHITECTURE.md` | Sección AnatomyLens v2, roadmap Phase B |
