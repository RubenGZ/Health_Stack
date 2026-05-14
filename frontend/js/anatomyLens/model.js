// frontend/js/anatomyLens/model.js
// Loads anatomy_lens.glb, builds mesh registry, clones base material per mesh.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { getScene } from './scene.js';

const MODEL_URL = '/models/anatomy_lens.glb';
const LOAD_TIMEOUT_MS = 10_000;

// Base material shared reference — cloned per mesh for independent highlighting
const BASE_MATERIAL = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x1a1a2e),
  roughness: 0.65,
  metalness: 0.08,
});

/** Map<string, THREE.Mesh[]> — meshName → all meshes with that name (both sides) */
let _registry = new Map();
let _modelRoot = null;

/**
 * Load the GLB and populate the mesh registry.
 * @param {Function} onProgress - called with (percent: number)
 * @returns {Promise<void>}
 */
export async function loadModel(onProgress) {
  return new Promise((resolve, reject) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    // Timeout guard
    const timeoutId = setTimeout(() => {
      reject(new Error(`GLB load timeout after ${LOAD_TIMEOUT_MS}ms`));
    }, LOAD_TIMEOUT_MS);

    loader.load(
      MODEL_URL,
      (gltf) => {
        clearTimeout(timeoutId);
        _modelRoot = gltf.scene;
        _registry = new Map();

        gltf.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          obj.castShadow = true;
          obj.receiveShadow = true;

          // Clone base material so each mesh can highlight independently
          obj.material = BASE_MATERIAL.clone();

          // Parse name: "mesh_pectoral_mayor_esternal" → key "pectoral_mayor_esternal"
          const rawName = obj.name ?? '';
          const key = rawName.replace(/^mesh_/, '').replace(/_[lr]$/, '');
          if (!key) return;

          if (!_registry.has(key)) _registry.set(key, []);
          _registry.get(key).push(obj);
        });

        getScene().add(gltf.scene);
        console.log(`[AnatomyLens] model loaded — ${_registry.size} muscle groups registered`);
        resolve();
      },
      (xhr) => {
        if (xhr.total > 0) {
          onProgress?.(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

/**
 * Get all mesh objects for a muscle name.
 * Tries exact match, then with _l and _r suffixes.
 * Returns empty array if not found (caller skips gracefully).
 * @param {string} muscleName - e.g. "pectoral_mayor_esternal"
 * @returns {THREE.Mesh[]}
 */
export function getMeshes(muscleName) {
  if (_registry.has(muscleName)) return _registry.get(muscleName);
  // Try both sides
  const result = [
    ...(_registry.get(`${muscleName}_l`) ?? []),
    ...(_registry.get(`${muscleName}_r`) ?? []),
  ];
  if (result.length === 0) {
    console.warn(`[AnatomyLens] mesh not found: ${muscleName}`);
  }
  return result;
}

/** Get the entire registry (for debug API) */
export function getRegistry() { return _registry; }

/** Reset all mesh materials to base (no highlights) */
export function resetAllMaterials() {
  _registry.forEach((meshes) => {
    meshes.forEach((mesh) => {
      mesh.material.emissive.set(0x000000);
      mesh.material.emissiveIntensity = 0;
    });
  });
}

/** Remove model from scene and clear registry */
export function disposeModel() {
  if (_modelRoot) {
    getScene()?.remove(_modelRoot);
    _modelRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
    _modelRoot = null;
  }
  _registry.clear();
}
