'use strict';
var AdminMetrics = (function() {
  var _chart  = null;
  var _loaded = false;

  function load() {
    if (_loaded) return;
    _loaded = true;

    // Ping health endpoint for API status
    var IS_PROD    = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    var healthUrl  = IS_PROD
      ? ('https://' + location.hostname + '/health')
      : 'http://localhost:8000/health';

    var uptimeEl = document.getElementById('metrics-uptime');
    if (uptimeEl) uptimeEl.textContent = '…';

    fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
      .then(function(r) {
        if (uptimeEl) uptimeEl.textContent = r.ok ? '✓ Online' : '✗ Error ' + r.status;
      })
      .catch(function() {
        if (uptimeEl) uptimeEl.textContent = '✗ Offline';
      });

    AdminAPI.getMetrics().then(function(data) {
      var pvToday = document.getElementById('metrics-pv-today');
      var pv7d    = document.getElementById('metrics-pv-7d');
      if (pvToday) pvToday.textContent = (data.page_views_today || 0).toLocaleString();
      if (pv7d)    pv7d.textContent    = (data.page_views_7d    || 0).toLocaleString();

      if (data.top_endpoints && data.top_endpoints.length > 0 && typeof Chart !== 'undefined') {
        renderEndpointsChart(data.top_endpoints);
      } else {
        // Show empty state instead of leaving canvas blank
        var container = document.getElementById('chart-endpoints-wrap');
        if (container) container.innerHTML =
          '<div class="empty-state" style="padding:40px;">Sin datos de tráfico aún</div>';
      }
    }).catch(function(e) { console.error('Metrics error:', e); });
  }

  function renderEndpointsChart(endpoints) {
    if (_chart) { _chart.destroy(); _chart = null; }
    var ctx = document.getElementById('chart-endpoints');
    if (!ctx) return;
    Chart.defaults.color       = '#7d8590';
    Chart.defaults.borderColor = '#30363d';
    _chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: endpoints.map(function(e) { return e.endpoint || e[0] || ''; }),
        datasets: [{
          label: 'Visitas (7d)',
          data: endpoints.map(function(e) { return e.count || e[1] || 0; }),
          backgroundColor: '#00d4aa', borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });
  }

  function reset() { _loaded = false; }

  return { load: load, reset: reset };
})();
