# AnatomyLens — Spec de diseño completo
**Fecha:** 2026-05-14  
**Estado:** Aprobado por usuario  
**Módulo:** `frontend/js/anatomyLens/`  
**Autor:** Claude Architect

---

## 1. Resumen ejecutivo

AnatomyLens es un visor anatómico 3D que reemplaza el SVG 2D plano actual en la sección de Ejercicios. Al seleccionar un ejercicio, la cámara anima automáticamente al ángulo óptimo para ver los músculos implicados, que se iluminan con material emissive pulsante. Es el único componente de este tipo en apps de fitness gratuitas. Si WebGL falla por cualquier motivo, el SVG actual actúa como fallback transparente.

---

## 2. Arquitectura de archivos

```
frontend/js/anatomyLens/
  index.js          ← API pública — 4 funciones. Único punto de entrada.
  scene.js          ← Three.js: renderer, luces, plataforma, loop de render
  model.js          ← Carga GLB, registra meshes por nombre, mesh registry
  highlighter.js    ← Materiales emissive, animación de pulso, transiciones
  camera.js         ← Base de datos de ángulos + tween SLERP 800ms
  muscleMap.js      ← Tabla ejercicio → {primary[], secondary[], camera}
  legend.js         ← Componente DOM: badges primario/secundario con fade
  fallback.js       ← Activa SVG existente si WebGL no disponible
  errorBoundary.js  ← Captura errores, decide recuperación o fallback
  state.js          ← Máquina de estados explícita
```

---

## 3. API pública (index.js)

```javascript
// Lo único que exercises.js necesita importar
import AnatomyLens from './anatomyLens/index.js';

AnatomyLens.init(containerElement)     // Monta visor en el div contenedor
AnatomyLens.highlight(exerciseId)      // Activa músculos del ejercicio
AnatomyLens.reset()                    // Limpia todos los highlights
AnatomyLens.destroy()                  // Libera memoria WebGL (navegación SPA)
```

Todas las funciones son async y devuelven Promise. Ninguna lanza excepciones — los errores se gestionan internamente.

---

## 4. Máquina de estados (state.js)

```
UNINITIALIZED
     ↓ init()
  LOADING
     ↓ GLB cargado          ↓ error
   READY              SVG_FALLBACK (terminal)
     ↓ highlight()
TRANSITIONING_CAMERA
     ↓ tween completo
HIGHLIGHTING
     ↓ highlight() de nuevo
TRANSITIONING_CAMERA (cancela anterior, inicia desde posición actual)
```

Transiciones inválidas se ignoran silenciosamente (ej: highlight() en LOADING).

---

## 5. Estrategias de resiliencia

| Fallo | Detección | Recuperación |
|-------|-----------|--------------|
| WebGL no disponible | `canvas.getContext('webgl2')` === null | SVG inmediato |
| GLB 404 / timeout 10s | error callback de GLTFLoader | SVG + console.error |
| Mesh de músculo no encontrado | `meshRegistry.get(name)` === undefined | Skip músculo, log warn |
| WebGL context lost | evento `webglcontextlost` | Recovery 1 intento → SVG |
| FPS < 20 por 3s sostenidos | contador en render loop | Reduce pixel ratio → si persiste → SVG |
| Ejercicio no en muscleMap | lookup === undefined | Reset highlights, no crash |
| Contenedor destruido en SPA | ResizeObserver disconnect | destroy() automático |

---

## 6. Visual y estética

### 6.1 Iluminación (hereda del Baki viewer)
```javascript
// Key light — naranja dramático desde arriba-derecha
SpotLight { color: #ff6a00, intensity: 22, position: [3.0, 6.5, 3.8] }

// Rim light — cyan desde atrás-izquierda  
SpotLight { color: #00cfff, intensity: 16, position: [-3.5, 5.5, -3.0] }

// Fill — azul oscuro para conservar volumen
DirectionalLight { color: #112244, intensity: 3.5 }

// Kick light — suelo
PointLight { color: #7766ff, intensity: 6 }
```

### 6.2 Material base del cuerpo
```javascript
MeshStandardMaterial {
  color: #1a1a2e,      // azul oscuro casi negro
  roughness: 0.65,
  metalness: 0.08,
  envMapIntensity: 1.2
}
```

### 6.3 Highlight primario
```javascript
// Músculo principal del ejercicio
emissive: #6c63ff,
emissiveIntensity: pulso con Math.sin(t * 1.2 * 2π) * 0.3 + 0.8
// Rango: 0.5 → 1.1, ciclo cada ~833ms
```

### 6.4 Highlight secundario
```javascript
// Músculos de asistencia
emissive: #00d2ff,
emissiveIntensity: 0.35  // steady, sin pulso
```

### 6.5 Plataforma (igual que el Baki)
- Disco metálico oscuro con dos anillos de neón (naranja + cyan)
- Sombras suaves PCFSoft

### 6.6 Transición de cámara
- Duración: 800ms
- Easing: cubic-bezier(0.4, 0, 0.2, 1) — Material Design standard
- Interpolación: SLERP en coordenadas esféricas para movimiento natural
- Si hay transición en curso: cancela y arranca desde posición actual (no flash)

### 6.7 Leyenda DOM
```html
<!-- Aparece con fade-in cuando la cámara llega al destino -->
<div class="anatomy-legend-3d">
  <div class="legend-group legend-primary">
    <span class="legend-dot primary"></span>
    <span>Pecho mayor</span>
  </div>
  <div class="legend-group legend-secondary">
    <span class="legend-dot secondary"></span>
    <span>Deltoides anterior · Tríceps</span>
  </div>
</div>
```

