# Landing Performance + Dashboard Visual Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 4.1 MB Spline chunk from the landing (main perf bottleneck) and polish the dashboard app's visual quality (background depth, stat cards, modal, sidebar active state, welcome card).

**Architecture:** Two independent subsystems. Landing: remove `@splinetool/react-spline` + `@splinetool/runtime` entirely and replace the hero right-panel with a pure CSS animated mesh (radial gradient orbs + subtle grid). Dashboard: CSS-only changes to `main.css` and minimal HTML additions — no new JS dependencies.

**Tech Stack:** Landing — React 18, Vite 5, Tailwind CSS, framer-motion. Dashboard — Vanilla JS SPA, CSS custom properties, Raleway + Lora fonts.

---

## File Map

**Landing (Tasks 1–2):**
| File | Action |
|------|--------|
| `landing/src/components/ui/hero-orbs.tsx` | CREATE — CSS animated mesh panel |
| `landing/src/components/ui/splite.tsx` | DELETE — no longer needed |
| `landing/src/components/demo.tsx` | MODIFY line 2 (remove SplineScene import), line 317 (replace component) |
| `landing/src/index.css` | MODIFY — add hero-orb keyframe + classes |
| `landing/package.json` | MODIFY — remove spline deps, add `"type": "module"` |
| `landing/vite.config.ts` | MODIFY — remove vendor-spline chunk |

**Dashboard (Tasks 3–6):**
| File | Action |
|------|--------|
| `frontend/css/main.css` | MODIFY — body mesh gradient, stat card accents, modal glass, sidebar pill, welcome card |
| `frontend/index.html` | MODIFY — add welcome card HTML in dashboard section |

---

### Task 1: Replace Spline hero with CSS animated mesh

**Files:**
- Create: `landing/src/components/ui/hero-orbs.tsx`
- Modify: `landing/src/index.css`
- Modify: `landing/src/components/demo.tsx`

- [ ] **Step 1: Create `hero-orbs.tsx`**

```tsx
// landing/src/components/ui/hero-orbs.tsx
export function HeroOrbs({ className }: { className?: string }) {
  return (
    <div className={`relative w-full h-full min-h-[500px] overflow-hidden ${className ?? ''}`} aria-hidden>
      <div className="hero-orb-1" />
      <div className="hero-orb-2" />
      <div className="hero-orb-3" />
      <div className="hero-grid-overlay" />
    </div>
  )
}
```

- [ ] **Step 2: Add orb CSS to `landing/src/index.css`** (append before the final closing line)

```css
/* ── Hero orbs (replaces Spline 3D scene) ─────────────────── */
.hero-orb-1, .hero-orb-2, .hero-orb-3 {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.hero-orb-1 {
  width: 480px; height: 480px;
  background: radial-gradient(circle, rgba(8,145,178,0.32) 0%, transparent 70%);
  top: -80px; right: 5%;
  animation: orb-drift 9s ease-in-out infinite;
  filter: blur(60px);
}
.hero-orb-2 {
  width: 320px; height: 320px;
  background: radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%);
  top: 35%; right: 28%;
  animation: orb-drift 12s ease-in-out -4s infinite;
  filter: blur(50px);
}
.hero-orb-3 {
  width: 260px; height: 260px;
  background: radial-gradient(circle, rgba(22,163,74,0.15) 0%, transparent 70%);
  bottom: 8%; right: 8%;
  animation: orb-drift 7s ease-in-out -6s infinite;
  filter: blur(45px);
}
.hero-grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 48px 48px;
  -webkit-mask-image: radial-gradient(ellipse 70% 70% at 60% 50%, black 30%, transparent 100%);
  mask-image: radial-gradient(ellipse 70% 70% at 60% 50%, black 30%, transparent 100%);
}
@keyframes orb-drift {
  0%, 100% { transform: translateY(0px) scale(1); }
  50%       { transform: translateY(-24px) scale(1.06); }
}
@media (prefers-reduced-motion: reduce) {
  .hero-orb-1, .hero-orb-2, .hero-orb-3 { animation: none; }
}
```

- [ ] **Step 3: Update `landing/src/components/demo.tsx`**

Remove the SplineScene import (line 2) and replace the component at line 317.

Remove this line:
```tsx
import { SplineScene }            from '@/components/ui/splite'
```

Add this import instead (alongside the other UI imports):
```tsx
import { HeroOrbs }               from '@/components/ui/hero-orbs'
```

Replace line 317:
```tsx
// BEFORE:
<SplineScene scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="w-full h-full" />

// AFTER:
<HeroOrbs className="w-full h-full" />
```

- [ ] **Step 4: Delete `landing/src/components/ui/splite.tsx`**

```bash
rm landing/src/components/ui/splite.tsx
```

