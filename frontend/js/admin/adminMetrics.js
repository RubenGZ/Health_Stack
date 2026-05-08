'use strict';
var AdminMetrics = (function() {
  var _chart = null;

  function load() {
    AdminAPI.getMetrics().then(function(data) {
      var pvToday = document.getElementById('metrics-pv-today');
      var pv7d = document.getElementById('metrics-pv-7d');
      var uptime = document.getElementById('metrics-uptime');
      if (pvToday) pvToday.textContent = (data.page_views_today || 0).toLocaleString();
      if (pv7d) pv7d.textContent = (data.page_views_7d || 0).toLocaleString();
      if (uptime) uptime.textContent = '—';

      if (data.top_endpoints && data.top_endpoints.length > 0 && typeof Chart !== 'undefined') {
        renderEndpointsChart(data.top_endpoints);
      }
    }).catch(function(e) { console.error('Metrics error:', e); });

    // Ping health endpoint for uptime
    var IS_PROD = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    var healthUrl = IS_PROD ? ('https://' + location.hostname + '/health') : 'http://localhost:8000/health';
    fetch(healthUrl, {signal: AbortSignal.timeout(3000)}).then(function(r) {
      var el = document.getElementById('metrics-uptime');
      if (el) el.textContent = r.ok ? '✓ Online' : '✗ Error';
    }).catch(function() {
      var el = document.getElementById('metrics-uptime');
      if (el) el.textContent = '✗ Offline';
    });
  }

  function renderEndpointsChart(endpoints) {
    if (_chart) { _chart.destroy(); _chart = null; }
    var ctx = document.getElementById('chart-endpoints');
    if (!ctx) return;
    Chart.defaults.color = '#7d8590';
    Chart.defaults.borderColor = '#30363d';
    _chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: endpoints.map(function(e) { return e.endpoint || e[0] || ''; }),
        datasets: [{
          label: 'Llamadas',
          data: endpoints.map(function(e) { return e.count || e[1] || 0; }),
          backgroundColor: '#00d4aa',
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }

  return { load: load };
})();
