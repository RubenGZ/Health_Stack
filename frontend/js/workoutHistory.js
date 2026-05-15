// frontend/js/workoutHistory.js
import { getLocalSessions } from './workoutSession.js';

export function init(container) {
  const sessions = getLocalSessions().slice(0, 10);
  if (!sessions.length) {
    container.innerHTML = '<p class="wl-history-empty">Aún no hay sesiones registradas.</p>';
    return;
  }
  container.innerHTML = `
    <h3 class="wl-history-title">Historial reciente</h3>
    <div class="wl-session-list">${sessions.map(sessionCard).join('')}</div>
    <div class="wl-chart-section">
      <label class="wl-chart-label">Progresión:</label>
      <select id="wl-chart-select" class="wl-select">${exerciseOptions(sessions)}</select>
      <canvas id="wl-chart" class="wl-chart" height="160"></canvas>
    </div>`;
  const select = container.querySelector('#wl-chart-select');
  if (select) {
    drawChart(container, select.value, sessions);
    select.addEventListener('change', () => drawChart(container, select.value, sessions));
  }
}

function sessionCard(s) {
  const date = new Date(s.startedAt).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const duration = s.durationSecs ? `${Math.round(s.durationSecs / 60)} min` : '';
  const volume = s.totalVolumeKg ? `${s.totalVolumeKg.toLocaleString('es-ES')} kg` : '';
  const exNames = (s.exercises || []).map(e => e.name).join(', ');
  return `<div class="wl-session-card">
    <span class="wl-sc-date">${date}</span>
    <span class="wl-sc-exercises">${exNames}</span>
    <span class="wl-sc-meta">${[duration, volume].filter(Boolean).join(' · ')}</span>
  </div>`;
}

function exerciseOptions(sessions) {
  const keys = new Map();
  sessions.forEach(s => (s.exercises || []).forEach(e => keys.set(e.key, e.name)));
  return [...keys.entries()].map(([key, name]) => `<option value="${key}">${name}</option>`).join('');
}

function drawChart(container, exerciseKey, sessions) {
  const canvas = container.querySelector('#wl-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 360;
  canvas.width = W;
  const points = sessions
    .filter(s => s.exercises && s.exercises.some(e => e.key === exerciseKey))
    .map(s => {
      const ex = s.exercises.find(e => e.key === exerciseKey);
      const working = (ex.sets || []).filter(s => !s.isWarmup);
      const best = working.length ? Math.max(...working.map(s => s.weightKg * (1 + s.reps / 30))) : 0;
      return { date: new Date(s.startedAt), val: Math.round(best * 10) / 10 };
    })
    .filter(p => p.val > 0).reverse();
  const H = 160, PAD = 30;
  ctx.clearRect(0, 0, W, H);
  if (points.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px system-ui';
    ctx.fillText('Necesitas ≥2 sesiones para ver el gráfico.', 20, 80);
    return;
  }
  const maxVal = Math.max(...points.map(p => p.val));
  const minVal = Math.min(...points.map(p => p.val));
  const range = maxVal - minVal || 1;
  const toX = i => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD - ((v - minVal) / range) * (H - PAD * 2);
  ctx.beginPath(); ctx.strokeStyle = '#7c6bff'; ctx.lineWidth = 2;
  points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p.val)) : ctx.lineTo(toX(i), toY(p.val)));
  ctx.stroke();
  points.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(toX(i), toY(p.val), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6bff'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '10px system-ui';
    ctx.fillText(`${p.val}`, toX(i) - 10, toY(p.val) - 8);
  });
}
