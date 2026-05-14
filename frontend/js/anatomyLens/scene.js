// frontend/js/anatomyLens/scene.js
// Three.js: renderer, scene, camera, lights, platform, render loop, FPS monitor.
// Lighting matches athleteViewer.js for visual consistency.

import * as THREE from 'three';

let renderer, scene, camera, rafId;
let _container = null;
const _updateCallbacks = [];
let _onFPSCritical = null;

// FPS monitor state
let _frameCount = 0;
let _lastFPSCheck = 0;
let _lowFPSTimer = 0;
const FPS_THRESHOLD = 20;
const FPS_WINDOW_MS = 1000;
const LOW_FPS_GRACE_MS = 3000;

/**
 * Initialize Three.js scene inside containerElement.
 * @param {HTMLElement} container
 * @param {Function} onFPSCritical - called when FPS stays below 20 for 3s
 * @returns {HTMLCanvasElement} the canvas element
 */
export function initScene(container, onFPSCritical = null) {
  _container = container;
  _onFPSCritical = onFPSCritical;

  // ── Renderer ─────────────────────────────────────────────────
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.className = 'anatomy-lens-canvas';
  container.appendChild(renderer.domElement);

  // ── Scene ────────────────────────────────────────────────────
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070f);
  scene.fog = new THREE.Fog(0x07070f, 8, 22);

  // ── Camera ───────────────────────────────────────────────────
  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50);
  camera.position.set(0, 1.8, 5.5);
  camera.lookAt(0, 1.2, 0);

  // ── Lights (same palette as athleteViewer.js) ────────────────
  const keyLight = new THREE.SpotLight(0xff6a00, 22);
  keyLight.position.set(3.0, 6.5, 3.8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 15;
  scene.add(keyLight);

  const rimLight = new THREE.SpotLight(0x00cfff, 16);
  rimLight.position.set(-3.5, 5.5, -3.0);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x112244, 3.5);
  fillLight.position.set(0, 3, -2);
  scene.add(fillLight);

  const kickLight = new THREE.PointLight(0x7766ff, 6);
  kickLight.position.set(0, -0.5, 1.5);
  scene.add(kickLight);

  scene.add(new THREE.AmbientLight(0x111122, 0.8));

  // ── Platform ─────────────────────────────────────────────────
  const discGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.06, 64);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x151520, roughness: 0.4, metalness: 0.7 });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = -0.03;
  disc.receiveShadow = true;
  scene.add(disc);

  const ringGeo = new THREE.TorusGeometry(1.38, 0.02, 8, 64);
  const ring1 = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff6a00, emissiveIntensity: 1.2, roughness: 0.3 }));
  scene.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.015, 8, 64), new THREE.MeshStandardMaterial({ color: 0x00cfff, emissive: 0x00cfff, emissiveIntensity: 0.8, roughness: 0.3 }));
  scene.add(ring2);

  // ── Resize observer ──────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    if (!_container) return;
    renderer.setSize(_container.clientWidth, _container.clientHeight);
    camera.aspect = _container.clientWidth / _container.clientHeight;
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  // ── Handle context lost ───────────────────────────────────────
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('[AnatomyLens] WebGL context lost');
    stopLoop();
  });

  return renderer.domElement;
}

/** Register a per-frame update callback */
export function registerUpdate(fn) {
  _updateCallbacks.push(fn);
}

/** Remove a previously registered update callback */
export function unregisterUpdate(fn) {
  const idx = _updateCallbacks.indexOf(fn);
  if (idx !== -1) _updateCallbacks.splice(idx, 1);
}

/** Start the render loop */
export function startLoop() {
  if (rafId != null) return;
  _lastFPSCheck = performance.now();
  _frameCount = 0;
  _lowFPSTimer = 0;
  loop();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  const now = performance.now();

  // FPS monitor
  _frameCount++;
  const elapsed = now - _lastFPSCheck;
  if (elapsed >= FPS_WINDOW_MS) {
    const fps = (_frameCount / elapsed) * 1000;
    _frameCount = 0;
    _lastFPSCheck = now;
    if (fps < FPS_THRESHOLD) {
      _lowFPSTimer += elapsed;
      if (_lowFPSTimer >= LOW_FPS_GRACE_MS) {
        if (renderer.getPixelRatio() > 0.75) {
          renderer.setPixelRatio(0.75);
          _lowFPSTimer = 0;
          console.warn('[AnatomyLens] FPS low — reducing pixel ratio to 0.75');
        } else {
          _onFPSCritical?.();
        }
      }
    } else {
      _lowFPSTimer = 0;
    }
  }

  _updateCallbacks.forEach(fn => fn(now));
  if (scene && camera) renderer.render(scene, camera);
}

/** Stop the render loop */
export function stopLoop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/** Expose camera for camera.js tweening */
export function getCamera() { return camera; }

/** Expose scene for model.js to add objects */
export function getScene() { return scene; }

/** Expose renderer for pixel ratio manipulation */
export function getRenderer() { return renderer; }

/** Release all GPU resources */
export function disposeScene() {
  stopLoop();
  _updateCallbacks.length = 0;
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  scene = null;
  camera = null;
  _container = null;
}
