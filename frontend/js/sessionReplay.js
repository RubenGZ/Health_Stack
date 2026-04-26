var SessionReplay = (function () {
  'use strict';

  var LS_KEY      = 'hs_session_log';   // [{id, date, name, sets:[{exercise,weight,reps,note,noteBlob,ts}]}]
  var MAX_NOTE_MS = 5000;               // 5 s voice cap
  var _recorder    = null;
  var _chunks      = [];
  var _activeSetEl = null;
  var _wired       = false;

  // ── Storage helpers ────────────────────────────────────────────
  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveSessions(sessions) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(sessions)); } catch (e) {}
  }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── Active session state ───────────────────────────────────────
  var _sessionId   = null;
  var _sessionName = null;

  function getActive() {
    return loadSessions().find(function (s) { return s.id === _sessionId; }) || null;
  }

  function upsertActive(mutate) {
    var sessions = loadSessions();
    var idx = sessions.findIndex(function (s) { return s.id === _sessionId; });
    if (idx === -1) return;
    mutate(sessions[idx]);
    saveSessions(sessions);
  }

  // ── Voice note recording ───────────────────────────────────────
  function startRecording(setIdx) {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      _chunks = [];
      _recorder = new MediaRecorder(stream);
      _recorder.ondataavailable = function (e) { if (e.data.size) _chunks.push(e.data); };
      _recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(_chunks, { type: 'audio/webm' });
        var reader = new FileReader();
        reader.onload = function () {
          upsertActive(function (s) {
            if (s.sets[setIdx]) s.sets[setIdx].noteBlob = reader.result;
          });
          renderTimeline(document.getElementById('sr-timeline'));
        };
        reader.readAsDataURL(blob);
      };
      _recorder.start();
      setTimeout(function () {
        if (_recorder && _recorder.state === 'recording') _recorder.stop();
      }, MAX_NOTE_MS);

      // update button state
      if (_activeSetEl) _activeSetEl.classList.add('sr-recording');
    }).catch(function () {});
  }

  function stopRecording() {
    if (_recorder && _recorder.state === 'recording') _recorder.stop();
    if (_activeSetEl) _activeSetEl.classList.remove('sr-recording');
  }

  // ── Add set ───────────────────────────────────────────────────
  function addSet(exercise, weight, reps, note) {
    if (!_sessionId) return;
    upsertActive(function (s) {
      s.sets.push({
        id: genId(),
        exercise: exercise,
        weight: weight,
        reps: reps,
        note: note || '',
        noteBlob: null,
        ts: Date.now(),
      });
    });
  }

  // ── Render timeline ────────────────────────────────────────────
  function renderTimeline(container) {
    if (!container) return;
    var session = getActive();
    if (!session || !session.sets.length) {
      container.innerHTML = '<p class="sr-empty">Añade series con el formulario para empezar el diario.</p>';
      return;
    }

    var html = session.sets.map(function (set, i) {
      var time = new Date(set.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      var hasNote = set.noteBlob || set.note;
      return '<div class="sr-set-item">'
        + '<div class="sr-set-dot"></div>'
        + '<div class="sr-set-body">'
        + '<div class="sr-set-meta">'
        + '<span class="sr-set-time">' + time + '</span>'
        + '<span class="sr-set-ex">' + escHtml(set.exercise) + '</span>'
        + '</div>'
        + '<div class="sr-set-numbers">'
        + '<span class="sr-set-val">' + set.weight + '<span class="sr-set-unit">kg</span></span>'
        + '<span class="sr-set-sep">×</span>'
        + '<span class="sr-set-val">' + set.reps + '<span class="sr-set-unit">rep</span></span>'
        + '</div>'
        + (set.note ? '<p class="sr-set-note">"' + escHtml(set.note) + '"</p>' : '')
        + (set.noteBlob
          ? '<audio class="sr-audio" controls src="' + set.noteBlob + '"></audio>'
          : '<button class="sr-rec-btn" data-idx="' + i + '" title="Grabar nota de voz">🎙</button>'
        )
        + '</div>'
        + '<button class="sr-del-set" data-idx="' + i + '" title="Eliminar">✕</button>'
        + '</div>';
    }).join('');

    container.innerHTML = '<div class="sr-timeline-line">' + html + '</div>';

    // wire delete buttons
    container.querySelectorAll('.sr-del-set').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        upsertActive(function (s) { s.sets.splice(idx, 1); });
        renderTimeline(container);
      });
    });

    // wire record buttons
    container.querySelectorAll('.sr-rec-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        _activeSetEl = btn;
        startRecording(idx);
      });
    });
  }

  // ── Render past sessions list ──────────────────────────────────
  function renderHistory(container) {
    if (!container) return;
    var sessions = loadSessions().filter(function (s) { return s.id !== _sessionId; });
    sessions.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    if (!sessions.length) {
      container.innerHTML = '<p class="sr-empty">Sin sesiones previas aún.</p>';
      return;
    }

    var html = sessions.slice(0, 10).map(function (s) {
      var d = new Date(s.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
      return '<div class="sr-hist-item">'
        + '<div class="sr-hist-info">'
        + '<span class="sr-hist-name">' + escHtml(s.name || 'Sesión') + '</span>'
        + '<span class="sr-hist-date">' + d + ' · ' + s.sets.length + ' series</span>'
        + '</div>'
        + '<button class="sr-hist-del btn btn--ghost" data-id="' + escAttr(s.id) + '">Borrar</button>'
        + '</div>';
    }).join('');

    container.innerHTML = html;

    container.querySelectorAll('.sr-hist-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.id;
        var sessions2 = loadSessions().filter(function (s) { return s.id !== id; });
        saveSessions(sessions2);
        renderHistory(container);
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    var root = document.getElementById('sr-root');
    if (!root) return;

    // Start a new session if none active today
    var todayStr = new Date().toISOString().slice(0, 10);
    var sessions = loadSessions();
    var todaySess = sessions.find(function (s) { return s.date && s.date.slice(0, 10) === todayStr; });

    if (todaySess) {
      _sessionId   = todaySess.id;
      _sessionName = todaySess.name;
    } else {
      _sessionId   = genId();
      _sessionName = 'Sesión ' + new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
      sessions.push({ id: _sessionId, date: new Date().toISOString(), name: _sessionName, sets: [] });
      saveSessions(sessions);
    }

    // Render session title
    var titleEl = root.querySelector('#sr-session-name');
    if (titleEl) titleEl.textContent = _sessionName;

    // Wire add-set form (guard against duplicate listeners on re-init)
    var form = root.querySelector('#sr-add-form');
    if (_wired) { renderTimeline(root.querySelector('#sr-timeline')); renderHistory(root.querySelector('#sr-history')); return; }
    _wired = true;
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ex  = form.querySelector('#sr-ex').value.trim();
        var wt  = parseFloat(form.querySelector('#sr-wt').value) || 0;
        var rp  = parseInt(form.querySelector('#sr-rp').value, 10) || 0;
        var nt  = form.querySelector('#sr-note').value.trim();
        if (!ex || !wt || !rp) return;
        addSet(ex, wt, rp, nt);
        form.querySelector('#sr-note').value = '';
        renderTimeline(root.querySelector('#sr-timeline'));
      });
    }

    renderTimeline(root.querySelector('#sr-timeline'));
    renderHistory(root.querySelector('#sr-history'));
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) { return escHtml(s); }

  return { init: init };
})();