### 6.8 Loading state
- Shimmer skeleton del tamaño exacto del canvas
- Texto "Cargando visor..." con barra de progreso real (GLTFLoader reporta %)
- Fade-out suave cuando el modelo está listo

---

## 7. Ángulos de cámara (camera.js)

```javascript
const CAMERA_ANGLES = {
  FRONT_UPPER:    { pos: [0, 2.2, 3.8],   target: [0, 1.5, 0] },  // pecho, deltoides ant
  FRONT_CENTER:   { pos: [0, 1.5, 4.0],   target: [0, 1.2, 0] },  // abdomen, core
  FRONT_LOWER:    { pos: [0, 0.4, 3.5],   target: [0, 0.7, 0] },  // cuádriceps, tibial
  BACK_UPPER:     { pos: [0, 2.2, -3.8],  target: [0, 1.5, 0] },  // trapecio, romboides
  BACK_CENTER:    { pos: [0, 1.5, -4.0],  target: [0, 1.2, 0] },  // dorsal, erector
  BACK_LOWER:     { pos: [0, 0.3, -3.5],  target: [0, 0.6, 0] },  // glúteos, isquio
  LATERAL_L:      { pos: [-4.0, 1.6, 0],  target: [0, 1.2, 0] },  // tríceps, dorsal lat
  LATERAL_R:      { pos: [4.0, 1.6, 0],   target: [0, 1.2, 0] },
  OBLIQUE_FL:     { pos: [-2.5, 2.0, 3.0],target: [0, 1.3, 0] },  // hombros 3/4
  OBLIQUE_FR:     { pos: [2.5, 2.0, 3.0], target: [0, 1.3, 0] },
  OBLIQUE_BL:     { pos: [-2.5, 1.5,-3.0],target: [0, 1.1, 0] },  // glúteo medio
  ARM_L:          { pos: [-4.5, 1.8, 1.0],target: [-1.0, 1.5, 0] },// bíceps/tríceps izq
  ARM_R:          { pos: [4.5, 1.8, 1.0], target: [1.0, 1.5, 0] },
  CALF:           { pos: [0, -0.5, 3.5],  target: [0, 0.2, 0] },   // gemelos, tibial
  FULL:           { pos: [0, 1.8, 5.5],   target: [0, 1.2, 0] },   // vista completa
};
```

---

## 8. Muscle Map exhaustivo — Fitness / Culturismo (muscleMap.js)

### 8.1 Inventario de músculos del modelo GLB

Nombres de mesh que el modelo GLB debe tener (o aproximación):

```
TORSO ANTERIOR:
  mesh_pectoral_mayor_clavicular_l / _r   (cabeza clavicular)
  mesh_pectoral_mayor_esternal_l / _r     (cabeza esternal)
  mesh_pectoral_menor_l / _r
  mesh_serrato_anterior_l / _r
  mesh_recto_abdominal
  mesh_oblicuo_externo_l / _r
  mesh_oblicuo_interno_l / _r
  mesh_transverso_abdominal

HOMBROS:
  mesh_deltoides_anterior_l / _r
  mesh_deltoides_medial_l / _r
  mesh_deltoides_posterior_l / _r
  mesh_supraespinoso_l / _r
  mesh_infraespinoso_l / _r
  mesh_redondo_menor_l / _r
  mesh_redondo_mayor_l / _r
  mesh_subescapular_l / _r

BRAZO SUPERIOR:
  mesh_biceps_cabeza_larga_l / _r
  mesh_biceps_cabeza_corta_l / _r
  mesh_braquial_l / _r
  mesh_triceps_cabeza_larga_l / _r
  mesh_triceps_cabeza_lateral_l / _r
  mesh_triceps_cabeza_medial_l / _r
  mesh_coracobraquial_l / _r

ANTEBRAZO:
  mesh_braquiorradial_l / _r
  mesh_extensores_antebrazo_l / _r
  mesh_flexores_antebrazo_l / _r
  mesh_pronador_redondo_l / _r

TORSO POSTERIOR:
  mesh_trapecio_superior_l / _r
  mesh_trapecio_medio_l / _r
  mesh_trapecio_inferior_l / _r
  mesh_dorsal_ancho_l / _r
  mesh_romboides_mayor_l / _r
  mesh_romboides_menor_l / _r
  mesh_erector_espinal_l / _r     (iliocostal + longísimo)
  mesh_cuadrado_lumbar_l / _r
  mesh_multifidos

CADERA Y GLÚTEOS:
  mesh_gluteo_mayor_l / _r
  mesh_gluteo_medio_l / _r
  mesh_gluteo_menor_l / _r
  mesh_tensor_fascia_lata_l / _r
  mesh_piriforme_l / _r
  mesh_psoas_iliaco_l / _r

MUSLO ANTERIOR:
  mesh_recto_femoral_l / _r
  mesh_vasto_lateral_l / _r
  mesh_vasto_medial_l / _r
  mesh_vasto_intermedio_l / _r
  mesh_sartorio_l / _r

MUSLO POSTERIOR:
  mesh_biceps_femoral_l / _r
  mesh_semitendinoso_l / _r
  mesh_semimembranoso_l / _r

ADUCTORES:
  mesh_aductor_largo_l / _r
  mesh_aductor_corto_l / _r
  mesh_aductor_mayor_l / _r
  mesh_gracil_l / _r
  mesh_pectíneo_l / _r

PIERNA INFERIOR:
  mesh_gastrocnemio_medial_l / _r
  mesh_gastrocnemio_lateral_l / _r
  mesh_soleo_l / _r
  mesh_tibial_anterior_l / _r
  mesh_peroneos_l / _r
  mesh_flexor_largo_dedos_l / _r
```

