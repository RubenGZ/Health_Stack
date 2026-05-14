// frontend/js/anatomyLens/state.js
// Pure state machine — no DOM, no Three.js, no side effects.

export const STATES = Object.freeze({
  UNINITIALIZED:       'UNINITIALIZED',
  LOADING:             'LOADING',
  READY:               'READY',
  TRANSITIONING_CAMERA:'TRANSITIONING_CAMERA',
  HIGHLIGHTING:        'HIGHLIGHTING',
  SVG_FALLBACK:        'SVG_FALLBACK',  // terminal
});

// Valid transitions: state → allowed next states
const TRANSITIONS = {
  [STATES.UNINITIALIZED]:        [STATES.LOADING],
  [STATES.LOADING]:              [STATES.READY, STATES.SVG_FALLBACK],
  [STATES.READY]:                [STATES.TRANSITIONING_CAMERA, STATES.SVG_FALLBACK],
  [STATES.TRANSITIONING_CAMERA]: [STATES.HIGHLIGHTING, STATES.TRANSITIONING_CAMERA, STATES.SVG_FALLBACK],
  [STATES.HIGHLIGHTING]:         [STATES.TRANSITIONING_CAMERA, STATES.READY, STATES.SVG_FALLBACK],
  [STATES.SVG_FALLBACK]:         [],
};

let _current = STATES.UNINITIALIZED;

/** Return current state string */
export function getState() {
  return _current;
}

/**
 * Attempt a state transition.
 * Returns true if successful, false if transition is invalid (logs warning).
 */
export function transition(next) {
  const allowed = TRANSITIONS[_current] ?? [];
  if (!allowed.includes(next)) {
    console.warn(`[AnatomyLens/state] Invalid transition: ${_current} → ${next}`);
    return false;
  }
  _current = next;
  return true;
}

/** Reset to initial state (for destroy + re-init cycles) */
export function resetState() {
  _current = STATES.UNINITIALIZED;
}

/** Returns true if the viewer is in a state where highlight() can proceed */
export function canHighlight() {
  return _current === STATES.READY || _current === STATES.HIGHLIGHTING || _current === STATES.TRANSITIONING_CAMERA;
}

/** Returns true if the viewer is fully operational (not loading, not fallback) */
export function is3DActive() {
  return _current !== STATES.UNINITIALIZED && _current !== STATES.SVG_FALLBACK;
}
