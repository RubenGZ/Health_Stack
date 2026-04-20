/* ============================================================
   community.js — Feed social mock + leaderboard + post creation
   Datos persistidos en localStorage
   ============================================================ */

const Community = (function () {
  'use strict';

  const LS_POSTS = 'hs_posts';
  const LS_LIKES = 'hs_likes';

  // ── Posts seed (demo) ─────────────────────────────────────
  const SEED_POSTS = [
    { id:'s1', author:'Ana García',   avatar:'AG', ts: Date.now() - 3600000*2,
      text:'¡Primera dominada conseguida después de 6 semanas de práctica! 💪 El método de las negativas funciona increíble.',
      likes:14 },
    { id:'s2', author:'Carlos M.',    avatar:'CM', ts: Date.now() - 3600000*5,
      text:'Mi TDEE calculado: 2.850 kcal. Empiezo el bulk limpio mañana con +250 kcal. A por los 85 kg 🎯',
      likes:9  },
    { id:'s3', author:'Laura P.',     avatar:'LP', ts: Date.now() - 3600000*18,
      text:'Semana 8 de pérdida de grasa: -3.2 kg, sin perder fuerza en ningún levantamiento. La magia de la proteína alta 🔬',
      likes:22 },
    { id:'s4', author:'Marcos T.',    avatar:'MT', ts: Date.now() - 86400000*1,
      text:'Press banca: 60 kg → 100 kg en 14 meses. Progresión lineal funciona hasta que deja de hacerlo. A reinventarse 💯',
      likes:31 },
    { id:'s5', author:'Sofía R.',     avatar:'SR', ts: Date.now() - 86400000*2,
      text:'Consejo del día: pésate siempre en las mismas condiciones. Yo lo hago cada mañana, en ayunas y después de ir al baño. Así los datos son consistentes.',
      likes:18 },
    { id:'s6', author:'David L.',     avatar:'DL', ts: Date.now() - 86400000*3,
      text:'El generador de rutinas me generó una PPL de 5 días perfecta para mi nivel. Ya llevo 3 semanas siguiéndola y los resultados se notan.',
      likes:7  },
  ];

  // ── Leaderboard mock ──────────────────────────────────────
  const LEADERBOARD_SEED = [
    { name: 'Marcos T.',  avatar: 'MT', xp: 4200, badge: '🏅', level: 'Atleta'     },
    { name: 'Laura P.',   avatar: 'LP', xp: 3800, badge: '🏅', level: 'Atleta'     },
    { name: 'Ana García', avatar: 'AG', xp: 2900, badge: '🔵', level: 'Competidor' },
    { name: 'Sofía R.',   avatar: 'SR', xp: 2400, badge: '🔵', level: 'Competidor' },
    { name: 'Carlos M.',  avatar: 'CM', xp: 1800, badge: '🔵', level: 'Competidor' },
    { name: 'David L.',   avatar: 'DL', xp: 1200, badge: '⚡', level: 'Aprendiz'   },
    { name: 'Elena V.',   avatar: 'EV', xp:  800, badge: '⚡', level: 'Aprendiz'   },
    { name: 'Roberto H.', avatar: 'RH', xp:  350, badge: '🌱', level: 'Novato'     },
  ];

  // ── Estado ────────────────────────────────────────────────
  let posts = [];
  let liked = new Set();  // IDs de posts que el usuario ha likeado

  // ── Persistencia ──────────────────────────────────────────
  function loadPosts() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_POSTS) || 'null');
      posts = saved?.length ? saved : [...SEED_POSTS];
    } catch { posts = [...SEED_POSTS]; }

    try {
      const l = JSON.parse(localStorage.getItem(LS_LIKES) || '[]');
      liked = new Set(l);
    } catch { liked = new Set(); }
  }

  function savePosts() {
    localStorage.setItem(LS_POSTS, JSON.stringify(posts));
    localStorage.setItem(LS_LIKES, JSON.stringify([...liked]));
  }

  // ── Formato de tiempo relativo ────────────────────────────
  function timeAgo(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60)    return 'ahora mismo';
    if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} días`;
  }

  // ── Render feed ───────────────────────────────────────────
  function renderFeed() {
    const list = document.getElementById('feed-list');
    if (!list) return;

    const sorted = [...posts].sort((a, b) => b.ts - a.ts);

    list.innerHTML = sorted.map(post => `
      <div class="feed-post card" data-post-id="${post.id}">
        <div class="post-header">
          <div class="post-avatar">${post.avatar}</div>
          <div class="post-meta">
            <span class="post-author">${post.author}</span>
            <span class="post-time">${timeAgo(post.ts)}</span>
          </div>
        </div>
        <p class="post-text">${escapeHtml(post.text)}</p>
        <div class="post-actions">
          <button class="post-like-btn${liked.has(post.id) ? ' liked' : ''}" data-id="${post.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked.has(post.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="post-likes">${post.likes}</span>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.post-like-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleLike(btn.dataset.id));
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Toggle like ───────────────────────────────────────────
  function toggleLike(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    if (liked.has(postId)) {
      liked.delete(postId);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      liked.add(postId);
      post.likes++;
    }
    savePosts();
    renderFeed();
  }

  // ── Crear post ────────────────────────────────────────────
  function createPost(text) {
    const user   = typeof API !== 'undefined' ? API.getUser?.() : null;
    const name   = user?.display_name || 'Tú';
    const initials = name.slice(0, 2).toUpperCase();

    const post = {
      id:     `u_${Date.now()}`,
      author: name,
      avatar: initials,
      ts:     Date.now(),
      text:   text.trim(),
      likes:  0,
    };
    posts.unshift(post);
    savePosts();
    renderFeed();

    // Añadir XP por publicar
    if (typeof Gamification !== 'undefined') Gamification.addXP('post');
  }

  // ── Render leaderboard ────────────────────────────────────
  function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    // Inyectar usuario real si tiene XP calculado
    let board = [...LEADERBOARD_SEED];
    if (typeof Gamification !== 'undefined') {
      const s    = Gamification.getState();
      const user = typeof API !== 'undefined' ? API.getUser?.() : null;
      const name = user?.display_name || 'Tú';
      const lv   = Gamification.getLevel(s.xp);
      board.push({ name, avatar: name.slice(0, 2).toUpperCase(), xp: s.xp, badge: lv.icon, level: lv.name, isMe: true });
    }
    board.sort((a, b) => b.xp - a.xp);

    list.innerHTML = board.slice(0, 10).map((entry, i) => `
      <div class="leaderboard-row${entry.isMe ? ' leaderboard-row--me' : ''}">
        <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
        <div class="lb-avatar">${entry.avatar}</div>
        <div class="lb-info">
          <span class="lb-name">${entry.name}${entry.isMe ? ' (Tú)' : ''}</span>
          <span class="lb-level">${entry.badge} ${entry.level}</span>
        </div>
        <span class="lb-xp">${entry.xp.toLocaleString()} XP</span>
      </div>
    `).join('');
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    loadPosts();
    renderFeed();
    renderLeaderboard();

    // Botón publicar
    document.getElementById('btn-new-post')?.addEventListener('click', () => {
      const card = document.getElementById('new-post-card');
      if (card) { card.style.display = card.style.display === 'none' ? '' : 'none'; }
    });

    document.getElementById('btn-cancel-post')?.addEventListener('click', () => {
      const card = document.getElementById('new-post-card');
      if (card) card.style.display = 'none';
    });

    document.getElementById('btn-submit-post')?.addEventListener('click', () => {
      const textarea = document.getElementById('post-textarea');
      const text     = textarea?.value || '';
      if (text.trim().length < 5) { textarea?.classList.add('error'); return; }
      createPost(text);
      if (textarea) textarea.value = '';
      const card = document.getElementById('new-post-card');
      if (card) card.style.display = 'none';
    });

    // Actualizar leaderboard cuando cambia el XP
    window.addEventListener('hs:xp-updated', () => renderLeaderboard());
  }

  return { init };
})();