### 8.2 Muscle Map por ejercicio

```javascript
// muscleMap.js — formato:
// [exerciseId]: {
//   primary: [meshNames],      ← color morado pulsante
//   secondary: [meshNames],    ← color cyan steady
//   camera: CAMERA_ANGLE_KEY,  ← ángulo de cámara óptimo
// }

// ─────────────────────────────────────────────
// PECHO
// ─────────────────────────────────────────────
'press_banca_plano': {
  primary: ['pectoral_mayor_esternal'],
  secondary: ['pectoral_mayor_clavicular', 'deltoides_anterior', 'triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  camera: 'FRONT_UPPER'
},
'press_banca_inclinado': {
  primary: ['pectoral_mayor_clavicular', 'deltoides_anterior'],
  secondary: ['pectoral_mayor_esternal', 'triceps_cabeza_larga', 'triceps_cabeza_lateral'],
  camera: 'OBLIQUE_FR'
},
'press_banca_declinado': {
  primary: ['pectoral_mayor_esternal'],  // porción inferior
  secondary: ['triceps_cabeza_larga', 'deltoides_anterior'],
  camera: 'FRONT_CENTER'
},
'aperturas_mancuernas': {
  primary: ['pectoral_mayor_esternal', 'pectoral_mayor_clavicular'],
  secondary: ['deltoides_anterior', 'coracobraquial'],
  camera: 'FRONT_UPPER'
},
'aperturas_cable_cruzado': {
  primary: ['pectoral_mayor_esternal', 'pectoral_mayor_clavicular'],
  secondary: ['deltoides_anterior', 'serrato_anterior'],
  camera: 'FRONT_UPPER'
},
'fondos_pecho': {
  primary: ['pectoral_mayor_esternal'],
  secondary: ['deltoides_anterior', 'triceps_cabeza_larga', 'triceps_cabeza_lateral'],
  camera: 'OBLIQUE_FL'
},
'pec_deck': {
  primary: ['pectoral_mayor_clavicular', 'pectoral_mayor_esternal'],
  secondary: ['deltoides_anterior'],
  camera: 'FRONT_UPPER'
},
'press_mancuernas_banco': {
  primary: ['pectoral_mayor_esternal'],
  secondary: ['pectoral_mayor_clavicular', 'deltoides_anterior', 'triceps_cabeza_lateral'],
  camera: 'FRONT_UPPER'
},
'pullover_mancuerna': {
  primary: ['dorsal_ancho', 'pectoral_mayor_esternal'],
  secondary: ['triceps_cabeza_larga', 'serrato_anterior', 'recto_abdominal'],
  camera: 'LATERAL_L'
},

// ─────────────────────────────────────────────
// ESPALDA
// ─────────────────────────────────────────────
'dominadas_pronas': {
  primary: ['dorsal_ancho', 'biceps_cabeza_larga', 'biceps_cabeza_corta'],
  secondary: ['romboides_mayor', 'trapecio_medio', 'infraespinoso', 'braquial'],
  camera: 'BACK_CENTER'
},
'dominadas_supinas': {
  primary: ['dorsal_ancho', 'biceps_cabeza_larga', 'biceps_cabeza_corta'],
  secondary: ['braquial', 'braquiorradial', 'romboides_mayor'],
  camera: 'BACK_CENTER'
},
'jalon_pecho': {
  primary: ['dorsal_ancho', 'biceps_cabeza_larga'],
  secondary: ['romboides_mayor', 'trapecio_medio', 'braquial', 'deltoides_posterior'],
  camera: 'BACK_CENTER'
},
'jalon_triangulo': {
  primary: ['dorsal_ancho'],
  secondary: ['biceps_cabeza_larga', 'braquial', 'romboides_mayor'],
  camera: 'BACK_CENTER'
},
'remo_barra': {
  primary: ['dorsal_ancho', 'romboides_mayor', 'trapecio_medio'],
  secondary: ['biceps_cabeza_larga', 'erector_espinal', 'deltoides_posterior'],
  camera: 'BACK_CENTER'
},
'remo_mancuerna': {
  primary: ['dorsal_ancho', 'romboides_mayor'],
  secondary: ['biceps_cabeza_larga', 'trapecio_medio', 'erector_espinal'],
  camera: 'OBLIQUE_BL'
},
'remo_cable_sentado': {
  primary: ['dorsal_ancho', 'romboides_mayor', 'romboides_menor'],
  secondary: ['biceps_cabeza_larga', 'trapecio_medio', 'erector_espinal'],
  camera: 'BACK_CENTER'
},
'peso_muerto_convencional': {
  primary: ['erector_espinal', 'gluteo_mayor', 'isquiotibiales_biceps_femoral'],
  secondary: ['dorsal_ancho', 'cuadrado_lumbar', 'trapecio_superior', 'cuadriceps_vasto_lateral', 'gluteo_medio'],
  camera: 'BACK_CENTER'
},
'peso_muerto_rumano': {
  primary: ['isquiotibiales_biceps_femoral', 'semitendinoso', 'semimembranoso', 'gluteo_mayor'],
  secondary: ['erector_espinal', 'dorsal_ancho', 'cuadrado_lumbar'],
  camera: 'BACK_LOWER'
},
'face_pull': {
  primary: ['deltoides_posterior', 'infraespinoso', 'redondo_menor'],
  secondary: ['trapecio_medio', 'romboides_mayor', 'biceps_cabeza_larga'],
  camera: 'BACK_UPPER'
},
'encogimientos_barra': {
  primary: ['trapecio_superior'],
  secondary: ['trapecio_medio', 'elevador_escapula', 'romboides_menor'],
  camera: 'BACK_UPPER'
},
'hiperextensiones': {
  primary: ['erector_espinal', 'gluteo_mayor'],
  secondary: ['isquiotibiales_biceps_femoral', 'cuadrado_lumbar', 'multifidos'],
  camera: 'BACK_CENTER'
},

// ─────────────────────────────────────────────
// HOMBROS
// ─────────────────────────────────────────────
'press_militar_barra': {
  primary: ['deltoides_anterior', 'deltoides_medial'],
  secondary: ['triceps_cabeza_larga', 'triceps_cabeza_lateral', 'trapecio_superior', 'serrato_anterior'],
  camera: 'OBLIQUE_FR'
},
'press_militar_mancuernas': {
  primary: ['deltoides_anterior', 'deltoides_medial'],
  secondary: ['triceps_cabeza_larga', 'trapecio_superior', 'serrato_anterior'],
  camera: 'OBLIQUE_FR'
},
'elevaciones_laterales': {
  primary: ['deltoides_medial'],
  secondary: ['deltoides_anterior', 'trapecio_superior', 'supraespinoso'],
  camera: 'OBLIQUE_FL'
},
'elevaciones_frontales': {
  primary: ['deltoides_anterior'],
  secondary: ['deltoides_medial', 'pectoral_mayor_clavicular', 'serrato_anterior'],
  camera: 'FRONT_UPPER'
},
'pajaros_mancuernas': {
  primary: ['deltoides_posterior', 'infraespinoso', 'redondo_menor'],
  secondary: ['romboides_mayor', 'trapecio_medio', 'supraespinoso'],
  camera: 'BACK_UPPER'
},
'arnold_press': {
  primary: ['deltoides_anterior', 'deltoides_medial'],
  secondary: ['triceps_cabeza_larga', 'deltoides_posterior', 'supraespinoso'],
  camera: 'OBLIQUE_FR'
},

// ─────────────────────────────────────────────
// BÍCEPS
// ─────────────────────────────────────────────
'curl_barra': {
  primary: ['biceps_cabeza_larga', 'biceps_cabeza_corta'],
  secondary: ['braquial', 'braquiorradial'],
  camera: 'ARM_R'
},
'curl_mancuernas': {
  primary: ['biceps_cabeza_larga', 'biceps_cabeza_corta'],
  secondary: ['braquial', 'braquiorradial'],
  camera: 'ARM_R'
},
'curl_martillo': {
  primary: ['braquiorradial', 'braquial'],
  secondary: ['biceps_cabeza_larga', 'extensores_antebrazo'],
  camera: 'ARM_R'
},
'curl_predicador': {
  primary: ['biceps_cabeza_corta'],
  secondary: ['biceps_cabeza_larga', 'braquial'],
  camera: 'ARM_R'
},
'curl_concentrado': {
  primary: ['biceps_cabeza_corta'],
  secondary: ['braquial'],
  camera: 'ARM_R'
},
'curl_cable_polea': {
  primary: ['biceps_cabeza_larga', 'biceps_cabeza_corta'],
  secondary: ['braquial', 'braquiorradial'],
  camera: 'ARM_R'
},
'curl_invertido': {
  primary: ['extensores_antebrazo', 'braquiorradial'],
  secondary: ['biceps_cabeza_larga', 'braquial'],
  camera: 'ARM_R'
},

// ─────────────────────────────────────────────
// TRÍCEPS
// ─────────────────────────────────────────────
'press_frances': {
  primary: ['triceps_cabeza_larga', 'triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  secondary: ['anconeo'],
  camera: 'LATERAL_R'
},
'fondos_triceps': {
  primary: ['triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  secondary: ['triceps_cabeza_larga', 'deltoides_anterior'],
  camera: 'LATERAL_R'
},
'extension_triceps_polea': {
  primary: ['triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  secondary: ['triceps_cabeza_larga', 'anconeo'],
  camera: 'LATERAL_R'
},
'extension_sobre_cabeza': {
  primary: ['triceps_cabeza_larga'],
  secondary: ['triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  camera: 'LATERAL_L'
},
'patada_triceps': {
  primary: ['triceps_cabeza_larga', 'triceps_cabeza_lateral'],
  secondary: ['anconeo'],
  camera: 'LATERAL_R'
},
'flexiones_diamante': {
  primary: ['triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  secondary: ['triceps_cabeza_larga', 'pectoral_mayor_esternal'],
  camera: 'FRONT_UPPER'
},

// ─────────────────────────────────────────────
// CORE / ABDOMEN
// ─────────────────────────────────────────────
'crunch': {
  primary: ['recto_abdominal'],
  secondary: ['oblicuo_externo', 'transverso_abdominal'],
  camera: 'FRONT_CENTER'
},
'crunch_inverso': {
  primary: ['recto_abdominal'],
  secondary: ['transverso_abdominal', 'psoas_iliaco'],
  camera: 'FRONT_CENTER'
},
'plancha': {
  primary: ['transverso_abdominal', 'recto_abdominal'],
  secondary: ['oblicuo_externo', 'oblicuo_interno', 'erector_espinal', 'gluteo_mayor'],
  camera: 'LATERAL_L'
},
'russian_twist': {
  primary: ['oblicuo_externo', 'oblicuo_interno'],
  secondary: ['recto_abdominal', 'multifidos'],
  camera: 'FRONT_CENTER'
},
'leg_raises': {
  primary: ['recto_abdominal', 'psoas_iliaco'],
  secondary: ['oblicuo_externo', 'tensor_fascia_lata'],
  camera: 'FRONT_CENTER'
},
'ab_wheel': {
  primary: ['recto_abdominal', 'transverso_abdominal'],
  secondary: ['oblicuo_externo', 'erector_espinal', 'dorsal_ancho'],
  camera: 'LATERAL_L'
},
'dragon_flag': {
  primary: ['recto_abdominal'],
  secondary: ['oblicuo_externo', 'psoas_iliaco', 'serrato_anterior'],
  camera: 'LATERAL_L'
},
'vacío_abdominal': {
  primary: ['transverso_abdominal'],
  secondary: ['oblicuo_interno'],
  camera: 'FRONT_CENTER'
},
'oblicuos_cable': {
  primary: ['oblicuo_externo', 'oblicuo_interno'],
  secondary: ['recto_abdominal', 'cuadrado_lumbar'],
  camera: 'OBLIQUE_FR'
},

// ─────────────────────────────────────────────
// PIERNAS — CUÁDRICEPS
// ─────────────────────────────────────────────
'sentadilla': {
  primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial', 'vasto_intermedio'],
  secondary: ['gluteo_mayor', 'isquiotibiales_biceps_femoral', 'erector_espinal', 'aductor_mayor'],
  camera: 'FRONT_LOWER'
},
'sentadilla_bulgara': {
  primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial'],
  secondary: ['gluteo_mayor', 'gluteo_medio', 'isquiotibiales_biceps_femoral'],
  camera: 'OBLIQUE_FR'
},
'sentadilla_sumo': {
  primary: ['vasto_lateral', 'vasto_medial', 'aductor_largo', 'aductor_mayor'],
  secondary: ['gluteo_mayor', 'gluteo_medio', 'recto_femoral'],
  camera: 'FRONT_LOWER'
},
'prensa_piernas': {
  primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial', 'vasto_intermedio'],
  secondary: ['gluteo_mayor', 'aductor_mayor'],
  camera: 'FRONT_LOWER'
},
'extension_cuadriceps': {
  primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial', 'vasto_intermedio'],
  secondary: [],
  camera: 'FRONT_LOWER'
},
'lunges': {
  primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial'],
  secondary: ['gluteo_mayor', 'isquiotibiales_biceps_femoral', 'gluteo_medio'],
  camera: 'OBLIQUE_FR'
},
'hack_squat': {
  primary: ['vasto_lateral', 'vasto_medial', 'recto_femoral'],
  secondary: ['gluteo_mayor', 'aductor_mayor'],
  camera: 'FRONT_LOWER'
},
'step_up': {
  primary: ['recto_femoral', 'vasto_lateral', 'gluteo_mayor'],
  secondary: ['vasto_medial', 'isquiotibiales_biceps_femoral', 'gluteo_medio'],
  camera: 'OBLIQUE_FR'
},

// ─────────────────────────────────────────────
// PIERNAS — ISQUIOTIBIALES
// ─────────────────────────────────────────────
'curl_femoral_tumbado': {
  primary: ['biceps_femoral', 'semitendinoso', 'semimembranoso'],
  secondary: ['gastrocnemio_medial', 'gastrocnemio_lateral', 'gracil'],
  camera: 'BACK_LOWER'
},
'curl_femoral_sentado': {
  primary: ['biceps_femoral', 'semitendinoso', 'semimembranoso'],
  secondary: ['gastrocnemio_medial'],
  camera: 'BACK_LOWER'
},
'good_morning': {
  primary: ['erector_espinal', 'isquiotibiales_biceps_femoral'],
  secondary: ['gluteo_mayor', 'cuadrado_lumbar', 'semimembranoso'],
  camera: 'BACK_CENTER'
},
'nordic_curl': {
  primary: ['biceps_femoral', 'semitendinoso', 'semimembranoso'],
  secondary: ['gastrocnemio_medial', 'gluteo_mayor'],
  camera: 'BACK_LOWER'
},

// ─────────────────────────────────────────────
// GLÚTEOS
// ─────────────────────────────────────────────
'hip_thrust': {
  primary: ['gluteo_mayor'],
  secondary: ['gluteo_medio', 'isquiotibiales_biceps_femoral', 'aductor_mayor'],
  camera: 'BACK_LOWER'
},
'peso_muerto_hexagonal': {
  primary: ['gluteo_mayor', 'erector_espinal', 'vasto_lateral'],
  secondary: ['isquiotibiales_biceps_femoral', 'cuadriceps_vasto_medial', 'trapecio_superior'],
  camera: 'BACK_CENTER'
},
'kickback_cable': {
  primary: ['gluteo_mayor'],
  secondary: ['isquiotibiales_biceps_femoral', 'gluteo_medio'],
  camera: 'BACK_LOWER'
},
'abduccion_cable': {
  primary: ['gluteo_medio', 'gluteo_menor'],
  secondary: ['tensor_fascia_lata', 'piriforme'],
  camera: 'OBLIQUE_BL'
},
'sentadilla_copa': {
  primary: ['gluteo_mayor', 'aductor_mayor'],
  secondary: ['vasto_medial', 'vasto_lateral', 'gluteo_medio'],
  camera: 'FRONT_LOWER'
},
'rdl_mancuernas': {
  primary: ['isquiotibiales_biceps_femoral', 'gluteo_mayor'],
  secondary: ['erector_espinal', 'semitendinoso', 'semimembranoso'],
  camera: 'BACK_LOWER'
},

// ─────────────────────────────────────────────
// GEMELOS / PANTORRILLA
// ─────────────────────────────────────────────
'elevaciones_talones_bipodal': {
  primary: ['gastrocnemio_medial', 'gastrocnemio_lateral'],
  secondary: ['soleo', 'tibial_posterior'],
  camera: 'CALF'
},
'elevaciones_talones_monopodal': {
  primary: ['gastrocnemio_medial', 'gastrocnemio_lateral'],
  secondary: ['soleo', 'peroneos'],
  camera: 'CALF'
},
'elevaciones_talones_sentado': {
  primary: ['soleo'],
  secondary: ['gastrocnemio_medial', 'gastrocnemio_lateral'],
  camera: 'CALF'
},
'tibial_anterior_cable': {
  primary: ['tibial_anterior'],
  secondary: ['peroneos', 'extensor_largo_dedos'],
  camera: 'CALF'
},

// ─────────────────────────────────────────────
// CARDIO / FUNCIONAL (cuerpo completo)
// ─────────────────────────────────────────────
'burpees': {
  primary: ['recto_abdominal', 'pectoral_mayor_esternal', 'deltoides_anterior'],
  secondary: ['gluteo_mayor', 'cuadriceps_vasto_lateral', 'triceps_cabeza_lateral'],
  camera: 'FRONT_CENTER'
},
'mountain_climbers': {
  primary: ['recto_abdominal', 'psoas_iliaco', 'transverso_abdominal'],
  secondary: ['deltoides_anterior', 'recto_femoral', 'oblicuo_externo'],
  camera: 'FRONT_CENTER'
},
'thruster': {
  primary: ['recto_femoral', 'vasto_lateral', 'deltoides_anterior'],
  secondary: ['gluteo_mayor', 'triceps_cabeza_larga', 'erector_espinal'],
  camera: 'OBLIQUE_FR'
},
'clean_and_press': {
  primary: ['deltoides_anterior', 'trapecio_superior', 'gluteo_mayor'],
  secondary: ['erector_espinal', 'triceps_cabeza_larga', 'cuadriceps_vasto_lateral'],
  camera: 'OBLIQUE_FR'
},
```

