'use strict';
var AdminSystem = (function() {
  var _running = false;

  var STATUS_CONFIG = {
    ok:    { icon: '●', cls: 'sys-ok',    label: 'Online'       },
    warn:  { icon: '●', cls: 'sys-warn',  label: 'Advertencia'  },
    error: { icon: '●', cls: 'sys-error', label: 'Error'        },
  };

  function renderServices(items) {
    var container = document.getElementById('system-services');
    if (!container) return;
    container.innerHTML = items.map(function(svc) {
      var cfg     = STATUS_CONFIG[svc.status] || STATUS_CONFIG.warn;
      var latency = svc.latency_ms >= 0
        ? '<span class="sys-latency">' + svc.latency_ms + ' ms</span>'
        : '';
      return '<div class="sys-card">' +
        '<div class="sys-header">' +
          '<span class="' + cfg.cls + '">' + cfg.icon + '</span>' +
          '<span class="sys-name">' + svc.service + '</span>' +
          latency +
        '</div>' +
        '<div class="sys-detail">' + (svc.detail || '') + '</div>' +
      '</div>';
    }).join('');
  }

  function setRunning(running) {
    _running = running;
    var btn = document.getElementById('system-check-btn');
    if (btn) {
      btn.disabled    = running;
      btn.textContent = running ? 'Verificando…' : '▶ Verificar ahora';
    }
  }

  function runCheck() {
    if (_running) return;
    setRunning(true);
    var ts = document.getElementById('system-last-check');
    if (ts) ts.textContent = '';

    AdminAPI.getSystemHealth().then(function(items) {
      renderServices(items);
      if (ts) ts.textContent = 'Última verificación: ' + new Date().toLocaleTimeString('es-ES');
    }).catch(function(e) {
      var container = document.getElementById('system-services');
      if (container) container.innerHTML =
        '<div class="empty-state">Error al verificar: ' + e.message + '</div>';
    }).finally(function() {
      setRunning(false);
    });
  }

  function load() {
    var btn = document.getElementById('system-check-btn');
    if (btn) {
      btn.removeEventListener('click', runCheck);
      btn.addEventListener('click', runCheck);
    }
    // Auto-run first check when section is opened
    runCheck();
  }

  return { load: load };
})();
