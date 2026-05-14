// frontend/js/anatomyLens/camera.js
// Camera angle database + smooth lerp tween.
// Uses Three.js Vector3.lerpVectors — no external animation library.

import * as THREE from 'three';
import { getCamera } from './scene.js';

const TWEEN_DURATION_MS = 800;

// Ease in-out quad
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

export const CAMERA_ANGLES = {
  FULL:           { pos: new THREE.Vector3(0, 1.8, 5.5),   target: new THREE.Vector3(0, 1.2, 0) },
  FRONT_UPPER:    { pos: new THREE.Vector3(0, 2.2, 3.8),   target: new THREE.Vector3(0, 1.5, 0) },
  FRONT_CENTER:   { pos: new THREE.Vector3(0, 1.5, 4.0),   target: new THREE.Vector3(0, 1.2, 0) },
  FRONT_LOWER:    { pos: new THREE.Vector3(0, 0.4, 3.5),   target: new THREE.Vector3(0, 0.7, 0) },
  BACK_UPPER:     { pos: new THREE.Vector3(0, 2.2, -3.8),  target: new THREE.Vector3(0, 1.5, 0) },
  BACK_CENTER:    { pos: new THREE.Vector3(0, 1.5, -4.0),  target: new THREE.Vector3(0, 1.2, 0) },
  BACK_LOWER:     { pos: new THREE.Vector3(0, 0.3, -3.5),  target: new THREE.Vector3(0, 0.6, 0) },
  LATERAL_L:      { pos: new THREE.Vector3(-4.0, 1.6, 0),  target: new THREE.Vector3(0, 1.2, 0) },
  LATERAL_R:      { pos: new THREE.Vector3(4.0, 1.6, 0),   target: new THREE.Vector3(0, 1.2, 0) },
  OBLIQUE_FL:     { pos: new THREE.Vector3(-2.5, 2.0, 3.0),target: new THREE.Vector3(0, 1.3, 0) },
  OBLIQUE_FR:     { pos: new THREE.Vector3(2.5, 2.0, 3.0), target: new THREE.Vector3(0, 1.3, 0) },
  OBLIQUE_BL:     { pos: new THREE.Vector3(-2.5, 1.5,-3.0),target: new THREE.Vector3(0, 1.1, 0) },
  ARM_L:          { pos: new THREE.Vector3(-4.5, 1.8, 1.0),target: new THREE.Vector3(-1.0, 1.5, 0) },
  ARM_R:          { pos: new THREE.Vector3(4.5, 1.8, 1.0), target: new THREE.Vector3(1.0, 1.5, 0) },
  CALF:           { pos: new THREE.Vector3(0, -0.5, 3.5),  target: new THREE.Vector3(0, 0.2, 0) },
};

let _currentTweenId = null;
const _lookAtTarget = new THREE.Vector3(0, 1.2, 0);

/**
 * Animate camera to named angle.
 * If a tween is in progress, cancels it and starts from current position.
 * @param {string} angleKey - key from CAMERA_ANGLES
 * @returns {Promise<void>} resolves when animation completes
 */
export function tweenToAngle(angleKey) {
  const angle = CAMERA_ANGLES[angleKey] ?? CAMERA_ANGLES.FULL;
  const cam = getCamera();
  if (!cam) return Promise.resolve();

  // Cancel in-flight tween
  if (_currentTweenId != null) {
    cancelAnimationFrame(_currentTweenId);
    _currentTweenId = null;
  }

  const startPos = cam.position.clone();
  const startTarget = _lookAtTarget.clone();
  const startTime = performance.now();

  return new Promise((resolve) => {
    function tick() {
      const elapsed = performance.now() - startTime;
      const t = easeInOut(Math.min(elapsed / TWEEN_DURATION_MS, 1));

      cam.position.lerpVectors(startPos, angle.pos, t);
      _lookAtTarget.lerpVectors(startTarget, angle.target, t);
      cam.lookAt(_lookAtTarget);

      if (t < 1) {
        _currentTweenId = requestAnimationFrame(tick);
      } else {
        _currentTweenId = null;
        resolve();
      }
    }
    _currentTweenId = requestAnimationFrame(tick);
  });
}

/** Immediately snap camera to angle (no animation — used for init) */
export function snapToAngle(angleKey) {
  const angle = CAMERA_ANGLES[angleKey] ?? CAMERA_ANGLES.FULL;
  const cam = getCamera();
  if (!cam) return;
  cam.position.copy(angle.pos);
  _lookAtTarget.copy(angle.target);
  cam.lookAt(_lookAtTarget);
}

/** Cancel any in-progress tween */
export function cancelTween() {
  if (_currentTweenId != null) {
    cancelAnimationFrame(_currentTweenId);
    _currentTweenId = null;
  }
}

/**
 * Tween camera to frame a set of THREE.Mesh objects automatically.
 * Computes the bounding box of all meshes, then positions the camera
 * to frame them using the named angle as the view direction.
 * Falls back to tweenToAngle(angleKey) if no valid meshes provided.
 *
 * @param {THREE.Mesh[]} meshes - meshes to frame (typically primary highlighted muscles)
 * @param {string} angleKey - base direction from CAMERA_ANGLES (e.g. 'FRONT_UPPER')
 * @returns {Promise<void>} resolves when animation completes
 */
export function tweenToMeshes(meshes, angleKey = 'FULL') {
  if (!meshes || meshes.length === 0) return tweenToAngle(angleKey);

  const cam = getCamera();
  if (!cam) return Promise.resolve();

  // Compute world-space bounding box of all provided meshes
  const box = new THREE.Box3();
  let hasValid = false;
  meshes.forEach(mesh => {
    try {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const worldBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      box.union(worldBox);
      hasValid = true;
    } catch { /* skip malformed geometry */ }
  });

  if (!hasValid || box.isEmpty()) return tweenToAngle(angleKey);

  const center = new THREE.Vector3();
  box.getCenter(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  // Use named angle as view direction, adjust distance to frame the muscles
  const baseAngle = CAMERA_ANGLES[angleKey] ?? CAMERA_ANGLES.FULL;
  const viewDir = baseAngle.pos.clone().sub(baseAngle.target).normalize();

  // Distance to fit bounding box in view with 1.8x padding
  const fovRad = (cam.fov * Math.PI) / 180;
  const distance = Math.max((maxDim * 0.5) / Math.tan(fovRad * 0.5) * 1.8, 1.5);

  const targetPos = center.clone().addScaledVector(viewDir, distance);

  // Reuse the same lerp tween logic with computed pos + center as target
  if (_currentTweenId != null) {
    cancelAnimationFrame(_currentTweenId);
    _currentTweenId = null;
  }

  const startPos = cam.position.clone();
  const startTarget = _lookAtTarget.clone();
  const startTime = performance.now();

  return new Promise((resolve) => {
    function tick() {
      const elapsed = performance.now() - startTime;
      const t = easeInOut(Math.min(elapsed / TWEEN_DURATION_MS, 1));

      cam.position.lerpVectors(startPos, targetPos, t);
      _lookAtTarget.lerpVectors(startTarget, center, t);
      cam.lookAt(_lookAtTarget);

      if (t < 1) {
        _currentTweenId = requestAnimationFrame(tick);
      } else {
        _currentTweenId = null;
        resolve();
      }
    }
    _currentTweenId = requestAnimationFrame(tick);
  });
}
