/* ============================================================
   auth-gate.js — Protege la SPA: redirige a la landing si el
   usuario no está autenticado o su token ha expirado.

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

  var token = localStorage.getItem(TOKEN_KEY);

  if (!token || isExpired(token)) {
    // Limpiar cualquier dato de sesión obsoleto
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    // Redirigir a la landing — replace para que no quede en el historial
    window.location.replace(LANDING_URL);
  }
})();