- [ ] **Step 5: Verify the app builds without errors**

```bash
cd landing && npm run build 2>&1 | grep -E "error|Error|vendor-spline|kB"
```

Expected: NO `vendor-spline` chunk in output. Build succeeds. Total JS ≈ 390 KB gzip (down from 1,483 KB).

- [ ] **Step 6: Commit**

```bash
git add landing/src/components/ui/hero-orbs.tsx landing/src/index.css landing/src/components/demo.tsx
git rm landing/src/components/ui/splite.tsx
git commit -m "perf(landing): replace Spline 3D scene with CSS animated mesh — removes 4.1MB chunk"
```

---

### Task 2: Remove Spline deps + clean Vite config

**Files:**
- Modify: `landing/package.json`
- Modify: `landing/vite.config.ts`

- [ ] **Step 1: Remove Spline packages from `landing/package.json`**

In the `"dependencies"` block, delete these two lines:
```json
"@splinetool/react-spline": "^2.2.6",
"@splinetool/runtime": "^0.9.490",
```

Also add `"type": "module"` at the top level (after `"private": true`):
```json
"type": "module",
```

- [ ] **Step 2: Clean the `vendor-spline` chunk from `landing/vite.config.ts`**

In the `manualChunks` function, remove these lines:
```ts
// REMOVE:
if (id.includes('@splinetool')) return 'vendor-spline'
```

Also update the comment block above `manualChunks` — replace the entire comment with:
```ts
/**
 * Manual chunks for long-term caching.
 *   vendor-react   ~142 KB  — React core
 *   vendor-motion  ~105 KB  — framer-motion (hero animations)
 *   vendor-i18n    ~50 KB   — i18next + react-i18next
 *   vendor-lucide  ~5 KB    — Lucide icons (tree-shaken)
 *   index          ~87 KB   — app code
 */
```

Also change `chunkSizeWarningLimit` from 1000 to 500 now that Spline is gone:
```ts
chunkSizeWarningLimit: 500,
```

- [ ] **Step 3: Reinstall deps**

```bash
cd landing && npm install
```

Expected: `@splinetool/react-spline` and `@splinetool/runtime` are NOT in `node_modules`.

- [ ] **Step 4: Final build check — verify sizes**

```bash
cd landing && npm run build 2>&1 | grep -E "\.js|kB|error"
```

Expected output (approximate):
```
vendor-lucide    ~5 kB  │ gzip:   ~1 kB
vendor-i18n     ~50 kB  │ gzip:  ~16 kB
index           ~87 kB  │ gzip:  ~28 kB
vendor-motion  ~105 kB  │ gzip:  ~35 kB
vendor-react   ~142 kB  │ gzip:  ~45 kB
```

No chunk above 500 kB warning. No `vendor-spline` line.

- [ ] **Step 5: Commit**

```bash
git add landing/package.json landing/vite.config.ts landing/package-lock.json
git commit -m "perf(landing): remove @splinetool deps + tighten chunk warning to 500KB"
```

---

### Task 3: Dashboard body mesh gradient

**Files:**
- Modify: `frontend/css/main.css` (`:root` block and `body` block, lines 1–55)

- [ ] **Step 1: Add mesh gradient variables to `:root`**

In `frontend/css/main.css`, inside the `:root { }` block, add after `--transition-slow`:
```css
  --mesh-1: radial-gradient(ellipse 60% 50% at 75% 20%, rgba(8,145,178,0.18) 0%, transparent 65%);
  --mesh-2: radial-gradient(ellipse 45% 40% at 20% 80%, rgba(22,163,74,0.10) 0%, transparent 60%);
  --mesh-3: radial-gradient(ellipse 35% 30% at 90% 70%, rgba(34,211,238,0.08) 0%, transparent 55%);
```

- [ ] **Step 2: Apply mesh via `body::before` pseudo-element**

After the `body { ... }` block (after line 55), add:
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: var(--mesh-1), var(--mesh-2), var(--mesh-3);
  z-index: 0;
  pointer-events: none;
}
```

- [ ] **Step 3: Verify `#bg-canvas` and `body::before` don't conflict**

`#bg-canvas` is already `z-index: 0` and `body::before` is also `z-index: 0`. Make `body::before` sit just below Three.js canvas:

Change the `body::before` z-index line to:
```css
  z-index: -1;
```

- [ ] **Step 4: Verify visually in browser**

Open `http://localhost:3000`. The dashboard background should show subtle teal/green gradient depth instead of flat `#030c0e`.

- [ ] **Step 5: Commit**

```bash
git add frontend/css/main.css
git commit -m "design(dashboard): add CSS mesh gradient to body background for depth"
```

---

### Task 4: Stat card colored top accent + quick-icon size fix

