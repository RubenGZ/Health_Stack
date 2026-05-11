# HealthStack Pro — Mobile Frontend Design Spec
**Fecha:** 2026-05-08 | **Rama:** feat/mobile | **Estado:** Aprobado

---

## 1. Alcance

Dos entregas paralelas e independientes:

| Entrega | Carpeta | Descripción |
|---------|---------|-------------|
| Landing responsive | `landing/` | Mejoras de mobile UX en el landing existente. Sin nueva carpeta. |
| App móvil | `frontend-mobile/` | Nueva SPA React+Vite+Tailwind mobile-only. No toca `frontend/`. |

---

## 2. Principios de aislamiento

- `frontend/` (desktop vanilla JS) — **no se toca en ningún caso**
- `landing/` — solo se modifican `src/components/demo.tsx` y `src/index.css`
- `frontend-mobile/` — proyecto React completamente independiente con su propio `package.json`, puerto 5175 y PWA manifest separado
- Los tres proyectos tienen su propio ciclo de deploy

---

## 3. Landing — Mejoras responsive

### Problemas a resolver

| Problema | Archivo | Fix |
|----------|---------|-----|
| Hero orbs 480px fijos | `index.css` | `min(480px, 90vw)` + opacity reducida en móvil |
| SplineScene carga 3D en móvil | `demo.tsx` | `hidden md:block` — solo desktop |
| ShaderAnimation + ContainerScroll WebGL | `demo.tsx` | `isMobile` → imagen estática en <768px |
| Nav sin hamburguesa funcional | `demo.tsx` | Drawer lateral con `vaul` en móvil |
| Features grid-cols-3 fija | `demo.tsx` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Pricing tarjetas en fila | `demo.tsx` | `flex-col md:flex-row` |
| CTA buttons tamaño fijo | `demo.tsx` | `w-full sm:w-auto` |

### Criterio de éxito landing
- LCP en móvil 3G < 2.5s (desde ~5s actual)
- Sin scroll horizontal en ningún breakpoint
- Nav funcional en 360px

---

## 4. App móvil — frontend-mobile/

### Stack
- React 18 + Vite + TypeScript
- Tailwind CSS (dark theme, mismo sistema de tokens que landing)
- shadcn/ui (componentes headless)
- `vaul` — bottom sheets
- Zustand — estado global
- React Router v6 — navegación

### Estructura de carpetas

```
frontend-mobile/
  src/
    components/
      ui/           ← shadcn/ui
      layout/       ← BottomTabBar, TopBar, PageShell
      shared/       ← componentes reutilizables
    screens/
      auth/         ← Login, Register, Onboarding (3 pasos)
      today/        ← Dashboard, WeightLog
      train/        ← Routines, Exercises, AIRoutine, ActiveWorkout
      nutrition/    ← DayPlanner, MyRecipes, TDEE, Supplements
      profile/      ← Stats, Gamification, Community, AICoach
    services/       ← TypeScript wrappers del backend API
      api.ts        ← fetch base + JWT interceptor
      auth.ts
      health.ts
      routines.ts
      nutrition.ts
      gamification.ts
    hooks/
      useAuth.ts
      useOffline.ts
    store/
      authStore.ts
      todayStore.ts
      trainStore.ts
      nutritionStore.ts
      gamificationStore.ts
    lib/
      utils.ts
    styles/
      globals.css
  public/
    manifest.json   ← PWA mobile
    sw.js
  package.json
  vite.config.ts    ← puerto 5175
  tailwind.config.js
  tsconfig.json
```

### Navegación

```
/ (auth guard)
├── /auth/login
├── /auth/register
├── /auth/onboarding
└── /app (BottomTabBar siempre visible)
    ├── /app/today        → Tab "Hoy"
    │   ├── dashboard
    │   └── weight-log
    ├── /app/train        → Tab "Gym"
    │   ├── routines
    │   ├── exercises
    │   ├── ai-routine
    │   └── active-workout
    ├── /app/nutrition    → Tab "Comida"
    │   ├── planner       ← day picker + bottom sheet recetas
    │   ├── my-recipes
    │   ├── tdee
    │   └── supplements
    └── /app/profile      → Tab "Perfil"
        ├── stats
        ├── gamification
        ├── community
        └── ai-coach
```

### Bottom Tab Bar

| Tab | Label | Icono | Secciones internas |
|-----|-------|-------|-------------------|
| today | Hoy | HomeIcon | Dashboard, Peso |
| train | Gym | DumbbellIcon | Rutinas, Ejercicios, IA, Workout activo |
| nutrition | Comida | UtensilsIcon | Planner, Recetas, TDEE, Suplementos |
| profile | Perfil | UserIcon | Stats, Gamificación, Comunidad, AI Coach |

Specs técnicas del tab bar:
- Área táctil mínima: 48×48px
- Safe area: `pb-[env(safe-area-inset-bottom)]`
- Fuente label: 11px font-medium
- Icono: 24px
- Activo: icono filled + label `text-cyan-600`
- Inactivo: icono outline + label `text-zinc-500`
- Fondo: `bg-zinc-950/95 backdrop-blur-md`

### Planner de comidas — interacción móvil

- Vista por día (selector horizontal L/M/X/J/V/S/D)
- Swipe izquierda/derecha para cambiar de día
- "+ Añadir" en cada slot → bottom sheet con recetas filtradas
- Vista semanal → botón "📊 Semana" → pantalla de resumen compacto
- Sin drag & drop — reemplazado por tap-to-add

### Onboarding — 3 pasos (primer acceso)

1. Objetivo (perder grasa / ganar músculo / mantener / rendimiento)
2. Cuerpo (peso, altura, edad)
3. Días de entrenamiento (2-6)

Al completar: genera TDEE + rutina sugerida automáticamente. Flag `hs_onboarded` en localStorage.

### PWA

- `manifest.json` separado de `frontend/manifest.json`
- `start_url`: `/mobile/`
- `display`: `standalone`
- `theme_color`: `#0891b2`
- Service Worker con cache estratégico (stale-while-revalidate para API, cache-first para assets)

### Diseño visual

- Dark theme: `bg-zinc-950` base, `bg-zinc-900` cards
- Acento: cyan `#0891b2` (mismo que frontend desktop y landing)
- Tipografía: Lora (headings) + Raleway (body) — mismas que el proyecto
- Glassmorphism en bottom bar y top bar: `backdrop-blur-md bg-zinc-950/95`
- Sin Three.js / sin canvas 3D — rendimiento mobile-first

---

## 5. Repositorio — Estructura de ramas

```
main              ← producción, no se toca directamente
feat/mobile       ← esta rama — landing responsive + frontend-mobile/
```

El merge a `main` se hace vía PR después de QA manual en móvil real.

---

## 6. Criterios de éxito

| Criterio | Verificación |
|----------|-------------|
| Landing sin scroll horizontal en 360px | DevTools mobile emulation |
| Landing LCP < 2.5s en 3G | Lighthouse mobile |
| Bottom tab bar visible y funcional | QA en Chrome móvil |
| Planner: añadir receta con tap | QA flujo completo |
| Onboarding: 3 pasos → dashboard con datos | QA primer acceso |
| `frontend/` sin ningún cambio | `git diff main -- frontend/` vacío |
| `backend/` sin ningún cambio | `git diff main -- backend/` vacío |
