# Mobile Navigation & UX — HealthStack Pro
**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Full mobile UX overhaul — navigation system + per-section adaptations

---

## 1. Objetivo

La SPA actual es responsive pero expone en móvil solo 5 tabs (Hoy, Gym, Comida, IA, Perfil) mientras que el escritorio tiene ~19 secciones. El objetivo es hacer **todas las funcionalidades disponibles en móvil** (excepto Comunidad, que se elimina globalmente) con una navegación agrupada, ergonómica y coherente.

---

## 2. Arquitectura de navegación

### Componente: `mobileNav.js`

Nuevo módulo JS dedicado que solo se inicializa en móvil (≤768px). No modifica el sidebar existente de escritorio. Se comunica con `app.js` mediante:
- Llama a `showSection(id)` (función existente en `app.js`)
- Escucha `CustomEvent('hs:section-change', { detail: { id } })` para sincronizarse cuando `app.js` cambia de sección por cualquier otro medio

### Layout

```
┌─────────────────────────────┐
│  Contenido (scroll)          │
├─────────────────────────────┤
│  Sub-tabs bar — 44px         │  ← scrollable horizontal, aparece solo si el tab tiene sub-secciones
├─────────────────────────────┤
│  Tab bar principal — 56px    │  ← siempre visible (excepto en chatbot)
└─────────────────────────────┘
```

El contenido ocupa `calc(100vh - 56px - 44px)` cuando hay sub-tabs, `calc(100vh - 56px)` cuando no.

---

## 3. Estructura de grupos y tabs

| Tab | Icono | Sub-secciones |
|-----|-------|---------------|
| **Hoy** | 🏠 | — (resumen del día, sin sub-tabs) |
| **Gym** | 🏋️ | Workout · Rutinas · Records · Replay · Deload |
| **Nutrición** | 🥗 | Macros · Planner · Suplementos · Timing · Peso · Composición |
| **IA** | 🤖 | Chatbot · Coach · Fatiga · Estancamiento |
| **Perfil** | 👤 | Logros · Ranked · Historial · Recibo |

**Comunidad**: eliminada de la app completa (móvil y escritorio).

### Comportamiento de sub-tabs

- Al tocar un tab principal sin sub-tabs (Hoy): navega directamente a la sección
- Al tocar un tab principal con sub-tabs: activa el primer sub-tab y muestra la sub-tab bar
- La sub-tab bar es un scroll horizontal de chips (pill buttons) de 32px de alto
- El sub-tab activo se mueve al viewport automáticamente (scrollIntoView)
- Estado persistido en `sessionStorage` para restaurar la última sub-sección al volver al tab

---

## 4. Adaptaciones por sección

### 4.1 Grupo GYM

#### Workout (entrenamiento activo)
- Lista vertical de ejercicios en acordeón: toca cabecera para expandir sets
- Cada fila de set: 3 inputs táctiles (peso / reps / ✓) — altura mínima 44px
- FAB `+` en bottom-right (80px desde el bottom nav) para añadir set
- Rest timer: overlay full-screen con círculo de cuenta atrás + vibración API al finalizar
- Botón "Terminar entreno" sticky encima del nav (bottom: 56px)

#### Rutinas (generador + visor 3D)
- Visor 3D: bloque full-width, 220px de alto fijo, controles de rotación con touch
- Quiz de generación: stepper vertical de 4 pasos (un paso por pantalla), avance con botón "Siguiente" en bottom
- Lista de rutinas: cards apiladas, expandibles con `▸` para ver ejercicios

#### Records (PRs)
- Tabla reducida a 3 columnas: ejercicio / peso / fecha
- Swipe-left en fila → botón "Editar" visible (color primario)
- Añadir PR: bottom sheet con 3 campos (ejercicio, peso, fecha)
- Chips horizontales scrollables para filtrar por grupo muscular

#### Session Replay
- Timeline horizontal scrollable tipo player con puntos de set clicables
- Gráfico RPE/carga: full-width, 1 línea (simplificado vs escritorio)
- Botón "Compartir": Web Share API nativa

#### Auto Deload
- Tarjeta de estado con semáforo visual (verde/amarillo/rojo) + texto explicativo
- Botón "Activar deload manual" si el sistema lo recomienda

---

### 4.2 Grupo NUTRICIÓN

#### Nutrición (macro calc + TDEE)
- Sub-tabs propios dentro del contenido: TDEE · Macros · Timing · Recetas
- TDEE: formulario 1 columna, resultado en tarjeta destacada al final del form
- Macros: dónut full-width 200px + leyenda en grid 2×2 debajo
- Timing: tabla 3 columnas compacta (momento / macros / kcal)
- Recetas: grid 2 columnas de cards con imagen

#### Planner semanal
- Vista semana: scroll horizontal, cada día = columna de 48px
- Interacción: tap en celda vacía → bottom sheet "Añadir comida" con buscador de recetas
- Tap en comida existente → opciones inline: mover a otro día / eliminar
- **Sin drag-and-drop** (inutilizable en touch) → reemplazado por tap-to-assign

#### Suplementos
- Lista de cards con toggle ON/OFF prominente
- FAB `+` para nuevo suplemento
- Detalle del suplemento: bottom sheet con campos dosis / frecuencia / notas

#### Timing Planner
- Cronograma como lista vertical ordenada por franja horaria
- Tap en franja → editar inline (campo de hora + descripción)

#### Peso (Weight Tracker)
- Gráfico de línea full-width con touch pan/zoom (Chart.js)
- Input de peso del día: campo sticky en top de la sección
- Historial: tabla 3 columnas debajo del gráfico (fecha / peso / Δ)

