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

  // ── Maintenance mode toggle ───────────────────────────────────────────────
  function _updateMaintenanceBadge(active) {
    var badge = document.getElementById('maintenance-status-badge');
    var btn   = document.getElementById('maintenance-toggle-btn');
    if (!badge || !btn) return;
    if (active) {
      badge.textContent = 'ACTIVO';
      badge.style.background = 'rgba(239,68,68,0.15)';
      badge.style.color       = '#f87171';
      badge.style.borderColor = 'rgba(239,68,68,0.3)';
      btn.textContent = 'Desactivar';
      btn.style.background = '#ef4444';
    } else {
      badge.textContent = 'DESACTIVADO';
      badge.style.background = 'rgba(34,197,94,0.15)';
      badge.style.color       = '#4ade80';
      badge.style.borderColor = 'rgba(34,197,94,0.3)';
      btn.textContent = 'Activar';
      btn.style.background = '';
    }
  }

  function _loadMaintenanceStatus() {
    AdminAPI.getMaintenance().then(function(data) {
      _updateMaintenanceBadge(data.active);
    }).catch(function() {});
  }

  function _toggleMaintenance() {
    var btn = document.getElementById('maintenance-toggle-btn');
    var badge = document.getElementById('maintenance-status-badge');
    var isActive = badge && badge.textContent === 'ACTIVO';
    if (btn) btn.disabled = true;

    AdminAPI.setMaintenance(!isActive).then(function(data) {
      _updateMaintenanceBadge(data.active);
      var msg = data.active
        ? '🐱 Modo mantenimiento ACTIVADO — usuarios verán el gatito'
        : '✅ Modo mantenimiento desactivado';
      if (typeof showToast === 'function') showToast(msg, data.active ? 'warning' : 'success');
    }).catch(function(e) {
      if (typeof showToast === 'function') showToast('Error: ' + e.message, 'error');
    }).finally(function() {
      if (btn) btn.disabled = false;
    });
  }

  function load() {
    var btn = document.getElementById('system-check-btn');
    if (btn) {
      btn.removeEventListener('click', runCheck);
      btn.addEventListener('click', runCheck);
    }

    var toggleBtn = document.getElementById('maintenance-toggle-btn');
    if (toggleBtn) {
      toggleBtn.removeEventListener('click', _toggleMaintenance);
      toggleBtn.addEventListener('click', _toggleMaintenance);
    }

    _loadMaintenanceStatus();
    // Auto-run first check when section is opened
    runCheck();
  }

  return { load: load };
})();