---

## 9. Modelo GLB — Especificaciones y fuentes

### 9.1 Requisitos del modelo
- Músculos como meshes independientes nombrados
- Low-poly estilizado (5k–15k polígonos totales)
- Escala: ~1.8m de altura en coordenadas Three.js
- Eje Y hacia arriba, origen en los pies
- Sin rig/armature (visor estático, no animado)
- Formato: GLB con DRACO para compresión (target < 4MB)

### 9.2 Fuentes recomendadas
1. **Sketchfab** — buscar "low poly human muscles anatomy" con licencia CC-BY
2. **Blend Swap** — modelos Blender con musculos separados
3. **SketchUp 3D Warehouse** — anatomía muscular
4. Alternativa: contratar modelador en Fiverr (~$30–50) para modelo custom con los meshes exactos

### 9.3 Pipeline de preparación del modelo
```
1. Descargar GLB base
2. Blender: separar músculos en meshes individuales
3. Nombrar meshes según convención: mesh_[nombre_musculo]_[l/r]
4. Aplicar material base uniforme (gris oscuro)
5. Exportar como GLB con DRACO: max quality, no animations
6. Colocar en: frontend/models/anatomy_lens.glb
```

---

## 10. Integración con exercises.js

### 10.1 Cambio de llamada

El cambio funcional es mínimo, **pero exercises.js debe convertirse en ES6 module** para poder importar AnatomyLens:

