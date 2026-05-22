/* ============================================================
   themeManager.js — Sistema de temas HealthStack Pro
   Gestiona la selección y persistencia de los 3 temas visuales.

   Temas disponibles:
     'forge'    — Dorado + negro profundo (default)
     'midnight' — Azul eléctrico + negro OLED
     'aurora'   — Violeta + negro cósmico

   Uso:
     ThemeManager.set('midnight')   // cambia tema
     ThemeManager.get()             // → 'midnight'
     ThemeManager.init()            // aplica tema guardado al arrancar
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY   = 'hs_theme';
  const VALID_THEMES  = ['forge', 'midnight', 'aurora'];
  const DEFAULT_THEME = 'forge';

  // ── Core ────────────────────────────────────────────────────
  function _apply(theme) {
    const t = VALID_THEMES.includes(theme) ? theme : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', t);

    // Actualizar theme-color meta para barra de estado del SO
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const colors = {
        forge:    '#c4a561',
        midnight: '#4f9cf4',
        aurora:   '#a78bfa',
      };
      metaTheme.content = colors[t] || '#c4a561';
    }

    // Actualizar estado visual de los swatches
    document.querySelectorAll('.theme-swatch').forEach(el => {
      const isActive = el.dataset.t === t;
      el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Emitir evento global para que otros módulos puedan reaccionar
    window.dispatchEvent(new CustomEvent('hs:theme-changed', { detail: { theme: t } }));
  }

  function set(theme) {
    if (!VALID_THEMES.includes(theme)) return;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    _apply(theme);

    // Pequeña animación de transición en body
    document.body.style.transition = 'background 300ms ease, color 200ms ease';
    setTimeout(() => { document.body.style.transition = ''; }, 350);
  }

  function get() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.includes(saved) ? saved : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  function init() {
    // Aplicar tema guardado lo antes posible (antes del primer paint)
    _apply(get());

    // Escuchar clics en los swatches del picker
    document.addEventListener('click', function (e) {
      const swatch = e.target.closest('.theme-swatch[data-t]');
      if (!swatch) return;
      set(swatch.dataset.t);
    });
  }

  // ── Render del picker HTML ───────────────────────────────────
  function renderPicker(container) {
    if (!container) return;
    const current = get();

    const themes = [
      { id: 'forge',    name: 'Forge',    desc: 'Dorado' },
      { id: 'midnight', name: 'Midnight', desc: 'OLED'   },
      { id: 'aurora',   name: 'Aurora',   desc: 'Violeta' },
    ];

    container.innerHTML = `
      <div class="theme-picker">
        <span class="theme-picker__label">Tema</span>
        <div class="theme-picker__swatches">
          ${themes.map(th => `
            <button
              class="theme-swatch"
              data-t="${th.id}"
              title="${th.desc}"
              aria-label="Tema ${th.name}"
              aria-pressed="${th.id === current}"
            >
              <span class="theme-swatch__dot"></span>
              <span>${th.name}</span>
              <span class="theme-swatch__check" aria-hidden="true">
                <svg width="8" height="8" viewBox="0 0 10 10" fill="white">
                  <polyline points="2,5 4,7 8,3" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── Export global ────────────────────────────────────────────
  window.ThemeManager = { init, set, get, renderPicker };

})();
