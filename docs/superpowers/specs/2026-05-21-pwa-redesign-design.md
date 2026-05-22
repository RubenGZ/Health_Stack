# HealthStack Pro — PWA Redesign: High-Tech Fitness Aesthetic
**Fecha:** 2026-05-21  
**Estado:** Aprobado por usuario  
**Rama:** movil-PWA

---

## Objetivo

Llevar la PWA de estado "pre-alpha visible" a calidad de empresa High Tech con estética fitness premium (referencia: Whoop/Oura). Tres capas independientes y desplegables, cada una shippable por sí sola.

---

## Capa 1 — Cirugía estructural

### Eliminar completamente

| Elemento | Archivo | Motivo |
|----------|---------|--------|
| `<footer class="app-footer">` | `index.html` línea ~1195 | Footer de página web en una PWA móvil fullscreen. Incongruente. |
| `<script defer src="js/components/feedbackWidget.js">` | `index.html` línea ~1572 | Widget de feedback no apto para producción |
| `perfil-feedback-btn` | `index.html` | Botón de feedback en sección Perfil |
| `"v28 · Alpha"` — `perfil-footer-version` | `index.html` | Etiqueta alpha nunca visible en producción |
| `sponsor-banner` con `ca-pub-XXXXXXXXXXXXXXXX` | `index.html` línea ~432 | Placeholder AdSense visible = peor que no tener anuncios |

### Modificar

| Elemento | Cambio |
|----------|--------|
| `adjustment-icon` emoji `📊` | Reemplazar por SVG inline: icono de flecha-tendencia |
| `perfil-footer-card` | Conservar links Privacidad/Términos. Eliminar feedback btn y versión alpha. |
| `app-footer` CSS | Eliminar todas las reglas `.app-footer`, `.footer-*` de `main.css` |

### Conservar

- `pwa-install-banner` (oculto por defecto, funcional cuando aplica)
- `adjustment-banner` contenedor (la funcionalidad es correcta, solo cambiar el icono)
- Links Privacidad/Términos en perfil

---

## Capa 2 — Tipografía + sistema de color

### Tipografía

**Eliminar:** Lora (serif) + Raleway. Combo incorrecto para app de datos fitness.

**Nuevo stack:** Inter → system-ui → -apple-system → sans-serif