```html
<!-- index.html — cambiar de: -->
<script defer src="js/exercises.js"></script>
<!-- a: -->
<script type="module" src="js/exercises.js"></script>
```

```javascript
// exercises.js — top del archivo
import AnatomyLens from './anatomyLens/index.js';

// En selectExercise(id):
// ANTES:
highlightMuscles(ex.muscles);

// DESPUÉS (con manejo de error para fallback graceful):
try {
  await AnatomyLens.highlight(ex.id);   // id numérico — AnatomyLens lo mapea internamente
} catch (err) {
  console.warn('[AnatomyLens] fallback SVG:', err);
  highlightMuscles(ex.muscles);  // SVG como red de seguridad extra
}
```

### 10.2 Orden de carga de scripts en index.html

`athleteViewer.js` ya usa Three.js. Para que AnatomyLens reutilice el mismo import map:
- athleteViewer debe cargar **antes** que exercises (ya estaba así a nivel de número de línea, pero verificar que el import map esté declarado antes de ambos)
- El import map ya está en index.html — no tocar

### 10.3 Inicialización en app.js

```javascript
// app.js — en la sección de init (línea ~631)
// Tras crear el container en el DOM:
const anatomyContainer = document.querySelector('.anatomy-lens-container');
if (anatomyContainer && typeof AnatomyLens !== 'undefined') {
  await AnatomyLens.init(anatomyContainer);
}

// Al navegar fuera de la sección exercises:
AnatomyLens.destroy();  // Libera contexto WebGL
```

