var FatigueHeatmap = (function () {
  'use strict';

  var MUSCLE_MAP = {
    chest:      ['Press banca','Press inclinado','Aperturas','Press pecho','Fondos','Pecho'],
    back:       ['Peso muerto','Remo con barra','Dominadas','Dominadas lastradas','Pull-up','Remo','Espalda','Jalón'],
    shoulders:  ['Press militar','Elevaciones laterales','Press hombros','Hombros','Face pull'],
    biceps:     ['Curl bíceps','Curl martillo','Bíceps'],
    triceps:    ['Fondos tríceps','Press cerrado','Extensión tríceps','Tríceps'],
    quads:      ['Sentadilla','Prensa','Extensión cuádriceps','Cuádriceps','Leg press'],
    hamstrings: ['Peso muerto rumano','Curl femoral','Isquios','Femoral'],
    glutes:     ['Hip thrust','Glúteos','Puente de glúteos'],
    core:       ['Plancha','Abdominales','Core','Crunch'],
    calves:     ['Gemelos','Elevación talones','Pantorrillas'],
  };

  var RECOVERY_H = { chest:60, back:72, shoulders:48, biceps:48, triceps:48, quads:72, hamstrings:72, glutes:72, core:36, calves:36 };

  var LABELS = { chest:'Pecho', back:'Espalda', shoulders:'Hombros', biceps:'Bíceps', triceps:'Tríceps', quads:'Cuádriceps', hamstrings:'Isquios', glutes:'Glúteos', core:'Core', calves:'Gemelos' };

  function getLastTrained() {
    var prs = {};
    try { prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}'); } catch (e) {}
    var exercises = prs.exercises || {};
    var lastTrained = {}; // muscle → Date

    Object.keys(exercises).forEach(function (exName) {
      var entries = exercises[exName];
      if (!entries.length) return;
      var latest = entries.reduce(function (a, b) { return a.date > b.date ? a : b; });
      var date = new Date(latest.date);

      Object.keys(MUSCLE_MAP).forEach(function (muscle) {
        var keywords = MUSCLE_MAP[muscle];
        var matches = keywords.some(function (kw) {
          return exName.toLowerCase().indexOf(kw.toLowerCase()) !== -1 || kw.toLowerCase().indexOf(exName.toLowerCase()) !== -1;
        });
        if (matches) {
          if (!lastTrained[muscle] || date > lastTrained[muscle]) {
            lastTrained[muscle] = date;
          }
        }
      });
    });
    return lastTrained;
  }

  function getStatus(muscle, lastTrained) {
    if (!lastTrained[muscle]) return { pct: null, color: 'rgba(255,255,255,0.06)', label: 'Sin datos' };
    var hoursElapsed = (Date.now() - lastTrained[muscle].getTime()) / 3600000;
    var recoveryH = RECOVERY_H[muscle] || 48;
    var pct = Math.min(hoursElapsed / recoveryH * 100, 100);
    var color = pct >= 100 ? 'rgba(16,185,129,0.7)'
              : pct >= 75  ? 'rgba(34,211,238,0.55)'
              : pct >= 50  ? 'rgba(245,158,11,0.6)'
                           : 'rgba(248,113,113,0.75)';
    var daysAgo = Math.round(hoursElapsed / 24);
    var label = daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : 'Hace ' + daysAgo + ' días';
    return { pct: Math.round(pct), color: color, label: label };
  }

  // Simplified SVG body silhouette with named zones
  // Front view: chest, shoulders, biceps, quads, core, calves
  // Back view: back, triceps, hamstrings, glutes
  function buildSVG(muscles, side) {
    var zones;
    if (side === 'front') {
      zones = [
        { id: 'shoulders', d: 'M55,52 Q45,48 38,58 Q36,70 42,72 Q50,62 60,60 Z M125,52 Q135,48 142,58 Q144,70 138,72 Q130,62 120,60 Z' },
        { id: 'chest',     d: 'M60,60 Q90,55 120,60 Q118,88 90,92 Q62,88 60,60 Z' },
        { id: 'biceps',    d: 'M38,72 Q32,82 34,100 Q40,104 46,98 Q44,82 42,72 Z M142,72 Q148,82 146,100 Q140,104 134,98 Q136,82 138,72 Z' },
        { id: 'core',      d: 'M62,92 Q90,96 118,92 Q116,128 90,132 Q64,128 62,92 Z' },
        { id: 'quads',     d: 'M64,132 Q76,136 82,170 Q82,200 78,220 Q70,222 64,218 Q62,192 62,170 Z M116,132 Q104,136 98,170 Q98,200 102,220 Q110,222 116,218 Q118,192 118,170 Z' },
        { id: 'calves',    d: 'M64,222 Q68,240 66,270 Q72,276 78,270 Q76,244 78,222 Z M116,222 Q112,240 114,270 Q108,276 102,270 Q104,244 102,222 Z' },
      ];
    } else {
      zones = [
        { id: 'shoulders', d: 'M55,52 Q45,48 38,58 Q36,70 42,72 Q50,62 60,60 Z M125,52 Q135,48 142,58 Q144,70 138,72 Q130,62 120,60 Z' },
        { id: 'back',      d: 'M60,60 Q90,55 120,60 Q118,95 90,100 Q62,95 60,60 Z' },
        { id: 'triceps',   d: 'M38,72 Q32,82 34,100 Q40,104 46,98 Q44,82 42,72 Z M142,72 Q148,82 146,100 Q140,104 134,98 Q136,82 138,72 Z' },
        { id: 'glutes',    d: 'M62,100 Q76,104 90,106 Q104,104 118,100 Q116,128 90,132 Q64,128 62,100 Z' },
        { id: 'hamstrings',d: 'M64,132 Q76,136 82,170 Q82,200 78,220 Q70,222 64,218 Q62,192 62,170 Z M116,132 Q104,136 98,170 Q98,200 102,220 Q110,222 116,218 Q118,192 118,170 Z' },
        { id: 'calves',    d: 'M64,222 Q68,240 66,270 Q72,276 78,270 Q76,244 78,222 Z M116,222 Q112,240 114,270 Q108,276 102,270 Q104,244 102,222 Z' },
      ];
    }

    var torso = '<ellipse cx="90" cy="76" rx="34" ry="36" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>'
              + '<ellipse cx="90" cy="30" rx="20" ry="22" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>'
              + '<rect x="74" y="130" width="32" height="8" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';

    var paths = zones.map(function (z) {
      var s = muscles[z.id] || { color: 'rgba(255,255,255,0.06)' };
      return '<path class="fatigue-zone" id="fz-' + side + '-' + z.id + '" d="' + z.d + '" fill="' + s.color + '" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>';
    }).join('');

    return '<svg class="fatigue-svg" viewBox="0 0 180 300" xmlns="http://www.w3.org/2000/svg">' + torso + paths + '</svg>';
  }

  function render() {
    var root = document.getElementById('fatigue-root');
    if (!root) return;

    var lastTrained = getLastTrained();
    var muscles = {};
    Object.keys(MUSCLE_MAP).forEach(function (m) {
      muscles[m] = getStatus(m, lastTrained);
    });

    var hasData = Object.keys(lastTrained).length > 0;
    if (!hasData) {
      root.innerHTML = '<p class="fatigue-empty">Añade registros en Records 1RM para ver tu estado de recuperación muscular.</p>';
      return;
    }

    var frontSVG = buildSVG(muscles, 'front');
    var backSVG  = buildSVG(muscles, 'back');

    var legendHTML = [
      '<div class="fatigue-legend">',
        '<div class="fatigue-legend-row"><div class="fatigue-legend-dot" style="background:rgba(16,185,129,0.8)"></div>Recuperado (≥100%)</div>',
        '<div class="fatigue-legend-row"><div class="fatigue-legend-dot" style="background:rgba(34,211,238,0.7)"></div>Casi listo (75-99%)</div>',
        '<div class="fatigue-legend-row"><div class="fatigue-legend-dot" style="background:rgba(245,158,11,0.7)"></div>Parcialmente fatigado (50-74%)</div>',
        '<div class="fatigue-legend-row"><div class="fatigue-legend-dot" style="background:rgba(248,113,113,0.8)"></div>Fatigado (&lt;50%)</div>',
      '</div>',
    ].join('');

    var listHTML = '<div class="fatigue-list">' + Object.keys(LABELS).map(function (m) {
      var s = muscles[m];
      var pctText = s.pct !== null ? s.pct + '% recuperado' : 'Sin datos';
      return [
        '<div class="fatigue-item">',
          '<div class="fatigue-item-dot" style="background:' + s.color + '"></div>',
          '<div class="fatigue-item-body">',
            '<div class="fatigue-item-name">' + LABELS[m] + '</div>',
            '<div class="fatigue-item-sub">' + s.label + '</div>',
          '</div>',
          '<div class="fatigue-item-pct">' + pctText + '</div>',
        '</div>',
      ].join('');
    }).join('') + '</div>';

    root.innerHTML = [
      '<div class="fatigue-layout">',
        '<div>',
          '<div class="fatigue-body-wrap">',
            '<figure class="fatigue-figure">' + frontSVG + '<figcaption>Frontal</figcaption></figure>',
            '<figure class="fatigue-figure">' + backSVG  + '<figcaption>Posterior</figcaption></figure>',
          '</div>',
        '</div>',
        '<div>',
          legendHTML,
          listHTML,
        '</div>',
      '</div>',
    ].join('');
  }

  function init() { render(); }

  return { init: init };
})();
