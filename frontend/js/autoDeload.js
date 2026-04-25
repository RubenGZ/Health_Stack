var AutoDeload = (function () {
  'use strict';

  // ── Thresholds ────────────────────────────────────────────────
  var READINESS_LOW      = 60;   // % below which readiness signal fires
  var READINESS_DAYS     = 5;    // consecutive days below threshold to fire
  var FREQ_DROP_PCT      = 35;   // weekly frequency drop % to fire load signal
  var PLATEAU_THRESHOLD  = 0.4;  // weekly 1RM gain % (mirrors plateauRadar.js)
  var WINDOW_WEEKS       = 3;    // weeks of history for trend analysis
  var DELOAD_VOLUME_PCT  = 60;   // recommended volume in deload week (%)

  // ── Helpers ───────────────────────────────────────────────────
  function daysAgo(d) {
    return Math.floor((Date.now() - d) / 86400000);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Reuses the same readiness formula from readiness.js so scores align
  function computeReadinessForDay(entries, refDate) {
    var refMs = refDate.getTime();
    var dayStart = new Date(refDate);
    dayStart.setHours(0, 0, 0, 0);
    var dayMs = dayStart.getTime();

    // entries before or on refDate
    var past = entries.filter(function (e) {
      return new Date(e.date).getTime() <= refMs;
    });

    if (past.length === 0) return null;

    var last = past[past.length - 1];
    var lastMs = new Date(last.date).setHours(0, 0, 0, 0);
    var restDays = Math.floor((dayMs - lastMs) / 86400000);

    var cutoff14 = dayMs - 14 * 86400000;
    var freq = past.filter(function (e) {
      return new Date(e.date).setHours(0, 0, 0, 0) >= cutoff14;
    }).length;

    var score = 100 - (restDays === 0 ? 30 : 0) - Math.max(0, (3 - freq) * 10);
    return clamp(score, 20, 100);
  }

  // ── Signal 1: Readiness trend ─────────────────────────────────
  // Returns { fires: bool, consecutiveLowDays: number, avgScore: number }
  function signalReadiness(weightEntries) {
    if (weightEntries.length < 3) {
      return { fires: false, consecutiveLowDays: 0, avgScore: null };
    }

    var today = new Date();
    var scores = [];
    var consecutive = 0;

    for (var i = 0; i < 14; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var s = computeReadinessForDay(weightEntries, d);
      if (s !== null) {
        scores.push(s);
        if (i < READINESS_DAYS && s < READINESS_LOW) consecutive++;
      }
    }

    var avg = scores.length
      ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)
      : null;

    return {
      fires: consecutive >= READINESS_DAYS,
      consecutiveLowDays: consecutive,
      avgScore: avg,
    };
  }

  // ── Signal 2: Training load drop ─────────────────────────────
  // Compares entries-per-week last week vs previous week
  // Returns { fires: bool, dropPct: number, thisWeek: number, lastWeek: number }
  function signalLoad(weightEntries) {
    var now = Date.now();
    var msPerWeek = 7 * 86400000;

    var thisWeek = weightEntries.filter(function (e) {
      return now - new Date(e.date).getTime() < msPerWeek;
    }).length;

    var prevWeek = weightEntries.filter(function (e) {
      var age = now - new Date(e.date).getTime();
      return age >= msPerWeek && age < 2 * msPerWeek;
    }).length;

    if (prevWeek === 0) {
      return { fires: false, dropPct: 0, thisWeek: thisWeek, lastWeek: prevWeek };
    }

    var dropPct = Math.round(((prevWeek - thisWeek) / prevWeek) * 100);
    return {
      fires: dropPct >= FREQ_DROP_PCT,
      dropPct: Math.max(0, dropPct),
      thisWeek: thisWeek,
      lastWeek: prevWeek,
    };
  }

  // ── Signal 3: 1RM plateau ─────────────────────────────────────
  // Uses PR records. If any exercise shows <0.4% weekly gain over 8 weeks → fires
  function signalPlateau(prRecords) {
    var exercises = prRecords.exercises || {};
    var windowMs = WINDOW_WEEKS * 7 * 86400000;
    var now = Date.now();
    var stalledCount = 0;
    var totalTracked = 0;

    Object.keys(exercises).forEach(function (ex) {
      var entries = (exercises[ex] || []).filter(function (r) {
        return now - new Date(r.date).getTime() <= windowMs;
      });
      if (entries.length < 2) return;
      totalTracked++;

      entries.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      var first = entries[0].rm;
      var last  = entries[entries.length - 1].rm;
      var spanDays = (new Date(entries[entries.length-1].date) - new Date(entries[0].date)) / 86400000;
      if (spanDays < 7) return;

      var weeklyGainPct = ((last - first) / first) * 100 * (7 / spanDays);
      if (weeklyGainPct < PLATEAU_THRESHOLD) stalledCount++;
    });

    return {
      fires: totalTracked > 0 && stalledCount >= Math.ceil(totalTracked / 2),
      stalledCount: stalledCount,
      totalTracked: totalTracked,
    };
  }

  // ── Build deload week plan ────────────────────────────────────
  function buildDeloadHint() {
    var rData = JSON.parse(localStorage.getItem('hs_routines') || '[]');
    if (!rData.length) return null;

    var routine = rData[0]; // use first routine as base
    var sets = routine.exercises
      ? routine.exercises.map(function (ex) {
          var sets = Math.max(1, Math.round((ex.sets || 3) * DELOAD_VOLUME_PCT / 100));
          return ex.name + ' — ' + sets + ' series al ' + DELOAD_VOLUME_PCT + '% peso';
        })
      : [];

    return { name: routine.name || 'Rutina principal', exercises: sets.slice(0, 5) };
  }

  // ── Render ────────────────────────────────────────────────────
  function render(root) {
    var weightEntries = JSON.parse(localStorage.getItem('hs_weight_entries') || '[]');
    weightEntries.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    var prRecords = JSON.parse(localStorage.getItem('hs_pr_records') || '{"exercises":{}}');

    var sR = signalReadiness(weightEntries);
    var sL = signalLoad(weightEntries);
    var sP = signalPlateau(prRecords);

    var firedCount = [sR.fires, sL.fires, sP.fires].filter(Boolean).length;
    var needsDeload = firedCount >= 2;

    var status = needsDeload ? 'red' : firedCount === 1 ? 'amber' : 'green';
    var statusLabel = needsDeload ? 'Deload recomendado' : firedCount === 1 ? 'Seguimiento recomendado' : 'En forma';
    var statusColor = status === 'red' ? '#f87171' : status === 'amber' ? '#fbbf24' : '#10b981';

    var deloadHint = needsDeload ? buildDeloadHint() : null;

    var html = '<div class="dl-header">'
      + '<div class="dl-status-dot" style="background:' + statusColor + ';box-shadow:0 0 10px ' + statusColor + '80"></div>'
      + '<div><div class="dl-status-label" style="color:' + statusColor + '">' + statusLabel + '</div>'
      + '<div class="dl-subtitle">' + firedCount + ' de 3 señales activas</div></div>'
      + '</div>'
      + '<div class="dl-signals">'
      + renderSignal(
          'Readiness',
          sR.fires,
          sR.avgScore !== null
            ? 'Media ' + sR.avgScore + '% · ' + sR.consecutiveLowDays + ' días bajos'
            : 'Sin datos suficientes'
        )
      + renderSignal(
          'Carga semanal',
          sL.fires,
          sL.lastWeek > 0
            ? 'Esta semana ' + sL.thisWeek + ' vs anterior ' + sL.lastWeek + (sL.dropPct > 0 ? ' (−' + sL.dropPct + '%)' : '')
            : 'Sin historial previo'
        )
      + renderSignal(
          'Progresión 1RM',
          sP.fires,
          sP.totalTracked > 0
            ? sP.stalledCount + ' de ' + sP.totalTracked + ' ejercicios estancados'
            : 'Sin registros de marca'
        )
      + '</div>';

    if (deloadHint) {
      html += '<div class="dl-plan">'
        + '<div class="dl-plan-title">Semana deload sugerida — ' + escHtml(deloadHint.name) + '</div>';
      if (deloadHint.exercises.length) {
        html += '<ul class="dl-plan-list">'
          + deloadHint.exercises.map(function (e) {
              return '<li>' + escHtml(e) + '</li>';
            }).join('')
          + '</ul>';
      } else {
        html += '<p class="dl-plan-empty">Añade ejercicios a tu rutina para ver el plan detallado.</p>';
      }
      html += '</div>';
    }

    root.innerHTML = html;
  }

  function renderSignal(label, fires, detail) {
    var icon  = fires ? '⚠️' : '✓';
    var color = fires ? '#f87171' : '#10b981';
    return '<div class="dl-signal' + (fires ? ' dl-signal--active' : '') + '">'
      + '<span class="dl-signal-icon" style="color:' + color + '">' + icon + '</span>'
      + '<div>'
      + '<div class="dl-signal-name">' + escHtml(label) + '</div>'
      + '<div class="dl-signal-detail">' + escHtml(detail) + '</div>'
      + '</div>'
      + '</div>';
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Public API ────────────────────────────────────────────────
  function init() {
    var root = document.getElementById('deload-root');
    if (!root) return;
    render(root);
  }

  return { init: init };
})();
