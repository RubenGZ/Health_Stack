/* ============================================================
   heroScene.js — Three.js athletic figure for landing hero
   Double-bicep flex pose · Dramatic gym lighting
   ============================================================ */

const HeroScene = (function () {
  'use strict';

  let renderer, scene, camera, athlete;
  let frameId, t = 0;

  /* ── Bootstrap ─────────────────────────────────────────────── */
  function start() {
    if (typeof THREE === 'undefined') {
      setTimeout(start, 80);
      return;
    }
    init();
  }

  function init() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    const W = canvas.offsetWidth  || 520;
    const H = canvas.offsetHeight || 580;

    /* Scene */
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050508, 0.10);

    /* Camera — low angle looking up slightly (power pose) */
    camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 50);
    camera.position.set(0, 1.55, 5.4);
    camera.lookAt(0, 1.65, 0);

    /* Renderer */
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    setupLights();
    setupPlatform();
    athlete = buildAthlete();
    scene.add(athlete);

    window.addEventListener('resize', onResize);
    tick();
  }

  /* ── Lighting ───────────────────────────────────────────────── */
  function setupLights() {
    /* Low ambient fill */
    scene.add(new THREE.AmbientLight(0x0d0d20, 1.1));

    /* Key light: warm orange from upper-right-front */
    const key = new THREE.SpotLight(0xff7a22, 16, 14, Math.PI / 5, 0.24, 1.4);
    key.position.set(2.8, 5.8, 3.5);
    key.target.position.set(0, 1.65, 0);
    key.castShadow = true;
    key.shadow.mapSize.width  = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.bias = -0.001;
    scene.add(key, key.target);

    /* Rim light: electric blue from back-left (muscle definition) */
    const rim = new THREE.SpotLight(0x00cfff, 12, 12, Math.PI / 4, 0.28, 1.5);
    rim.position.set(-3.8, 5.0, -2.8);
    rim.target.position.set(0, 1.65, 0);
    scene.add(rim, rim.target);

    /* Kicker: purple/violet bounce from below (gym floor reflect) */
    const kick = new THREE.PointLight(0x7766ff, 5, 6);
    kick.position.set(0, -0.15, 2.0);
    scene.add(kick);

    /* Subtle cool fill from left */
    const fill = new THREE.DirectionalLight(0x112244, 3);
    fill.position.set(-2, 3, 2);
    scene.add(fill);
  }

  /* ── Platform / Podium ──────────────────────────────────────── */
  function setupPlatform() {
    /* Main reflective disc */
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 0.065, 56),
      new THREE.MeshStandardMaterial({ color: 0x08080f, roughness: 0.12, metalness: 0.96 })
    );
    disc.position.y = -0.033;
    disc.receiveShadow = true;
    scene.add(disc);

    /* Outer neon ring — orange */
    const ringO = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.016, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xff6a00 })
    );
    ringO.rotation.x = Math.PI / 2;
    ringO.position.y = 0.012;
    scene.add(ringO);

    /* Inner ring — electric blue */
    const ringB = new THREE.Mesh(
      new THREE.TorusGeometry(1.02, 0.009, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0x00cfff })
    );
    ringB.rotation.x = Math.PI / 2;
    ringB.position.y = 0.009;
    scene.add(ringB);

    /* Shadow-only floor plane */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial({ opacity: 0.55 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  /* ── Athlete (double-bicep flex pose) ──────────────────────── */
  function buildAthlete() {
    const root = new THREE.Group();

    /* Materials */
    const skin = new THREE.MeshStandardMaterial({
      color: 0x9a5f3a,
      roughness: 0.60,
      metalness: 0.04,
    });
    const shorts = new THREE.MeshStandardMaterial({
      color: 0x0c0c1c,
      roughness: 0.88,
      metalness: 0.05,
    });
    const shoe = new THREE.MeshStandardMaterial({
      color: 0x111120,
      roughness: 0.60,
      metalness: 0.40,
    });
    const hair = new THREE.MeshStandardMaterial({
      color: 0x111118,
      roughness: 0.90,
    });

    /* Helper: add mesh to root */
    function addM(geo, mat, px, py, pz, rx, ry, rz, sx, sy, sz) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px || 0, py || 0, pz || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      if (sx !== undefined) m.scale.set(sx, sy !== undefined ? sy : sx, sz !== undefined ? sz : sx);
      m.castShadow = true;
      root.add(m);
      return m;
    }

    /* ── HEAD ──────────────────────────────────────────────────── */
    addM(new THREE.SphereGeometry(0.215, 24, 24), skin, 0, 2.73, 0);

    /* Hair / short cap (top hemisphere) */
    const capGeo = new THREE.SphereGeometry(0.222, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    addM(capGeo, hair, 0, 2.73, 0);

    /* ── NECK ───────────────────────────────────────────────────── */
    addM(new THREE.CylinderGeometry(0.098, 0.115, 0.20, 14), skin, 0, 2.47, 0);

    /* ── UPPER TORSO — V-taper chest ───────────────────────────── */
    addM(new THREE.CylinderGeometry(0.45, 0.28, 0.74, 18), skin, 0, 1.94, 0);

    /* Pec bulge — left */
    addM(new THREE.SphereGeometry(0.175, 16, 16), skin,
         -0.145, 2.04, 0.19, 0, 0, 0, 1, 0.68, 0.80);
    /* Pec bulge — right */
    addM(new THREE.SphereGeometry(0.175, 16, 16), skin,
          0.145, 2.04, 0.19, 0, 0, 0, 1, 0.68, 0.80);

    /* Trapezius humps — left */
    addM(new THREE.SphereGeometry(0.135, 12, 12), skin,
         -0.31, 2.30, -0.04, 0, 0, 0, 1, 0.68, 0.72);
    /* Trapezius humps — right */
    addM(new THREE.SphereGeometry(0.135, 12, 12), skin,
          0.31, 2.30, -0.04, 0, 0, 0, 1, 0.68, 0.72);

    /* ── ABDOMEN ────────────────────────────────────────────────── */
    addM(new THREE.CylinderGeometry(0.265, 0.255, 0.42, 16), skin, 0, 1.505, 0);

    /* ── HIPS / WAISTBAND ────────────────────────────────────────── */
    addM(new THREE.CylinderGeometry(0.30, 0.275, 0.27, 16), shorts, 0, 1.185, 0);

    /* ── LEFT ARM — double bicep flex (viewer's right) ─────────── */
    const lArm = new THREE.Group();
    lArm.position.set(-0.54, 2.20, 0);
    root.add(lArm);

    /* Deltoid cap */
    const lSh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skin);
    lSh.castShadow = true;
    lArm.add(lSh);

    /* Side deltoid */
    const lDel = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), skin);
    lDel.position.set(-0.1, 0, 0.05);
    lDel.scale.set(1, 0.72, 0.82);
    lDel.castShadow = true;
    lArm.add(lDel);

    /* Upper arm (horizontal, going outward-left) */
    const lUA = new THREE.Mesh(new THREE.CapsuleGeometry(0.108, 0.36, 8, 16), skin);
    lUA.position.set(-0.26, 0.09, 0);
    lUA.rotation.z = Math.PI / 2;
    lUA.castShadow = true;
    lArm.add(lUA);

    /* Bicep peak bulge */
    const lBic = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 14), skin);
    lBic.position.set(-0.275, 0.20, 0.07);
    lBic.scale.set(1, 0.70, 0.86);
    lBic.castShadow = true;
    lArm.add(lBic);

    /* Forearm group (points UP from elbow in flex) */
    const lFA = new THREE.Group();
    lFA.position.set(-0.52, 0.10, 0);
    const lFAMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.090, 0.31, 8, 14), skin);
    lFAMesh.position.set(0, 0.22, 0);
    lFAMesh.castShadow = true;
    lFA.add(lFAMesh);
    const lFist = new THREE.Mesh(new THREE.SphereGeometry(0.092, 12, 12), skin);
    lFist.position.set(0, 0.40, 0);
    lFist.castShadow = true;
    lFA.add(lFist);
    lArm.add(lFA);

    /* ── RIGHT ARM — mirror ─────────────────────────────────────── */
    const rArm = new THREE.Group();
    rArm.position.set(0.54, 2.20, 0);
    root.add(rArm);

    const rSh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skin);
    rSh.castShadow = true;
    rArm.add(rSh);

    const rDel = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), skin);
    rDel.position.set(0.1, 0, 0.05);
    rDel.scale.set(1, 0.72, 0.82);
    rDel.castShadow = true;
    rArm.add(rDel);

    const rUA = new THREE.Mesh(new THREE.CapsuleGeometry(0.108, 0.36, 8, 16), skin);
    rUA.position.set(0.26, 0.09, 0);
    rUA.rotation.z = -Math.PI / 2;
    rUA.castShadow = true;
    rArm.add(rUA);

    const rBic = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 14), skin);
    rBic.position.set(0.275, 0.20, 0.07);
    rBic.scale.set(1, 0.70, 0.86);
    rBic.castShadow = true;
    rArm.add(rBic);

    const rFA = new THREE.Group();
    rFA.position.set(0.52, 0.10, 0);
    const rFAMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.090, 0.31, 8, 14), skin);
    rFAMesh.position.set(0, 0.22, 0);
    rFAMesh.castShadow = true;
    rFA.add(rFAMesh);
    const rFist = new THREE.Mesh(new THREE.SphereGeometry(0.092, 12, 12), skin);
    rFist.position.set(0, 0.40, 0);
    rFist.castShadow = true;
    rFA.add(rFist);
    rArm.add(rFA);

    /* ── LEGS ───────────────────────────────────────────────────── */
    const thighGeo  = new THREE.CapsuleGeometry(0.158, 0.43, 8, 16);
    const calfGeo   = new THREE.CapsuleGeometry(0.110, 0.38, 8, 14);
    const calfBulge = new THREE.SphereGeometry(0.112, 12, 12);
    const footGeo   = new THREE.BoxGeometry(0.13, 0.075, 0.28);

    /* Left leg */
    addM(thighGeo,  shorts, -0.17, 0.83, 0);
    addM(calfGeo,   skin,   -0.17, 0.29, 0.025);
    addM(calfBulge, skin,   -0.17, 0.34, 0.055, 0, 0, 0, 1, 0.76, 0.80);
    addM(footGeo,   shoe,   -0.17, 0.024, 0.072);

    /* Right leg */
    addM(thighGeo,  shorts,  0.17, 0.83, 0);
    addM(calfGeo,   skin,    0.17, 0.29, 0.025);
    addM(calfBulge, skin,    0.17, 0.34, 0.055, 0, 0, 0, 1, 0.76, 0.80);
    addM(footGeo,   shoe,    0.17, 0.024, 0.072);

    /* Slight initial rotation for dynamic 3/4 view */
    root.scale.setScalar(0.91);
    root.rotation.y = 0.18;

    return root;
  }

  /* ── Animation Loop ─────────────────────────────────────────── */
  function tick() {
    frameId = requestAnimationFrame(tick);
    t += 0.016;

    if (athlete) {
      /* Breathing — subtle scale pulse on torso axis */
      const breathe = 1 + Math.sin(t * 1.1) * 0.009;
      athlete.scale.setScalar(0.91 * breathe);

      /* Proud slow rotation — oscillates gently around 3/4 view */
      athlete.rotation.y = 0.18 + Math.sin(t * 0.36) * 0.11;
    }

    renderer.render(scene, camera);
  }

  /* ── Resize ─────────────────────────────────────────────────── */
  function onResize() {
    if (!renderer || !camera) return;
    const canvas = renderer.domElement;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (!W || !H) return;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  }

  /* ── Auto-start (all scripts are defer so DOM+THREE ready) ──── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return { init, onResize };
})();
