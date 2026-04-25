var PlateauRadar = (function () {
  'use strict';

  var PLATEAU_THRESHOLD_PCT = 0.4;  // weekly gain < 0.4% = plateau
  var WINDOW_DAYS = 56;             // 8 weeks

  function linReg(entries) {
    var sorted = entries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var t0 = new Date(sorted[0].date).getTime();
    var n = sorted.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    sorted.forEach(function (e) {
      var x = (new Date(e.date).getTime() - t0) / 86400000;
      var y = e.rm;
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    });
    var denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 0.001) return 0;
    return (n * sumXY - sumX * sumY) / denom; // slope in kg/day
  }

  function getDiagnosis(exName, weeklyPct) {
    var causes = [];
    var now = new Date(); now.setHours(0,0,0,0);
    var cut28 = new Date(now); cut28.setDate(cut28.getDate() - 28);

    // Low frequency
    var prs = {};
    try { prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}'); } catch (e) {}
    var exEntries = (prs.exercises || {})[exName] || [];
    var last28 = exEntries.filter(function (e) { return new Date(e.date) >= cut28; });
    if (last28.length < 2) causes.push('Baja frecuencia: menos de 2 sesiones en las últimas 4 semanas.');

    // Deload overdue: if no gap > 7 days in last 35 days, deload overdue
    var allExercises = Object.values((prs.exercises) || {});
    var allDates = [];
    allExercises.forEach(function (arr) {
      arr.forEach(function (e) { allDates.push(new Date(e.date).getTime()); });
    });
    allDates.sort();
    var cut35 = new Date(now); cut35.setDate(cut35.getDate() - 35);
    var recent = allDates.filter(function (t) { return t >= cut35.getTime(); }).sort();
    var hadRest = false;
    for (var j = 1; j < recent.length; j++) {
      if ((recent[j] - recent[j-1]) / 86400000 >= 7) { hadRest = true; break; }
    }
    if (!hadRest && recent.length >= 3) causes.push('Sin semana de descanso en las últimas 5 semanas — considera un deload.');

    // Caloric deficit + weight stall
    var weightEntries = [];
    try { weightEntries = JSON.parse(localStorage.getItem('hs_weight_entries') || '[]'); } catch (e) {}
    var tdeeData = {};
    try { tdeeData = JSON.parse(localStorage.getItem('hs_tdee') || '{}'); } catch (e) {}
    if (weightEntries.length >= 5 && tdeeData.goal && tdeeData.goal.indexOf('deficit') !== -1) {
      var last5 = weightEntries.slice(-5);
      var wSlope = last5[last5.length-1].weight - last5[0].weight;
      if (wSlope >= 0) causes.push('Peso estancado en fase de déficit — puede estar limitando la recuperación muscular.');
    }

    if (!causes.length) causes.push('Considera variar el esquema de series/rep (e.g. cambiar de 4×8 a 5×5 o 3×12).');
    return causes;
  }

  function analyzeExercises() {
    var prs = {};
    try { prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}'); } catch (e) {}
    var exercises = prs.exercises || {};
    var now = new Date(); now.setHours(0,0,0,0);
    var cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

    var results = [];
    Object.keys(exercises).forEach(function (name) {
      var all = exercises[name];
      var recent = all.filter(function (e) { return new Date(e.date) >= cutoff; });
      if (recent.length < 3) return; // need at least 3 data points
      var slope = linReg(recent);          // kg per day
      var weeklyGain = slope * 7;
      var currentRM = Math.max.apply(null, recent.map(function (e) { return e.rm; }));
      var weeklyPct = currentRM > 0 ? (weeklyGain / currentRM) * 100 : 0;
      results.push({ name: name, weeklyGain: weeklyGain, weeklyPct: weeklyPct, currentRM: currentRM, dataPoints: recent.length });
    });

    return results.sort(function (a, b) { return a.weeklyPct - b.weeklyPct; });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function render() {
    var root = document.getElementById('plateau-root');
    if (!root) return;

    var results = analyzeExercises();
    if (!results.length) {
      root.innerHTML = '<p class="plateau-empty">Necesitas al menos 3 registros por ejercicio en las últimas 8 semanas.<br>Añade intentos en la sección Records 1RM.</p>';
      return;
    }

    var stalled  = results.filter(function (r) { return r.weeklyPct < PLATEAU_THRESHOLD_PCT; });
    var healthy  = results.filter(function (r) { return r.weeklyPct >= PLATEAU_THRESHOLD_PCT; });

    var html = '';

    if (!stalled.length) {
      html += '<div class="plateau-all-good">✅ Todos tus levantamientos muestran progresión. ¡Sigue así!</div>';
    }

    html += '<div class="plateau-grid">';

    stalled.forEach(function (r) {
      var causes = getDiagnosis(r.name, r.weeklyPct);
      var trendStr = r.weeklyGain >= 0
        ? '+' + r.weeklyGain.toFixed(2) + ' kg/sem'
        : r.weeklyGain.toFixed(2) + ' kg/sem';
      html += '<div class="plateau-card plateau-card--stalled">';
      html += '<div class="plateau-card-head"><span class="plateau-card-name">' + escHtml(r.name) + '</span><span class="plateau-badge plateau-badge--stalled">⚠ Estancado</span></div>';
      html += '<div class="plateau-rm">1RM actual: <strong>' + r.currentRM.toFixed(1) + ' kg</strong> · ' + r.dataPoints + ' registros</div>';
      html += '<div class="plateau-trend plateau-trend--flat">' + trendStr + ' <small style="font-size:13px;font-weight:400">(' + r.weeklyPct.toFixed(2) + '%)</small></div>';
      html += '<div class="plateau-causes">' + causes.map(function (c) { return '<div class="plateau-cause">' + escHtml(c) + '</div>'; }).join('') + '</div>';
      html += '</div>';
    });

    healthy.forEach(function (r) {
      var trendStr = '+' + r.weeklyGain.toFixed(2) + ' kg/sem';
      html += '<div class="plateau-card plateau-card--gaining">';
      html += '<div class="plateau-card-head"><span class="plateau-card-name">' + escHtml(r.name) + '</span><span class="plateau-badge plateau-badge--gaining">↑ Progresando</span></div>';
      html += '<div class="plateau-rm">1RM actual: <strong>' + r.currentRM.toFixed(1) + ' kg</strong> · ' + r.dataPoints + ' registros</div>';
      html += '<div class="plateau-trend plateau-trend--pos">' + trendStr + ' <small style="font-size:13px;font-weight:400">(+' + r.weeklyPct.toFixed(2) + '%/sem)</small></div>';
      html += '</div>';
    });

    html += '</div>';
    root.innerHTML = html;
  }

  function init() { render(); }

  return { init: init };
})();
