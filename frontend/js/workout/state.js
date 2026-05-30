// frontend/js/workout/state.js
// Estado mutable compartido por todos los submódulos del workout logger.
// Todos importan el mismo objeto S y lo mutan directamente (sin getters/setters).

export const REST_DEFAULT = 90; // segundos de descanso por defecto

export const S = {
  root:            null,   // contenedor DOM inyectado por init()
  session:         null,   // draft de sesión activa (objeto en memoria)
  onRenderActive:  null,   // callback inyectado por el coordinador para transitar a vista activa
  timerInterval:   null,
  restInterval:    null,
  restRemaining:   0,
  restTotal:       REST_DEFAULT,
  restExKey:       null,   // key del ejercicio cuyo rest timer está corriendo
  prToastQueue:    [],     // cola de toasts de PR pendientes
  prToastActive:   false,
  lastActivityAt:  Date.now(),
  inactivityTimer: null,
  inactivityToast: null,
  wlViewer:        null,   // instancia del anatomy viewer (anatomyLens)
};
