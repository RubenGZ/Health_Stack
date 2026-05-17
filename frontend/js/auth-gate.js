/* ============================================================
   auth-gate.js — Protege la SPA: muestra el modal de registro
   si el usuario no está autenticado o su token ha expirado.

   Flujo para usuarios no autenticados:
     → redirige a /?action=register (app carga + modal abre solo)
     → si cierran el modal sin loguearse → vuelven a la landing

   Debe cargarse como PRIMER script en index.html (después de
   mobile-redirect.js) para que no se renderice ningún contenido
   antes de verificar la sesión.
   ============================================================ */

(function () {
  'use strict';

  var TOKEN_KEY   = 'hs_access_token';
  var REFRESH_KEY = 'hs_refresh_token';
  var USER_KEY    = 'hs_user';
  var LANDING_URL = '/landing/';

  function isExpired(token) {
    try {
      var parts   = token.split('.');
      if (parts.length !== 3) return true;
      var payload = JSON.parse(atob(parts[1]));
      // exp en segundos → comparar con ms
      return typeof payload.exp === 'number'
        ? payload.exp * 1000 < Date.now()
        : true;
    } catch (_) {
      return true;
    }
  }

  var _params = new URLSearchParams(window.location.search);

  // 1. Deep-links de la landing: /?action=register|login
  //    app.js los intercepta con handleLandingBridge() y abre el modal correcto.
  var bridgeAction = _params.get('action');
  if (bridgeAction === 'register' || bridgeAction === 'login') return;

  // 2. Callback de Google OAuth: /?auth=google#access_token=...
  //    El token viene en el hash — app.js lo mueve a localStorage.
  //    Dejar pasar para que handleOAuthCallback() pueda procesarlo.
  if (_params.get('auth') === 'google' && window.location.hash.includes('access_token')) return;

  // 3. Errores de OAuth — dejar pasar para que app.js pueda mostrar el error.
  if (_params.get('auth_error')) return;

  var token = localStorage.getItem(TOKEN_KEY);

  if (!token || isExpired(token)) {
    // Limpiar cualquier dato de sesión obsoleto
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    // Abrir el modal de registro directamente en la app.
    // ?action=register está whitelisted arriba, así que no entra en bucle.
    window.location.replace('/?action=register');
  }
})();