---

## 11. HTML y CSS

### 11.1 Cambio de DOM en el panel de anatomía

El panel actual tiene tres divs independientes (`anatomy-svg-wrap`, `anatomy-legend`, `anatomy-affiliate`). Se añade un sub-contenedor para el canvas sin romper los existentes:

```html
<!-- Dentro de .anatomy-panel.card — AÑADIR antes del SVG -->
<div class="anatomy-lens-container">
  <!-- Canvas 3D montado aquí por AnatomyLens.init() -->
  <!-- Si WebGL falla, este div se oculta y aparece el SVG de abajo -->
</div>

<!-- MANTENER — SVG fallback existente (oculto por defecto cuando 3D activo) -->
<div id="anatomy-svg-wrap" class="anatomy-svg-hidden-by-default">
  <!-- SVG actual sin cambios -->
</div>
<div id="anatomy-legend"></div>
<div id="anatomy-affiliate"></div>
```

`fallback.js` gestiona `display: none` ↔ `display: block` entre canvas y SVG.

### 11.2 CSS nuevo (anatomy-lens.css)

**Nota crítica:** main.css ya tiene `.legend-dot` (línea ~1153). Las clases del visor 3D usan prefijo `al-` para evitar colisión:

```css
/* anatomy-lens.css — solo clases nuevas, hereda variables de main.css */

.anatomy-lens-container {
  position: relative;
  width: 100%;
  aspect-ratio: 9/16;
  max-height: 480px;
  background: var(--bg-surface, #07070f);
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
}

/* SVG original oculto cuando 3D activo */
.anatomy-svg-hidden-by-default { display: none; }
.anatomy-svg-hidden-by-default.al-fallback-active { display: block; }

.anatomy-lens-canvas { width: 100%; height: 100%; display: block; }

.anatomy-lens-loading {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; background: var(--bg-surface, #07070f);
}

.anatomy-lens-progress {
  width: 120px; height: 2px;
  background: rgba(255,255,255,0.1);
  border-radius: 1px; overflow: hidden;
}

.anatomy-lens-progress-bar {
  height: 100%; background: #6c63ff;
  transition: width 0.3s ease;
}

/* ─── Leyenda 3D — prefijo al- para no colisionar con .legend-dot de main.css ─── */
.anatomy-legend-3d {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding: 8px 0; opacity: 0;
  transition: opacity 0.4s ease;
}

.anatomy-legend-3d.visible { opacity: 1; }

.al-legend-dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block; margin-right: 4px;
}

.al-legend-dot.primary  { background: #6c63ff; box-shadow: 0 0 6px #6c63ff; }
.al-legend-dot.secondary { background: #00d2ff; }
```

