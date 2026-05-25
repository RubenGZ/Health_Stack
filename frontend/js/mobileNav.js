/* ============================================================
   mobileNav.js — Navegación móvil HealthStack Pro
   Solo se inicializa en dispositivos ≤768px.
   5 tabs principales + sub-tabs scrollables por grupo.
   Coordina con app.js vía window.navigateTo + hs:section-changed.
   ============================================================ */

(function () {
  'use strict';

  // ── Guardia de dispositivo ─────────────────────────────────
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  // ── Estructura de grupos y sub-tabs ───────────────────────
  // chatbot: acción especial → abre el panel flotante
  const NAV_GROUPS = [
    {
      id: 'hoy',
      label: 'Hoy',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
               <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
             </svg>`,
      section: 'dashboard',
      subtabs: [],
    },
    {
      id: 'gym',
      label: 'Gym',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M6.5 6.5h11M6.5 17.5h11M3 10.5h18M3 13.5h18"/>
             </svg>`,
      section: 'rutinas',
      subtabs: [
        { id: 'rutinas',       label: 'Rutinas' },
        { id: 'workout',       label: 'Entreno' },
        { id: 'ejercicios',    label: 'Ejercicios' },
        { id: 'records',       label: 'Records' },
        { id: 'sessionreplay', label: 'Replay' },
        { id: 'rehab',         label: 'Rehab' },
        { id: 'deload',        label: 'Deload' },
      ],
    },
    {
      id: 'nutricion',
      label: 'Nutrición',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M12 2a9 9 0 0 1 9 9c0 5-4 9-9 11C7 20 3 16 3 11a9 9 0 0 1 9-9z"/>
               <path d="M12 7v5l3 3"/>
             </svg>`,
      section: 'nutricion',
      subtabs: [
        { id: 'nutricion',   label: 'Macros' },
        { id: 'planner',     label: 'Planner' },
        { id: 'suplementos', label: 'Suplementos' },
        { id: 'timing',      label: 'Timing' },
        { id: 'peso',        label: 'Peso' },
        { id: 'bodycomp',    label: 'Composición' },
      ],
    },
    {
      id: 'ia',
      label: 'IA',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <circle cx="12" cy="12" r="10"/>
               <path d="M12 8v4l3 3"/>
             </svg>`,
      section: 'ia',
      subtabs: [
        { id: 'ia',       label: 'Inicio' },
        { id: 'chatbot',  label: 'Chat IA',   action: 'chatbot' },
        { id: 'fatigue',  label: 'Fatiga' },
        { id: 'plateau',  label: 'Estancamiento' },
      ],
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
               <circle cx="12" cy="7" r="4"/>
             </svg>`,
      section: 'gamificacion',
      subtabs: [
        { id: 'gamificacion', label: 'Logros' },
        { id: 'ranked',       label: 'Ranked' },
        { id: 'receipt',      label: 'Recibo' },
        { id: 'config',       label: 'Config' },
      ],
    },
  ];

  // ── Estado interno ─────────────────────────────────────────
  let activeGroupId  = 'hoy';
  let activeSection  = 'dashboard';
  let navEl          = null;
  let subtabBarEl    = null;

  // ── Mapear sección → grupo ─────────────────────────────────
  function groupForSection(sectionId) {
    for (const g of NAV_GROUPS) {
      if (g.section === sectionId) return g;
      if (g.subtabs.some(s => s.id === sectionId)) return g;
    }
    return NAV_GROUPS[0]; // fallback: Hoy
  }

  // ── Renderizar nav inferior ────────────────────────────────
  function render() {
    // Contenedor principal
    navEl = document.createElement('nav');
    navEl.id = 'mobile-bottom-nav';
    navEl.setAttribute('aria-label', 'Navegación principal');

    NAV_GROUPS.forEach(group => {
      const btn = document.createElement('button');
      btn.className = 'mbn-tab';
      btn.dataset.group = group.id;
      btn.setAttribute('aria-label', group.label);
      btn.innerHTML = `
        <span class="mbn-icon">${group.icon}</span>
        <span class="mbn-label">${group.label}</span>
      `;
      btn.addEventListener('click', () => onTabClick(group));
      navEl.appendChild(btn);
    });

    document.body.appendChild(navEl);

    // Sub-tab bar
    subtabBarEl = document.createElement('div');
    subtabBarEl.id = 'mobile-subtab-bar';
    document.body.appendChild(subtabBarEl);

    setActiveGroup(activeGroupId, false);
  }

  // ── Click en tab principal ─────────────────────────────────
  function onTabClick(group) {
    // Si el grupo ya está activo Y la sección visible coincide con un subtab del grupo
    // → no hacer nada (el usuario ya está aquí)
    // Si está activo pero la sección visible no es de este grupo (puede pasar tras usar
    // el botón Atrás), forzar navegación para desatascar
    if (activeGroupId === group.id && group.subtabs.length > 0) {
      const isInGroup = group.subtabs.some(s => s.id === activeSection) ||
                        group.section === activeSection;
      if (isInGroup) return; // ya aquí, no hacer nada
      // Estaba "stuck" — forzar el primer subtab
    }
    setActiveGroup(group.id, true);
  }

  // ── Activar grupo ──────────────────────────────────────────
  function setActiveGroup(groupId, navigate) {
    activeGroupId = groupId;
    const group = NAV_GROUPS.find(g => g.id === groupId);
    if (!group) return;

    // Actualizar tab activo
    navEl.querySelectorAll('.mbn-tab').forEach(btn => {
      btn.classList.toggle('mbn-tab--active', btn.dataset.group === groupId);
    });

    // Mostrar/ocultar sub-tab bar
    renderSubtabs(group);

    if (!navigate) return;

    if (group.subtabs.length === 0) {
      // Sin sub-tabs: ir directo a la sección
      if (group.section) doNavigate(group.section);
    } else {
      // Con sub-tabs: restaurar última sub-sección o ir al primer sub-tab
      const saved = sessionStorage.getItem(`mbn_last_${groupId}`);
      const target = group.subtabs.find(s => s.id === saved) || group.subtabs[0];
      doSubtab(target);
    }
  }

  // ── Renderizar sub-tabs ────────────────────────────────────
  function renderSubtabs(group) {
    subtabBarEl.innerHTML = '';

    if (group.subtabs.length === 0) {
      subtabBarEl.style.display = 'none';
      return;
    }

    subtabBarEl.style.display = 'flex';
    group.subtabs.forEach(sub => {
      const chip = document.createElement('button');
      chip.className = 'mbn-chip';
      chip.dataset.subtab = sub.id;
      chip.textContent = sub.label;
      chip.addEventListener('click', () => doSubtab(sub));
      subtabBarEl.appendChild(chip);
    });

    updateSubtabActive(group);
  }

  // ── Activar sub-tab concreto ───────────────────────────────
  function doSubtab(sub) {
    // Acción especial para chatbot (FAB flotante)
    if (sub.action === 'chatbot') {
      const chatbotBtn = document.getElementById('chatbot-btn');
      if (chatbotBtn) chatbotBtn.click();
      // Marcar chip activo sin navegar
      subtabBarEl.querySelectorAll('.mbn-chip').forEach(c => {
        c.classList.toggle('mbn-chip--active', c.dataset.subtab === sub.id);
      });
      return;
    }

    // Guardar última sub-sección para este grupo
    sessionStorage.setItem(`mbn_last_${activeGroupId}`, sub.id);
    activeSection = sub.id;

    // Actualizar chips
    subtabBarEl.querySelectorAll('.mbn-chip').forEach(c => {
      c.classList.toggle('mbn-chip--active', c.dataset.subtab === sub.id);
    });

    // Scroll del chip activo a la vista
    const activeChip = subtabBarEl.querySelector('.mbn-chip--active');
    if (activeChip) activeChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

    doNavigate(sub.id);
  }

  // ── Navegar a sección ──────────────────────────────────────
  function doNavigate(sectionId) {
    activeSection = sectionId;
    if (typeof window.navigateTo === 'function') {
      window.navigateTo(sectionId);
    }
  }

  // ── Escuchar cambios de sección externos (app.js, hash nav) ─
  function updateSubtabActive(group) {
    subtabBarEl.querySelectorAll('.mbn-chip').forEach(c => {
      c.classList.toggle('mbn-chip--active', c.dataset.subtab === activeSection);
    });
  }

  window.addEventListener('hs:section-changed', e => {
    const section = e.detail?.section;
    if (!section) return;
    activeSection = section;

    // Safety: si la nav está oculta pero el chatbot NO está abierto, restaurarla.
    // Esto previene quedar atascado si el panel se cierra por otra vía.
    const chatPanel = document.getElementById('chatbot-panel');
    if (chatPanel && chatPanel.style.display !== 'flex') {
      if (navEl)       navEl.classList.remove('mbn--hidden');
      if (subtabBarEl) subtabBarEl.classList.remove('mbn--hidden');
    }

    // Sincronizar grupo activo
    const group = groupForSection(section);
    if (group.id !== activeGroupId) {
      activeGroupId = group.id;
      navEl.querySelectorAll('.mbn-tab').forEach(btn => {
        btn.classList.toggle('mbn-tab--active', btn.dataset.group === group.id);
      });
      renderSubtabs(group);
    }
    updateSubtabActive(group);
  });

  // ── Ajuste de altura del contenido ────────────────────────
  // El contenido debe quedar encima del nav (56px) + sub-tabs (44px cuando visible)
  function syncContentPadding() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    const subtabVisible = subtabBarEl && subtabBarEl.style.display !== 'none';
    mainContent.style.paddingBottom = subtabVisible ? '106px' : '62px';
  }

  // Observar cambios en display del sub-tab bar
  const observer = new MutationObserver(syncContentPadding);

  // ── Init ───────────────────────────────────────────────────
  function init() {
    if (!isMobile()) return;

    render();
    observer.observe(subtabBarEl, { attributes: true, attributeFilter: ['style'] });

    // Sincronizar con sección inicial
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const group = groupForSection(hash);
      activeGroupId = group.id;
      activeSection = hash;
      setActiveGroup(group.id, false);
      updateSubtabActive(group);
    }

    syncContentPadding();

    // Esconder/mostrar nav en función del estado REAL del panel tras el click.
    // Verificamos el estado resultante del panel (no qué botón se pulsó), porque
    // tanto #chatbot-btn como el tab de IA hacen toggle y la lógica de add/remove
    // separada causaba que una doble pulsación escondiera la nav permanentemente.
    document.addEventListener('click', e => {
      if (e.target.closest('#chatbot-btn') || e.target.closest('#chatbot-close')) {
        // chatbot.js ya ejecutó togglePanel antes de que llegue el evento al documento
        const panel  = document.getElementById('chatbot-panel');
        const isOpen = panel && panel.style.display === 'flex';
        if (navEl)       navEl.classList.toggle('mbn--hidden', isOpen);
        if (subtabBarEl) subtabBarEl.classList.toggle('mbn--hidden', isOpen);
      }
    });
  }

  // Esperar a que app.js termine (está deferrido, mobileNav también)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay para que app.js exponga window.navigateTo
    setTimeout(init, 0);
  }
})();
