/* ============================================================
   celebrations.js — Canvas confetti engine HealthStack Pro
   Sin dependencias externas. Partículas doradas + acentos.

   API global:
     Celebrations.firePR()           → confetti burst for a PR
     Celebrations.fireWorkoutDone()  → full celebration + sustained burst
     Celebrations.stop()             → cleanup
   ============================================================ */

(function () {
  'use strict';

  // ── Paleta brand ────────────────────────────────────────────
  const COLORS_PR   = ['#c4a561','#e0c882','#f5e6b8','#a07830','#ffffff'];
  const COLORS_DONE = ['#c4a561','#e0c882','#f5e6b8','#a07830','#ffffff','#d4b97a','#ffd700'];

  let _canvas  = null;
  let _ctx     = null;
  let _rafId   = null;
  let _particles = [];

  // ── Crear / reutilizar canvas ────────────────────────────────
  function _ensureCanvas() {
    if (_canvas && document.body.contains(_canvas)) return;
    _canvas = document.createElement('canvas');
    _canvas.id = 'hs-confetti-canvas';
    Object.assign(_canvas.style, {
      position:      'fixed',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '10000',
    });
    document.body.appendChild(_canvas);
    _resize();
  }

  function _resize() {
    if (!_canvas) return;
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
    _ctx = _canvas.getContext('2d');
  }

  // ── Partícula ────────────────────────────────────────────────
  function _makeParticle(colors, originX, originY, spread, burstV) {
    const angle  = (Math.random() * spread - spread / 2) - Math.PI / 2;
    const speed  = burstV + Math.random() * burstV * 0.8;
    return {
      x:      originX,
      y:      originY,
      vx:     Math.cos(angle) * speed,
      vy:     Math.sin(angle) * speed,
      size:   4 + Math.random() * 6,
      color:  colors[Math.floor(Math.random() * colors.length)],
      alpha:  1,
      rot:    Math.random() * Math.PI * 2,
      rotV:   (Math.random() - 0.5) * 0.3,
      wobble: Math.random() * Math.PI * 2,
      shape:  Math.random() > 0.45 ? 'rect' : 'circle',
    };
  }

  function _spawnBurst(count, colors, originX, originY, spread, burstV) {
    for (let i = 0; i < count; i++) {
      _particles.push(_makeParticle(colors, originX, originY, spread, burstV));
    }
  }

  // ── Loop de animación ────────────────────────────────────────
  function _loop() {
    if (!_ctx) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    const gravity   = 0.22;
    const drag      = 0.992;
    const fadeSpeed = 0.012;

    _particles = _particles.filter(p => p.alpha > 0.02);

    for (const p of _particles) {
      p.vy     += gravity;
      p.vx     *= drag;
      p.x      += p.vx;
      p.y      += p.vy;
      p.rot    += p.rotV;
      p.wobble += 0.08;
      p.alpha  -= fadeSpeed;

      _ctx.save();
      _ctx.globalAlpha = Math.max(0, p.alpha);
      _ctx.translate(p.x, p.y);
      _ctx.rotate(p.rot);
      _ctx.fillStyle = p.color;

      const w = p.size * (1 + 0.3 * Math.sin(p.wobble));
      const h = p.size * 0.45;

      if (p.shape === 'rect') {
        _ctx.fillRect(-w / 2, -h / 2, w, h);
      } else {
        _ctx.beginPath();
        _ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
        _ctx.fill();
      }
      _ctx.restore();
    }

    if (_particles.length > 0) {
      _rafId = requestAnimationFrame(_loop);
    } else {
      _cleanup();
    }
  }

  function _startLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = requestAnimationFrame(_loop);
  }

  function _cleanup() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_canvas && _particles.length === 0) {
      setTimeout(() => {
        if (_canvas && _particles.length === 0) {
          _canvas.remove();
          _canvas = null;
          _ctx    = null;
        }
      }, 400);
    }
  }

  // ── API pública ──────────────────────────────────────────────

  /**
   * Burst de celebración para un Personal Record.
   * Explosión desde arriba-centro + puntos dorados.
   */
  function firePR() {
    _ensureCanvas();
    const cx = _canvas.width  * 0.5;
    const cy = _canvas.height * 0.18;
    _spawnBurst(90, COLORS_PR, cx, cy, Math.PI * 1.4, 14);
    _startLoop();
  }

  /**
   * Celebración completa al terminar un entreno.
   * Dos rafagas desde esquinas + lluvia central.
   */
  function fireWorkoutDone() {
    _ensureCanvas();
    const W = _canvas.width;
    const H = _canvas.height;

    // Dos cañones desde esquinas superiores
    _spawnBurst(80, COLORS_DONE, W * 0.15, H * 0.05, Math.PI * 0.8, 16);
    _spawnBurst(80, COLORS_DONE, W * 0.85, H * 0.05, Math.PI * 0.8, 16);

    // Centro
    _spawnBurst(60, COLORS_DONE, W * 0.5, H * 0.02, Math.PI * 1.1, 12);

    // Segunda oleada con delay
    setTimeout(() => {
      if (!_canvas) return;
      _spawnBurst(50, COLORS_DONE, W * 0.3, H * 0.08, Math.PI * 0.9, 13);
      _spawnBurst(50, COLORS_DONE, W * 0.7, H * 0.08, Math.PI * 0.9, 13);
    }, 450);

    _startLoop();
  }

  /** Forzar parada y limpieza (p.ej. al navegar). */
  function stop() {
    _particles = [];
    _cleanup();
  }

  // Limpiar al navegar entre secciones
  window.addEventListener('hs:section-changed', stop);

  // ── Export ───────────────────────────────────────────────────
  window.Celebrations = { firePR, fireWorkoutDone, stop };

})();
