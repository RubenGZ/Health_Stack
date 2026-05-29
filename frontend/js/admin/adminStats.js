'use strict';
var AdminStats = (function() {
  var _loaded = false;
  var _charts = {};

  function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  function chartDefaults() {
    if (typeof Chart === 'undefined') return false;
    Chart.defaults.color       = '#7d8590';
    Chart.defaults.borderColor = '#30363d';
    return true;
  }

  function renderKPIs(data) {
    document.getElementById('kpi-total').textContent  = data.total_users.toLocaleString();
    document.getElementById('kpi-active').textContent = data.active_users_30d.toLocaleString();
    document.getElementById('kpi-today').textContent  = data.new_users_today.toLocaleString();
    document.getElementById('kpi-admins').textContent = data.admin_count.toLocaleString();
  }

  function renderTimeseries(points) {
    if (!chartDefaults()) return;
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
          tension: 0.4, fill: true, pointRadius: 3,
        }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 8 } } } },
    });
  }

  function renderModules(modules) {
    if (!chartDefaults()) return;
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
          backgroundColor: '#c4a561', borderRadius: 4,
        }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  function renderPlansDonut(plans) {
    if (!chartDefaults()) return;
    destroyChart('plans');
    var ctx = document.getElementById('chart-plans');
    if (!ctx) return;
    // plans = [{plan, count}, ...] from real /stats/plans endpoint
    var labels = plans.map(function(p) { return p.plan.charAt(0).toUpperCase() + p.plan.slice(1); });
    var data   = plans.map(function(p) { return p.count; });
    var colors = { free: '#7d8590', pro: '#c4a561', elite: '#f59e0b' };
    var bgColors = plans.map(function(p) { return colors[p.plan] || '#7d8590'; });

    _charts['plans'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 0 }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '65%' },
    });
  }

  function load() {
    if (_loaded) return;   // avoid reloading on every nav click
    _loaded = true;

    if (!chartDefaults()) {
      var main = document.getElementById('section-overview');
      if (main) main.insertAdjacentHTML('afterbegin',
        '<div style="color:#da3633;padding:8px 0;">⚠️ Chart.js no disponible. Recarga la página.</div>');
      return;
    }

    AdminAPI.getOverview().then(function(data) {
      renderKPIs(data);
    }).catch(function(e) { console.error('Overview error:', e); });

    AdminAPI.getPlans().then(function(plans) {
      renderPlansDonut(plans);
    }).catch(function(e) {
      console.error('Plans error:', e);
      // fallback: empty donut
      renderPlansDonut([{ plan: 'free', count: 1 }]);
    });

    AdminAPI.getTimeseries(30).then(renderTimeseries).catch(function(e) { console.error('Timeseries error:', e); });
    AdminAPI.getModules().then(renderModules).catch(function(e) { console.error('Modules error:', e); });
  }

  function reset() { _loaded = false; }

  return { load: load, reset: reset };
})();
