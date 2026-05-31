'use strict';
var AdminHealth = (function() {
  var _loading        = false;
  var _refreshInterval = null;
  var _lastUpdated    = null;
  var REFRESH_MS      = 30000;   // 30 segundos
  var _charts         = {};

  function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  // ── Live indicator ──────────────────────────────────────────────────────────
  function _updateLiveIndicator(isLoading) {
    var dot = document.getElementById('health-live-dot');
    var ts  = document.getElementById('health-live-ts');
    if (!dot || !ts) return;
    if (isLoading) {
      dot.className = 'live-dot live-dot--loading';
      ts.textContent = 'Actualizando…';
      return;
    }
    dot.className = 'live-dot live-dot--ok';
    if (!_lastUpdated) { ts.textContent = ''; return; }
    var secs = Math.round((Date.now() - _lastUpdated) / 1000);
    ts.textContent = secs < 5 ? 'ahora mismo' : 'hace ' + secs + 's';
  }

  // ── Semaphore grid ──────────────────────────────────────────────────────────
  var STATUS_CONFIG = {
    ok:    { icon: '✅', label: 'Activo',                  cls: 'status-ok'    },
    warn:  { icon: '⚠️',  label: 'Sin actividad reciente', cls: 'status-warn'  },
    empty: { icon: '⬜',  label: 'Sin datos',               cls: 'status-empty' },
    error: { icon: '❌', label: 'Error',                   cls: 'status-error' },
  };

  function formatRelative(isoStr) {
    if (!isoStr) return '—';
    var diff = Date.now() - new Date(isoStr).getTime();
    var m = Math.floor(diff / 60000);
    if (m < 1)    return 'hace un momento';
    if (m < 60)   return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24)   return 'hace ' + h + 'h';
    var d = Math.floor(h / 24);
    if (d < 30)   return 'hace ' + d + 'd';
    return new Date(isoStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  function renderSemaphore(items) {
    var container = document.getElementById('health-semaphore');
    if (!container) return;
    container.innerHTML = items.map(function(item) {
      var cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.warn;
      return '<div class="health-card ' + cfg.cls + '">' +
        '<div class="health-card-header">' +
          '<span class="health-icon">' + cfg.icon + '</span>' +
          '<span class="health-label">' + (item.label || item.module) + '</span>' +
        '</div>' +
        '<div class="health-stat">' + (item.total || 0).toLocaleString() + ' <span>total</span></div>' +
        '<div class="health-meta">' +
          '<span title="últimas 24h">24h: <strong>' + (item.active_24h || 0) + '</strong></span>' +
          '<span title="últimos 7 días">7d: <strong>' + (item.active_7d || 0) + '</strong></span>' +
        '</div>' +
        '<div class="health-last">Último: ' + formatRelative(item.last_record_at) + '</div>' +
        '<div class="health-status-label">' + cfg.label + '</div>' +
      '</div>';
    }).join('');
  }

  // ── Multi-module timeseries ─────────────────────────────────────────────────
  function renderTimeseriesMulti(points) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color       = '#7d8590';
    Chart.defaults.borderColor = '#30363d';
    destroyChart('multi');
    var ctx = document.getElementById('chart-multi');
    if (!ctx) return;
    var labels = points.map(function(p) { return p.date; });
    _charts['multi'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Usuarios',      data: points.map(function(p){ return p.users; }),    borderColor: '#00d4aa', backgroundColor: 'rgba(0,212,170,0.08)',  tension: 0.4, fill: false, pointRadius: 2 },
          { label: 'Entrenamientos',data: points.map(function(p){ return p.workouts; }), borderColor: '#c4a561', backgroundColor: 'rgba(196,165,97,0.08)', tension: 0.4, fill: false, pointRadius: 2 },
          { label: 'Posts',         data: points.map(function(p){ return p.posts; }),    borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,0.08)',   tension: 0.4, fill: false, pointRadius: 2 },
          { label: 'Rutinas',       data: points.map(function(p){ return p.routines; }), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', tension: 0.4, fill: false, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true } },
      },
    });
  }

  // ── Core data fetch ─────────────────────────────────────────────────────────
  function _fetchData() {
    if (_loading) return;
    _loading = true;
    _updateLiveIndicator(true);

    Promise.all([
      AdminAPI.getDbHealth(),
      AdminAPI.getTimeseriesMulti(30),
    ]).then(function(results) {
      renderSemaphore(results[0]);
      renderTimeseriesMulti(results[1]);
      _lastUpdated = Date.now();
      _loading = false;
      _updateLiveIndicator(false);
    }).catch(function(e) {
      _loading = false;
      _updateLiveIndicator(false);
      var el = document.getElementById('health-semaphore');
      if (el && el.querySelector('.empty-state')) {
        el.innerHTML = '<div class="empty-state">Error: ' + e.message + '</div>';
      }
      console.error('[AdminHealth] fetch error:', e);
    });
  }

  // Actualiza solo el timestamp en el indicador cada segundo (sin re-fetch)
  function _tickIndicator() {
    if (!_loading) _updateLiveIndicator(false);
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  function load() {
    _fetchData();
    if (!_refreshInterval) {
      _refreshInterval = setInterval(_fetchData, REFRESH_MS);
      // tick el indicador cada segundo para mostrar "hace X s"
      setInterval(_tickIndicator, 1000);
    }
  }

  function reset() {
    if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
    _loading = false;
    _lastUpdated = null;
  }

  return { load: load, reset: reset };
})();