**Files:**
- Modify: `frontend/css/main.css` (stat card section, lines ~306–350)

- [ ] **Step 1: Add `border-top` accent to each stat-icon variant**

Find the four `.stat-icon--*` lines (currently around line 328) and replace with:
```css
.stat-icon--blue   { background: rgba(34,211,238,0.12);  color: var(--secondary); }
.stat-icon--purple { background: rgba(22,163,74,0.12);   color: #16a34a;          }
.stat-icon--cyan   { background: rgba(8,145,178,0.12);   color: var(--primary);   }
.stat-icon--pink   { background: rgba(245,158,11,0.12);  color: #f59e0b;          }
```

(These should already be set from a previous session — verify they're correct, skip if already matching.)

- [ ] **Step 2: Add colored top border to each stat card variant via data attributes**

After the `.stat-card:hover { ... }` block, add:
```css
.stat-card[data-accent="blue"]   { border-top: 2px solid rgba(34,211,238,0.45); }
.stat-card[data-accent="green"]  { border-top: 2px solid rgba(22,163,74,0.45);  }
.stat-card[data-accent="teal"]   { border-top: 2px solid rgba(8,145,178,0.45);  }
.stat-card[data-accent="amber"]  { border-top: 2px solid rgba(245,158,11,0.45); }
```

- [ ] **Step 3: Add `data-accent` attributes to the four stat cards in `frontend/index.html`**

Find the four `.stat-card` divs (they contain `.stat-icon--blue`, `--purple`, `--cyan`, `--pink`).
Add `data-accent` attribute to each:

```html
<!-- Peso stat card -->
<div class="stat-card" data-accent="teal">
  ...stat-icon--cyan...

<!-- Calorías stat card -->
<div class="stat-card" data-accent="blue">
  ...stat-icon--blue...

<!-- Racha stat card -->
<div class="stat-card" data-accent="amber">
  ...stat-icon--pink...

<!-- Nivel stat card -->
<div class="stat-card" data-accent="green">
  ...stat-icon--purple...
```

- [ ] **Step 4: Fix `.quick-icon` size** (currently `font-size: 1.5rem` — but icons are now SVGs, not emoji)

Find `.quick-icon { font-size: 1.5rem; }` and replace:
```css
.quick-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}
.quick-card:hover:not(.quick-card--soon) .quick-icon {
  color: var(--secondary);
}
```

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000` → dashboard. Each stat card should have a colored top line matching its icon color. Quick-action cards show SVG icons correctly sized.

- [ ] **Step 6: Commit**

```bash
git add frontend/css/main.css frontend/index.html
git commit -m "design(dashboard): stat card accent borders + fix quick-icon SVG sizing"
```

---

### Task 5: Auth modal glassmorphism polish

**Files:**
- Modify: `frontend/css/main.css` (modal section, lines ~718–758)

- [ ] **Step 1: Replace the `.modal` block**

Find the current `.modal { background: var(--bg-surface); ... }` block and replace it entirely:

```css
.modal {
  background: rgba(7, 21, 25, 0.92);
  border: 1px solid rgba(34, 211, 238, 0.14);
  border-radius: var(--radius-xl);
  padding: 32px;
  width: 100%;
  max-width: 460px;
  box-shadow:
    0 0 0 1px rgba(8, 145, 178, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.7),
    0 0 80px rgba(8, 145, 178, 0.06) inset;
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.modal::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent);
  pointer-events: none;
}
```

- [ ] **Step 2: Improve `.modal-overlay` scrim**

Replace `.modal-overlay { background: rgba(0,0,0,0.65); ... }`:
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 8, 10, 0.80);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}
```

- [ ] **Step 3: Improve form inputs inside modals**

After `.modal-close:hover { color: var(--text-primary); }` add:
```css
.modal input[type="email"],
.modal input[type="password"],
.modal input[type="text"] {
  width: 100%;
  background: rgba(8, 145, 178, 0.05);
  border: 1px solid rgba(34, 211, 238, 0.15);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: var(--transition);
  margin-bottom: 12px;
}
.modal input:focus {
  outline: none;
  border-color: rgba(8, 145, 178, 0.5);
  background: rgba(8, 145, 178, 0.08);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
}
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3000`, click "Iniciar sesión". The modal should appear with a frosted glass look, cyan top highlight line, and better input fields.

- [ ] **Step 5: Commit**

```bash
git add frontend/css/main.css
git commit -m "design(dashboard): glassmorphism auth modal — frosted glass, cyan accent line, input focus ring"
```

---

### Task 6: Sidebar active pill + dashboard welcome card

**Files:**
- Modify: `frontend/css/main.css` (sidebar section, nav-item block ~lines 140–168)
- Modify: `frontend/index.html` (dashboard section, add welcome card before stats-grid)