---

## 12. Testing y debug

Cada función exporta su estado internamente. Para depurar:

```javascript
// En consola del navegador:
window.__anatomyLens.getState()       // → 'HIGHLIGHTING'
window.__anatomyLens.getMeshRegistry() // → Map de nombres → meshes
window.__anatomyLens.getFPS()         // → 58
window.__anatomyLens.forceFallback()  // Fuerza SVG para test (typo corregido)
```

---

## 13. Checklist de implementación

**Paso 0 (bloqueante — hacerlo antes de código):**
- [ ] Sourcing y preparación del modelo GLB anatómico (ver §9)
- [ ] Verificar meshes del GLB con inspector Three.js o Blender antes de escribir muscleMap

**Módulo AnatomyLens:**
- [ ] state.js — máquina de estados
- [ ] scene.js — renderer, luces, plataforma (reutilizar configuración de athleteViewer.js)
- [ ] model.js — loader GLB, mesh registry
- [ ] highlighter.js — materiales, pulso, transiciones
- [ ] camera.js — ángulos, tween SLERP con Three.js Quaternion (no GSAP)
- [ ] muscleMap.js — tabla completa ejercicios → músculos + EXERCISE_ID_MAP
- [ ] legend.js — componente DOM con clases prefijadas `al-`
- [ ] errorBoundary.js — captura errores
- [ ] fallback.js — activación SVG (toggle visibility, no eliminar del DOM)
- [ ] index.js — API pública, exponer en `window.__anatomyLens` solo en dev

**Integración:**
- [ ] anatomy-lens.css — estilos con prefijo `al-` donde colisione con main.css
- [ ] index.html — añadir `anatomy-lens-container` div, mantener SVG existente
- [ ] exercises.js → ES6 module (`<script type="module">`)
- [ ] app.js — llamar `AnatomyLens.init()` al montar y `destroy()` al desmontar

**Tests manuales obligatorios:**
- [ ] WebGL deshabilitado en Chrome → SVG aparece inmediatamente
- [ ] GLB URL incorrecta → SVG fallback tras timeout 10s
- [ ] Músculo no encontrado en mesh registry → skip + log, sin crash
- [ ] Click ejercicio durante transición de cámara → cancela y reanima desde posición actual
- [ ] Navegación SPA (ir y volver) → destroy + re-init correcto, sin memory leak

---

## 14. Correcciones post-auditoría (2026-05-14)

Esta sección recoge los hallazgos del audit de integración contra el código existente.

### 14.1 Puente de nombres: DB → GLB (CRÍTICO)

La BD de ejercicios usa nombres simplificados (`pecho_mayor`, `deltoides_ant`). El GLB anatómico usa nombres detallados por cabeza muscular. La capa de traducción va en `muscleMap.js`:

