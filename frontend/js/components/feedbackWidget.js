/**
 * feedbackWidget.js — Widget de feedback para alpha testers
 *
 * Renderiza un botón flotante "💬 Dar Feedback" en la esquina inferior izquierda.
 * Al hacer clic muestra un modal con dos opciones:
 *   A) Bug → WhatsApp deep-link con contexto pre-rellenado
 *   B) Sugerencia → textarea + POST a /api/v1/community/posts con tag #feedback
 *
 * No depende de ningún framework. DOM puro, compatible con la arquitectura SPA.
 *
 * ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
 * Cambia WHATSAPP_NUMBER al número real antes de lanzar el alpha.
 * Formato internacional sin + ni espacios: "34XXXXXXXXX"
 */

const FeedbackWidget = (function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || '/api/v1';
  const WIDGET_VERSION = '1.0.0'; // bump si cambias el DOM para invalidar caché

  // ── Estado ─────────────────────────────────────────────────────────────────
  let _mounted = false;
  // Número de WhatsApp cargado desde /api/v1/config/public en el arranque.
  // Mientras se carga, el botón de bug muestra WhatsApp con número vacío;
  // en cuanto llega el número funciona correctamente.
  let _whatsappNumber = '';

  // ── Templates HTML ──────────────────────────────────────────────────────────

  function _buildCSS() {
    return `
      /* feedbackWidget.css — inlined */
      .fw-btn {
        position: fixed;
        bottom: 24px;
        left: 20px;
        z-index: 8000;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 10px 16px;
        background: rgba(20, 20, 40, 0.92);
        border: 1px solid rgba(124, 107, 255, 0.35);
        border-radius: 24px;
        color: rgba(255,255,255,0.82);
        font-size: 13px;
        font-weight: 600;
        font-family: system-ui, sans-serif;
        cursor: pointer;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.35), 0 0 0 1px rgba(124,107,255,0.08);
        transition: background 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
        user-select: none;
      }
      .fw-btn:hover {
        background: rgba(30, 28, 60, 0.97);
        border-color: rgba(124, 107, 255, 0.65);
        transform: translateY(-2px);
        box-shadow: 0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,107,255,0.16);
        color: #fff;
      }
      .fw-btn:active { transform: translateY(0); }
      .fw-btn-icon { font-size: 16px; line-height: 1; }

      /* Alpha badge */
      .fw-alpha-badge {
        display: inline-block;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(124,107,255,0.22);
        color: #a89aff;
        border-radius: 6px;
        padding: 1px 5px;
        margin-left: 2px;
      }

      /* Overlay */
      .fw-overlay {
        position: fixed;
        inset: 0;
        z-index: 8001;
        background: rgba(4, 4, 12, 0.72);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: flex-end;
        justify-content: flex-start;
        padding: 0 0 90px 20px;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .fw-overlay.fw-open {
        opacity: 1;
        pointer-events: all;
      }

      /* Modal */
      .fw-modal {
        background: linear-gradient(160deg, #12122a 0%, #0c0c1e 100%);
        border: 1px solid rgba(124,107,255,0.22);
        border-radius: 20px;
        padding: 24px;
        width: 100%;
        max-width: 340px;
        box-shadow:
          0 20px 60px rgba(0,0,0,0.55),
          0 0 0 1px rgba(124,107,255,0.07),
          inset 0 1px 0 rgba(255,255,255,0.05);
        transform: translateY(16px);
        transition: transform 0.25s cubic-bezier(.34,1.56,.64,1);
      }
      .fw-overlay.fw-open .fw-modal {
        transform: translateY(0);
      }

      .fw-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }
      .fw-modal-title {
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        margin: 0;
        letter-spacing: -0.01em;
      }
      .fw-modal-subtitle {
        font-size: 12px;
        color: rgba(255,255,255,0.42);
        margin: 3px 0 0;
      }
      .fw-close-btn {
        background: rgba(255,255,255,0.06);
        border: none;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255,255,255,0.5);
        font-size: 16px;
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.15s, color 0.15s;
      }
      .fw-close-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }

      /* Option buttons */
      .fw-options { display: flex; flex-direction: column; gap: 10px; }
      .fw-option {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 0.15s, border-color 0.15s, transform 0.12s;
      }
      .fw-option:hover {
        background: rgba(124,107,255,0.12);
        border-color: rgba(124,107,255,0.35);
        transform: translateX(3px);
      }
      .fw-option:active { transform: translateX(0); }
      .fw-option-icon {
        font-size: 22px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.06);
        border-radius: 10px;
        flex-shrink: 0;
      }
      .fw-option-text { flex: 1; }
      .fw-option-label {
        font-size: 14px;
        font-weight: 600;
        color: #fff;
        display: block;
      }
      .fw-option-hint {
        font-size: 11.5px;
        color: rgba(255,255,255,0.42);
        display: block;
        margin-top: 2px;
      }
      .fw-option--bug .fw-option-icon   { background: rgba(239,68,68,0.15); }
      .fw-option--idea .fw-option-icon  { background: rgba(124,107,255,0.18); }

      /* Suggestion textarea panel */
      .fw-suggestion-panel { display: flex; flex-direction: column; gap: 12px; }
      .fw-suggestion-back {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: rgba(255,255,255,0.45);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        margin-bottom: 4px;
        width: fit-content;
        transition: color 0.15s;
      }
      .fw-suggestion-back:hover { color: rgba(255,255,255,0.75); }
      .fw-suggestion-label {
        font-size: 13px;
        font-weight: 600;
        color: rgba(255,255,255,0.78);
        display: block;
        margin-bottom: 6px;
      }
      .fw-textarea {
        width: 100%;
        min-height: 90px;
        resize: vertical;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        padding: 10px 12px;
        color: rgba(255,255,255,0.88);
        font-size: 13px;
        font-family: inherit;
        line-height: 1.5;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.15s;
      }
      .fw-textarea:focus { border-color: rgba(124,107,255,0.5); }
      .fw-textarea::placeholder { color: rgba(255,255,255,0.28); }
      .fw-send-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .fw-char-count { font-size: 11px; color: rgba(255,255,255,0.28); }
      .fw-send-btn {
        padding: 9px 18px;
        background: linear-gradient(135deg, #7c6bff, #5b4fcf);
        border: none;
        border-radius: 10px;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.12s;
      }
      .fw-send-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
      .fw-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      /* States */
      .fw-success-msg, .fw-error-msg {
        font-size: 13px;
        padding: 10px 14px;
        border-radius: 10px;
        text-align: center;
        margin-top: 4px;
      }
      .fw-success-msg {
        background: rgba(16,185,129,0.12);
        border: 1px solid rgba(16,185,129,0.25);
        color: #6ee7b7;
      }
      .fw-error-msg {
        background: rgba(239,68,68,0.10);
        border: 1px solid rgba(239,68,68,0.22);
        color: #fca5a5;
      }

      /* Responsive: desktop moves modal next to button */
      @media (min-width: 600px) {
        .fw-overlay { padding: 0 0 90px 20px; }
      }
    `;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _getToken() {
    return (typeof API !== 'undefined' && API.getToken?.())
      || localStorage.getItem('hs_access_token')
      || localStorage.getItem('access_token')
      || null;
  }

  function _buildWhatsAppUrl(type) {
    const page    = window.location.pathname;
    const ua      = navigator.userAgent.slice(0, 80);
    const version = typeof CONFIG !== 'undefined' ? (CONFIG.VERSION || '2.0') : '2.0';

    const prefix = type === 'bug'
      ? `Hola Rubén, he encontrado un bug en HealthStack Pro (v${version}):\n\n`
      : `Hola Rubén, tengo una sugerencia para HealthStack Pro:\n\n`;
    const context = `\n\n---\nPágina: ${page}\nApp: v${version}`;

    const text = encodeURIComponent(prefix + context);
    return `https://wa.me/${_whatsappNumber}?text=${text}`;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────────

  function _renderOptions(modal) {
    modal.querySelector('.fw-modal-body').innerHTML = `
      <div class="fw-options">
        <button class="fw-option fw-option--bug" id="fw-bug-btn" type="button">
          <span class="fw-option-icon">🐛</span>
          <span class="fw-option-text">
            <span class="fw-option-label">Bug / Algo no funciona</span>
            <span class="fw-option-hint">Abre WhatsApp con contexto pre-rellenado</span>
          </span>
        </button>
        <button class="fw-option fw-option--idea" id="fw-idea-btn" type="button">
          <span class="fw-option-icon">💡</span>
          <span class="fw-option-text">
            <span class="fw-option-label">Sugerencia / Idea</span>
            <span class="fw-option-hint">Envíanos tu idea directamente</span>
          </span>
        </button>
      </div>
    `;

    modal.querySelector('#fw-bug-btn').addEventListener('click', () => {
      window.open(_buildWhatsAppUrl('bug'), '_blank', 'noopener,noreferrer');
      _close();
    });

    modal.querySelector('#fw-idea-btn').addEventListener('click', () => {
      _renderSuggestion(modal);
    });
  }

  function _renderSuggestion(modal) {
    const MAX = 500;
    modal.querySelector('.fw-modal-body').innerHTML = `
      <div class="fw-suggestion-panel">
        <button class="fw-suggestion-back" id="fw-back-btn" type="button">
          ← Volver
        </button>
        <label class="fw-suggestion-label">
          Cuéntanos tu idea o sugerencia
        </label>
        <textarea
          class="fw-textarea"
          id="fw-suggestion-text"
          placeholder="¿Qué mejorarías? ¿Qué te falta? ¿Qué te encantó?"
          maxlength="${MAX}"
          autocomplete="off"
        ></textarea>
        <div class="fw-send-row">
          <span class="fw-char-count" id="fw-char-count">0 / ${MAX}</span>
          <button class="fw-send-btn" id="fw-send-btn" type="button" disabled>
            Enviar →
          </button>
        </div>
        <div id="fw-feedback-status"></div>
      </div>
    `;

    const textarea  = modal.querySelector('#fw-suggestion-text');
    const sendBtn   = modal.querySelector('#fw-send-btn');
    const charCount = modal.querySelector('#fw-char-count');

    textarea.focus();

    textarea.addEventListener('input', () => {
      const len = textarea.value.trim().length;
      charCount.textContent = `${len} / ${MAX}`;
      sendBtn.disabled = len < 5;
    });

    modal.querySelector('#fw-back-btn').addEventListener('click', () => {
      _renderOptions(modal);
    });

    sendBtn.addEventListener('click', async () => {
      await _submitSuggestion(modal, textarea.value.trim());
    });
  }

  async function _submitSuggestion(modal, text) {
    const statusEl = modal.querySelector('#fw-feedback-status');
    const sendBtn  = modal.querySelector('#fw-send-btn');
    if (!text || text.length < 5) return;

    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando…';

    // Formato seguro: prefijo #feedback para fácil búsqueda en la BD
    // Nunca enviamos datos biométricos, solo el texto libre del usuario
    const content = `[FEEDBACK] #feedback ${text}`;
    const token   = _getToken();

    try {
      const res = await fetch(`${BASE}/community/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        statusEl.innerHTML = `
          <div class="fw-success-msg">
            ✅ ¡Gracias por tu feedback! Lo revisaremos pronto.
          </div>
        `;
        // Cerrar automáticamente tras 2.5 segundos
        setTimeout(_close, 2500);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      // Fallback: WhatsApp si falla la API (sin conexión, sin auth, etc.)
      statusEl.innerHTML = `
        <div class="fw-error-msg">
          No se pudo enviar. <a href="${_buildWhatsAppUrl('idea')}"
            target="_blank" rel="noopener noreferrer"
            style="color:#c4b5fd;text-decoration:underline">
            Enviar por WhatsApp
          </a>
        </div>
      `;
      sendBtn.disabled  = false;
      sendBtn.textContent = 'Enviar →';
    }
  }

  // ── Modal lifecycle ───────────────────────────────────────────────────────────

  function _open() {
    const overlay = document.getElementById('fw-overlay');
    if (!overlay) return;
    const modal = overlay.querySelector('.fw-modal');
    // Reset al estado inicial
    _renderOptions(modal);
    // Animar apertura en el próximo frame
    requestAnimationFrame(() => overlay.classList.add('fw-open'));
  }

  function _close() {
    const overlay = document.getElementById('fw-overlay');
    if (!overlay) return;
    overlay.classList.remove('fw-open');
  }

  // ── Mount ─────────────────────────────────────────────────────────────────────

  // ── Carga config del servidor ─────────────────────────────────────────────
  function _loadConfig() {
    fetch(`${BASE}/config/public`)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.whatsapp_number) {
          _whatsappNumber = data.whatsapp_number;
        }
      })
      .catch(function () { /* silencioso — sin número WA simplemente no abre */ });
  }

  function mount() {
    if (_mounted) return;
    _mounted = true;

    // Cargar número de WhatsApp desde el backend (no hardcodeado)
    _loadConfig();

    // ── Inyectar estilos ──────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.id = 'fw-styles';
    style.textContent = _buildCSS();
    document.head.appendChild(style);

    // ── Botón flotante ────────────────────────────────────────────────────────
    const btn = document.createElement('button');
    btn.id        = 'fw-trigger-btn';
    btn.className = 'fw-btn';
    btn.type      = 'button';
    btn.setAttribute('aria-label', 'Dar feedback al equipo');
    btn.innerHTML = `
      <span class="fw-btn-icon">💬</span>
      <span>Dar Feedback</span>
      <span class="fw-alpha-badge">alpha</span>
    `;
    btn.addEventListener('click', _open);
    document.body.appendChild(btn);

    // ── Overlay + modal ───────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id        = 'fw-overlay';
    overlay.className = 'fw-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Panel de feedback');
    overlay.innerHTML = `
      <div class="fw-modal">
        <div class="fw-modal-header">
          <div>
            <p class="fw-modal-title">Comparte tu opinión</p>
            <p class="fw-modal-subtitle">Alpha · Tu feedback mejora la app</p>
          </div>
          <button class="fw-close-btn" id="fw-close-btn"
                  type="button" aria-label="Cerrar">✕</button>
        </div>
        <div class="fw-modal-body"></div>
      </div>
    `;

    // Cerrar al hacer clic fuera del modal
    overlay.addEventListener('click', e => {
      if (e.target === overlay) _close();
    });
    overlay.querySelector('#fw-close-btn').addEventListener('click', _close);

    // Cerrar con Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('fw-open')) _close();
    });

    document.body.appendChild(overlay);
  }

  // ── API pública ───────────────────────────────────────────────────────────────
  return { mount };
})();

// Auto-mount cuando el DOM esté listo
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FeedbackWidget.mount());
  } else {
    FeedbackWidget.mount();
  }
}
