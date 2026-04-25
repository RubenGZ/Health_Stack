var RestTimer = (function () {
  'use strict';

  var _timer     = null;
  var _total     = 0;
  var _remaining = 0;
  var _warned    = false;
  var CIRC       = 2 * Math.PI * 52;

  function fmt(s) {
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function setType(reps, rpe) {
    if (reps <= 5 && (rpe === null || rpe >= 8)) return { label: 'Fuerza',       seconds: 210, color: '#f87171' };
    if (reps <= 12)                               return { label: 'Hipertrofia',  seconds: 90,  color: '#22d3ee' };
    return                                               { label: 'Accesorio',    seconds: 60,  color: '#34d399' };
  }

  function beep(freq, dur) {
    try {
      var ctx  = new (window.AudioContext || window.webkitAudioContext)();
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function ring(remaining, total, color) {
    var fill = document.getElementById('rest-ring-fill');
    if (!fill) return;
    var offset = CIRC * (1 - remaining / total);
    fill.style.strokeDasharray  = CIRC.toFixed(2);
    fill.style.strokeDashoffset = offset.toFixed(2);
    fill.style.stroke = color;
  }

  function tick(type) {
    var lbl  = document.getElementById('rest-time-label');
    var hint = document.getElementById('rest-next-hint');
    if (!lbl) { stopTimer(); return; }
    _remaining--;
    lbl.textContent = fmt(_remaining);
    ring(_remaining, _total, type.color);
    if (!_warned && _remaining <= Math.floor(_total * 0.20)) {
      _warned = true;
      beep(880, 0.15);
      if (navigator.vibrate) navigator.vibrate(100);
      if (hint) hint.textContent = '¡Prepárate!';
    }
    if (_remaining <= 0) {
      stopTimer();
      beep(660, 0.25);
      setTimeout(function () { beep(880, 0.3); }, 280);
      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
      if (lbl)  lbl.textContent  = '¡Listo!';
      if (hint) hint.textContent = 'Descanso completado';
    }
  }

  function startTimer(reps, rpe) {
    var type = setType(reps, rpe);
    _total = _remaining = type.seconds;
    _warned = false;
    var stEl = document.getElementById('rest-set-type');
    var lbl  = document.getElementById('rest-time-label');
    var hint = document.getElementById('rest-next-hint');
    if (stEl) stEl.textContent = type.label;
    if (lbl)  lbl.textContent  = fmt(_remaining);
    if (hint) hint.textContent = '';
    var fill = document.getElementById('rest-ring-fill');
    if (fill) { fill.style.strokeDasharray = CIRC.toFixed(2); fill.style.strokeDashoffset = '0'; fill.style.stroke = type.color; }
    document.getElementById('rest-form').style.display          = 'none';
    document.getElementById('rest-timer-display').style.display = 'block';
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function () { tick(type); }, 1000);
  }

  function stopTimer() { if (_timer) { clearInterval(_timer); _timer = null; } }

  function openModal() {
    document.getElementById('rest-form').style.display          = 'block';
    document.getElementById('rest-timer-display').style.display = 'none';
    document.getElementById('rest-timer-overlay').style.display = 'flex';
    stopTimer();
    var fill = document.getElementById('rest-ring-fill');
    if (fill) { fill.style.strokeDasharray = CIRC.toFixed(2); fill.style.strokeDashoffset = CIRC.toFixed(2); }
  }

  function closeModal() {
    stopTimer();
    document.getElementById('rest-timer-overlay').style.display = 'none';
  }

  function init() {
    document.getElementById('rest-timer-fab')?.addEventListener('click', openModal);
    document.getElementById('rest-close')?.addEventListener('click', closeModal);
    document.getElementById('rest-skip-btn')?.addEventListener('click', closeModal);
    var overlay = document.getElementById('rest-timer-overlay');
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.getElementById('rest-start-btn')?.addEventListener('click', function () {
      var reps = parseInt(document.getElementById('rt-reps').value, 10);
      var rpe  = parseFloat(document.getElementById('rt-rpe').value) || null;
      if (!reps || reps < 1) { alert('Introduce las repeticiones realizadas.'); return; }
      startTimer(reps, rpe);
    });
  }

  return { init: init };
})();
