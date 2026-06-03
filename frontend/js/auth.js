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
            <img src="/icons/logo-icon-white.svg" width="28" height="28" style="display:block" alt="">
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
          <!-- Google OAuth -->
          <div style="padding: 20px 24px 0">
            <a href="/api/v1/auth/google/redirect" class="auth-google-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar con Google
            </a>
            <div class="auth-divider"><span>o entra con email</span></div>
          </div>
          <div class="ob-fields" style="padding: 0 24px">
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
          <!-- Google OAuth -->
          <div style="padding: 20px 24px 0">
            <a href="/api/v1/auth/google/redirect" class="auth-google-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Registrarse con Google
            </a>
            <div class="auth-divider"><span>o crea una cuenta con email</span></div>
          </div>
          <div class="ob-fields" style="padding: 0 24px">
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
      // Reset iOS viewport zoom
      const mv = document.querySelector('meta[name=viewport]');
      if (mv) { const c = mv.content; mv.content = c + ',maximum-scale=1'; requestAnimationFrame(() => { mv.content = c; }); }
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
      const msg = /rate.limit|429|too many/i.test(err.message)
        ? 'Demasiados intentos de acceso. Espera un momento.'
        : (err.message || 'Email o contraseña incorrectos.');
      showError(errEl, msg);
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
        showToast('¡Bienvenido a HealthStack Pro Beta! 🎉', 'success');
        // TTFV: marcar timestamp de registro
        localStorage.setItem('hs_ttfv_ts', String(Date.now()));
        if (typeof window._sendTelemetryEvent === 'function') {
          window._sendTelemetryEvent('registro_completado', { method: 'email' });
        }
        // SmartOnboarding v2: lanzar wizard tras cerrar el modal de auth (380ms de animación de salida + buffer)
        // Doble-seguro: el gate hs:user-loaded ya disparó init(false), pero z-index podía dejarlo
        // oculto detrás del modal de auth. Con este delay el auth modal ya está eliminado del DOM.
        setTimeout(() => {
          if (typeof SmartOnboarding !== 'undefined') {
            SmartOnboarding.init(false);
          }
        }, 480);
      } else {
        showError(errEl, 'No se pudo crear la cuenta.');
      }
    } catch (err) {
      const msg = /rate.limit|429|too many/i.test(err.message)
        ? 'Demasiados intentos de registro. Espera un momento e inténtalo de nuevo.'
        : (err.message || 'No se pudo crear la cuenta. Prueba otro email.');
      showError(errEl, msg);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crear cuenta →';
    }
  }

  async function doForgotPassword() {
    const emailInput = document.getElementById('auth-login-email');
    const email = emailInput?.value.trim();
    const errEl = document.getElementById('auth-login-error');

    if (!email) {
      if (emailInput) { emailInput.focus(); }
      showError(errEl, 'Introduce tu email primero.');
      return;
    }
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
    // Usar el sistema global de toasts si está disponible
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
      window.showToast(msg, type);
      return;
    }
    // Fallback minimal si toast.js no ha cargado aún
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
          levelEl.textContent = 'Administrador';
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
    const _escEmail = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    menu.innerHTML = `
      <div class="auth-logout-info">
        <span class="auth-logout-email">${_escEmail(user?.email || 'Usuario')}</span>
        ${user?.role === 'admin' ? '<span class="auth-logout-role">Admin</span>' : ''}
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

    window.addEventListener('hs:login',  () => { closeModal(); updateUserChip(); });
    window.addEventListener('hs:logout', () => updateUserChip());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Reset de contraseña ────────────────────────────────────
  // Si la URL contiene ?reset_token=... se inyecta un modal de nueva contraseña.
  // Reemplaza el window.prompt() anterior — prompt() está bloqueado en iOS PWA
  // standalone mode, lo que hacía la feature completamente inaccesible.

  function _showResetModal(token) {
    // Limpiar el token de la URL (no queda en historial ni en Referer)
    window.history.replaceState({}, '', window.location.pathname);

    // Eliminar modal previo si existiera
    document.getElementById('reset-pwd-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'reset-pwd-modal';
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-modal auth-modal-inner" role="dialog" aria-modal="true" aria-label="Nueva contraseña">
        <div class="ob-header">
          <div class="ob-logo">
            <img src="/icons/logo-icon-white.svg" width="28" height="28" style="display:block" alt="">
          </div>
          <span class="ob-brand">HealthStack Pro</span>
        </div>

        <div style="padding: 8px 24px 0">
          <h3 style="font-size:1.05rem;font-weight:700;color:var(--hs-text,#e2e8f0);margin:0 0 4px">
            Nueva contraseña
          </h3>
          <p style="font-size:.83rem;color:rgba(255,255,255,.45);margin:0 0 20px">
            Mín. 8 caracteres · mayúscula · minúscula · número · símbolo
          </p>
        </div>

        <div class="ob-fields" style="padding: 0 24px">
          <div class="ob-field">
            <label class="form-label" for="reset-pwd-new">Nueva contraseña</label>
            <div class="input-wrapper" style="position:relative">
              <input type="password" id="reset-pwd-new" class="form-input"
                     placeholder="••••••••" autocomplete="new-password"
                     style="padding-right:44px">
              <button type="button" id="reset-pwd-toggle"
                      style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:rgba(255,255,255,.4);padding:4px"
                      aria-label="Mostrar contraseña">
                <svg id="reset-eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="ob-field">
            <label class="form-label" for="reset-pwd-confirm">Confirmar contraseña</label>
            <div class="input-wrapper">
              <input type="password" id="reset-pwd-confirm" class="form-input"
                     placeholder="••••••••" autocomplete="new-password">
            </div>
          </div>
        </div>

        <div id="reset-pwd-error" class="auth-error" style="display:none;margin:8px 24px 0"></div>

        <div class="ob-footer" style="padding-top:12px">
          <span></span>
          <button class="btn btn--primary" id="reset-pwd-submit">Actualizar contraseña →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const newPwdEl    = document.getElementById('reset-pwd-new');
    const confirmEl   = document.getElementById('reset-pwd-confirm');
    const errorEl     = document.getElementById('reset-pwd-error');
    const submitBtn   = document.getElementById('reset-pwd-submit');
    const toggleBtn   = document.getElementById('reset-pwd-toggle');

    // Mostrar/ocultar contraseña
    toggleBtn.addEventListener('click', () => {
      const show = newPwdEl.type === 'password';
      newPwdEl.type    = show ? 'text' : 'password';
      confirmEl.type   = show ? 'text' : 'password';
      toggleBtn.style.color = show ? 'var(--hs-accent,#c4a561)' : 'rgba(255,255,255,.4)';
    });

    // Enviar con Enter
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitBtn.click();
    });

    // Focus automático
    setTimeout(() => newPwdEl.focus(), 80);

    submitBtn.addEventListener('click', async () => {
      const pwd     = newPwdEl.value;
      const confirm = confirmEl.value;

      // Validaciones cliente
      if (!pwd) {
        showError(errorEl, 'Introduce una contraseña.');
        newPwdEl.focus();
        return;
      }
      if (pwd.length < 8) {
        showError(errorEl, 'Mínimo 8 caracteres.');
        newPwdEl.focus();
        return;
      }
      if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd) || !/[^A-Za-z0-9]/.test(pwd)) {
        showError(errorEl, 'Incluye mayúscula, minúscula, número y símbolo (!@#...).');
        newPwdEl.focus();
        return;
      }
      if (pwd !== confirm) {
        showError(errorEl, 'Las contraseñas no coinciden.');
        confirmEl.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Actualizando…';
      clearError(errorEl);

      try {
        const res  = await fetch('/api/v1/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: pwd }),
        });
        const data = await res.json();

        if (res.ok) {
          overlay.remove();
          showToast(data.message || 'Contraseña actualizada. Ya puedes iniciar sesión.', 'success');
          // Abrir el modal de login para que el usuario entre inmediatamente
          setTimeout(() => openModal('login'), 600);
        } else {
          showError(errorEl, data.detail || 'El enlace es inválido o ha expirado.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Actualizar contraseña →';
        }
      } catch {
        showError(errorEl, 'Error de red. Comprueba tu conexión e inténtalo de nuevo.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Actualizar contraseña →';
      }
    });
  }

  // Detectar ?reset_token al cargar (esperar DOM para poder inyectar el modal)
  (function checkResetToken() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('reset_token');
    if (!token) return;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => _showResetModal(token));
    } else {
      _showResetModal(token);
    }
  })();

  // Expose for external use (e.g., admin panel, tests)
  window.Auth = { open: openModal, close: closeModal, showToast };

})();