```javascript
// muscleMap.js — añadir al inicio
// Mapa: nombre DB → nombres de mesh GLB correspondientes
const DB_TO_MESH = {
  'pecho_mayor':     ['pectoral_mayor_esternal', 'pectoral_mayor_clavicular'],
  'deltoides_ant':   ['deltoides_anterior'],
  'deltoides_med':   ['deltoides_medial'],
  'deltoides_post':  ['deltoides_posterior'],
  'biceps':          ['biceps_cabeza_larga', 'biceps_cabeza_corta'],
  'triceps':         ['triceps_cabeza_larga', 'triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  'dorsal':          ['dorsal_ancho'],
  'trapecio':        ['trapecio_superior', 'trapecio_medio'],
  'gluteo':          ['gluteo_mayor'],
  'isquiotibiales':  ['biceps_femoral', 'semitendinoso', 'semimembranoso'],
  'cuadriceps':      ['recto_femoral', 'vasto_lateral', 'vasto_medial', 'vasto_intermedio'],
  'gemelos':         ['gastrocnemio_medial', 'gastrocnemio_lateral'],
  'core':            ['recto_abdominal', 'oblicuo_externo', 'transverso_abdominal'],
  'lumbar':          ['erector_espinal', 'cuadrado_lumbar'],
  // completar según muscles[] de cada ejercicio en exercises.js
};
```

El muscleMap primero busca por ID de ejercicio (mapeo enriquecido). Si no lo encuentra, usa `DB_TO_MESH` como fallback para traducir los `muscles[]` del DB. Así los 33 ejercicios actuales funcionan desde el día 1 aunque no estén en el muscleMap detallado.

### 14.2 API highlight() — aceptar ID numérico

`exercises.js` pasa `ex.id` (número entero). La API debe resolverlo:

```javascript
// index.js
const EXERCISE_ID_MAP = {
  // Mapeo DB id → key de muscleMap
  1:  'press_banca_plano',
  2:  'press_banca_inclinado',
  3:  'aperturas_mancuernas',
  // ... completar con los 33 ejercicios del DB
};

async function highlight(exerciseId) {
  const key = typeof exerciseId === 'number'
    ? (EXERCISE_ID_MAP[exerciseId] ?? null)
    : exerciseId;
  // Si key === null → usar DB_TO_MESH fallback con muscles[] del ejercicio
}
```

### 14.3 Mesh `anconeo` — ausente del inventario GLB

El muscleMap referencia `anconeo` en ejercicios de tríceps. Este músculo no está en el inventario del §8.1. **Dos opciones:**
- Añadirlo al inventario si el GLB lo incluye: `mesh_anconeo_l / _r`
- Si el GLB no lo tiene: `errorBoundary.js` lo skipea silenciosamente (ya cubierto por la estrategia de §5)

### 14.4 Nombres inconsistentes en muscleMap actual

Revisando el muscleMap en §8.2, algunos nombres no siguen la convención `mesh_XXX` del inventario. Ejemplos:
- Usa `isquiotibiales_biceps_femoral` → debe ser `biceps_femoral`
- Usa `cuadriceps_vasto_lateral` → debe ser `vasto_lateral`  
- Usa `cuadriceps_vasto_medial` → debe ser `vasto_medial`

**Regla:** los nombres en `primary[]` y `secondary[]` deben coincidir EXACTAMENTE con los nombres de mesh del GLB (sin prefijo `mesh_`, sin sufijo `_l/_r` — el highlighter añade ambos lados automáticamente). Corregir durante la implementación de `muscleMap.js`.

### 14.5 Interpolación de cámara — implementación concreta

El spec menciona SLERP pero no el código. Usar Three.js nativo, sin GSAP:

```javascript
// camera.js — tween con requestAnimationFrame
function tweenCamera(targetPos, targetLookAt, durationMs = 800) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();

  const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out quad

  function tick() {
    const elapsed = performance.now() - startTime;
    const t = ease(Math.min(elapsed / durationMs, 1));

    camera.position.lerpVectors(startPos, targetPos, t);
    controls.target.lerpVectors(startTarget, targetLookAt, t);
    controls.update();

    if (t < 1) {
      currentTweenId = requestAnimationFrame(tick);
    } else {
      currentTweenId = null;
      // Trigger legend fade-in
    }
  }

  if (currentTweenId) cancelAnimationFrame(currentTweenId);
  currentTweenId = requestAnimationFrame(tick);
}
```

### 14.6 Archivos que se modifican en el proyecto existente

Para referencia del implementador:

| Archivo | Tipo de cambio |
|---------|----------------|
| `frontend/index.html` | Añadir `<div class="anatomy-lens-container">`, añadir `<link>` a anatomy-lens.css, añadir clase `.anatomy-svg-hidden-by-default` al SVG wrap |
| `frontend/js/exercises.js` | Cambiar a `type="module"`, importar AnatomyLens, cambiar `highlightMuscles()` → `await AnatomyLens.highlight()` con try/catch |
| `frontend/js/app.js` | Añadir init/destroy de AnatomyLens |
| `frontend/css/main.css` | No tocar — anatomy-lens.css es archivo separado |

**Archivos que NO se tocan:**
- `frontend/js/athleteViewer.js` — Baki viewer separado, sin cambios
- `frontend/models/baki_hanma.glb` — No se modifica
- Todo el backend

---

*Spec generado por Claude Architect — AnatomyLens v1.0.0 | Auditado 2026-05-14*
