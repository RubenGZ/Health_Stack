var AthleteReceipt = (function () {
  'use strict';

  function getWeekNumber(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function getThisWeekRange() {
    var now   = new Date();
    var day   = now.getDay() || 7;
    var mon   = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0);
    var sun   = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    return { mon: mon, sun: sun };
  }

  function buildReceipt() {
    var now    = new Date();
    var week   = getWeekNumber(now);
    var year   = now.getFullYear();
    var range  = getThisWeekRange();

    // Athlete name
    var user   = JSON.parse(localStorage.getItem('hs_user') || 'null');
    var name   = (user && (user.display_name || user.username)) || 'Atleta';

    // Weight entries this week
    var allEntries = [];
    try { allEntries = JSON.parse(localStorage.getItem('hs_weight_entries') || '[]'); } catch (e) {}
    var weekEntries = allEntries.filter(function (e) {
      var d = new Date(e.date); return d >= range.mon && d <= range.sun;
    });
    var trainingDays = new Set(weekEntries.map(function (e) { return e.date; })).size;
    var currentWeight = allEntries.length ? allEntries[allEntries.length - 1].weight.toFixed(1) + ' kg' : '—';

    // XP this week (total XP as proxy, since we don't track weekly delta)
    var gami = {};
    try { gami = JSON.parse(localStorage.getItem('hs_gami') || '{}'); } catch (e) {}
    var xp = gami.xp || 0;

    // Best PR this week
    var prs = {};
    try { prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}'); } catch (e) {}
    var bestPR = null;
    var exercises = (prs.exercises) || {};
    Object.keys(exercises).forEach(function (exName) {
      var weekPRs = exercises[exName].filter(function (e) {
        var d = new Date(e.date); return d >= range.mon && d <= range.sun;
      });
      weekPRs.forEach(function (e) {
        if (!bestPR || e.rm > bestPR.rm) bestPR = { exercise: exName, rm: e.rm };
      });
    });

    var prText = bestPR
      ? bestPR.exercise + ' — ' + bestPR.rm + ' kg 1RM 🏆'
      : 'Sin nuevo PR esta semana';

    return {
      week: week, year: year, name: name,
      trainingDays: trainingDays,
      currentWeight: currentWeight,
      xp: xp,
      prText: prText,
      exerciseCount: Object.keys(exercises).length,
    };
  }

  function render() {
    var wrapper = document.getElementById('receipt-card-wrapper');
    if (!wrapper) return;
    var d = buildReceipt();

    var motivations = [
      'La consistencia supera a la intensidad. Semana a semana.',
      'Los grandes resultados son el producto de pequeñas decisiones repetidas.',
      'No entrenas para el espejo. Entrenas para la persona que quieres ser.',
      'Cada sesión es un depósito en tu cuenta de salud a largo plazo.',
      'El progreso no siempre es visible. Siempre es real.',
    ];
    var quote = motivations[d.week % motivations.length];

    wrapper.innerHTML = [
      '<div class="receipt-card">',
        '<div class="receipt-brand">HealthStack Pro</div>',
        '<div class="receipt-week">Semana ' + d.week + ' &middot; ' + d.year + '</div>',
        '<div class="receipt-athlete">' + escHtml(d.name) + '</div>',
        '<hr class="receipt-divider">',
        '<div class="receipt-metrics">',
          '<div class="receipt-tile"><span class="receipt-tile-val">' + d.trainingDays + '</span><div class="receipt-tile-lbl">Días activos</div></div>',
          '<div class="receipt-tile"><span class="receipt-tile-val">' + escHtml(d.currentWeight) + '</span><div class="receipt-tile-lbl">Peso actual</div></div>',
          '<div class="receipt-tile"><span class="receipt-tile-val">' + d.xp + '</span><div class="receipt-tile-lbl">XP total</div></div>',
          '<div class="receipt-tile"><span class="receipt-tile-val">' + d.exerciseCount + '</span><div class="receipt-tile-lbl">Ejercicios con PR</div></div>',
        '</div>',
        '<div class="receipt-highlight">',
          '<div class="receipt-highlight-label">Mejor PR esta semana</div>',
          '<div class="receipt-highlight-val">' + escHtml(d.prText) + '</div>',
        '</div>',
        '<hr class="receipt-divider">',
        '<div class="receipt-footer">' + escHtml(quote) + '</div>',
      '</div>',
    ].join('');
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function init() { render(); }

  return { init: init };
})();
