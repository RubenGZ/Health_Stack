/* ============================================================
   athleteViewer.js — Visor 3D híbrido
   Cuerpo GLB original + cabeza y brazos Three.js procedurales
   ============================================================ */

import * as THREE        from 'three';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }   from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ── Canvas ──────────────────────────────────────────────────── */
const canvas = await waitFor('athlete-canvas');
if (!canvas) { console.error('[Viewer] canvas no encontrado'); }

const wrap = canvas.parentElement;
let W = wrap.clientWidth  || 420;
let H = wrap.clientHeight || 520;

/* ── Renderer ────────────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(W, H, false);
renderer.shadowMap.enabled     = true;
renderer.shadowMap.type        = THREE.PCFSoftShadowMap;
renderer.toneMapping           = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure   = 1.35;

/* ── Scene ───────────────────────────────────────────────────── */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070f);
scene.fog = new THREE.FogExp2(0x07070f, 0.038);

/* ── Camera ──────────────────────────────────────────────────── */
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 60);
camera.position.set(0, 2.2, 4.6);
camera.lookAt(0, 1.8, 0);

/* ── Luces ───────────────────────────────────────────────────── */
scene.add(new THREE.AmbientLight(0x0d0d20, 1.5));

const key = new THREE.SpotLight(0xff6a00, 22, 16, Math.PI / 5, 0.22, 1.3);
key.position.set(3.0, 6.5, 3.8);
key.target.position.set(0, 1.5, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.001;
scene.add(key, key.target);

const rim = new THREE.SpotLight(0x00cfff, 16, 14, Math.PI / 4.5, 0.26, 1.4);
rim.position.set(-3.5, 5.5, -3.0);
rim.target.position.set(0, 1.5, 0);
scene.add(rim, rim.target);

const kick = new THREE.PointLight(0x7766ff, 6, 7);
kick.position.set(0, -0.1, 2.2);
scene.add(kick);

const fill = new THREE.DirectionalLight(0x112244, 3.5);
fill.position.set(-2, 3, 2);
scene.add(fill);

/* ── Plataforma ──────────────────────────────────────────────── */
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.5, 1.5, 0.06, 60),
  new THREE.MeshStandardMaterial({ color: 0x08080f, roughness: 0.10, metalness: 0.95 })
);
disc.position.y = -0.03;
disc.receiveShadow = true;
scene.add(disc);

[[1.42, 0.018, 0xff6a00], [1.02, 0.010, 0x00cfff]].forEach(([r, th, c]) => {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, th, 8, 96),
    new THREE.MeshBasicMaterial({ color: c })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.012;
  scene.add(ring);
});

const shadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.5 })
);
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

/* ── Grupo raíz (body + head + arms rotan juntos) ────────────── */
const root = new THREE.Group();
scene.add(root);

/* ── Materiales piel ─────────────────────────────────────────── */
const skin = new THREE.MeshStandardMaterial({ color: 0x9a5f3a, roughness: 0.52, metalness: 0.04 });
const hair = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.90 });

/* ── Cargar GLB ──────────────────────────────────────────────── */
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load(
  'models/baki_hanma.glb',

  (gltf) => {
    const body = gltf.scene;

    /* Escalar y centrar */
    const box    = new THREE.Box3().setFromObject(body);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale  = 2.3 / Math.max(size.x, size.y, size.z);

    body.scale.setScalar(scale);
    body.position.set(
      -center.x * scale,
      -box.min.y * scale + 0.03,   // pies sobre la plataforma
      -center.z * scale
    );

    body.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = child.receiveShadow = true;
      if (child.material?.isMeshStandardMaterial) {
        child.material.roughness       = Math.max(child.material.roughness * 0.8, 0.25);
        child.material.envMapIntensity = 1.5;
      }
    });

    root.add(body);

    /* Ocultar loading */
    const ld = document.getElementById('athlete-loading');
    if (ld) { ld.style.opacity = '0'; setTimeout(() => { ld.style.display = 'none'; }, 500); }
  },

  (xhr) => {
    const el = document.getElementById('athlete-pct');
    if (el) el.textContent = xhr.total > 0
      ? Math.round(xhr.loaded / xhr.total * 100) + '%'
      : Math.round(xhr.loaded / 1024) + ' KB';
  },

  (err) => {
    console.error('[Viewer] Error GLB:', err);
    const ld = document.getElementById('athlete-loading');
    if (ld) ld.innerHTML = '<span style="color:#ff6a00;font-size:.8rem">⚠ Error cargando modelo</span>';
  }
);

