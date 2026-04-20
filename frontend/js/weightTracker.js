/* ============================================================
   weightTracker.js — Tracking de peso con Chart.js
   CRUD completo en localStorage + gráfica lineal interactiva
   + análisis semanal con mensajes de ajuste automático.
   ============================================================ */

const WeightTracker = (function () {
  'use strict';

  const LS_KEY = 'hs_weight_entries';

  let chartInstance = null;
  let miniChartInstance = null;
  let currentRange = 30;
  let editingId = null;

  // ── LocalStorage CRUD ──────────────────────────────────────
  function getAll() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function save(entries) {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event('hs:weight-updated'));
  }

  function addEntry(date, weight, notes) {
    const entries = getAll();
    const existing = entries.find(e => e.date === date);
    const isNew = !existing;
    if (existing) {
      existing.weight = weight;
      existing.notes  = notes;
    } else {
      entries.push({ id: Date.now(), date, weight: parseFloat(weight), notes: notes || '' });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    save(entries);

    // Confetti una vez por día en entradas nuevas
    if (isNew) {
      const confettiKey = 'hs_confetti_' + new Date().toDateString();
      if (!sessionStorage.getItem(confettiKey)) {
        sessionStorage.setItem(confettiKey, '1');
        launchConfetti();
      }
    }

    return entries;
  }

  // ── Confetti canvas puro (sin dependencias) ───────────────
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = '';

    const COLORS = ['#6c63ff','#00d2ff','#10b981','#f59e0b','#ff6584','#a78bfa','#fb923c'];
    const particles = Array.from({ length: 120 }, () => ({
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height * -1,
      r:    Math.random() * 8 + 4,
      d:    Math.random() * 3 + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.05,
    }));

    let frame = 0;
    const MAX_FRAMES = 160;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.tiltAngle += p.tiltSpeed;
        p.y         += p.d + 1;
        p.x         += Math.sin(p.tiltAngle) * 2;
        p.tilt       = Math.sin(p.tiltAngle) * 12;

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });

      frame++;
      if (frame < MAX_FRAMES) {
        requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
      }
    }

    requestAnimationFrame(draw);
  }

  function updateEntry(id, date, weight, notes) {
    const entries = getAll();
    const idx = entries.findIndex(e => e.id === id);
    if (idx !== -1) {
      entries[idx] = { id, date, weight: parseFloat(weight), notes: notes || '' };
      entries.sort((a, b) => a.date.localeCompare(b.date));
      save(entries);
    }
    return entries;
  }

  function deleteEntry(id) {
    const entries = getAll().filter(e => e.id !== id);
    save(entries);
    return entries;
  }

  // ── Filtrado por rango ─────────────────────────────────────
  function filterByRange(entries, days) {
    if (!days) return entries;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutStr = cutoff.toISOString().split('T')[0];
    return entries.filter(e => e.date >= cutStr);
  }

  // ── Formateador de fecha ───────────────────────────────────
  function fmtDate(str) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }

  function fmtDateLong(str) {
    const [y, m, d] = str.split('-');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
  }

  // ── Análisis semanal ───────────────────────────────────────
  function weeklyAnalysis(entries) {
    if (entries.length < 2) return null;

    const now   = new Date();
    const w1End = new Date(now); w1End.setDate(now.getDate() - 0);
    const w1Sta = new Date(now); w1Sta.setDate(now.getDate() - 7);
    const w2End = new Date(now); w2End.setDate(now.getDate() - 7);
    const w2Sta = new Date(now); w2Sta.setDate(now.getDate() - 14);

    const toStr = d => d.toISOString().split('T')[0];

    const thisWeek = entries.filter(e => e.date >= toStr(w1Sta) && e.date <= toStr(w1End));
    const lastWeek = entries.filter(e => e.date >= toStr(w2Sta) && e.date <= toStr(w2End));

    if (!thisWeek.length || !lastWeek.length) return null;

    const avg = arr => arr.reduce((s, e) => s + e.weight, 0) / arr.length;
    const diff = avg(thisWeek) - avg(lastWeek);

    return { diff: parseFloat(diff.toFixed(2)) };
  }

  // ── Renderizar mensaje de ajuste ───────────────────────────
  function renderAdjustmentBanner(entries) {
    const banner = document.getElementById('adjustment-banner');
    if (!banner) return;

    const analysis = weeklyAnalysis(entries);
    if (!analysis) { banner.style.display = 'none'; return; }

    const { diff } = analysis;
    let icon, text, cls;

    if (diff > 0.4) {
      icon = '📈'; cls = 'warning';
      text = `Estás ganando <strong>${diff} kg</strong> de media esta semana. Si tu objetivo es definición, considera reducir ~200 kcal/día o añadir cardio.`;
    } else if (diff < -0.4) {
      icon = '📉'; cls = '';
      text = `Estás perdiendo <strong>${Math.abs(diff)} kg</strong> de media esta semana. ¡Buen progreso! Mantén el ritmo.`;
    } else if (diff < -0.8) {
      icon = '⚠️'; cls = 'danger';
      text = `Pérdida rápida de <strong>${Math.abs(diff)} kg</strong>. Asegúrate de consumir suficiente proteína para preservar músculo.`;
    } else {
      icon = '⚖️'; cls = '';
      text = `Tu peso se mantiene estable (${diff > 0 ? '+' : ''}${diff} kg respecto a la semana anterior). ¡Consistencia!`;
    }

    banner.className = `adjustment-banner ${cls}`;
    banner.style.display = 'flex';
    document.getElementById('adjustment-icon').textContent = icon;
    document.getElementById('adjustment-text').innerHTML = text;
  }

  // ── Chart.js principal ─────────────────────────────────────
  function buildChartData(entries) {
    return {
      labels: entries.map(e => fmtDate(e.date)),
      data:   entries.map(e => e.weight),
    };
  }

  function createGradient(ctx, chartArea) {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0,   'rgba(108, 99, 255, 0.3)');
    gradient.addColorStop(0.5, 'rgba(108, 99, 255, 0.08)');
    gradient.addColorStop(1,   'rgba(108, 99, 255, 0)');
    return gradient;
  }

  function renderChart(entries) {
    const canvas = document.getElementById('weight-chart');
    const empty  = document.getElementById('weight-chart-empty');
    if (!canvas) return;

    const filtered = filterByRange(entries, currentRange);

    if (!filtered.length) {
      empty && (empty.style.display = 'flex');
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      return;
    }
    empty && (empty.style.display = 'none');

    const { labels, data } = buildChartData(filtered);

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Peso (kg)',
          data,
          borderColor: '#6c63ff',
          borderWidth: 2.5,
          pointBackgroundColor: '#6c63ff',
          pointBorderColor: '#0e0e1a',
          pointBorderWidth: 2,
          pointRadius: data.length > 60 ? 2 : 5,
          pointHoverRadius: 7,
          fill: true,
          backgroundColor: function (context) {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'transparent';
            return createGradient(c, chartArea);
          },
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(14, 14, 26, 0.95)',
            borderColor: 'rgba(108, 99, 255, 0.3)',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#e2e8f0',
            padding: 12,
            callbacks: {
              title: items => fmtDateLong(filtered[items[0].dataIndex].date),
              label: item  => ` ${item.raw.toFixed(1)} kg`,
              afterLabel: item => {
                const note = filtered[item.dataIndex].notes;
                return note ? `  📝 ${note}` : '';
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#475569',
              font: { size: 11 },
              maxTicksLimit: 10,
            },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#475569',
              font: { size: 11 },
              callback: v => `${v} kg`,
            },
          },
        },
      },
    });
  }

  // ── Mini chart (dashboard) ─────────────────────────────────
  function renderMiniChart(entries) {
    const canvas = document.getElementById('mini-weight-chart');
    const empty  = document.getElementById('mini-chart-empty');
    if (!canvas) return;

    const last56 = filterByRange(entries, 56);

    if (!last56.length) {
      empty && (empty.style.display = 'flex');
      canvas.style.display = 'none';
      if (miniChartInstance) { miniChartInstance.destroy(); miniChartInstance = null; }
      return;
    }
    empty && (empty.style.display = 'none');
    canvas.style.display = 'block';

    const { labels, data } = buildChartData(last56);
    if (miniChartInstance) { miniChartInstance.destroy(); miniChartInstance = null; }

    const ctx = canvas.getContext('2d');
    miniChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#6c63ff',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: 'rgba(108, 99, 255, 0.1)',
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        elements: { point: { radius: 0 } },
      },
    });
  }

  // ── Estadísticas ───────────────────────────────────────────
  function renderStats(entries) {
    const statsBar  = document.getElementById('weight-stats');
    const tableCard = document.getElementById('weight-table-card');
    if (!entries.length) {
      statsBar  && (statsBar.style.display  = 'none');
      tableCard && (tableCard.style.display = 'none');
      return;
    }
    statsBar  && (statsBar.style.display  = 'grid');
    tableCard && (tableCard.style.display = 'block');

    const weights = entries.map(e => e.weight);
    const initial = weights[0];
    const current = weights[weights.length - 1];
    const change  = current - initial;
    const min     = Math.min(...weights);
    const max     = Math.max(...weights);
    const avg     = weights.reduce((s, w) => s + w, 0) / weights.length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('wstat-initial',      `${initial.toFixed(1)} kg`);
    set('wstat-current',      `${current.toFixed(1)} kg`);
    set('wstat-min',          `${min.toFixed(1)} kg`);
    set('wstat-max',          `${max.toFixed(1)} kg`);
    set('wstat-avg',          `${avg.toFixed(1)} kg`);

    const chEl = document.getElementById('wstat-total-change');
    if (chEl) {
      chEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)} kg`;
      chEl.style.color = change > 0 ? '#ff6584' : change < 0 ? '#10b981' : '#94a3b8';
    }
  }

  // ── Tabla de registros ─────────────────────────────────────
  function renderTable(entries) {
    const tbody = document.getElementById('weight-table-body');
    const count = document.getElementById('record-count');
    if (!tbody) return;

    if (count) count.textContent = `${entries.length} registro${entries.length !== 1 ? 's' : ''}`;

    const reversed = [...entries].reverse();
    tbody.innerHTML = reversed.map((entry, idx) => {
      const prev = reversed[idx + 1];
      let changeTxt = '—', changeClass = 'change-neutral';

      if (prev) {
        const diff = entry.weight - prev.weight;
        changeTxt  = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} kg`;
        changeClass = diff > 0 ? 'change-positive' : diff < 0 ? 'change-negative' : 'change-neutral';
      }

      return `
        <tr>
          <td>${fmtDateLong(entry.date)}</td>
          <td><strong>${entry.weight.toFixed(1)} kg</strong></td>
          <td class="${changeClass}">${changeTxt}</td>
          <td style="color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${entry.notes || '—'}
          </td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" onclick="WeightTracker.openEdit(${entry.id})" title="Editar">✏️</button>
              <button class="btn-icon btn-icon--delete" onclick="WeightTracker.confirmDelete(${entry.id})" title="Eliminar">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Render completo ────────────────────────────────────────
  function renderAll() {
    const entries = getAll();
    renderChart(entries);
    renderMiniChart(entries);
    renderStats(entries);
    renderTable(entries);
    renderAdjustmentBanner(entries);
    updateDashboardStats(entries);
  }

  function updateDashboardStats(entries) {
    const statW  = document.getElementById('stat-weight');
    const statWC = document.getElementById('stat-weight-change');
    const statR  = document.getElementById('stat-records');
    const statRL = document.getElementById('stat-records-label');

    const _t = window.t || (k => k);
    if (statR)  statR.textContent  = entries.length;
    if (statRL) statRL.textContent = `${entries.length} ${_t('weight.history')}`;

    if (!entries.length) {
      if (statW)  statW.textContent  = '-- kg';
      if (statWC) statWC.textContent = _t('dashboard.no_data');
      return;
    }

    const last = entries[entries.length - 1];
    if (statW) statW.textContent = `${last.weight.toFixed(1)} kg`;

    if (entries.length > 1) {
      const prev = entries[entries.length - 2];
      const diff = last.weight - prev.weight;
      if (statWC) {
        statWC.textContent = `${diff >= 0 ? '▲ +' : '▼ '}${Math.abs(diff).toFixed(1)} kg`;
        statWC.className   = `stat-change ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}`;
      }
    } else {
      if (statWC) statWC.textContent = 'Primer registro';
    }

    // Actualizar BMI si hay talla guardada
    const tdeeData = (() => { try { return JSON.parse(localStorage.getItem('hs_tdee') || 'null'); } catch { return null; }})();
    if (tdeeData && tdeeData.height) {
      const h   = tdeeData.height / 100;
      const bmi = last.weight / (h * h);
      const bmiEl = document.getElementById('stat-bmi');
      const bmiL  = document.getElementById('stat-bmi-label');
      if (bmiEl) bmiEl.textContent = bmi.toFixed(1);
      if (bmiL) {
        const labels = [[18.5,'Bajo peso'],[25,'Peso normal'],[30,'Sobrepeso'],[Infinity,'Obesidad']];
        bmiL.textContent = (labels.find(([t]) => bmi < t) || [,'-'])[1];
      }
    }
  }

  // ── Modal ──────────────────────────────────────────────────
  function openModal(id = null, prefill = {}) {
    editingId = id;
    const modal  = document.getElementById('weight-modal');
    const title  = document.getElementById('modal-title');
    const idFld  = document.getElementById('weight-edit-id');
    const dateFl = document.getElementById('w-date');
    const wFld   = document.getElementById('w-weight');
    const nFld   = document.getElementById('w-notes');

    const _t2 = window.t || (k => k);
    title.textContent = id ? _t2('modal.edit_weight') : _t2('modal.add_weight');
    idFld.value  = id || '';
    dateFl.value = prefill.date   || new Date().toISOString().split('T')[0];
    wFld.value   = prefill.weight || '';
    nFld.value   = prefill.notes  || '';

    modal.style.display = 'flex';
    wFld.focus();
  }

  function closeModal() {
    const modal = document.getElementById('weight-modal');
    if (modal) modal.style.display = 'none';
    editingId = null;
  }

  function openEdit(id) {
    const entry = getAll().find(e => e.id === id);
    if (entry) openModal(id, entry);
  }

  function confirmDelete(id) {
    const _tDel = window.t || (k => k);
    if (confirm(_tDel('weight.confirm_delete'))) {
      deleteEntry(id);
      renderAll();
    }
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    // Botones de abrir modal
    document.getElementById('btn-open-weight-form')  ?.addEventListener('click', () => openModal());
    document.getElementById('btn-add-first-weight')  ?.addEventListener('click', () => openModal());
    document.getElementById('btn-add-first-weight')  ?.addEventListener('click', () => openModal());

    // Cerrar modal
    document.getElementById('modal-close')  ?.addEventListener('click', closeModal);
    document.getElementById('modal-cancel') ?.addEventListener('click', closeModal);
    document.getElementById('weight-modal') ?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Submit formulario
    document.getElementById('weight-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const id     = document.getElementById('weight-edit-id').value;
      const date   = document.getElementById('w-date').value;
      const weight = parseFloat(document.getElementById('w-weight').value);
      const notes  = document.getElementById('w-notes').value.trim();

      if (!date || isNaN(weight)) return;

      if (id) {
        updateEntry(parseInt(id), date, weight, notes);
      } else {
        addEntry(date, weight, notes);
      }

      closeModal();
      renderAll();
    });

    // Selector de rango
    document.querySelectorAll('.chip[data-range]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip[data-range]').forEach(c => c.classList.remove('chip--active'));
        chip.classList.add('chip--active');
        currentRange = parseInt(chip.dataset.range) || 0;
        renderChart(getAll());
      });
    });

    // Banner cerrar
    document.getElementById('banner-close')?.addEventListener('click', () => {
      const b = document.getElementById('adjustment-banner');
      if (b) b.style.display = 'none';
    });

    // Exportar CSV
    document.getElementById('btn-export-weight')?.addEventListener('click', exportCSV);

    // Render inicial
    renderAll();
  }

  // ── Exportar CSV ──────────────────────────────────────────
  function exportCSV() {
    const entries = getAll();
    if (!entries.length) {
      alert('No hay datos para exportar.');
      return;
    }
    const header = 'Fecha,Peso (kg),Notas\n';
    const rows   = entries.map(e =>
      `${e.date},${e.weight},"${(e.notes || '').replace(/"/g, '""')}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `healthstack-peso-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init, renderAll, openEdit, confirmDelete, getAll, exportCSV };
})();
