/* ============================================================
   chatbot.js — Wizard AI powered by Groq via backend proxy
   ============================================================ */

const Chatbot = (function () {
  'use strict';

  const _IS_PROD = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const _BASE    = _IS_PROD ? `https://${location.hostname}` : 'http://localhost:8000';
  const API_URL  = `${_BASE}/api/v1/chat/message`;
  const HEALTH_URL = `${_BASE}/health`;

  // Conversation history sent to backend for context
  let history = [];
  let _online  = false;

  // ── i18n helpers ──────────────────────────────────────────

  /** Current language code ('es'|'en'|'fr'|'de'|'it'). */
  function _lang() {
    return (typeof getLanguage === 'function' ? getLanguage() : null)
      || localStorage.getItem('hs-app-lang')
      || 'es';
  }

  /**
   * Translate a chatbot key with optional variable substitution.
   * Falls back to Spanish if the key is missing in the current locale.
   * Usage: _t('pill_weight', { kg: 83 })  →  'Guardar 83 kg en tu historial'
   */
  function _t(key, vars) {
    const raw = (typeof t === 'function')
      ? t(`chatbot.${key}`)
      : key;   // fallback if i18n not loaded
    if (!vars || typeof raw !== 'string') return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  }

  /** Return the localized SUGGESTIONS array for the current language. */
  function _getSuggestions() {
    const arr = (typeof t === 'function') ? t('chatbot.suggestions') : null;
    if (Array.isArray(arr) && arr.length) return arr;
    // Fallback to Spanish hardcoded list
    return [
      '¿Cuánta proteína necesito?',
      '¿Cómo pierdo grasa sin perder músculo?',
      '¿Qué es el TDEE?',
      '¿La creatina funciona?',
      '¿Cuántos días debo entrenar?',
      '¿Cómo genero mi rutina personalizada?',
      '¿Qué comer antes de entrenar?',
      '¿Cómo mejorar el sueño y la recuperación?',
      '¿Qué suplementos vale la pena tomar?',
      'Explícame la técnica de la sentadilla',
    ];
  }

  // ── Connection status ─────────────────────────────────────

  function setDotStatus(online) {
    _online = online;
    const dot = document.querySelector('.wizard-online-dot');
    if (!dot) return;
    if (online) {
      dot.style.background = '#22c55e';
      dot.style.boxShadow  = '0 0 6px #22c55e';
      dot.title = _t('connected');
    } else {
      dot.style.background = '#ef4444';
      dot.style.boxShadow  = '0 0 6px #ef4444';
      dot.title = _t('disconnected');
    }
  }

  async function checkConnection() {
    try {
      const res = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(4000),
      });
      setDotStatus(res.ok);
      return res.ok;
    } catch {
      setDotStatus(false);
      return false;
    }
  }

  // ── DOM helpers ───────────────────────────────────────────

  function msgs() { return document.getElementById('chatbot-messages'); }

  function scrollBottom() {
    const el = msgs();
    if (el) el.scrollTop = el.scrollHeight;
  }

  function addMessage(text, isBot, action) {
    const container = msgs();
    if (!container) return;

    const row = document.createElement('div');
    row.className = `chat-msg chat-msg--${isBot ? 'bot' : 'user'}`;

    if (isBot) {
      row.innerHTML = `
        <div class="wizard-bot-avatar">HS</div>
        <div class="chat-bubble">${formatText(text)}</div>`;
      // Añadir pill de acción si el backend detectó datos guardables
      if (action) {
        const pill = buildActionPill(action);
        if (pill) row.querySelector('.chat-bubble').appendChild(pill);
      }
    } else {
      row.innerHTML = `<div class="chat-bubble">${formatText(text)}</div>`;
    }

    container.appendChild(row);
    scrollBottom();
    return row;
  }

  function formatText(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function addTypingIndicator() {
    const container = msgs();
    if (!container) return null;
    const row = document.createElement('div');
    row.className = 'chat-msg chat-msg--bot chat-typing';
    row.innerHTML = `
      <div class="wizard-bot-avatar">HS</div>
      <div class="chat-bubble">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>`;
    container.appendChild(row);
    scrollBottom();
    return row;
  }

  // ── Action pills ──────────────────────────────────────────

  /**
   * Construye la pill de confirmación para una acción detectada.
   * Devuelve un elemento DOM o null si la acción no es soportada.
   */
  function buildActionPill(action) {
    const type = action.type;
    let label = '';
    let icon  = '';

    if (type === 'save_weight' && action.kg) {
      icon  = '';
      label = _t('pill_weight', { kg: action.kg });
    } else if (type === 'save_pr' && action.exercise) {
      const rm = action.weight_kg && action.reps
        ? ` (1RM ~${calcEpley(action.weight_kg, action.reps)} kg)`
        : '';
      icon  = '';
      label = _t('pill_pr', {
        exercise: action.exercise,
        weight:   action.weight_kg,
        reps:     action.reps,
        rm,
      });
    } else if (type === 'log_workout') {
      icon  = '';
      label = _t('pill_workout');
    } else if (type === 'save_sleep' && action.hours) {
      icon  = '';
      label = _t('pill_sleep', { hours: action.hours });
    } else {
      return null;
    }

    const pill = document.createElement('div');
    pill.className = 'chat-action-pill';
    pill.innerHTML = `
      <span class="cap-icon">${icon}</span>
      <span class="cap-label">${label}</span>
      <button class="cap-btn cap-btn--confirm" title="${_t('save_btn')}">${_t('save_btn')}</button>
      <button class="cap-btn cap-btn--dismiss" title="✕">✕</button>`;

    pill.querySelector('.cap-btn--confirm').addEventListener('click', () => {
      executeAction(action, pill);
    });
    pill.querySelector('.cap-btn--dismiss').addEventListener('click', () => {
      pill.remove();
    });

    return pill;
  }

  function calcEpley(weight, reps) {
    if (+reps === 1) return +weight;
    return +(+weight * (1 + +reps / 30)).toFixed(1);
  }

  /**
   * Ejecuta la acción cuando el usuario confirma.
   * Llama al endpoint correspondiente y actualiza la UI.
   */
  async function executeAction(action, pill) {
    const confirmBtn = pill.querySelector('.cap-btn--confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '…'; }

    const token   = typeof API !== 'undefined' ? API.getToken?.() : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const today = new Date().toISOString().slice(0, 10);

    try {
      let ok = false;

      if (action.type === 'save_weight') {
        const res = await fetch(`${_BASE}/api/v1/health/records`, {
          method: 'POST', headers,
          body: JSON.stringify({ recorded_date: today, weight_kg: action.kg }),
        });
        ok = res.ok;
        if (ok) _postGamification(headers, 'weight');

      } else if (action.type === 'save_pr') {
        // Los PRs se guardan en localStorage (módulo Records)
        if (typeof Records !== 'undefined' && action.exercise && action.weight_kg && action.reps) {
          Records.addEntry(action.exercise, action.weight_kg, action.reps);
          ok = true;
        }
        if (ok) _postGamification(headers, 'workout');

      } else if (action.type === 'log_workout') {
        ok = await _postGamification(headers, 'workout');

      } else if (action.type === 'save_sleep') {
        const res = await fetch(`${_BASE}/api/v1/health/records`, {
          method: 'POST', headers,
          body: JSON.stringify({ recorded_date: today, sleep_hours: action.hours }),
        });
        ok = res.ok;
      }

      if (ok) {
        pill.innerHTML = `<span style="color:#22c55e;font-size:.85rem;">${_t('saved_ok')}</span>`;
        setTimeout(() => pill.remove(), 2500);
      } else {
        _pillError(pill, _t('err_save'));
      }
    } catch {
      _pillError(pill, _t('err_connection'));
    }
  }

  async function _postGamification(headers, actionName) {
    try {
      const res = await fetch(`${_BASE}/api/v1/gamification/action`, {
        method: 'POST', headers,
        body: JSON.stringify({ action: actionName }),
      });
      return res.ok;
    } catch { return false; }
  }

  function _pillError(pill, msg) {
    pill.innerHTML = `<span style="color:#ef4444;font-size:.85rem;">⚠ ${msg}</span>`;
    setTimeout(() => pill.remove(), 4000);
  }

  // ── Send message ──────────────────────────────────────────

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const input   = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');
    if (input)   input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    addMessage(trimmed, false);
    const typing = addTypingIndicator();

    try {
      // Añadir token si el usuario está autenticado (contexto personalizado)
      const headers = { 'Content-Type': 'application/json' };
      const token = typeof API !== 'undefined' ? API.getToken?.() : null;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: trimmed, history, language: _lang() }),
        signal: AbortSignal.timeout(30000),
      });

      if (typing) typing.remove();

      // Leer body como texto primero — puede ser HTML (502/503 de nginx)
      const rawText = await res.text();
      let data;
      try { data = JSON.parse(rawText); } catch { data = {}; }

      if (res.ok) {
        const reply  = data.reply || data.message || 'Respuesta recibida.';
        const action = data.action || null;
        addMessage(reply, true, action);
        setDotStatus(true);
        history.push({ role: 'user',      content: trimmed });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 20) history = history.slice(-20);
      } else {
        setDotStatus(false);
        const errMsg = res.status >= 500
          ? _t('err_service')
          : (data.detail || _t('err_service'));
        addMessage(errMsg, true);
      }

    } catch (err) {
      if (typing) typing.remove();
      setDotStatus(false);
      addMessage(_t('err_offline'), true);

    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input)   input.focus();
      renderSuggestions();
    }
  }

  // ── Suggestions ───────────────────────────────────────────

  function renderSuggestions() {
    const wrap = document.getElementById('chatbot-suggestions');
    if (!wrap) return;
    const picks = [..._getSuggestions()].sort(() => Math.random() - 0.5).slice(0, 3);
    wrap.innerHTML = picks
      .map(s => `<button class="chat-suggestion">${s}</button>`)
      .join('');
    wrap.querySelectorAll('.chat-suggestion').forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.textContent));
    });
  }

  // ── Panel toggle ──────────────────────────────────────────

  function togglePanel() {
    const panel = document.getElementById('chatbot-panel');
    const badge = document.getElementById('chatbot-badge');
    if (!panel) return;
    const opening = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = opening ? 'flex' : 'none';
    if (opening) {
      if (badge) badge.style.display = 'none';
      // Solo hacer focus en desktop — en móvil abriría el teclado y haría zoom en iOS
      if (!window.matchMedia('(max-width: 768px)').matches) {
        document.getElementById('chatbot-input')?.focus();
      }
      checkConnection();
      // Móvil: ajustar panel cuando aparece el teclado virtual
      _initKeyboardAware();
    } else {
      _destroyKeyboardAware();
    }
  }

  // ── Keyboard-aware (móvil) ─────────────────────────────────
  // Ajusta la altura del panel cuando el teclado virtual iOS/Android
  // reduce el visualViewport, evitando que el input quede tapado.
  let _vvListener = null;

  function _initKeyboardAware() {
    if (!window.visualViewport) return;
    if (_vvListener) return; // ya activo
    _vvListener = () => {
      const panel = document.getElementById('chatbot-panel');
      if (!panel || panel.style.display === 'none') return;
      const vvHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      const keyboardHeight = windowHeight - vvHeight;
      // En móvil el panel es fullscreen (inset:0), no ajustar bottom
      if (!window.matchMedia('(max-width: 768px)').matches) {
        panel.style.bottom = keyboardHeight > 50 ? `${keyboardHeight}px` : '';
      }
    };
    window.visualViewport.addEventListener('resize', _vvListener);
  }

  function _destroyKeyboardAware() {
    if (_vvListener && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', _vvListener);
      _vvListener = null;
    }
    // Restaurar bottom por defecto
    const panel = document.getElementById('chatbot-panel');
    if (panel) panel.style.bottom = '';
  }

  // ── PWA background safety ─────────────────────────────────
  // Cierra el panel cuando la app pasa a segundo plano (visibilitychange/pagehide).
  // Evita que el panel quede cubriendo la pantalla al retomar la app en iOS/Android.
  function _closeOnBackground() {
    const panel = document.getElementById('chatbot-panel');
    if (!panel || panel.style.display !== 'flex') return;
    panel.style.display = 'none';
    _destroyKeyboardAware();
    // Restaurar badge: el panel se cerró sin que el usuario lo pidiera
    const badge = document.getElementById('chatbot-badge');
    if (badge) badge.style.display = '';
    // Avisar a mobileNav para que restaure la navegación
    window.dispatchEvent(new CustomEvent('hs:nav-unlock'));
  }

  // ── Init ──────────────────────────────────────────────────

  function init() {
    document.getElementById('chatbot-btn')?.addEventListener('click', togglePanel);
    document.getElementById('chatbot-close')?.addEventListener('click', togglePanel);

    const sendBtn = document.getElementById('chatbot-send');
    const inputEl = document.getElementById('chatbot-input');

    sendBtn?.addEventListener('click', () => sendMessage(inputEl?.value || ''));
    inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
      }
    });

    renderSuggestions();

    // Initial connection check — dot shows green/red immediately
    checkConnection();
    // Re-check every 30s to stay accurate
    setInterval(checkConnection, 30_000);

    setTimeout(() => {
      const badge = document.getElementById('chatbot-badge');
      if (badge) { badge.style.display = ''; badge.textContent = '1'; }
    }, 4000);

    // PWA lifecycle: cerrar el panel al pasar a segundo plano
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) _closeOnBackground();
    });
    window.addEventListener('pagehide', _closeOnBackground);
  }

  return { init };
})();
