/* ============================================================
   background3d.js — Fondo de partículas Three.js interactivo
   Partículas flotantes conectadas por líneas, con repulsión
   al pasar el ratón sobre ellas.
   ============================================================ */

(function () {
  'use strict';

  const PARTICLE_COUNT  = 140;
  const CONNECT_DIST    = 2.4;    // Distancia máxima de conexión (unidades Three.js)
  const REPEL_DIST      = 1.8;    // Radio de repulsión del cursor
  const REPEL_FORCE     = 0.015;  // Intensidad de la repulsión
  const SPEED           = 0.004;  // Velocidad base de las partículas
  const DAMPING         = 0.985;  // Amortiguación de velocidades

  // Colores del tema
  const COLORS = [0x6c63ff, 0x00d2ff, 0x8b5cf6, 0x38bdf8];

  let scene, camera, renderer;
  let particlesMesh, linesMesh;
  let positions, velocities;
  let mouseWorld = { x: 0, y: 0 };
  let animating = false;

  function init() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    // ── Scene ──────────────────────────────────────────────
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 12;

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // ── Partículas ─────────────────────────────────────────
    positions  = new Float32Array(PARTICLE_COUNT * 3);
    velocities = new Float32Array(PARTICLE_COUNT * 3);

    const spread = 14;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * spread * 2;
      positions[i3 + 1] = (Math.random() - 0.5) * spread;
      positions[i3 + 2] = (Math.random() - 0.5) * 4;

      velocities[i3]     = (Math.random() - 0.5) * SPEED;
      velocities[i3 + 1] = (Math.random() - 0.5) * SPEED;
      velocities[i3 + 2] = 0;
    }

    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const ptMat = new THREE.PointsMaterial({
      size: 0.06,
      color: 0x6c63ff,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
    });

    particlesMesh = new THREE.Points(ptGeo, ptMat);
    scene.add(particlesMesh);

    // ── Líneas de conexión ─────────────────────────────────
    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x6c63ff,
      transparent: true,
      opacity: 0.18,
    });
    linesMesh = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(linesMesh);

    // ── Listeners ──────────────────────────────────────────
    window.addEventListener('resize',     onResize,    { passive: true });
    window.addEventListener('mousemove',  onMouseMove, { passive: true });

    animating = true;
    animate();
  }

  function animate() {
    if (!animating) return;
    requestAnimationFrame(animate);

    const spread = 14;

    // Actualizar posiciones + repulsión del cursor
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Repulsión del cursor
      const dx = positions[i3]     - mouseWorld.x;
      const dy = positions[i3 + 1] - mouseWorld.y;
      const d  = Math.sqrt(dx * dx + dy * dy);

      if (d < REPEL_DIST && d > 0.001) {
        const force = (REPEL_DIST - d) / REPEL_DIST * REPEL_FORCE;
        velocities[i3]     += (dx / d) * force;
        velocities[i3 + 1] += (dy / d) * force;
      }

      // Amortiguación
      velocities[i3]     *= DAMPING;
      velocities[i3 + 1] *= DAMPING;

      // Mover
      positions[i3]     += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];

      // Wrap en los bordes
      if (positions[i3]     >  spread)     positions[i3]     = -spread;
      if (positions[i3]     < -spread)     positions[i3]     =  spread;
      if (positions[i3 + 1] >  spread / 2) positions[i3 + 1] = -spread / 2;
      if (positions[i3 + 1] < -spread / 2) positions[i3 + 1] =  spread / 2;
    }

    particlesMesh.geometry.attributes.position.needsUpdate = true;

    // Reconstruir líneas entre partículas cercanas
    const linePts = [];
    const CONNECT_SQ = CONNECT_DIST * CONNECT_DIST;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const j3  = j * 3;
        const ddx = positions[i3]     - positions[j3];
        const ddy = positions[i3 + 1] - positions[j3 + 1];
        const sq  = ddx * ddx + ddy * ddy;
        if (sq < CONNECT_SQ) {
          linePts.push(
            positions[i3], positions[i3 + 1], positions[i3 + 2],
            positions[j3], positions[j3 + 1], positions[j3 + 2]
          );
        }
      }
    }

    linesMesh.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(linePts), 3)
    );
    linesMesh.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function onMouseMove(e) {
    // Convertir coordenadas de pantalla a espacio 3D (z=0)
    const nx = (e.clientX / window.innerWidth)  *  2 - 1;
    const ny = (e.clientY / window.innerHeight) * -2 + 1;

    // Proyección inversa simple para z=0 con la cámara en z=12
    const vFov = (camera.fov * Math.PI) / 180;
    const h    = 2 * Math.tan(vFov / 2) * camera.position.z;
    const w    = h * camera.aspect;

    mouseWorld.x = nx * (w / 2);
    mouseWorld.y = ny * (h / 2);
  }

  // Arrancar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
