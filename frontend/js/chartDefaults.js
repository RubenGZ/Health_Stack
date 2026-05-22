/* ============================================================
   chartDefaults.js — Tema global de Chart.js para HealthStack Pro
   Se carga antes de cualquier módulo que use Chart.js.
   Aplica el tema del brand automáticamente + se actualiza
   cuando el usuario cambia de tema visual.
   ============================================================ */

(function () {
  'use strict';

  // Paleta de colores por tema
  const THEME_PALETTES = {
    forge:    { accent: '#c4a561', accentRgb: '196,165,97',  grid: 'rgba(255,255,255,0.04)', ticks: 'rgba(255,255,255,0.30)' },
    midnight: { accent: '#4f9cf4', accentRgb: '79,156,244',  grid: 'rgba(255,255,255,0.04)', ticks: 'rgba(255,255,255,0.30)' },
    aurora:   { accent: '#a78bfa', accentRgb: '167,139,250', grid: 'rgba(255,255,255,0.04)', ticks: 'rgba(255,255,255,0.30)' },
  };

  function _getTheme() {
    try {
      const t = localStorage.getItem('hs_theme');
      return (t && THEME_PALETTES[t]) ? t : 'forge';
    } catch { return 'forge'; }
  }

  function _applyDefaults() {
    if (typeof Chart === 'undefined') return;

    const theme = _getTheme();
    const p     = THEME_PALETTES[theme];

    // ── Globales ─────────────────────────────────────────────
    Chart.defaults.color             = p.ticks;
    Chart.defaults.borderColor       = p.grid;
    Chart.defaults.font.family       = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size         = 11;
    Chart.defaults.responsive        = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 600;
    Chart.defaults.animation.easing  = 'easeOutQuart';

    // ── Tooltips ─────────────────────────────────────────────
    Chart.defaults.plugins.tooltip.backgroundColor    = 'rgba(10,10,20,0.92)';
    Chart.defaults.plugins.tooltip.borderColor        = `rgba(${p.accentRgb},0.25)`;
    Chart.defaults.plugins.tooltip.borderWidth        = 1;
    Chart.defaults.plugins.tooltip.padding            = 10;
    Chart.defaults.plugins.tooltip.cornerRadius       = 8;
    Chart.defaults.plugins.tooltip.titleColor         = '#e2e8f0';
    Chart.defaults.plugins.tooltip.bodyColor          = 'rgba(255,255,255,0.65)';
    Chart.defaults.plugins.tooltip.titleFont          = { size: 12, weight: '600' };
    Chart.defaults.plugins.tooltip.bodyFont           = { size: 11 };
    Chart.defaults.plugins.tooltip.displayColors      = false;
    Chart.defaults.plugins.tooltip.callbacks          = {};

    // ── Legend ───────────────────────────────────────────────
    Chart.defaults.plugins.legend.display = false;

    // ── Line chart defaults ─────────────────────────────────
    Chart.defaults.elements.line.borderWidth   = 2;
    Chart.defaults.elements.line.tension       = 0.35;
    Chart.defaults.elements.line.fill          = false;

    // ── Point defaults ───────────────────────────────────────
    Chart.defaults.elements.point.radius       = 3;
    Chart.defaults.elements.point.hoverRadius  = 5;
    Chart.defaults.elements.point.borderWidth  = 2;

    // ── Bar defaults ─────────────────────────────────────────
    Chart.defaults.elements.bar.borderRadius   = 4;
    Chart.defaults.elements.bar.borderSkipped  = 'bottom';

    // ── Scale defaults ────────────────────────────────────────
    Chart.defaults.scales.linear = Chart.defaults.scales.linear || {};
    Chart.defaults.scales.linear.grid = {
      color: p.grid,
      drawBorder: false,
    };
    Chart.defaults.scales.linear.ticks = {
      color: p.ticks,
      font: { size: 11 },
      padding: 6,
    };
    Chart.defaults.scales.category = Chart.defaults.scales.category || {};
    Chart.defaults.scales.category.grid = { display: false };
    Chart.defaults.scales.category.ticks = {
      color: p.ticks,
      font: { size: 11 },
    };
  }

  // ── Esperar a que Chart.js esté disponible ────────────────────
  function _waitForChart(attempts) {
    if (typeof Chart !== 'undefined') {
      _applyDefaults();
      return;
    }
    if (attempts > 0) setTimeout(() => _waitForChart(attempts - 1), 100);
  }

  // Aplicar en cuanto esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => _waitForChart(20));
  } else {
    _waitForChart(20);
  }

  // Re-aplicar cuando el usuario cambie de tema
  window.addEventListener('hs:theme-changed', () => {
    _applyDefaults();
    // Re-renderizar gráficos activos
    if (typeof Chart !== 'undefined') {
      Chart.instances && Object.values(Chart.instances).forEach(chart => {
        try { chart.update('none'); } catch {}
      });
    }
  });

  // Exponer por si algún módulo necesita la paleta
  window.ChartTheme = {
    getPalette: () => THEME_PALETTES[_getTheme()],
    apply:      _applyDefaults,
  };

})();