/* ── Cabeza procedural ───────────────────────────────────────── */
function addHead(bodyTop) {
  const headR = 0.215;
  const neckY = bodyTop + 0.11;
  const headY = neckY  + 0.10 + headR;

  /* Cuello */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.110, 0.128, 0.22, 16), skin);
  neck.position.set(0, neckY, 0);
  neck.castShadow = true;
  root.add(neck);

  /* Cabeza */
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 28, 28), skin);
  head.position.set(0, headY, 0);
  head.castShadow = true;
  root.add(head);

  /* Mandíbula más ancha */
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 16), skin);
  jaw.position.set(0, headY - 0.10, 0.06);
  jaw.scale.set(1.2, 0.55, 1.0);
  jaw.castShadow = true;
  root.add(jaw);

  /* Pelo */
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.04, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.50),
    hair
  );
  cap.position.set(0, headY, 0);
  cap.castShadow = true;
  root.add(cap);

  /* Trapecios */
  [-0.28, 0.28].forEach(x => {
    const trap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), skin);
    trap.position.set(x, bodyTop + 0.06, -0.02);
    trap.scale.set(1, 0.65, 0.72);
    trap.castShadow = true;
    root.add(trap);
  });
}

/* ── Brazos procedurales (pose doble bíceps) ─────────────────── */
function addArms(shoulderY, bodyW) {
  const offsetX = bodyW * 0.52;   // distancia del centro al hombro

  [-1, 1].forEach(side => {
    const arm = new THREE.Group();
    arm.position.set(side * offsetX, shoulderY, 0);
    root.add(arm);

    /* Deltoides */
    const del = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 18), skin);
    del.castShadow = true;
    arm.add(del);

    const delSide = new THREE.Mesh(new THREE.SphereGeometry(0.148, 14, 14), skin);
    delSide.position.set(side * 0.11, -0.02, 0.06);
    delSide.scale.set(1, 0.70, 0.82);
    delSide.castShadow = true;
    arm.add(delSide);

    /* Brazo superior horizontal */
    const ua = new THREE.Mesh(new THREE.CapsuleGeometry(0.118, 0.36, 10, 18), skin);
    ua.position.set(side * 0.26, 0.10, 0);
    ua.rotation.z = side * Math.PI / 2;
    ua.castShadow = true;
    arm.add(ua);

    /* Pico del bíceps */
    const bic = new THREE.Mesh(new THREE.SphereGeometry(0.148, 16, 16), skin);
    bic.position.set(side * 0.28, 0.24, 0.09);
    bic.scale.set(1, 0.82, 0.90);
    bic.castShadow = true;
    arm.add(bic);

    /* Tríceps */
    const tri = new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 12), skin);
    tri.position.set(side * 0.26, 0.00, -0.10);
    tri.scale.set(1, 0.64, 0.78);
    tri.castShadow = true;
    arm.add(tri);

    /* Antebrazo (apunta hacia arriba en el flex) */
    const fa = new THREE.Group();
    fa.position.set(side * 0.54, 0.12, 0);

    const faMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.096, 0.32, 8, 14), skin);
    faMesh.position.y = 0.23;
    faMesh.castShadow = true;
    fa.add(faMesh);

    const faExt = new THREE.Mesh(new THREE.SphereGeometry(0.080, 10, 10), skin);
    faExt.position.set(side * 0.04, 0.24, 0.06);
    faExt.scale.set(1, 0.58, 0.78);
    faExt.castShadow = true;
    fa.add(faExt);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.096, 14, 14), skin);
    fist.position.y = 0.42;
    fist.castShadow = true;
    fa.add(fist);

    arm.add(fa);
  });
}

/* ── OrbitControls ───────────────────────────────────────────── */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.06;
controls.minDistance     = 2.5;
controls.maxDistance     = 8.0;
controls.maxPolarAngle   = Math.PI / 1.75;
controls.target.set(0, 1.8, 0);
// Sincronizar cámara con el target antes del primer frame
controls.update();
controls.autoRotate      = true;
controls.autoRotateSpeed = 1.8;
controls.update();

let autoTimer;
renderer.domElement.addEventListener('pointerdown', () => {
  controls.autoRotate = false;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => { controls.autoRotate = true; }, 4000);
});

/* ── Resize ──────────────────────────────────────────────────── */
new ResizeObserver(() => {
  W = wrap.clientWidth; H = wrap.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}).observe(wrap);

/* ── Loop ────────────────────────────────────────────────────── */
(function tick() {
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
})();

/* ── Util ────────────────────────────────────────────────────── */
function waitFor(id, ms = 8000) {
  return new Promise(resolve => {
    const el = document.getElementById(id);
    if (el) return resolve(el);
    const ob = new MutationObserver(() => {
      const f = document.getElementById(id);
      if (f) { ob.disconnect(); resolve(f); }
    });
    ob.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { ob.disconnect(); resolve(null); }, ms);
  });
}
