// frontend/js/ranked.js
// Panel de rankeds: dos colas + gym server UI + sparring search + leaderboard modal.

const TIER_COLORS = {
  // Normal
  novato:       '#6b7280', regular:      '#10b981', constante:    '#22d3ee',
  comprometido: '#3b82f6', veterano:     '#8b5cf6', forjado:      '#f59e0b',
  elite:        '#ef4444', leyenda:      '#fbbf24',
  // Competitivo
  calentando:   '#6b7280', amateur:      '#10b981', semipro:      '#22d3ee',
  bestia:       '#3b82f6', titan:        '#8b5cf6', fenomeno:     '#f59e0b',
  invicto:      '#ef4444', apex:         '#fbbf24',
};

const TIER_LABELS = {
  novato:'Novato', regular:'Regular', constante:'Constante', comprometido:'Comprometido',
  veterano:'Veterano', forjado:'Forjado', elite:'Élite', leyenda:'Leyenda',
  calentando:'Calentando', amateur:'Amateur', semipro:'Semipro', bestia:'Bestia',
  titan:'Titán', fenomeno:'Fenómeno', invicto:'Invicto', apex:'Apex',
};

async function rkFetchJSON(url, options = {}) {
  const token = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token') || '';
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function initRanked(container) {
  const token = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token');
  if (!token) {
    container.innerHTML = '<p class="rk-error">Inicia sesión para ver tu ranking.</p>';
    return;
  }
  container.innerHTML = '<div class="rk-loading">Cargando rankeds...</div>';
  try {
    const [profile, gyms] = await Promise.all([
      rkFetchJSON('/api/v1/ranked/profile'),
      rkFetchJSON('/api/v1/gym-servers/my-gyms'),
    ]);
    renderRanked(container, profile, gyms);
  } catch (e) {
    container.innerHTML = '<p class="rk-error">No se pudo cargar el ranking. Inicia sesión primero.</p>';
  }
}

function renderRanked(container, profile, gyms) {
  container.innerHTML = `
    <div class="rk-panel">
      ${queueCard('Normal', profile.normal)}
      ${profile.competitive.unlocked
        ? queueCard('Competitivo', profile.competitive)
        : lockedCard()
      }
    </div>
    ${gyms.length ? gymPanel(gyms[0]) : noGymPanel()}`;

  container.querySelectorAll('[data-gym-id]').forEach(btn => {
    btn.addEventListener('click', () => openGymLeaderboard(container, btn.dataset.gymId));
  });
  container.querySelectorAll('[data-sparring-gym]').forEach(btn => {
    btn.addEventListener('click', () => openSparring(container, btn.dataset.sparringGym));
  });
  const createBtn = container.querySelector('#rk-create-gym');
  if (createBtn) createBtn.addEventListener('click', () => openCreateGym(container));
  const joinBtn = container.querySelector('#rk-join-btn');
  if (joinBtn) joinBtn.addEventListener('click', () => joinGym(container));
}

function queueCard(label, q) {
  const color   = TIER_COLORS[q.tier] || '#7c6bff';
  const tierLbl = TIER_LABELS[q.tier] || q.tier;
  const isTop   = q.tier === 'leyenda' || q.tier === 'apex';
  const divNums = ['I','II','III','IV'];
  const divLbl  = q.division ? ` ${divNums[q.division - 1]}` : '';
  const pct     = isTop ? 100 : Math.min(q.lp, 100);

  return `<div class="rk-queue-card">
    <div class="rk-queue-header">
      <span class="rk-queue-label">${label}</span>
      <span class="rk-tier-badge" style="background:${color}22;color:${color};">${tierLbl}${divLbl}</span>
    </div>
    <div class="rk-lp-bar-track">
      <div class="rk-lp-bar-fill" style="width:${pct}%;background:${color};"></div>
    </div>
    <div class="rk-lp-info">${q.lp} LP${!isTop ? ' / 100' : ''}</div>
  </div>`;
}

function lockedCard() {
  return `<div class="rk-queue-card rk-locked">
    <p class="rk-locked-msg">🔒 Cola Competitivo</p>
    <p class="rk-locked-hint">Llega a <strong>Comprometido</strong> en Normal para desbloquear.</p>
  </div>`;
}

function gymPanel(gym) {
  return `<div class="rk-gym-panel">
    <div class="rk-gym-header">
      <span class="rk-gym-name">🏋️ ${gym.name}</span>
      <span class="rk-gym-code">Código: <strong>${gym.invite_code}</strong></span>
    </div>
    <div class="rk-gym-actions">
      <button class="btn btn--ghost btn--sm rk-action" data-gym-id="${gym.id}">🏆 Leaderboard</button>
      <button class="btn btn--ghost btn--sm rk-action" data-sparring-gym="${gym.id}">🤝 Buscar Sparring</button>
    </div>
  </div>`;
}

function noGymPanel() {
  return `<div class="rk-no-gym">
    <p>Aún no perteneces a ningún gym. ¡Crea uno o únete con un código!</p>
    <button class="btn btn--primary btn--sm" id="rk-create-gym">+ Crear Gym</button>
    <div class="rk-join-form">
      <input type="text" id="rk-join-code" placeholder="Código de invitación" class="wl-input" maxlength="12" />
      <button class="btn btn--ghost btn--sm" id="rk-join-btn">Unirse</button>
    </div>
  </div>`;
}

async function openGymLeaderboard(container, gymId) {
  try {
    const data = await rkFetchJSON(`/api/v1/ranked/leaderboard?queue=competitive&scope=gym&gym_id=${gymId}`);
    const rows = data.entries.map((e, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
      const tier  = TIER_LABELS[e.tier] || e.tier;
      const divNums = ['I','II','III','IV'];
      const div   = e.division ? ` ${divNums[e.division-1]}` : '';
      return `<div class="rk-lb-row${e.rank === data.my_rank ? ' rk-lb-me' : ''}">
        <span class="rk-lb-rank">${medal}</span>
        <span class="rk-lb-name">${e.username}</span>
        <span class="rk-lb-tier">${tier}${div}</span>
        <span class="rk-lb-lp">${e.lp} LP</span>
      </div>`;
    }).join('');
    showModal('Leaderboard Competitivo', rows || '<p style="color:rgba(255,255,255,0.5)">Sin participantes aún.</p>');
  } catch (e) {
    showModal('Error', '<p>No se pudo cargar el leaderboard.</p>');
  }
}

async function openSparring(container, gymId) {
  try {
    const data = await rkFetchJSON(`/api/v1/gym-servers/${gymId}/sparrings`);
    const goals = { strength:'Fuerza', volume:'Volumen', health:'Salud' };
    const times = { morning:'Mañana', afternoon:'Tarde', evening:'Noche' };
    const cards = data.map(m => {
      return `<div class="rk-sparring-card">
        <span class="rk-sparring-name">${m.user_id}</span>
        <span class="rk-sparring-meta">${times[m.schedule] || '—'} · ${goals[m.goal] || '—'}</span>
        ${m.contact ? `<a class="rk-sparring-contact" href="${m.contact}" target="_blank">Contactar</a>` : ''}
      </div>`;
    }).join('');
    showModal('Buscar Sparring', cards || '<p style="color:rgba(255,255,255,0.5)">Ningún miembro ha activado su perfil aún.</p>');
  } catch (e) {
    showModal('Error', '<p>No se pudo cargar el sparring.</p>');
  }
}

function openCreateGym(container) {
  showModal('Crear Gym', `
    <div class="rk-create-form">
      <input id="rk-gym-name" class="wl-input" placeholder="Nombre del gym" maxlength="80" />
      <input id="rk-gym-city" class="wl-input" placeholder="Ciudad (opcional)" maxlength="80" />
      <button class="btn btn--primary btn--sm" id="rk-gym-submit">Crear</button>
    </div>`);
  document.getElementById('rk-gym-submit')?.addEventListener('click', async () => {
    const name = document.getElementById('rk-gym-name')?.value?.trim();
    const city = document.getElementById('rk-gym-city')?.value?.trim();
    if (!name) return;
    try {
      await rkFetchJSON('/api/v1/gym-servers', {
        method: 'POST',
        body: JSON.stringify({ name, city, is_public: true }),
      });
      closeModal();
      initRanked(container);
    } catch (e) {
      alert('Error creando gym: ' + e.message);
    }
  });
}

async function joinGym(container) {
  const code = document.getElementById('rk-join-code')?.value?.trim();
  if (!code) return;
  try {
    await rkFetchJSON('/api/v1/gym-servers/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: code }),
    });
    initRanked(container);
  } catch (e) {
    alert('Código inválido o gym no encontrado.');
  }
}

function showModal(title, html) {
  let overlay = document.getElementById('rk-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rk-modal-overlay';
    overlay.className = 'rk-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="rk-modal">
    <div class="rk-modal-header">
      <span>${title}</span>
      <button class="rk-modal-close" onclick="document.getElementById('rk-modal-overlay').remove()">✕</button>
    </div>
    <div class="rk-modal-body">${html}</div>
  </div>`;
  overlay.style.display = 'flex';
}

function closeModal() {
  document.getElementById('rk-modal-overlay')?.remove();
}

// Expose globally (app.js uses global pattern, not ES modules)
window.RankedModule = { init: initRanked };
