/* ============================================================
   toast.js — Sistema de notificaciones premium HealthStack Pro
   Reemplaza alert() y confirm() del navegador con UI nativa.

   API global:
     showToast(message, type, duration)   → void
     showConfirm(message, options)        → Promise<boolean>
     showPromptToast(message, type)       → void  (alias corto)

   Tipos: 'success' | 'error' | 'warning' | 'info' | 'gold'
   ============================================================ */

(function () {
  'use strict';

  // ── Contenedor de toasts ──────────────────────────────────────
  let _container = null;

  function _getContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'hs-toast-container';
    _container.setAttribute('aria-live', 'assertive'); /* anunciar inmediatamente a lectores de pantalla */
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
    return _container;
  }

  // ── Iconos por tipo ───────────────────────────────────────────
  const ICONS = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    gold:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  };

  // ── showToast ─────────────────────────────────────────────────
  function showToast(message, type = 'info', duration = 3500) {
    const container = _getContainer();

    const toast = document.createElement('div');
    toast.className = `hs-toast hs-toast--${type}`;
    toast.setAttribute('role', 'status');

    toast.innerHTML = `
      <span class="hs-toast__icon">${ICONS[type] || ICONS.info}</span>
      <span class="hs-toast__msg">${message}</span>
      <button class="hs-toast__close" aria-label="Cerrar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Cerrar al hacer clic en X
    toast.querySelector('.hs-toast__close').addEventListener('click', () => _dismiss(toast));

    // Cerrar al hacer clic en el toast completo (tap en mobile)
    toast.addEventListener('click', (e) => {
      if (!e.target.closest('.hs-toast__close')) _dismiss(toast);
    });

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('hs-toast--visible'));
    });

    // Auto-dismiss
    if (duration > 0) {
      const timer = setTimeout(() => _dismiss(toast), duration);
      toast._dismissTimer = timer;
    }

    // Limitar stack a 4 toasts — cancelar su timer antes de remover para evitar leak
    const toasts = container.querySelectorAll('.hs-toast');
    if (toasts.length > 4) {
      const oldest = toasts[0];
      if (oldest._dismissTimer) { clearTimeout(oldest._dismissTimer); oldest._dismissTimer = null; }
      _dismiss(oldest);
    }

    return toast;
  }

  function _dismiss(toast) {
    if (!toast || toast._dismissing) return;
    toast._dismissing = true;
    if (toast._dismissTimer) clearTimeout(toast._dismissTimer);
    toast.classList.remove('hs-toast--visible');
    toast.classList.add('hs-toast--exit');
    setTimeout(() => toast.remove(), 300);
  }

  // ── showConfirm — reemplaza confirm() del browser ─────────────
  function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
      const {
        confirmText = 'Confirmar',
        cancelText  = 'Cancelar',
        type        = 'warning',  // 'warning' | 'danger' | 'info'
        title       = null,
      } = options;

      // Overlay
      const overlay = document.createElement('div');
      overlay.className = 'hs-confirm-overlay';

      const colors = {
        warning: { icon: ICONS.warning, accent: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
        danger:  { icon: ICONS.error,   accent: '#ef4444', bg: 'rgba(239,68,68,0.10)'  },
        info:    { icon: ICONS.info,    accent: 'var(--hs-accent)', bg: 'var(--hs-accent-dim)' },
      };
      const c = colors[type] || colors.warning;

      overlay.innerHTML = `
        <div class="hs-confirm">
          <div class="hs-confirm__icon" style="color:${c.accent};background:${c.bg}">
            ${c.icon}
          </div>
          ${title ? `<h3 class="hs-confirm__title">${title}</h3>` : ''}
          <p class="hs-confirm__msg">${message}</p>
          <div class="hs-confirm__actions">
            <button class="hs-confirm__cancel">${cancelText}</button>
            <button class="hs-confirm__ok" data-type="${type}">${confirmText}</button>
          </div>
        </div>
      `;

      function _close(result) {
        overlay.classList.add('hs-confirm-overlay--exit');
        setTimeout(() => { overlay.remove(); resolve(result); }, 220);
      }

      overlay.querySelector('.hs-confirm__cancel').addEventListener('click', () => _close(false));
      overlay.querySelector('.hs-confirm__ok').addEventListener('click',     () => _close(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) _close(false); });

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add('hs-confirm-overlay--visible'));
      });
    });
  }

  // ── Inyectar estilos CSS ──────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('hs-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'hs-toast-styles';
    style.textContent = `
      /* ── Toast container ── */
      #hs-toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        max-width: 360px;
        width: calc(100vw - 48px);
      }
      @media (max-width: 768px) {
        #hs-toast-container {
          bottom: max(80px, calc(64px + env(safe-area-inset-bottom)));
          right: 16px;
          left: 16px;
          width: auto;
          max-width: none;
        }
      }

      /* ── Toast base ── */
      .hs-toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--hs-surface-2, #161626);
        border: 1px solid var(--hs-border, rgba(255,255,255,0.08));
        box-shadow: 0 8px 32px rgba(0,0,0,0.50), 0 2px 8px rgba(0,0,0,0.30);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        pointer-events: all;
        cursor: pointer;
        /* start hidden */
        opacity: 0;
        transform: translateX(16px) scale(0.97);
        transition: opacity 220ms cubic-bezier(0.4,0,0.2,1),
                    transform 220ms cubic-bezier(0.4,0,0.2,1);
        will-change: transform, opacity;
        -webkit-tap-highlight-color: transparent;
      }
      .hs-toast--visible {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      .hs-toast--exit {
        opacity: 0;
        transform: translateX(8px) scale(0.95);
      }

      /* ── Type variants ── */
      .hs-toast--success { border-left: 3px solid #22c55e; }
      .hs-toast--error   { border-left: 3px solid #ef4444; }
      .hs-toast--warning { border-left: 3px solid #f59e0b; }
      .hs-toast--info    { border-left: 3px solid rgba(255,255,255,0.25); }
      .hs-toast--gold    { border-left: 3px solid #c4a561; }

      .hs-toast--success .hs-toast__icon { color: #22c55e; }
      .hs-toast--error   .hs-toast__icon { color: #ef4444; }
      .hs-toast--warning .hs-toast__icon { color: #f59e0b; }
      .hs-toast--info    .hs-toast__icon { color: rgba(255,255,255,0.50); }
      .hs-toast--gold    .hs-toast__icon { color: #c4a561; }

      .hs-toast__icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }
      .hs-toast__msg {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--hs-text, #e2e8f0);
        line-height: 1.4;
      }
      .hs-toast__close {
        flex-shrink: 0;
        color: var(--hs-text-3, rgba(255,255,255,0.22));
        padding: 2px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition: color 150ms;
      }
      .hs-toast__close:hover { color: var(--hs-text, #e2e8f0); }

      /* ── Confirm overlay ── */
      .hs-confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(2, 4, 8, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 220ms ease;
      }
      .hs-confirm-overlay--visible { opacity: 1; }
      .hs-confirm-overlay--exit    { opacity: 0; }

      .hs-confirm {
        background: var(--hs-surface-2, #161626);
        border: 1px solid var(--hs-border-2, rgba(255,255,255,0.12));
        border-radius: 20px;
        padding: 28px 24px;
        max-width: 360px;
        width: 100%;
        text-align: center;
        box-shadow: 0 24px 64px rgba(0,0,0,0.65);
        transform: translateY(6px) scale(0.98);
        transition: transform 220ms cubic-bezier(0.4,0,0.2,1);
      }
      .hs-confirm-overlay--visible .hs-confirm {
        transform: translateY(0) scale(1);
      }
      .hs-confirm__icon {
        width: 52px; height: 52px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 16px;
      }
      .hs-confirm__icon svg { width: 22px; height: 22px; }
      .hs-confirm__title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--hs-text, #e2e8f0);
        margin-bottom: 8px;
      }
      .hs-confirm__msg {
        font-size: 0.875rem;
        color: var(--hs-text-2, rgba(255,255,255,0.45));
        line-height: 1.55;
        margin-bottom: 20px;
      }
      .hs-confirm__actions {
        display: flex;
        gap: 10px;
      }
      .hs-confirm__cancel,
      .hs-confirm__ok {
        flex: 1;
        padding: 11px;
        border-radius: 10px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 150ms ease;
      }
      .hs-confirm__cancel {
        background: transparent;
        border-color: var(--hs-border-2, rgba(255,255,255,0.12));
        color: var(--hs-text-2, rgba(255,255,255,0.45));
      }
      .hs-confirm__cancel:hover {
        background: rgba(255,255,255,0.05);
        color: var(--hs-text, #e2e8f0);
      }
      .hs-confirm__ok {
        background: var(--hs-accent, #c4a561);
        color: #07070f;
        font-weight: 700;
      }
      .hs-confirm__ok[data-type="danger"] {
        background: #ef4444;
        color: white;
      }
      .hs-confirm__ok[data-type="warning"] {
        background: #f59e0b;
        color: #07070f;
      }
      .hs-confirm__ok:hover { filter: brightness(1.08); }
      .hs-confirm__ok:active,
      .hs-confirm__cancel:active { transform: scale(0.97); }
    `;
    document.head.appendChild(style);
  }

  // ── Init ──────────────────────────────────────────────────────
  _injectStyles();

  // ── Export global ─────────────────────────────────────────────
  window.showToast   = showToast;
  window.showConfirm = showConfirm;

  // Sobrescribir alert/confirm globales para que cualquier
  // código legacy que los use se beneficie automáticamente.
  // Se guardan los originales por si algún módulo los necesita.
  window._nativeAlert   = window.alert;
  window._nativeConfirm = window.confirm;

  window.alert = function (msg) {
    // Detectar tipo por contenido del mensaje
    const lower = String(msg).toLowerCase();
    const type = lower.includes('error') || lower.includes('fallo') || lower.includes('no se pudo')
      ? 'error'
      : lower.includes('éxito') || lower.includes('guardado') || lower.includes('completado')
      ? 'success'
      : lower.includes('límite') || lower.includes('atención') || lower.includes('cuidado')
      ? 'warning'
      : 'info';
    showToast(msg, type, 4000);
  };

  // confirm() síncrono → async: retorna true para no romper flujos existentes.
  // Los módulos que necesiten el resultado real deben usar showConfirm() directamente.
  // Para la migración gradual, el confirm() global usa showConfirm y retorna false
  // (bloquea la acción) — el módulo debe reimplementar usando await showConfirm().
  window.confirm = function (msg) {
    // Mostrar el confirm premium pero retornar false sincrónicamente
    // (el browser no puede bloquear aquí; los módulos críticos ya usan showConfirm)
    showConfirm(msg, { type: 'warning' });
    return false; // Previene acción hasta que el usuario migre a showConfirm()
  };

})();
