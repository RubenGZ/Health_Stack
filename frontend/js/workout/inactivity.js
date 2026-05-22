// frontend/js/workout/inactivity.js
// Detección de inactividad del usuario durante una sesión de entrenamiento.
// 10 min sin interacción → aviso. 60 min → auto-finalizar sesión.
import { S } from './state.js';

// Callback inyectado por el coordinador para finalizar la sesión
let _onFinish = null;
export function registerOnFinish(cb) { _onFinish = cb; }

export function resetInactivity() {
  S.lastActivityAt = Date.now();
}

export function startInactivityWatch() {
  clearInterval(S.inactivityTimer);
  S.inactivityTimer = setInterval(() => {
    if (S.session?.pausedAt) return; // no contar inactividad durante pausa
    const idleMs = Date.now() - S.lastActivityAt;
    if (idleMs >= 3600000) {          // 60 min → auto-close
      clearInterval(S.inactivityTimer);
      S.inactivityToast?.remove();
      _onFinish?.();
    } else if (idleMs >= 600000 && !S.inactivityToast) { // 10 min → aviso
      _showInactivityToast();
    }
  }, 30000); // check cada 30 s
}

function _showInactivityToast() {
  if (S.inactivityToast) return;
  S.inactivityToast = document.createElement('div');
  S.inactivityToast.className = 'wl-inactivity-toast';
  S.inactivityToast.innerHTML = `
    <span class="wl-inact-icon">◷</span>
    <span class="wl-inact-msg">¿Sigues ahí? Llevas más de 10 min sin registrar nada.</span>
    <div class="wl-inact-actions">
      <button class="wl-inact-continue">Continuar</button>
      <button class="wl-inact-finish">Finalizar sesión</button>
    </div>`;
  document.body.appendChild(S.inactivityToast);
  S.inactivityToast.querySelector('.wl-inact-continue').addEventListener('click', () => {
    resetInactivity();
    S.inactivityToast?.remove();
    S.inactivityToast = null;
  });
  S.inactivityToast.querySelector('.wl-inact-finish').addEventListener('click', () => {
    S.inactivityToast?.remove();
    S.inactivityToast = null;
    _onFinish?.();
  });
}
