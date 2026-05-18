// frontend/js/workoutHistory.js

export async function init(container) {
  container.innerHTML = '<p class="wl-history-empty" style="opacity:0.5">Cargando historial...</p>';

  const token =
    localStorage.getItem('hs_access_token') ||
    sessionStorage.getItem('hs_access_token');
  let sessions = [];

  if (token) {
    try {
      const resp = await fetch('/api/v1/workout/sessions?page=1&per_page=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        sessions = (data.sessions || []).map(s => ({
          id: s.id,
          startedAt: s.started_at,
          durationSecs: s.duration_secs,
          totalVolumeKg: s.total_volume_kg,
          exercises: (s.exercises || []).map(name => ({
            name,
            key: name.toLowerCase().replace(/\s+/g, '_'),
            sets: [],
          })),
        }));
      }
    } catch {
      // ignorar — fallback a local
    }
  }

  // Fallback: localStorage si el backend no devuelve datos
  if (!sessions.length) {
    const { getLocalSessions } = await import('./workoutSession.js');
    sessions = getLocalSessions().slice(0, 20);
  }

  if (!sessions.length) {
    container.innerHTML = '<p class="wl-history-empty">Aún no hay sesiones registradas.</p>';
    return;
  }

  container.innerHTML = `
    <h3 class="wl-history-title">Historial reciente</h3>
    <div class="wl-session-list">${sessions.map(sessionCard).join('')}</div>
    <div class="wl-chart-section">
      <label class="wl-chart-label">Progresión de volumen por sesión:</label>
      <canvas id="wl-chart" class="wl-chart" height="160"></canvas>
    </div>`;
  drawVolumeChart(container, sessions);
}

function sessionCard(s) {
  const date = new Date(s.startedAt).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const duration = s.durationSecs ? `${Math.round(s.durationSecs / 60)} min` : '';
  const volume = s.totalVolumeKg ? `${s.totalVolumeKg.toLocaleString('es-ES')} kg` : '';
  const exNames = (s.exercises || []).map(e => e.name).join(', ');
  return `<div class="wl-session-card">
    <span class="wl-sc-date">${date}</span>
    <span class="wl-sc-exercises">${exNames}</span>
    <span class="wl-sc-meta">${[duration, volume].filter(Boolean).join(' · ')}</span>
  </div>`;
}

function drawVolumeChart(container, sessions) {
  const canvas = container.querySelector('#wl-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 360;
  canvas.width = W;
  const H = 160, PAD = 36;

  const points = sessions
    .filter(s => s.totalVolumeKg > 0)
    .map(s => ({ date: new Date(s.startedAt), val: Math.round(s.totalVolumeKg) }))
    .reverse();

  ctx.clearRect(0, 0, W, H);

  if (points.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px system-ui';
    ctx.fillText('Necesitas ≥2 sesiones con datos para ver el gr\xe1fico.', 16, 80);
    return;
  }

  const maxVal = Math.max(...points.map(p => p.val));
  const minVal = Math.min(...points.map(p => p.val));
  const range = maxVal - minVal || 1;
  const toX = i => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD - ((v - minVal) / range) * (H - PAD * 2);

  // Línea de progresión
  ctx.beginPath();
  ctx.strokeStyle = '#7c6bff';
  ctx.lineWidth = 2;
  points.forEach((p, i) =>
    i === 0 ? ctx.moveTo(toX(i), toY(p.val)) : ctx.lineTo(toX(i), toY(p.val))
  );
  ctx.stroke();

  // Puntos + etiquetas
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(p.val), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6bff';
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px system-ui';
    ctx.fillText(`${p.val}kg`, toX(i) - 14, toY(p.val) - 8);

    const label = p.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(label, toX(i) - 14, H - 8);
  });
}