- [ ] **Step 1: Add left pill to active nav item**

Find `.nav-item.active { background: var(--primary-light); ... }` and replace:
```css
.nav-item.active {
  background: var(--primary-light);
  color: var(--primary);
  border: 1px solid rgba(8, 145, 178, 0.2);
  position: relative;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
  box-shadow: 0 0 8px var(--primary-glow);
}
```

- [ ] **Step 2: Add welcome card CSS**

At the end of the CSS file (before the `@media` blocks), add:
```css
/* ── WELCOME CARD ──────────────────────────────────────────── */
.welcome-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 24px;
  background: linear-gradient(135deg, rgba(8,145,178,0.10) 0%, rgba(34,211,238,0.05) 100%);
  border: 1px solid rgba(8, 145, 178, 0.18);
  border-radius: var(--radius-lg);
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
}
.welcome-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent);
}
.welcome-greeting {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--primary);
  margin-bottom: 4px;
}
.welcome-name {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
  font-family: 'Lora', Georgia, serif;
}
.welcome-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.welcome-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(245,158,11,0.10);
  border: 1px solid rgba(245,158,11,0.25);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.welcome-badge-icon {
  font-size: 1.2rem;
}
.welcome-badge-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.welcome-badge-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--amber);
  font-weight: 700;
}
.welcome-badge-value {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Add welcome card HTML to dashboard section**

In `frontend/index.html`, find the dashboard section. It starts with `<section id="inicio"` and contains the `.stats-grid`. Add this HTML **immediately before** the `<div class="stats-grid">`:

```html
<!-- Welcome card -->
<div class="welcome-card">
  <div>
    <p class="welcome-greeting" id="welcome-greeting">Buenos días</p>
    <p class="welcome-name" id="welcome-name" data-i18n="dashboard.user">Usuario</p>
    <p class="welcome-sub" data-i18n="dashboard.welcome_sub">Aquí tienes tu resumen de hoy</p>
  </div>
  <div class="welcome-badge">
    <span class="welcome-badge-icon">🔥</span>
    <span class="welcome-badge-text">
      <span class="welcome-badge-label" data-i18n="dashboard.streak_label">Racha</span>
      <span class="welcome-badge-value" id="welcome-streak">—</span>
    </span>
  </div>
</div>
```

- [ ] **Step 4: Wire welcome card greeting + name in `frontend/js/app.js`**

In `app.js`, find the section where the user profile is loaded/displayed (look for `getUser()` or `USER_KEY`). Add this function call after user data is loaded:

```js
function updateWelcomeCard() {
  const user = API.getUser?.() || JSON.parse(localStorage.getItem('hs_user') || 'null');
  const hour = new Date().getHours();
  const greetings = { es: ['Buenas noches','Buenos días','Buenas tardes','Buenas noches'] };
  const lang = localStorage.getItem('i18n_lang') || 'es';
  const g = greetings[lang] || greetings.es;
  const greeting = hour < 6 ? g[0] : hour < 13 ? g[1] : hour < 20 ? g[2] : g[3];

  const greetEl = document.getElementById('welcome-greeting');
  const nameEl  = document.getElementById('welcome-name');
  if (greetEl) greetEl.textContent = greeting;
  if (nameEl && user?.username) nameEl.textContent = user.username;
}
```

Then call `updateWelcomeCard()` inside the existing `init()` or `DOMContentLoaded` handler (wherever user state is applied to the UI).

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000`. Dashboard should show:
- Welcome card with greeting ("Buenos días / Buenas tardes / Buenas noches") + username
- Sidebar active nav item has a glowing left cyan pill indicator

- [ ] **Step 6: Commit**

```bash
git add frontend/css/main.css frontend/index.html frontend/js/app.js
git commit -m "design(dashboard): sidebar active pill, welcome card with greeting + streak badge"
```

---

## Self-Review

**Spec coverage:**
- ✅ Landing perf: Spline 4.1MB removed (Tasks 1–2)
- ✅ Landing perf: package.json cleaned, vite config cleaned (Task 2)
- ✅ Dashboard visual: body mesh gradient (Task 3)
- ✅ Dashboard visual: stat card accents + quick-icon fix (Task 4)
- ✅ Dashboard visual: modal glassmorphism (Task 5)
- ✅ Dashboard visual: sidebar pill + welcome card (Task 6)

**Placeholder scan:** All code blocks are complete. No TBDs.

**Type consistency:** No TypeScript types shared between tasks. `updateWelcomeCard()` references `API.getUser?.()` with optional chaining as safe fallback.

**One gap found and addressed:** Task 4 Step 3 requires reading `index.html` to find the correct `.stat-card` divs — the implementer must read the file first before adding `data-accent` attributes to ensure correct mapping to icon classes.
