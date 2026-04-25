var Readiness = (function () {
  'use strict';

  function computeScore() {
    var entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
    if (!entries.length) return null;

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var lastDate = new Date(entries[entries.length - 1].date);
    lastDate.setHours(0, 0, 0, 0);
    var restDays = Math.round((today - lastDate) / 86400000);

    var cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 14);
    var frequency = entries.filter(function (e) {
      return new Date(e.date) >= cutoff;
    }).length;

    var score = 100
      - (restDays === 0 ? 30 : 0)
      - Math.max(0, (3 - frequency) * 10);
    return Math.min(100, Math.max(20, score));
  }

  function getLabel(score) {
    if (score >= 80) return { badge: 'push',     badgeText: '🔥 Listo para rendir', rec: 'Entrena al máximo hoy',   sub: 'Tu cuerpo está recuperado y en forma. Sesión intensa recomendada.' };
    if (score >= 50) return { badge: 'moderate', badgeText: '⚡ Carga moderada',    rec: 'Entrena a ritmo moderado', sub: 'Buena forma pero reserva energía. Técnica y volumen medio.' };
    return              { badge: 'rest',     badgeText: '🌙 Descanso activo',   rec: 'Recuperación activa',      sub: 'Prioriza movilidad, estiramientos o un paseo ligero hoy.' };
  }

  function getStrokeColor(score) {
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#8b5cf6';
  }

  function render(score) {
    var widget = document.getElementById('readiness-widget');
    if (!widget) return;
    if (score === null) { widget.style.display = 'none'; return; }

    var info   = getLabel(score);
    var color  = getStrokeColor(score);
    var r      = 30;
    var circ   = 2 * Math.PI * r;
    var offset = circ - (score / 100) * circ;

    widget.style.display = 'block';
    widget.innerHTML = [
      '<div class="readiness-card">',
        '<div class="readiness-dial">',
          '<svg viewBox="0 0 72 72">',
            '<circle class="readiness-dial__track" cx="36" cy="36" r="' + r + '"/>',
            '<circle class="readiness-dial__fill" cx="36" cy="36" r="' + r + '"',
              ' stroke="' + color + '"',
              ' stroke-dasharray="' + circ.toFixed(2) + '"',
              ' stroke-dashoffset="' + circ.toFixed(2) + '"',
              ' id="readiness-fill"/>',
          '</svg>',
          '<div class="readiness-dial__label">' + score + '</div>',
        '</div>',
        '<div class="readiness-info">',
          '<span class="readiness-badge readiness-badge--' + info.badge + '">' + info.badgeText + '</span>',
          '<p class="readiness-rec">' + info.rec + '</p>',
          '<p class="readiness-sub">' + info.sub + '</p>',
        '</div>',
      '</div>',
    ].join('');

    requestAnimationFrame(function () {
      var fill = document.getElementById('readiness-fill');
      if (fill) fill.style.strokeDashoffset = offset.toFixed(2);
    });
  }

  function init() {
    render(computeScore());
  }

  return { init: init };
})();