```html
<!-- En <head> de index.html — reemplazar las Google Fonts actuales -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

**Regla global en main.css:**
```css
* { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
```

**Números métricos** (peso, calorías, XP, series, macros):
```css
.metric-value, .stat-value, .wstat-value, [class*="-count"], [class*="-number"] {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
```

**Escala tipográfica — solo 4 tamaños:**
```css
--hs-text-xs:   11px;   /* meta, labels, badges */
--hs-text-sm:   13px;   /* body, subtítulos */
--hs-text-base: 15px;   /* texto destacado */
--hs-text-lg:   20px;   /* títulos de sección */
```

### Sistema de color (CSS custom properties)

Definir en `:root` en `main.css`. Reemplazar todos los valores hardcodeados.

```css
:root {
  /* Fondos */
  --hs-bg:         #07070f;
  --hs-surface:    #0f0f1a;
  --hs-surface-2:  #161626;

  /* Bordes */
  --hs-border:     rgba(255, 255, 255, 0.07);
  --hs-border-2:   rgba(255, 255, 255, 0.12);

  /* Texto */
  --hs-text:       #e2e8f0;
  --hs-text-2:     rgba(255, 255, 255, 0.45);
  --hs-text-3:     rgba(255, 255, 255, 0.25);

  /* Acento */
  --hs-accent:     #7c6bff;
  --hs-accent-dim: rgba(124, 107, 255, 0.15);

  /* Semánticos */
  --hs-success:    #22c55e;
  --hs-danger:     #ef4444;
  --hs-warning:    #f59e0b;

  /* Border radius */
  --hs-r-sm:  8px;
  --hs-r-md:  12px;
  --hs-r-lg:  16px;
  --hs-r-xl:  20px;
  --hs-r-full: 9999px;

  /* Spacing base 4px */
  --hs-sp-1: 4px;
  --hs-sp-2: 8px;
  --hs-sp-3: 12px;
  --hs-sp-4: 16px;
  --hs-sp-5: 20px;
  --hs-sp-6: 24px;
  --hs-sp-8: 32px;
}
```

### Eliminación de emojis

Archivos con emojis a limpiar (por impacto):

| Archivo | Emojis aprox. | Acción |
|---------|--------------|--------|
| `js/i18n.js` | 25 | Eliminar emojis de todas las strings de traducción |
| `js/gamification.js` | 7 | Reemplazar emojis de badges/logros por SVG o texto |
| `js/community.js` | 6 | Eliminar de posts/cards |
| `js/config.js` | 11 | Eliminar de nombres de configuración |
| `js/exercises.js` | 5 | Eliminar de grupos musculares |
| `js/app.js` | 5 | Eliminar de mensajes de sistema |
| `js/routineGenerator.js` | 6 | Eliminar — quedan iconos SVG existentes |
| `js/timingPlanner.js` | 5 | Eliminar |
| `js/workoutLogger.js` | 1 | Ya reducido — eliminar el restante |
| `index.html` | 3 | Eliminar inline |

**Regla:** si el emoji era meramente decorativo → eliminar. Si aportaba significado semántico → reemplazar por SVG inline de 16×16.

---

## Capa 3 — Componentes

### Cards

```css
.card {
  background: var(--hs-surface);
  border: 1px solid var(--hs-border);
  border-radius: var(--hs-r-lg);
  padding: var(--hs-sp-4);        /* 16px móvil */
}
@media (min-width: 769px) {
  .card { padding: var(--hs-sp-5); }   /* 20px desktop */
}
.card:hover {
  border-color: var(--hs-border-2);
  transition: border-color 0.2s ease;
}
```

Eliminar todas las variantes de padding inconsistentes (`.card` con `padding: 8px`, `padding: 12px`, `padding: 24px`).

### Botones — 3 variantes únicas

```css
.btn {
  height: 40px;
  padding: 0 16px;
  border-radius: var(--hs-r-md);
  font-size: var(--hs-text-sm);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}
.btn--sm   { height: 34px; padding: 0 12px; font-size: var(--hs-text-xs); }
.btn--primary { background: var(--hs-accent); color: #fff; border: none; }
.btn--primary:hover { opacity: 0.88; }
.btn--ghost {
  background: transparent;
  border: 1px solid var(--hs-border);
  color: var(--hs-text-2);
}
.btn--ghost:hover { border-color: var(--hs-border-2); color: var(--hs-text); }
.btn--danger { background: var(--hs-danger); color: #fff; border: none; }
```

Eliminar variantes: `btn--accent`, `btn--outline`, `btn--secondary` (consolidar en las 3 anteriores).

### Stat cards del dashboard

```css
.stat-card .stat-value {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-card .stat-label {
  font-size: var(--hs-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--hs-text-2);
  margin-bottom: 4px;
}
```

### Chips / tabs

```css
.chip {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--hs-r-sm);
  font-size: var(--hs-text-xs);
  font-weight: 600;
  border: 1px solid var(--hs-border);
  color: var(--hs-text-2);
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.chip--active, .chip:hover {
  background: var(--hs-accent-dim);
  border-color: var(--hs-accent);
  color: var(--hs-text);
}
```

### Section headers

```css
.section-header {
  padding-bottom: var(--hs-sp-4);
  border-bottom: 1px solid var(--hs-border);
  margin-bottom: var(--hs-sp-4);
}
.section-title {
  font-size: var(--hs-text-lg);
  font-weight: 600;
  letter-spacing: -0.3px;
}
.section-subtitle {
  font-size: var(--hs-text-sm);
  color: var(--hs-text-2);
  margin-top: 2px;
}
```

### Estados vacíos

Patrón único para todos los empty states:
```html
<div class="empty-state">
  <svg class="empty-state-icon" .../>   <!-- SVG existente, sin emoji -->
  <p class="empty-state-text">Mensaje neutral en --hs-text-2</p>
  <button class="btn btn--primary btn--sm">CTA acción</button>
</div>
```

```css
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 48px 24px; text-align: center;
}
.empty-state-icon { opacity: 0.25; }
.empty-state-text { font-size: var(--hs-text-sm); color: var(--hs-text-2); }
```

### Mobile nav — consistencia

- Subtab chips: `height: 28px`, padding `0 10px`
- Tab activo: icono en `var(--hs-accent)`, label en `var(--hs-text)`
- Tab inactivo: icono y label en `var(--hs-text-2)`

---

## Archivos afectados

| Archivo | Capas | Tipo de cambio |
|---------|-------|----------------|
| `frontend/index.html` | 1, 2 | Eliminar footer/banners, cambiar fuente |
| `frontend/css/main.css` | 2, 3 | CSS custom properties, tipografía, componentes |
| `frontend/js/i18n.js` | 2 | Eliminar emojis de strings |
| `frontend/js/gamification.js` | 2 | Eliminar/reemplazar emojis |
| `frontend/js/community.js` | 2 | Eliminar emojis |
| `frontend/js/config.js` | 2 | Eliminar emojis |
| `frontend/js/exercises.js` | 2 | Eliminar emojis |
| `frontend/js/app.js` | 2 | Eliminar emojis |
| `frontend/js/routineGenerator.js` | 2 | Eliminar emojis residuales |
| `frontend/js/timingPlanner.js` | 2 | Eliminar emojis |
| `frontend/js/workoutLogger.js` | 2 | Eliminar emoji restante |
| `frontend/js/components/feedbackWidget.js` | 1 | No se carga (script tag eliminado) |
| `frontend/sw.js` | — | Bump a v33 tras todos los cambios |

---

## Criterios de aceptación

- [ ] No aparece ninguna etiqueta "Alpha", "ALPHA" o número de versión visible al usuario
- [ ] No hay ningún footer visible en la app
- [ ] No hay ningún placeholder de AdSense visible (`XXXXXXXXXXXXXXXX`)
- [ ] No hay ningún emoji en la UI (excepto avatares de usuario si los hay)
- [ ] Fuente Inter cargada y aplicada en todos los elementos
- [ ] CSS custom properties `--hs-*` definidas y usadas en al menos cards, botones, chips, section headers
- [ ] Todos los `.card` con padding y border consistentes
- [ ] Botones solo en 3 variantes: primary, ghost, danger
- [ ] Service Worker bumped a v33
