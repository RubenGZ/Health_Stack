var Records = (function () {
  'use strict';

  var LS_KEY = 'hs_pr_records';

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { exercises: {} };
    } catch (e) {
      return { exercises: {} };
    }
  }

  function save(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  function epley(weight, reps) {
    if (reps === 1) return weight;
    return +(weight * (1 + reps / 30)).toFixed(1);
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function addEntry(exercise, weight, reps) {
    var data = load();
    if (!data.exercises[exercise]) data.exercises[exercise] = [];
    data.exercises[exercise].push({
      id: uuid(),
      date: new Date().toISOString().slice(0, 10),
      weight: +weight,
      reps: +reps,
      rm: epley(+weight, +reps),
    });
    data.exercises[exercise].sort(function (a, b) {
      return b.date.localeCompare(a.date);
    });
    save(data);
  }

  function deleteEntry(exercise, id) {
    var data = load();
    if (!data.exercises[exercise]) return;
    data.exercises[exercise] = data.exercises[exercise].filter(function (e) {
      return e.id !== id;
    });
    if (!data.exercises[exercise].length) delete data.exercises[exercise];
    save(data);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }

  function renderLeaderboard() {
    var container = document.getElementById('rm-leaderboard');
    if (!container) return;

    var data  = load();
    var names = Object.keys(data.exercises);

    if (!names.length) {
      container.innerHTML = '<p class="rm-empty">Aún no tienes records.<br>Añade tu primer intento para empezar.</p>';
      return;
    }

    var html = '';
    names.forEach(function (name) {
      var entries = data.exercises[name];
      var bestRM  = Math.max.apply(null, entries.map(function (e) { return e.rm; }));

      html += '<div class="card rm-exercise-block" style="padding:20px">';
      html += '<h3 class="rm-exercise-name">' + escHtml(name);
      html += ' <span class="rm-best-badge">1RM: ' + bestRM + ' kg</span></h3>';
      html += '<table class="rm-table"><thead><tr>';
      html += '<th>Fecha</th><th>Peso levantado</th><th>Reps</th><th>1RM estimado</th><th></th>';
      html += '</tr></thead><tbody>';

      entries.forEach(function (e) {
        var isPR = e.rm === bestRM;
        html += '<tr' + (isPR ? ' class="rm-pr-row"' : '') + '>';
        html += '<td>' + e.date + '</td>';
        html += '<td>' + e.weight + ' kg</td>';
        html += '<td>' + e.reps + '</td>';
        html += '<td class="rm-1rm-val">' + e.rm + ' kg' + (isPR ? ' 🏆' : '') + '</td>';
        html += '<td><button class="rm-delete-btn" data-exercise="' + escAttr(name) + '" data-id="' + escAttr(e.id) + '" title="Eliminar">✕</button></td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    });

    container.innerHTML = html;

    container.querySelectorAll('.rm-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteEntry(btn.dataset.exercise, btn.dataset.id);
        renderLeaderboard();
      });
    });
  }

  function initForm() {
    var openBtn   = document.getElementById('btn-open-rm-form');
    var cancelBtn = document.getElementById('btn-cancel-rm');
    var saveBtn   = document.getElementById('btn-save-rm');
    var wrapper   = document.getElementById('rm-form-wrapper');

    if (!openBtn || !wrapper) return;

    openBtn.addEventListener('click', function () {
      wrapper.style.display = wrapper.style.display === 'none' ? 'block' : 'none';
    });

    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      wrapper.style.display = 'none';
    });

    if (saveBtn) saveBtn.addEventListener('click', function () {
      var exercise = (document.getElementById('rm-exercise').value || '').trim();
      var weight   = parseFloat(document.getElementById('rm-weight').value);
      var reps     = parseInt(document.getElementById('rm-reps').value, 10);

      if (!exercise) { alert('Introduce el nombre del ejercicio.'); return; }
      if (!weight || weight <= 0) { alert('Introduce un peso válido.'); return; }
      if (!reps || reps < 1 || reps > 30) { alert('Las repeticiones deben ser entre 1 y 30.'); return; }

      addEntry(exercise, weight, reps);
      document.getElementById('rm-exercise').value = '';
      document.getElementById('rm-weight').value   = '';
      document.getElementById('rm-reps').value     = '';
      wrapper.style.display = 'none';
      renderLeaderboard();
    });
  }

  function init() {
    renderLeaderboard();
    initForm();
  }

  return { init: init };
})();
