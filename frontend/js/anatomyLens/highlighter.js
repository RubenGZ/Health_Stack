// frontend/js/anatomyLens/highlighter.js
// Applies emissive highlight materials to meshes.
// Primary: purple pulse. Secondary: cyan steady.
// Uses scene.js registerUpdate() to drive pulse animation each frame.

import * as THREE from 'three';
import { getMeshes, resetAllMaterials } from './model.js';
import { registerUpdate, unregisterUpdate } from './scene.js';

const COLOR_PRIMARY   = new THREE.Color(0x6c63ff);
const COLOR_SECONDARY = new THREE.Color(0x00d2ff);

let _activePrimary = [];
let _activeSecondary = [];
let _pulseCallback = null;

/**
 * Highlight muscles for an exercise.
 * Clears previous highlights first.
 * @param {string[]} primary - mesh names to pulse purple
 * @param {string[]} secondary - mesh names to glow cyan
 */
export function applyHighlight(primary, secondary) {
  clearHighlight();

  // Apply primary — pulsing purple
  _activePrimary = primary.flatMap(name => getMeshes(name));
  _activePrimary.forEach(mesh => {
    mesh.material.emissive.copy(COLOR_PRIMARY);
    mesh.material.emissiveIntensity = 0.8;
  });

  // Apply secondary — steady cyan
  _activeSecondary = secondary.flatMap(name => getMeshes(name));
  _activeSecondary.forEach(mesh => {
    mesh.material.emissive.copy(COLOR_SECONDARY);
    mesh.material.emissiveIntensity = 0.35;
  });

  // Register pulse animation (Math.sin wave on primary meshes)
  _pulseCallback = (now) => {
    const intensity = Math.sin((now / 1000) * 1.2 * Math.PI * 2) * 0.3 + 0.8;
    _activePrimary.forEach(mesh => {
      mesh.material.emissiveIntensity = Math.max(0.5, Math.min(1.1, intensity));
    });
  };
  registerUpdate(_pulseCallback);
}

/** Remove all highlights and stop pulse */
export function clearHighlight() {
  if (_pulseCallback) {
    unregisterUpdate(_pulseCallback);
    _pulseCallback = null;
  }
  resetAllMaterials();
  _activePrimary = [];
  _activeSecondary = [];
}