#### Composición Corporal (Body Comp Forecast)
- Gráfico de proyección full-width
- Controles: sliders apilados verticalmente (déficit kcal, proteína g/kg, semanas)
- Resultado: tarjeta resumen con masa magra proyectada y fecha objetivo

---

### 4.3 Grupo IA

#### Chatbot
- **Pantalla completa** al activar: nav inferior se oculta (`display:none`)
- Layout: `100vh` con `padding-bottom` dinámico vía `window.visualViewport` (evita jumping de teclado iOS)
- Historial de mensajes: scroll vertical con burbuja propia (derecha) y asistente (izquierda)
- Input: sticky en bottom, botón enviar a la derecha
- Botón `← Volver` en top-left restaura el nav inferior

#### AI Coach / Insights
- Cards de insight apiladas verticalmente, una por recomendación
- Cada card: icono + título + texto expandible con "Leer más"

#### Fatigue Heatmap
- Mapa de calor 7 columnas (días) × N filas (músculos), full-width
- Celdas mínimo 36px de ancho — legibles en móvil
- Tap en celda → tooltip con valor exacto + recomendación

#### Plateau Radar
- Gráfico radar full-width (280px de alto)
- Ejes etiquetados con texto corto (abreviado si hace falta)
- Leyenda debajo del gráfico

---

### 4.4 Grupo PERFIL

#### Gamificación
- Hero card full-width: avatar + nivel + XP + barra de progreso (160px de alto aprox.)
- Badges: grid 4 columnas, iconos 56px
- Desafíos activos: lista vertical de cards con barra de progreso individual

#### Ranked / Gym Servers
- Leaderboard: lista vertical (rank / avatar / nombre / LP)
- Tu posición: card sticky en top del scroll con fondo distinto
- Buscar gym: modal full-screen con input de búsqueda y resultados en lista

#### Historial de ejercicios
- Lista vertical de sesiones con fecha + duración
- Expandible para ver ejercicios de esa sesión

#### Athlete Receipt
- Tarjeta de recibo centrada, scroll vertical
- Botón "Compartir como imagen" → Web Share API con canvas generado

---

## 5. Principios transversales

| Patrón escritorio | Adaptación móvil |
|---|---|
| Tablas multi-columna | 2-3 cols + swipe para acciones |
| Drag & drop | Tap-to-assign + long-press para reordenar |
| Gráficos multipanel | Un gráfico full-width, paneles secundarios debajo |
| Formularios 2 columnas | 1 columna, inputs ≥44px de alto (WCAG touch target) |
| Teclado virtual tapa contenido | `visualViewport` listener en chatbot |
| Modales de escritorio | Bottom sheets (65% height, swipe-to-close con handle) |
| Tooltips hover | Tap para abrir, tap fuera para cerrar |
| Sidebar de escritorio | Oculto en móvil, reemplazado por mobileNav.js |

---

## 6. Detalles técnicos

### Detección de dispositivo
```javascript
// mobileNav.js — solo se inicializa si ≤768px
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
if (!isMobile()) return;
```

### Sincronización con app.js
```javascript
// mobileNav.js escucha cambios externos
window.addEventListener('hs:section-change', e => setActiveTab(e.detail.id));

// app.js emite evento al cambiar sección
function showSection(id) {
  // ... lógica existente ...
  window.dispatchEvent(new CustomEvent('hs:section-change', { detail: { id } }));
}
```

### Bottom sheets
- Clase CSS `.bottom-sheet` con `transform: translateY(100%)` por defecto
- `.bottom-sheet.open` con `transform: translateY(0)` + `transition: transform 0.3s ease`
- Handle visual (barra de 32×4px centrada) para indicar swipe-to-close
- Overlay semitransparente que cierra al tocar

### Chatbot keyboard-aware
```javascript
// Ajuste dinámico cuando aparece teclado virtual
window.visualViewport?.addEventListener('resize', () => {
  const chatInput = document.querySelector('.chat-input-bar');
  if (chatInput) {
    chatInput.style.bottom = `${window.innerHeight - window.visualViewport.height}px`;
  }
});
```

### Service Worker
- Bump de versión de caché requerido tras implementar mobileNav.js
- `mobileNav.js` se añade a `STATIC_ASSETS` en `sw.js`

---

## 7. Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `frontend/js/mobileNav.js` | **NUEVO** — componente completo de navegación móvil |
| `frontend/css/main.css` | Añadir estilos: `.bottom-nav`, `.sub-tab-bar`, `.bottom-sheet`, `.fab`, `.chat-fullscreen`, ajustes por sección |
| `frontend/js/app.js` | Emitir `hs:section-change`, eliminar lógica de Community |
| `frontend/index.html` | Añadir `<script src="/js/mobileNav.js">`, eliminar referencias a Community |
| `frontend/sw.js` | Añadir `mobileNav.js` a STATIC_ASSETS, bump versión caché |
| `frontend/js/planner.js` | Reemplazar drag-drop por tap-to-assign para mobile |
| `frontend/js/chatbot.js` | Añadir lógica keyboard-aware + ocultar/restaurar nav |

---

## 8. Fuera de alcance

- Rediseño de las secciones de escritorio (sin cambios en desktop)
- Backend: ningún cambio necesario
- Comunidad: se elimina tanto en móvil como en escritorio (requiere limpieza en `app.js` y `index.html`)
- Tests E2E de mobile (deseable pero no incluido en este sprint)
