/**
 * auth.js — Email/password login + register modal
 * Triggered by clicking the user chip in the sidebar.
 * Uses API.login() / API.register() from api.js.
 */

(function () {
  'use strict';

  // ── Modal HTML ─────────────────────────────────────────────

  function injectModal() {
    if (document.getElementById('auth-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'auth-modal';
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-modal auth-modal-inner" role="dialog" aria-modal="true" aria-label="Acceso a HealthStack Pro">
        <div class="ob-header">
          <div class="ob-logo">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L29 9.5V22.5L16 29L3 22.5V9.5L16 3Z" stroke="url(#authg)" stroke-width="2" fill="none"/>
              <path d="M8 16H24M16 8V24" stroke="url(#authg)" stroke-width="2" stroke-linecap="round"/>
              <defs><linearGradient id="authg" x1="3" y1="3" x2="29" y2="29">
                <stop offset="0%" stop-color="#6c63ff"/>
                <stop offset="100%" stop-color="#00d2ff"/>
              </linearGradient></defs>
            </svg>
          </div>
          <span class="ob-brand">HealthStack Pro</span>
          <button class="ob-skip" id="auth-close-btn" aria-label="Cerrar">✕</button>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab auth-tab--active" data-tab="login">Entrar</button>
          <button class="auth-tab" data-tab="register">Registrarse</button>
        </div>

        <!-- ── Login ── -->
        <div id="auth-login-form" class="auth-form">
          <div class="ob-fields" style="padding: 24px 24px 0">
            <div class="ob-field">
              <label class="form-label" for="auth-login-email">Email</label>
              <div class="input-wrapper">
                <input type="email" id="auth-login-email" class="form-input"
                       placeholder="tu@email.com" autocomplete="email">
              </div>
            </div>
            <div class="ob-field">
              <label class="form-label" for="auth-login-pwd">Contraseña</label>
              <div class="input-wrapper">
                <input type="password" id="auth-login-pwd" class="form-input"
                       placeholder="••••••••" autocomplete="current-password">
              </div>
            </div>
          </div>
          <div id="auth-login-error" class="auth-error" style="display:none;margin:0 24px"></div>
          <div style="text-align:right;margin:4px 24px 0">
            <button type="button" class="btn btn--ghost btn--sm" id="auth-forgot-btn">¿Olvidaste tu contraseña?</button>
          </div>
          <div class="ob-footer">
            <span></span>
            <button class="btn btn--primary" id="auth-login-btn">Entrar →</button>
          </div>
        </div>

        <!-- ── Register ── -->
        <div id="auth-register-form" class="auth-form" style="display:none">
          <div class="ob-fields" style="padding: 24px 24px 0">
            <div class="ob-field">
              <label class="form-label" for="auth-reg-name">Nombre (opcional)</label>
              <div class="input-wrapper">
                <input type="text" id="auth-reg-name" class="form-input"
                       placeholder="Tu nombre" autocomplete="name">
              </div>
            </div>
            <div class="ob-field">
              <label class="form-label" for="auth-reg-email">Email</label>
              <div class="input-wrapper">
                <input type="email" id="auth-reg-email" class="form-input"
                       placeholder="tu@email.com" autocomplete="email">
              </div>
            </div>
            <div class="ob-field">
              <label class="form-label" for="auth-reg-pwd">Contraseña</label>
              <div class="input-wrapper">
                <input type="password" id="auth-reg-pwd" class="form-input"
                       placeholder="Mín. 8 caracteres" autocomplete="new-password">
              </div>
              <p class="auth-pwd-hint">Mín. 8 caracteres · mayúscula · minúscula · número · carácter especial (!@#…)</p>
            </div>
          </div>
          <label class="auth-consent">
            <input type="checkbox" id="auth-gdpr">
            Acepto la <a href="/privacy.html" target="_blank" rel="noopener">Política de Privacidad</a> y los <a href="/terms.html" target="_blank" rel="noopener">Términos de Uso</a>
          </label>
          <div id="auth-register-error" class="auth-error" style="display:none;margin:0 24px"></div>
          <div class="ob-footer">
            <span></span>
            <button class="btn btn--primary" id="auth-register-btn">Crear cuenta →</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    attachModalEvents(overlay);
  }

  // ── Event wiring ───────────────────────────────────────────

  function attachModalEvents(overlay) {
    document.getElementById('auth-close-btn').addEventListener('click', closeModal);

    // Close on backdrop click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });

    // Tab switching
    overlay.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Submit on Enter
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const activeForm = overlay.querySelector('.auth-form:not([style*="display:none"])');
        activeForm?.querySelector('.btn--primary')?.click();
      }
      if (e.key === 'Escape') closeModal();
    });

    document.getElementById('auth-login-btn').addEventListener('click', doLogin);
    document.getElementById('auth-register-btn').addEventListener('click', doRegister);
    document.getElementById('auth-forgot-btn').addEventListener('click', doForgotPassword);
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(b =>
      b.classList.toggle('auth-tab--active', b.dataset.tab === tab)
    );
    document.getElementById('auth-login-form').style.display    = tab === 'login'    ? '' : 'none';
    document.getElementById('auth-register-form').style.display = tab === 'register' ? '' : 'none';

    // Focus first relevant input
    const focusId = tab === 'login' ? 'auth-login-email' : 'auth-reg-email';
    setTimeout(() => document.getElementById(focusId)?.focus(), 50);
  }

  // ── Open / close ───────────────────────────────────────────

  function openModal(defaultTab = 'login') {
    injectModal();
    const modal = document.getElementById('auth-modal');
    modal.style.display = '';
    switchTab(defaultTab);
  }

  function closeModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('ob-exit');
    setTimeout(() => {
      modal.remove();
      // Si cerraron sin autenticarse → volver a la landing
      if (!localStorage.getItem('hs_access_token')) {
        window.location.replace('/landing/');
      }
    }, 380);
  }

  // ── Auth actions ───────────────────────────────────────────

  async function doLogin() {
    const email  = document.getElementById('auth-login-email').value.trim();
    const pwd    = document.getElementById('auth-login-pwd').value;
    const errEl  = document.getElementById('auth-login-error');
    const btn    = document.getElementById('auth-login-btn');

    clearError(errEl);

    if (!email || !pwd) { showError(errEl, 'Completa email y contraseña.'); return; }
    if (!email.includes('@')) { showError(errEl, 'Email no válido.'); return; }

    btn.disabled = true;
    btn.textContent = 'Entrando…';

    try {
      const data = await API.login(email, pwd);
      if (data) {
        closeModal();
        updateUserChip();
        showToast('¡Bienvenido! Sesión iniciada.', 'success');
      } else {
        showError(errEl, 'Email o contraseña incorrectos.');
      }
    } catch (err) {
      showError(errEl, err.message || 'Email o contraseña incorrectos.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar →';
    }
  }

  async function doRegister() {
    const name   = document.getElementById('auth-reg-name').value.trim();
    const email  = document.getElementById('auth-reg-email').value.trim();
    const pwd    = document.getElementById('auth-reg-pwd').value;
    const gdpr   = document.getElementById('auth-gdpr').checked;
    const errEl  = document.getElementById('auth-register-error');
    const btn    = document.getElementById('auth-register-btn');

    clearError(errEl);

    if (!email || !pwd) { showError(errEl, 'Completa email y contraseña.'); return; }
    if (!email.includes('@')) { showError(errEl, 'Email no válido.'); return; }
    if (pwd.length < 8) { showError(errEl, 'La contraseña debe tener al menos 8 caracteres.'); return; }
    if (!/[A-Z]/.test(pwd)) { showError(errEl, 'La contraseña debe tener al menos una mayúscula (A-Z).'); return; }
    if (!/[a-z]/.test(pwd)) { showError(errEl, 'La contraseña debe tener al menos una minúscula (a-z).'); return; }
    if (!/[0-9]/.test(pwd)) { showError(errEl, 'La contraseña debe tener al menos un número (0-9).'); return; }
    if (!/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(pwd)) { showError(errEl, 'La contraseña debe tener al menos un carácter especial (!@#$%...).'); return; }
    if (!gdpr) { showError(errEl, 'Debes aceptar la política de privacidad.'); return; }

    btn.disabled = true;
    btn.textContent = 'Creando cuenta…';

    try {
      const data = await API.register(email, pwd, name || null, true);
      if (data) {
        closeModal();
        updateUserChip();
        showToast('¡Cuenta creada! Bienvenido a HealthStack Pro.', 'success');
      } else {
        showError(errEl, 'No se pudo crear la cuenta.');
      }
    } catch (err) {
      showError(errEl, err.message || 'No se pudo crear la cuenta. Prueba otro email.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crear cuenta →';
    }
  }

  async function doForgotPassword() {
    const emailInput = document.getElementById('auth-login-email');
    const email = emailInput?.value.trim() || prompt('Introduce tu email:');
    if (!email) return;

    const errEl = document.getElementById('auth-login-error');
    const btn   = document.getElementById('auth-forgot-btn');

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    try {
      await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Respuesta siempre positiva (anti-enumeration)
      if (errEl) {
        errEl.style.display = '';
        errEl.style.color = '#10b981';
        errEl.textContent = 'Si el email existe, recibirás instrucciones en breve.';
      }
    } catch (_) {
      // Fallo de red — misma UX positiva para no revelar información
      if (errEl) {
        errEl.style.display = '';
        errEl.style.color = '#10b981';
        errEl.textContent = 'Si el email existe, recibirás instrucciones en breve.';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '¿Olvidaste tu contraseña?'; }
    }
  }

  // ── Error helpers ──────────────────────────────────────────

  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = '';
    el.classList.add('auth-error--shake');
    setTimeout(() => el.classList.remove('auth-error--shake'), 500);
  }

  function clearError(el) {
    el.style.display = 'none';
    el.textContent = '';
  }

  // ── Toast ──────────────────────────────────────────────────

  function showToast(msg, type = 'info') {
    const old = document.getElementById('auth-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'auth-toast';
    t.className = `auth-toast auth-toast--${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('auth-toast--visible'));
    setTimeout(() => {
      t.classList.remove('auth-toast--visible');
      setTimeout(() => t.remove(), 400);
    }, 3500);
  }

  // ── User chip ──────────────────────────────────────────────

  function updateUserChip() {
    const user     = typeof API !== 'undefined' ? API.getUser?.() : null;
    const nameEl   = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const levelEl  = document.getElementById('user-level');
    const chip     = document.getElementById('user-chip');

    if (user) {
      const display = user.display_name || user.email?.split('@')[0] || 'Atleta';
      if (nameEl)   nameEl.textContent   = display;
      if (avatarEl) avatarEl.textContent = display[0]?.toUpperCase() || 'A';
      if (chip) chip.setAttribute('title', 'Opciones de cuenta');

      if (levelEl) {
        if (user.role === 'admin') {
          levelEl.textContent = '👑 Administrador';
          levelEl.style.color = '#f59e0b';
        } else {
          levelEl.style.color = '';
        }
      }

    } else {
      if (nameEl)   nameEl.textContent   = 'Atleta';
      if (avatarEl) avatarEl.textContent = 'A';
      if (chip) chip.setAttribute('title', 'Iniciar sesión');
      if (levelEl) levelEl.style.color = '';
    }
  }

  // ── Logout menu ────────────────────────────────────────────

  function showLogoutMenu(anchor) {
    const existing = document.getElementById('auth-logout-menu');
    if (existing) { existing.remove(); return; }

    const user = typeof API !== 'undefined' ? API.getUser?.() : null;
    const menu = document.createElement('div');
    menu.id = 'auth-logout-menu';
    menu.className = 'auth-logout-menu';
    menu.innerHTML = `
      <div class="auth-logout-info">
        <span class="auth-logout-email">${user?.email || 'Usuario'}</span>
        ${user?.role === 'admin' ? '<span class="auth-logout-role">👑 Admin</span>' : ''}
      </div>
      <button class="auth-logout-btn" id="do-logout-btn">Cerrar sesión</button>
    `;
    document.body.appendChild(menu);

    // Position above the user chip
    const rect = anchor.getBoundingClientRect();
    menu.style.cssText = `
      position: fixed;
      bottom: ${window.innerHeight - rect.top + 8}px;
      left: ${rect.left}px;
      z-index: 9999;
    `;

    document.getElementById('do-logout-btn').addEventListener('click', () => {
      if (typeof API !== 'undefined') API.logout();
      menu.remove();
      updateUserChip();
    });

    // Dismiss on outside click
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 10);
  }

  // ── Init ──────────────────────────────────────────────────

  function init() {
    const chip = document.getElementById('user-chip');
    if (chip) {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        const loggedIn = typeof API !== 'undefined' && API.isLoggedIn?.();
        if (loggedIn) {
          showLogoutMenu(chip);
        } else {
          openModal('login');
        }
      });
    }

    updateUserChip();

    window.addEventListener('hs:login',  () => updateUserChip());
    window.addEventListener('hs:logout', () => updateUserChip());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Reset token en URL ─────────────────────────────────────
  // Si la URL contiene ?reset_token=... se muestra el diálogo de nueva contraseña.
  // Se ejecuta en cuanto el script carga (antes del DOMContentLoaded no es necesario
  // porque solo usa fetch + prompt, no el DOM del modal).
  (function checkResetToken() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('reset_token');
    if (!token) return;

    // Limpiar el token de la URL inmediatamente (no queda en historial)
    window.history.replaceState({}, '', window.location.pathname);

    const newPwd = prompt(
      'Introduce tu nueva contraseña\n(mín. 8 caracteres · mayúscula · minúscula · número · símbolo):'
    );
    if (!newPwd) return;

    fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPwd }),
    })
      .then(r => r.json())
      .then(data => {
        alert(data.message || 'Contraseña actualizada. Ya puedes iniciar sesión.');
      })
      .catch(() => {
        alert('Error al restablecer la contraseña. El enlace puede haber expirado.');
      });
  })();

  // Expose for external use (e.g., admin panel, tests)
  window.Auth = { open: openModal, close: closeModal, showToast };

})();
