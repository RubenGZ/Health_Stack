/* ============================================================
   app.js — Router SPA, coordinador de módulos e inicialización
   Punto de entrada principal.

   Módulos extraídos (Fase 5 — 2026-05-23):
   - Dashboard stats/greeting/projection → js/dashboard/index.js
   - PWA install banner + sponsor       → js/pwa/index.js
   ============================================================ */

(function () {
  'use strict';

  function _t(key) { return (window.t && window.t(key)) || key; }

  // ── Navegación SPA ─────────────────────────────────────────
  const SECTIONS = [
    'dashboard','peso','nutricion','ejercicios',
    'rutinas','planner','gamificacion',
    'suplementos','timing','records','receipt','fatigue','plateau','deload','bodycomp','sessionreplay','workout','ranked','rehab',
  ];

  // ── Historia de navegación (back button móvil) ─────────────
  const _navHistory = [];
  let _currentSection = null;

  function _updateBackBtn() {
    const backBtn = document.getElementById('mobile-back-btn');
    const header  = document.getElementById('mobile-header');
    if (!backBtn || !header) return;
    const canGoBack = _navHistory.length > 0;
    backBtn.style.display = canGoBack ? 'flex' : 'none';
    header.classList.toggle('has-back', canGoBack);
  }

  function _goBack() {
    if (_navHistory.length === 0) return;
    const prev = _navHistory.pop();
    navigateTo(prev, true /* isBack */);
  }

  function navigateTo(sectionId, isBack) {
    // ── Plan gate ───────────────────────────────────────────
    if (typeof Plan !== 'undefined' && !Plan.can(sectionId)) {
      Plan.showUpgradeModal(sectionId, function () { navigateTo(sectionId); });
      return;
    }

    // ── Gestión del historial (back button) ─────────────────
    if (!isBack && _currentSection && _currentSection !== sectionId) {
      _navHistory.push(_currentSection);
      if (_navHistory.length > 10) _navHistory.shift();
    }
    _currentSection = sectionId;
    _updateBackBtn();

    // Ocultar todas las secciones
    SECTIONS.forEach(id => {
      const el = document.getElementById(`section-${id}`);
      if (el) { el.classList.remove('active'); el.classList.remove('section--visible'); }
    });

    // Activar la sección destino
    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      requestAnimationFrame(() => target.classList.add('section--visible'));
    }

    // Actualizar nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Actualizar hash sin recargar
    history.replaceState(null, '', `#${sectionId}`);

    // Sync mobile section title
    const mobileTitle = document.getElementById('mobile-section-title');
    if (mobileTitle) {
      const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"] .nav-label`);
      mobileTitle.textContent = navItem ? navItem.textContent : sectionId;
    }

    // Notify listeners de cambio de sección
    window.dispatchEvent(new CustomEvent('hs:section-changed', { detail: { section: sectionId } }));

    // Si es la sección de peso, re-renderizar el gráfico
    if (sectionId === 'peso' && typeof WeightTracker !== 'undefined') {
      setTimeout(() => WeightTracker.renderAll(), 50);
    }
    if (sectionId === 'records'      && typeof Records       !== 'undefined') Records.init();
    if (sectionId === 'receipt'      && typeof AthleteReceipt !== 'undefined') AthleteReceipt.init();
    if (sectionId === 'fatigue'      && typeof FatigueHeatmap !== 'undefined') FatigueHeatmap.init();
    if (sectionId === 'plateau'      && typeof PlateauRadar  !== 'undefined') PlateauRadar.init();
    if (sectionId === 'deload'       && typeof AutoDeload    !== 'undefined') AutoDeload.init();
    if (sectionId === 'bodycomp'     && typeof BodyCompForecast !== 'undefined') BodyCompForecast.init();
    if (sectionId === 'sessionreplay'&& typeof SessionReplay !== 'undefined') SessionReplay.init();

    if (sectionId === 'workout') {
      const loggerRoot  = document.getElementById('workout-logger-root');
      const historyRoot = document.getElementById('workout-history-root');
      if (loggerRoot && typeof WorkoutLogger !== 'undefined') {
        WorkoutLogger.init(loggerRoot);
        loggerRoot.dataset.initialized = 'true';
      }
      if (historyRoot && typeof WorkoutHistory !== 'undefined') WorkoutHistory.init(historyRoot);
    }
    if (sectionId === 'ranked') {
      const rankedRoot = document.getElementById('ranked-root');
      if (rankedRoot && typeof RankedModule !== 'undefined') RankedModule.init(rankedRoot);
    }
    if (sectionId === 'suplementos' && typeof Supplements !== 'undefined') {
      const sg = document.getElementById('suppl-grid');
      if (sg && (!sg.children.length || sg.querySelector('.suppl-loading'))) Supplements.init();
    }
    if (sectionId === 'ejercicios' && typeof Exercises !== 'undefined') Exercises.refreshLayout?.();
    if (sectionId === 'rutinas'    && typeof RoutineGenerator !== 'undefined') RoutineGenerator.init();

    // ── FAB rest timer: solo visible en workout o con sesión activa ──
    const _fab = document.getElementById('rest-timer-fab');
    if (_fab) {
      const _hasActive = Boolean(localStorage.getItem('hs_workout_active'));
      _fab.style.display = (sectionId === 'workout' || _hasActive) ? '' : 'none';
    }
  }

  function initNavigation() {
    document.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const section = el.dataset.section;
        if (!el.classList.contains('nav-item--soon') && !el.classList.contains('quick-card--soon')) {
          navigateTo(section);
        }
      });
    });

    // Macro Autopilot tab — gate for Pro
    const autoTab = document.querySelector('.stab[data-tab="autopilot"]');
    if (autoTab) {
      autoTab.addEventListener('click', function (e) {
        if (typeof Plan !== 'undefined' && !Plan.isPro()) {
          e.stopImmediatePropagation();
          Plan.showUpgradeModal('autopilot', function () { autoTab.click(); });
        }
      }, true);
    }

    const backBtn = document.getElementById('mobile-back-btn');
    if (backBtn) backBtn.addEventListener('click', _goBack);

    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin') { location.href = '/admin'; return; }
    navigateTo(SECTIONS.includes(hash) ? hash : 'dashboard');
  }

  // ── Section tabs (Nutrición) ──────────────────────────────
  function initSectionTabs() {
    document.getElementById('nutrition-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.stab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll('#nutrition-tabs .stab').forEach(b =>
        b.classList.toggle('stab--active', b.dataset.tab === tab)
      );
      document.querySelectorAll('#section-nutricion .stab-content').forEach(c =>
        c.classList.toggle('stab-content--active', c.id === `stab-${tab}`)
      );
      if (tab === 'macroinfo' && typeof Supplements !== 'undefined') {
        const macroGrid = document.getElementById('macro-info-grid');
        if (macroGrid && !macroGrid.children.length) Supplements.init();
      }
      if (tab === 'autopilot' && typeof MacroAutopilot !== 'undefined') MacroAutopilot.init();
    });
  }

  // ── Offline indicator ─────────────────────────────────────
  function initOfflineIndicator() {
    function _getOrCreateBanner() {
      let el = document.getElementById('hs-offline-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'hs-offline-banner';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          <span>Sin conexión — Datos guardados localmente</span>`;
        document.body.appendChild(el);
        el.style.cssText = [
          'position:fixed','top:0','left:0','right:0','z-index:9997',
          'display:flex','align-items:center','justify-content:center','gap:8px',
          'padding:8px 16px',
          'background:rgba(15,10,30,0.96)',
          'border-bottom:1px solid rgba(239,68,68,0.35)',
          'color:#f87171','font-size:0.78rem','font-weight:600','letter-spacing:0.01em',
          'backdrop-filter:blur(12px)',
          'transform:translateY(-100%)',
          'transition:transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        ].join(';');
      }
      return el;
    }
    const _show = () => requestAnimationFrame(() => { _getOrCreateBanner().style.transform = 'translateY(0)'; });
    const _hide = () => {
      const el = document.getElementById('hs-offline-banner');
      if (el) el.style.transform = 'translateY(-100%)';
    };
    if (!navigator.onLine) _show();
    window.addEventListener('offline', _show);
    window.addEventListener('online',  _hide);
  }

  // ── Haptic feedback ────────────────────────────────────────
  window.haptic = {
    light:   () => navigator.vibrate?.([8]),
    medium:  () => navigator.vibrate?.([20]),
    heavy:   () => navigator.vibrate?.([40]),
    success: () => navigator.vibrate?.([10, 30, 10]),
    pr:      () => navigator.vibrate?.([20, 40, 20, 40, 60]),
    error:   () => navigator.vibrate?.([80]),
  };
  window.addEventListener('hs:pr-achieved',      () => window.haptic.pr());
  window.addEventListener('hs:set-completed',    () => window.haptic.light());
  window.addEventListener('hs:workout-finished', () => window.haptic.success());

  // ── Admin nav visibility ──────────────────────────────────
  function syncAdminNav() {
    const link = document.getElementById('nav-admin-link');
    const sep  = document.getElementById('nav-admin-separator');
    if (!link || !sep) return;
    let isAdmin = false;
    try {
      const raw = localStorage.getItem('hs_access_token');
      if (raw) {
        const payload = JSON.parse(atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        isAdmin = payload.role === 'admin';
      }
    } catch (e) { /* token malformado o ausente */ }
    link.style.display = isAdmin ? '' : 'none';
    sep.style.display  = isAdmin ? '' : 'none';
  }

  // ── Getting Started widget ────────────────────────────────
  function _initGettingStarted() {
    const widget   = document.getElementById('getting-started');
    const cpWidget = document.getElementById('consistency-progress-widget');
    if (!widget) return;

    function _updateState() {
      const hasWeight   = Boolean(localStorage.getItem('hs_weight_entries'));
      const sessionCount = parseInt(localStorage.getItem('hs_session_count') || '0', 10);
      widget.style.display = (!hasWeight && sessionCount === 0) ? 'block' : 'none';
      if (cpWidget) {
        cpWidget.style.display = sessionCount > 0 ? 'block' : 'none';
        if (typeof Plan !== 'undefined') Plan.applyPhasedNav();
      }
    }
    _updateState();
    window.addEventListener('hs:section-changed', e => {
      if (e.detail?.section === 'dashboard') _updateState();
    });
    window.addEventListener('hs:workout-session-changed', _updateState);
  }

  // ── Beta mode UI ──────────────────────────────────────────
  function _initBetaModeUI() {
    const btn   = document.getElementById('beta-mode-btn');
    const label = document.getElementById('beta-mode-label');
    const badge = document.getElementById('beta-mode-badge');
    if (!btn || !label) return;

    function _refreshUI() {
      const on = typeof Plan !== 'undefined' && Plan.isBeta();
      label.textContent    = on ? 'Desactivar modo beta' : 'Activar modo beta';
      if (badge) badge.style.display = on ? '' : 'none';
    }
    _refreshUI();
    window._toggleBetaMode = function () {
      if (typeof Plan === 'undefined') return;
      Plan.isBeta() ? Plan.disableBeta() : Plan.enableBeta();
      _refreshUI();
    };

    // ── Theme picker en Perfil ────────────────────────────────
    function _syncThemePickerUI() {
      const current = document.documentElement.getAttribute('data-theme') || 'forge';
      const label   = document.getElementById('perfil-theme-current');
      if (label) label.textContent = current.charAt(0).toUpperCase() + current.slice(1);
      document.querySelectorAll('.perfil-theme-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.t === current);
      });
    }
    window._openThemePicker = function () {
      const panel = document.getElementById('perfil-theme-panel');
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) _syncThemePickerUI();
    };
    window._setThemeFromPerfil = function (theme) {
      if (typeof ThemeManager !== 'undefined') {
        ThemeManager.set(theme);
      } else {
        // Fallback directo si ThemeManager no cargó aún
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('hs_theme', theme); } catch {}
        window.dispatchEvent(new CustomEvent('hs:theme-changed', { detail: { theme } }));
      }
      _syncThemePickerUI();
      if (typeof showToast === 'function') showToast('Tema aplicado: ' + theme.charAt(0).toUpperCase() + theme.slice(1));
    };
    // Sincronizar cuando se navega al perfil
    window.addEventListener('hs:section-changed', e => {
      if (e.detail?.section === 'perfil') _syncThemePickerUI();
    });
    _syncThemePickerUI();
  }

  // ── Google OAuth callback ─────────────────────────────────
  function handleOAuthCallback() {
    const params  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const access  = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (!access || !refresh) return;

    localStorage.setItem('hs_access_token',  access);
    localStorage.setItem('hs_refresh_token', refresh);

    fetch(`${location.protocol}//${location.host}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${access}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(user => { if (user) localStorage.setItem('hs_user', JSON.stringify(user)); })
      .catch(() => {})
      .finally(() => {
        history.replaceState(null, '', '/');
        if (typeof API !== 'undefined') API.checkBackend?.();
        // Dashboard module gestiona el refresh del chip y welcome card
        if (typeof Dashboard !== 'undefined') Dashboard.refresh();
      });
  }

  // ── Deep-link desde landing ───────────────────────────────
  function handleLandingBridge() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action !== 'register' && action !== 'login') return;

    history.replaceState(null, '', window.location.pathname + window.location.hash);

    const openWhenReady = () => {
      if (typeof Auth !== 'undefined' && typeof Auth.open === 'function') {
        Auth.open(action);
      } else {
        setTimeout(openWhenReady, 80);
      }
    };
    setTimeout(openWhenReady, 200);
  }

  // ── Init global ───────────────────────────────────────────
  function init() {
    initNavigation();

    // ── Dashboard — saludo, stats, gráficos, insights ─────
    if (typeof Dashboard !== 'undefined') Dashboard.init();

    // ── Módulos de features ───────────────────────────────
    if (typeof WeightTracker    !== 'undefined') WeightTracker.init();
    if (typeof MacroCalc        !== 'undefined') MacroCalc.init();
    if (typeof Exercises        !== 'undefined') Exercises.init();
    if (typeof RoutineGenerator !== 'undefined') RoutineGenerator.init();
    if (typeof MealPlanner      !== 'undefined') MealPlanner.init();
    if (typeof Gamification     !== 'undefined') Gamification.init();
    if (typeof Chatbot          !== 'undefined') Chatbot.init();
    if (typeof Community        !== 'undefined') Community.init();
    if (typeof Supplements      !== 'undefined') Supplements.init();
    if (typeof MyRecipes        !== 'undefined') MyRecipes.init();
    if (typeof TimingPlanner    !== 'undefined') TimingPlanner.init();

    // Onboarding solo si hay token
    if (typeof Onboarding !== 'undefined') {
      const _hasToken = Boolean(localStorage.getItem('hs_access_token'));
      if (_hasToken) {
        const _u = typeof API !== 'undefined' ? API.getUser?.() : null;
        Onboarding.init(_u ? _u.onboarding_completed : undefined);
      }
    }
    window.addEventListener('hs:login', function () {
      if (typeof Onboarding === 'undefined') return;
      const u = typeof API !== 'undefined' ? API.getUser?.() : null;
      if (!u) return;
      if (u.onboarding_completed === false || !localStorage.getItem('hs_tdee')) Onboarding.init(false);
    });

    // ── Card scroll reveal (IntersectionObserver) ─────────
    if ('IntersectionObserver' in window) {
      const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('card--revealed'), Math.min(i, 5) * 60);
            cardObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08 });

      document.querySelectorAll('.card').forEach(card => {
        card.classList.add('card--will-reveal');
        cardObserver.observe(card);
      });
      window.addEventListener('hs:section-changed', function () {
        setTimeout(() => {
          document.querySelectorAll('.card:not(.card--will-reveal)').forEach(card => {
            card.classList.add('card--will-reveal');
            cardObserver.observe(card);
          });
        }, 50);
      });
    }

    initSectionTabs();
    if (typeof Readiness  !== 'undefined') Readiness.init();
    if (typeof RestTimer  !== 'undefined') RestTimer.init();
    initOfflineIndicator();

    // ── PWA install banner + sponsor ──────────────────────
    if (typeof PWAManager !== 'undefined') PWAManager.init();

    // Plan gating — después del DOM
    if (typeof Plan !== 'undefined') Plan.init();
    if (typeof RehabLogger !== 'undefined') RehabLogger.mount('rehab-root');

    // API backend monitor
    if (typeof API !== 'undefined') API.init();

    // Gate RestTimer FAB para Pro
    const fab = document.getElementById('rest-timer-fab');
    if (fab) {
      fab.addEventListener('click', function (e) {
        if (typeof Plan !== 'undefined' && !Plan.isPro()) {
          e.stopImmediatePropagation();
          Plan.showUpgradeModal('restimer');
        }
      }, true);
      const _initialSection = window.location.hash.replace('#', '') || 'dashboard';
      const _hasActive = Boolean(localStorage.getItem('hs_workout_active'));
      if (_initialSection !== 'workout' && !_hasActive) fab.style.display = 'none';
    }

    window.addEventListener('hs:workout-session-changed', function () {
      const _fab2 = document.getElementById('rest-timer-fab');
      if (!_fab2) return;
      const sec    = window.location.hash.replace('#', '') || 'dashboard';
      const active = Boolean(localStorage.getItem('hs_workout_active'));
      _fab2.style.display = (sec === 'workout' || active) ? '' : 'none';
    });

    const perfilFeedbackBtn = document.getElementById('perfil-feedback-btn');
    if (perfilFeedbackBtn) {
      perfilFeedbackBtn.addEventListener('click', () => {
        if (typeof FeedbackWidget !== 'undefined' && FeedbackWidget.open) FeedbackWidget.open();
      });
    }

    _initGettingStarted();
    _initBetaModeUI();

    console.log('%c HealthStack Pro v2.0 ', 'background:#c4a561;color:white;padding:4px 8px;border-radius:4px;font-weight:bold');
  }

  // ── Bootstrap ─────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { handleOAuthCallback(); handleLandingBridge(); init(); });
  } else {
    handleOAuthCallback();
    handleLandingBridge();
    init();
  }

  // Admin nav: carga inicial + cambios de sesión
  syncAdminNav();
  window.addEventListener('hs:login',  syncAdminNav);
  window.addEventListener('hs:logout', syncAdminNav);

  // Exponer navigateTo globalmente
  window.navigateTo = navigateTo;

  // Theme Manager
  if (typeof ThemeManager !== 'undefined') {
    ThemeManager.init();
    ThemeManager.renderPicker(document.getElementById('theme-picker-root'));
  }

  // ── Global helpers ────────────────────────────────────────

  /**
   * createEmptyState({ icon, title, message, ctaText, ctaAction, compact })
   * Crea un nodo DOM con un empty state estilizado. Uso: container.appendChild(createEmptyState(...))
   */
  window.createEmptyState = function (opts) {
    const { icon = '📭', title = 'Sin datos', message = '', ctaText, ctaAction, compact } = opts || {};
    const wrap = document.createElement('div');
    wrap.className = compact ? 'empty-state empty-state--compact' : 'empty-state';
    wrap.innerHTML = `
      <div class="empty-state__icon">${icon}</div>
      <div class="empty-state__title">${title}</div>
      ${message ? `<p class="empty-state__msg">${message}</p>` : ''}
      ${ctaText  ? `<button class="btn btn--ghost btn--sm empty-state__cta">${ctaText}</button>` : ''}
    `;
    if (ctaText && ctaAction) wrap.querySelector('.empty-state__cta')?.addEventListener('click', ctaAction);
    return wrap;
  };

  /**
   * createSkeletonCard(rows)
   * Crea una card con N filas skeleton. Uso: container.appendChild(createSkeletonCard(3))
   */
  window.createSkeletonCard = function (rows) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    for (let i = 0; i < (rows || 3); i++) {
      const sk = document.createElement('div');
      sk.className  = 'skeleton';
      sk.style.height = i === 0 ? '20px' : '14px';
      sk.style.width  = i === 0 ? '55%' : `${60 + Math.random() * 30}%`;
      card.appendChild(sk);
    }
    return card;
  };

  /**
   * setFieldState(inputEl, state, hint?)
   * Gestiona estado visual de un input.
   * @param {HTMLElement} inputEl — el <input>
   * @param {'error'|'success'|'clear'} state
   * @param {string} [hint] — texto de ayuda opcional
   */
  window.setFieldState = function (inputEl, state, hint) {
    if (!inputEl) return;
    const wrapper = inputEl.closest('.input-wrapper') || inputEl.parentElement;

    inputEl.classList.remove('form-input--error', 'form-input--success', 'error');
    wrapper.querySelector('.input-icon')?.remove();
    const oldHint = inputEl.nextElementSibling;
    if (oldHint?.classList.contains('field-hint')) oldHint.remove();

    if (state === 'clear') return;

    if (state === 'error')   inputEl.classList.add('form-input--error');
    if (state === 'success') inputEl.classList.add('form-input--success');

    const icon = document.createElement('span');
    icon.className = `input-icon input-icon--${state}`;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = state === 'error'
      ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5 8.5L7 10.5L11 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (wrapper !== inputEl.parentElement) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(icon);
    }

    if (hint) {
      const hintEl = document.createElement('span');
      hintEl.className   = `field-hint field-hint--${state}`;
      hintEl.textContent = hint;
      inputEl.insertAdjacentElement('afterend', hintEl);
    }

    if (state === 'error') {
      inputEl.style.animation = 'none';
      requestAnimationFrame(() => {
        inputEl.style.animation = 'shake 0.4s ease';
        setTimeout(() => { inputEl.style.animation = ''; }, 400);
      });
    }
  };
})();
