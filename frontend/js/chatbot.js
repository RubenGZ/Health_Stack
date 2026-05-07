/* ============================================================
   chatbot.js — Wizard AI powered by Grok via backend proxy
   ============================================================ */

const Chatbot = (function () {
  'use strict';

  const _IS_PROD = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const API_URL  = _IS_PROD
    ? `https://${location.hostname}/api/v1/chat/message`
    : 'http://localhost:8000/api/v1/chat/message';

  // Conversation history sent to backend for context
  let history = [];

  const SUGGESTIONS = [
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

  // ── DOM helpers ───────────────────────────────────────────

  function msgs() { return document.getElementById('chatbot-messages'); }

  function scrollBottom() {
    const el = msgs();
    if (el) el.scrollTop = el.scrollHeight;
  }

  function addMessage(text, isBot) {
    const container = msgs();
    if (!container) return;

    const row = document.createElement('div');
    row.className = `chat-msg chat-msg--${isBot ? 'bot' : 'user'}`;

    if (isBot) {
      row.innerHTML = `
        <div class="wizard-bot-avatar">HS</div>
        <div class="chat-bubble">${formatText(text)}</div>`;
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

  // ── Send message ──────────────────────────────────────────

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    addMessage(trimmed, false);

    const typing = addTypingIndicator();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await res.json();
      const reply = res.ok ? data.reply : (data.detail || 'Error al conectar con el asistente.');

      if (typing) typing.remove();
      addMessage(reply, true);

      // Update history (keep last 10 turns)
      history.push({ role: 'user', content: trimmed });
      history.push({ role: 'assistant', content: reply });
      if (history.length > 20) history = history.slice(-20);

    } catch (_) {
      if (typing) typing.remove();
      addMessage('No pude conectar con el asistente. Verifica tu conexión e inténtalo de nuevo.', true);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
      renderSuggestions();
    }
  }

  // ── Suggestions ───────────────────────────────────────────

  function renderSuggestions() {
    const wrap = document.getElementById('chatbot-suggestions');
    if (!wrap) return;
    const picks = [...SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 3);
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
      document.getElementById('chatbot-input')?.focus();
    }
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

    setTimeout(() => {
      const badge = document.getElementById('chatbot-badge');
      if (badge) { badge.style.display = ''; badge.textContent = '1'; }
    }, 4000);
  }

  return { init };
})();
