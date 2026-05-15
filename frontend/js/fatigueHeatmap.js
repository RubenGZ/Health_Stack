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
    var lastTrained = {}; // muscle → Date

    // Fuente 1: workout logger sessions
    try {
      var sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]');
      sessions.forEach(function(session) {
        var date = new Date(session.startedAt);
        (session.exercises || []).forEach(function(ex) {
          Object.keys(MUSCLE_MAP).forEach(function(muscle) {
            var keywords = MUSCLE_MAP[muscle];
            var matches = keywords.some(function(kw) {
              return (ex.name || '').toLowerCase().indexOf(kw.toLowerCase()) !== -1;
            });
            if (matches && (!lastTrained[muscle] || date > lastTrained[muscle])) {
              lastTrained[muscle] = date;
            }
          });
        });
      });
    } catch(e) {}

    // Fuente 2: PR records
    var prs = {};
    try { prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}'); } catch (e) {}
    var exercises = prs.exercises || {};

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

  async function render() {
    var root = document.getElementById('fatigue-root');
    if (!root) return;

    var lastTrained = getLastTrained();
    var muscles     = {};
    Object.keys(MUSCLE_MAP).forEach(function (m) {
      muscles[m] = getStatus(m, lastTrained);
    });

    var hasData = Object.keys(lastTrained).length > 0;
    if (!hasData) {
      root.innerHTML = '<p class="fatigue-empty">Añade registros en Records 1RM para ver tu estado de recuperación muscular.</p>';
      return;
    }

    // Lista de recovery — se mantiene igual que antes
    var listHTML = '<div class="fatigue-list">'
      + Object.keys(LABELS).map(function (m) {
          var s       = muscles[m];
          var pctText = s.pct !== null ? s.pct + '% recuperado' : 'Sin datos';
          return '<div class="fatigue-item">'
            + '<div class="fatigue-item-dot" style="background:' + s.color + '"></div>'
            + '<div class="fatigue-item-body">'
            + '<div class="fatigue-item-name">' + LABELS[m] + '</div>'
            + '<div class="fatigue-item-sub">' + s.label + '</div>'
            + '</div>'
            + '<div class="fatigue-item-pct">' + pctText + '</div>'
            + '</div>';
        }).join('')
      + '</div>';

    // Layout: viewer AnatomyLens | lista de recovery
    root.innerHTML = '<div class="fatigue-layout">'
      + '<div><div id="fatigue-anatomy-wrap" class="anatomy-lens-container anatomy-lens-compact"></div></div>'
      + '<div>' + listHTML + '</div>'
      + '</div>';

    // Montar AnatomyLens overlay (async, silently degrade si CDN falla)
    try {
      var mod    = await import('./anatomyLens/index.js');
      var viewer = mod.createViewer();
      await viewer.init(document.getElementById('fatigue-anatomy-wrap'));

      var overlayData = Object.keys(RECOVERY_H).map(function (muscle) {
        var s = getStatus(muscle, lastTrained);
        if (s.pct === null) return null;
        return {
          key:       muscle,
          intensity: (100 - s.pct) / 100,
          status:    s.pct >= 100 ? 'fresh'
                   : s.pct >= 75  ? 'warming'
                   : s.pct >= 50  ? 'recovering' : 'tired',
          label:     s.label,
        };
      }).filter(Boolean);

      viewer.setOverlay(overlayData);
    } catch (e) {
      console.warn('[FatigueHeatmap] AnatomyLens overlay failed:', e);
      // Degradación silenciosa — la lista de recovery sigue visible
    }
  }

  function init() { render().catch(function(e) { console.warn('[FatigueHeatmap] render failed:', e); }); }

  return { init: init };
})();
