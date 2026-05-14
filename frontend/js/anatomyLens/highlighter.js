// frontend/js/anatomyLens/highlighter.js
// Applies emissive highlight materials to meshes.
// Primary: purple pulse. Secondary: cyan steady.
// Uses scene.js registerUpdate() to drive pulse animation each frame.

import * as THREE from 'three';
import { getMeshes, getAllMeshes, isGenericModel, resetAllMaterials } from './model.js';
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
/**
 * Highlight muscles for an exercise.
 * Clears previous highlights first.
 * @param {string[]} primary - mesh names to pulse purple
 * @param {string[]} secondary - mesh names to glow cyan
 * @returns {THREE.Mesh[]} primary meshes that were found (for dynamic camera zoom)
 */
export function applyHighlight(primary, secondary) {
  clearHighlight();

  if (isGenericModel()) {
    // Generic model (no named muscle meshes): highlight ALL meshes with a full-body glow.
    // Camera angle + legend still convey which muscles are active.
    _activePrimary = getAllMeshes();
    _activePrimary.forEach(mesh => {
      mesh.material.emissive.copy(COLOR_PRIMARY);
      mesh.material.emissiveIntensity = 0.5;
    });
    _activeSecondary = [];
  } else {
    // Named model: highlight specific meshes per muscle group
    _activePrimary = primary.flatMap(name => getMeshes(name));
    _activePrimary.forEach(mesh => {
      mesh.material.emissive.copy(COLOR_PRIMARY);
      mesh.material.emissiveIntensity = 0.8;
    });

    _activeSecondary = secondary.flatMap(name => getMeshes(name));
    _activeSecondary.forEach(mesh => {
      mesh.material.emissive.copy(COLOR_SECONDARY);
      mesh.material.emissiveIntensity = 0.35;
    });
  }

  // Pulse animation on primary meshes (works for both modes)
  _pulseCallback = (now) => {
    const intensity = Math.sin((now / 1000) * 1.2 * Math.PI * 2) * 0.3 + 0.8;
    const min = isGenericModel() ? 0.3 : 0.5;
    const max = isGenericModel() ? 0.7 : 1.1;
    _activePrimary.forEach(mesh => {
      mesh.material.emissiveIntensity = Math.max(min, Math.min(max, intensity));
    });
  };
  registerUpdate(_pulseCallback);

  return _activePrimary;
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
