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

  // 4. Reset de contraseña — el enlace del email incluye ?reset_token=...
  //    auth.js mostrará el modal de nueva contraseña al cargar.
  //    Sin esta whitelist, usuarios no autenticados serían redirigidos a
  //    /landing/ ANTES de que auth.js pueda leer el token.
  if (_params.get('reset_token')) return;

  var token = localStorage.getItem(TOKEN_KEY);

  if (!token || isExpired(token)) {
    // Solo borrar el access token expirado.
    // REFRESH_KEY y USER_KEY se conservan intencionalmente:
    // api.js init() los usará para hacer un silent refresh y evitar
    // forzar un login manual cuando la sesión sigue siendo válida.
    localStorage.removeItem(TOKEN_KEY);
    // Abrir el modal de registro directamente en la app.
    // ?action=register está whitelisted arriba, así que no entra en bucle.
    // Si el silent refresh tiene éxito, auth.js cerrará el modal automáticamente.
    window.location.replace('/?action=register');
  }
})();
