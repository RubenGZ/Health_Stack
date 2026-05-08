'use strict';
var AdminStats = (function() {
  var _loaded = false;
  var _charts = {};

  function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  function renderKPIs(data) {
    document.getElementById('kpi-total').textContent = data.total_users.toLocaleString();
    document.getElementById('kpi-active').textContent = data.active_users_30d.toLocaleString();
    document.getElementById('kpi-today').textContent = data.new_users_today.toLocaleString();
    document.getElementById('kpi-admins').textContent = data.admin_count.toLocaleString();
  }

  function renderTimeseries(points) {
    destroyChart('timeseries');
    var ctx = document.getElementById('chart-timeseries');
    if (!ctx) return;
    _charts['timeseries'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: points.map(function(p) { return p.date; }),
        datasets: [{
          label: 'Nuevos usuarios',
          data: points.map(function(p) { return p.count; }),
          borderColor: '#00d4aa',
          backgroundColor: 'rgba(0,212,170,0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 8 } } } }
    });
  }

  function renderModules(modules) {
    destroyChart('modules');
    var ctx = document.getElementById('chart-modules');
    if (!ctx) return;
    _charts['modules'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: modules.map(function(m) { return m.module; }),
        datasets: [{
          label: 'Registros',
          data: modules.map(function(m) { return m.count; }),
          backgroundColor: '#6c63ff',
          borderRadius: 4,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function renderPlansDonut(data) {
    destroyChart('plans');
    var ctx = document.getElementById('chart-plans');
    if (!ctx) return;
    // TODO: add /stats/plans endpoint to get real plan distribution
    _charts['plans'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Free', 'Pro', 'Elite'],
        datasets: [{
          data: [data.total_users, 0, 0],
          backgroundColor: ['#7d8590', '#6c63ff', '#f59e0b'],
          borderWidth: 0,
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '65%' }
    });
  }

  function load() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#7d8590';
    Chart.defaults.borderColor = '#30363d';

    AdminAPI.getOverview().then(function(data) {
      renderKPIs(data);
      renderPlansDonut(data);
    }).catch(function(e) { console.error('Overview error:', e); });

    AdminAPI.getTimeseries(30).then(renderTimeseries).catch(function(e) { console.error('Timeseries error:', e); });
    AdminAPI.getModules().then(renderModules).catch(function(e) { console.error('Modules error:', e); });
  }

  return { load: load };
})();
