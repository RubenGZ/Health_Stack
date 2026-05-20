# Diseño: Rediseño Visual MVP — HealthStack Pro PWA Móvil
**Fecha:** 2026-05-21  
**Rama:** movil-PWA  
**Alcance:** Opción A — Cirugía limpia (MVP)

---

## Objetivo

Lavar la imagen visual de la PWA móvil para que parezca hecha por un equipo profesional. Sin emojis decorativos innecesarios, sin elementos que bloqueen la navegación, con transiciones fluidas y un onboarding estructurado post-login. El sistema de diseño existente (dark, teal #0891b2, glassmorphism, Raleway+Lora) se mantiene intacto.

---

## Sección 1 — Limpieza de Emojis Decorativos

### Qué sale
- Emojis en opciones de cuestionarios (routineGenerator, onboarding, timingPlanner)
- Emojis en banners de sección (`section-subtitle-banner`)
- Emojis aleatorios en outputs de IA sin contexto (⚡, caritas, etc.)
- Emoji `⚡` en el botón "Generar horario óptimo"

### Qué se queda
- ✅/❌ en validaciones funcionales
- Iconos de acción en botones (guardar, eliminar) — aportan contexto rápido
- SVG thin-line icons en la navbar (ya existentes)

### Criterio
Si el emoji no añade información que el texto no da ya → fuera.

---

## Sección 2 — Footer y Feedback → Perfil

### Cambios en móvil
- `#app-footer` oculto con `display: none` en `@media (max-width: 768px)`
- Banner "Dar Feedback ALPHA" (`feedbackWidget.js`) eliminado del layout principal en móvil

### Nuevo bloque en sección Perfil
Al final del scroll de Perfil, una card discreta con:
- Dos botones pill sin relleno (borde fino): `Privacidad` · `Términos`
- Botón circular pequeño de feedback con icono bocadillo → abre el widget existente
- Texto de versión: `v27 · Alpha` en `var(--text-muted)`

Agrupado en una `.card` suave, no prominente, después del contenido principal.

---

## Sección 3 — Transiciones Profesionales

### Variables CSS nuevas
```css
--dur-fast: 150ms;
--dur-base: 220ms;
--ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
```

### Cambio de sección
Cuando `navigateTo()` cambia de sección:
```css
.section { opacity: 0; transform: translateY(10px); }
.section.section--visible {
  opacity: 1;
  transform: translateY(0);
  transition: opacity var(--dur-base) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
}
```
La clase `section--visible` se añade en `app.js` tras activar la sección.

### Cards con scroll reveal
`IntersectionObserver` en `.card` elements: fade+slide al entrar en viewport.
```css
.card { opacity: 0; transform: translateY(8px); transition: ... }
.card.card--revealed { opacity: 1; transform: none; }
```
Stagger de 60ms entre cards consecutivas para efecto en cascada.

### Nav activo
Tab activo en `#mobile-bottom-nav`: transición de color en 150ms + indicador top (línea de 2px en `var(--primary)`) que aparece con `transform: scaleX(0→1)`.

### Estados interactivos de botones
```css
.btn:active { transform: scale(0.97); transition: transform var(--dur-fast); }
```
Ripple sutil en color primario con `::after` pseudo-elemento radial-gradient.

---

## Sección 4 — Onboarding Post-Login

### Flujo completo
```
Visita → Auth Gate → Login/Registro → [check hs_tdee] → Onboarding (si nuevo) → App
```

### Trigger
En `auth.js` / `auth-gate.js`, tras login/registro exitoso:
```javascript
const hasOnboarding = localStorage.getItem('hs_tdee');
if (!hasOnboarding) {
  Onboarding.show(); // modal full-screen
} else {
  navigateTo('dashboard');
}
```

### Modal de onboarding
- Full-screen overlay (`position: fixed, inset: 0`) sobre la app
- Barra de progreso top: `paso X de 5` con fill animado
- Transición entre pasos: slide horizontal (`translateX(-100%→0)` siguiente paso)
- Botón "Omitir por ahora" en paso 1 (texto, no prominente)
- Al completar: animación checkmark + `opacity 1→0` del overlay en 400ms → app visible

### Re-trigger si omitido
Banner discreto en sección "Hoy" (una línea, pill style):
> "Completa tu perfil para personalizar tus macros →"

Se elimina permanentemente si el usuario hace clic en "×" o completa el onboarding.

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `frontend/css/main.css` | Variables `--dur-*`, section transitions, card reveal, button states, footer hide, nav indicator |
| `frontend/js/app.js` | Añadir clase `section--visible` en `navigateTo()`, IntersectionObserver para cards |
| `frontend/js/onboarding.js` | Convertir a modal full-screen, añadir progress bar, slide entre pasos |
| `frontend/js/auth-gate.js` | Post-login check → trigger onboarding si no hay TDEE |
| `frontend/index.html` | Mover footer links a sección Perfil, ajustar estructura Perfil |
| `frontend/js/components/feedbackWidget.js` | Ocultar FAB en móvil, lógica de botón circular en Perfil |
| `frontend/js/routineGenerator.js` | Quitar emojis decorativos de opciones |
| `frontend/js/timingPlanner.js` | Quitar emojis decorativos de opciones |
| `frontend/sw.js` | Bumpar a v28 |

---

## Criterios de éxito

- [ ] Ningún emoji decorativo visible en cuestionarios o banners de sección
- [ ] El footer no se ve en móvil en ninguna sección
- [ ] El banner "Dar Feedback ALPHA" no bloquea la navegación inferior
- [ ] Al hacer login/registro sin TDEE guardado, aparece el onboarding modal
- [ ] Las transiciones de sección son visibles y suaves (220ms)
- [ ] Las cards hacen reveal al hacer scroll
- [ ] El tab activo de la nav tiene indicador visual animado
- [ ] Los botones responden con scale al presionar
