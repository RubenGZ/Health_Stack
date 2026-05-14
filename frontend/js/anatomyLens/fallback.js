// frontend/js/anatomyLens/fallback.js
// Toggles between 3D canvas and 2D SVG by manipulating display/class.

import { transition, STATES } from './state.js';
import { clearLegend } from './legend.js';

/** Activate SVG fallback — hide canvas container, show SVG */
export function activateSVGFallback() {
  transition(STATES.SVG_FALLBACK);

  const container = document.querySelector('.anatomy-lens-container');
  if (container) container.style.display = 'none';

  const svg = document.getElementById('anatomy-svg-wrap');
  if (svg) svg.classList.add('al-fallback-active');

  clearLegend();
  console.info('[AnatomyLens] SVG fallback activated');
}

/**
 * Check WebGL availability before even trying to init.
 * @returns {boolean}
 */
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
