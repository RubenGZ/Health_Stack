/* ============================================================
   exercises.js — Base de datos de ejercicios + visor anatómico SVG
   ============================================================ */

const Exercises = (function () {
  'use strict';

  // ── Base de datos ──────────────────────────────────────────
  const MUSCLE_GROUPS = [
    { id: 'all',       label: 'Todos',        color: '#94a3b8' },
    { id: 'pecho',     label: 'Pecho',        color: '#6c63ff' },
    { id: 'espalda',   label: 'Espalda',      color: '#00d2ff' },
    { id: 'hombros',   label: 'Hombros',      color: '#f59e0b' },
    { id: 'brazos',    label: 'Brazos',       color: '#10b981' },
    { id: 'core',      label: 'Core',         color: '#ff6584' },
    { id: 'piernas',   label: 'Piernas',      color: '#a78bfa' },
    { id: 'gluteos',   label: 'Glúteos',      color: '#fb923c' },
    { id: 'cardio',    label: 'Cardio',       color: '#22d3ee' },
  ];

  // affiliate: { icon, name, desc, url } — enlace de afiliado (rel="sponsored noopener")
  // video_url: URL de YouTube con tutorial de técnica
  const DB = [
    // ── PECHO ──
    { id: 1, name: 'Press banca plano', group: 'pecho', level: 'Intermedio', equipment: 'Barra',
      muscles: ['pecho_mayor', 'triceps', 'deltoides_ant'],
      desc: 'Ejercicio rey del pecho. Acostado en banco, baja la barra al pecho y empuja hacia arriba.',
      video_url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
      affiliate: { icon: '🏋', name: 'Barra olímpica 20kg', desc: 'Barra recta olímpica con agarre moleteado', url: 'https://www.amazon.es/s?k=barra+olimpica+20kg&tag=healthstackpro-21' } },
    { id: 2, name: 'Press banca inclinado', group: 'pecho', level: 'Intermedio', equipment: 'Barra',
      muscles: ['pecho_mayor_sup', 'deltoides_ant', 'triceps'],
      desc: 'Banco a 30-45°. Enfatiza la porción clavicular (superior) del pectoral mayor.',
      video_url: 'https://www.youtube.com/watch?v=DbFgADa2PL8',
      affiliate: { icon: '🪑', name: 'Banco ajustable multiposición', desc: 'Regulable de -15° a 90°, soporta 300kg', url: 'https://www.amazon.es/s?k=banco+musculacion+ajustable&tag=healthstackpro-21' } },
    { id: 3, name: 'Aperturas con mancuernas', group: 'pecho', level: 'Principiante', equipment: 'Mancuernas',
      muscles: ['pecho_mayor', 'deltoides_ant'],
      desc: 'Abre los brazos en arco hasta sentir estiramiento del pecho, sube sin bloquear codos.',
      video_url: 'https://www.youtube.com/watch?v=eozdVDA78K0',
      affiliate: { icon: '💪', name: 'Mancuernas hexagonales 10-30kg', desc: 'Set de mancuernas con soporte, goma antideslizante', url: 'https://www.amazon.es/s?k=mancuernas+hexagonales+set&tag=healthstackpro-21' } },
    { id: 4, name: 'Fondos en paralelas', group: 'pecho', level: 'Intermedio', equipment: 'Peso corporal',
      muscles: ['pecho_mayor', 'triceps', 'deltoides_ant'],
      desc: 'Inclina el tronco hacia delante para mayor énfasis pectoral. Baja hasta 90° de codo.',
      video_url: 'https://www.youtube.com/watch?v=2z8JmcrW-As',
      affiliate: { icon: '🔩', name: 'Paralelas de pared plegables', desc: 'Acero reforzado, instalación sin taladro', url: 'https://www.amazon.es/s?k=paralelas+pared+fondos&tag=healthstackpro-21' } },
    { id: 5, name: 'Flexiones diamante', group: 'pecho', level: 'Principiante', equipment: 'Peso corporal',
      muscles: ['triceps', 'pecho_mayor'],
      desc: 'Manos juntas formando un rombo. Activa tríceps y porción esternal del pecho.',
      video_url: 'https://www.youtube.com/watch?v=J0DnG1_S92I' },

    // ── ESPALDA ──
    { id: 6, name: 'Dominadas', group: 'espalda', level: 'Avanzado', equipment: 'Peso corporal',
      muscles: ['dorsal', 'biceps', 'romboides'],
      desc: 'Agarre prono, escápulas activadas. El ejercicio más completo para la espalda superior.',
      video_url: 'https://www.youtube.com/watch?v=eGo4IYlbE5g',
      affiliate: { icon: '🔗', name: 'Barra de dominadas para puerta', desc: 'Sin tornillos, soporta 100kg, 5 agarres', url: 'https://www.amazon.es/s?k=barra+dominadas+puerta&tag=healthstackpro-21' } },
    { id: 7, name: 'Remo con barra', group: 'espalda', level: 'Intermedio', equipment: 'Barra',
      muscles: ['dorsal', 'romboides', 'trapecio', 'biceps'],
      desc: 'Tronco a ~45°, tira la barra hacia el ombligo. Reina de la masa en espalda.',
      video_url: 'https://www.youtube.com/watch?v=G8l_8chR5BE' },
    { id: 8, name: 'Jalón al pecho', group: 'espalda', level: 'Principiante', equipment: 'Polea',
      muscles: ['dorsal', 'biceps', 'romboides'],
      desc: 'En polea alta, tira el agarre hacia el pecho. Ideal para aprender el patrón de dominada.',
      video_url: 'https://www.youtube.com/watch?v=CAwf7n6Luuc' },
    { id: 9, name: 'Remo con mancuerna', group: 'espalda', level: 'Principiante', equipment: 'Mancuernas',
      muscles: ['dorsal', 'trapecio_medio', 'biceps'],
      desc: 'Una mano apoyada en banco, tira la mancuerna hacia la cadera. Excelente rango de movimiento.',
      video_url: 'https://www.youtube.com/watch?v=DMo3HJoawrU',
      affiliate: { icon: '💪', name: 'Mancuerna ajustable 5-32kg', desc: 'Reemplaza 15 mancuernas, selector rápido', url: 'https://www.amazon.es/s?k=mancuerna+ajustable+dial&tag=healthstackpro-21' } },
    { id: 10, name: 'Peso muerto convencional', group: 'espalda', level: 'Avanzado', equipment: 'Barra',
      muscles: ['erector_espinal', 'gluteos', 'isquiotibiales', 'dorsal'],
      desc: 'El movimiento más completo del gym. Activa cadena posterior completa. Técnica es clave.',
      video_url: 'https://www.youtube.com/watch?v=op9kVnSso6Q',
      affiliate: { icon: '🧤', name: 'Cinturón de halterofilia + guantes', desc: 'Pack protección lumbar + grip para cargas pesadas', url: 'https://www.amazon.es/s?k=cinturon+halterofilia+gym&tag=healthstackpro-21' } },

    // ── HOMBROS ──
    { id: 11, name: 'Press militar con barra', group: 'hombros', level: 'Intermedio', equipment: 'Barra',
      muscles: ['deltoides_ant', 'deltoides_med', 'triceps', 'trapecio'],
      desc: 'De pie o sentado, empuja la barra sobre la cabeza. Desarrolla hombros completos.',
      video_url: 'https://www.youtube.com/watch?v=2yjwXTZQDDI' },
    { id: 12, name: 'Elevaciones laterales', group: 'hombros', level: 'Principiante', equipment: 'Mancuernas',
      muscles: ['deltoides_med'],
      desc: 'Levanta los brazos en cruz hasta 90°. Aísla el deltoides medio para hombros anchos.',
      video_url: 'https://www.youtube.com/watch?v=3VcKaXpzqRo',
      affiliate: { icon: '💪', name: 'Mancuernas neopreno 2-10kg', desc: 'Ideales para elevaciones — agarre suave', url: 'https://www.amazon.es/s?k=mancuernas+neopreno+set&tag=healthstackpro-21' } },
    { id: 13, name: 'Pájaro con mancuernas', group: 'hombros', level: 'Principiante', equipment: 'Mancuernas',
      muscles: ['deltoides_post', 'romboides'],
      desc: 'Con torso inclinado, abre los brazos hacia atrás. Clave para hombro posterior.',
      video_url: 'https://www.youtube.com/watch?v=ttvfGg9d76c' },
    { id: 14, name: 'Face pull con polea', group: 'hombros', level: 'Principiante', equipment: 'Polea',
      muscles: ['deltoides_post', 'rotadores_ext', 'romboides'],
      desc: 'Tira la cuerda hacia la cara. Salud del manguito rotador y postura.',
      video_url: 'https://www.youtube.com/watch?v=rep-qVOkqgk',
      affiliate: { icon: '🔗', name: 'Polea de puerta + cuerda', desc: 'Kit completo para entrenamiento en casa', url: 'https://www.amazon.es/s?k=polea+puerta+cable+fitness&tag=healthstackpro-21' } },

    // ── BRAZOS ──
    { id: 15, name: 'Curl con barra', group: 'brazos', level: 'Principiante', equipment: 'Barra',
      muscles: ['biceps', 'braquial'],
      desc: 'Agarre supino, codos fijos. El clásico para volumen de bíceps.',
      video_url: 'https://www.youtube.com/watch?v=kwG2ipFRgfo',
      affiliate: { icon: '🏋', name: 'Barra EZ + discos olímpicos', desc: 'Set barra curvada + 20kg de discos', url: 'https://www.amazon.es/s?k=barra+ez+curl+discos+set&tag=healthstackpro-21' } },
    { id: 16, name: 'Curl martillo', group: 'brazos', level: 'Principiante', equipment: 'Mancuernas',
      muscles: ['biceps', 'braquial', 'braquiorradial'],
      desc: 'Agarre neutro (pulgar arriba). Trabaja bíceps braquial y braquiorradial.',
      video_url: 'https://www.youtube.com/watch?v=zC3nLlEvin4' },
    { id: 17, name: 'Extensión tríceps polea', group: 'brazos', level: 'Principiante', equipment: 'Polea',
      muscles: ['triceps'],
      desc: 'Codos pegados al tronco, extiende la cuerda hacia abajo. Aísla las 3 cabezas del tríceps.',
      video_url: 'https://www.youtube.com/watch?v=2-LAMcpzODU' },
    { id: 18, name: 'Press francés', group: 'brazos', level: 'Intermedio', equipment: 'Barra EZ',
      muscles: ['triceps'],
      desc: 'Acostado, baja la barra EZ detrás de la cabeza. Máxima elongación del tríceps.',
      video_url: 'https://www.youtube.com/watch?v=d_KZxkY_0cM' },

    // ── CORE ──
    { id: 19, name: 'Plancha frontal', group: 'core', level: 'Principiante', equipment: 'Peso corporal',
      muscles: ['transverso', 'oblicuos', 'lumbar'],
      desc: 'Cuerpo recto sobre antebrazos. Activa toda la musculatura estabilizadora del tronco.',
      video_url: 'https://www.youtube.com/watch?v=B296mZDhrP4',
      affiliate: { icon: '🧘', name: 'Esterilla fitness antideslizante 10mm', desc: 'Extra gruesa, ideal para ejercicios de suelo', url: 'https://www.amazon.es/s?k=esterilla+fitness+10mm+antideslizante&tag=healthstackpro-21' } },
    { id: 20, name: 'Crunch abdominal', group: 'core', level: 'Principiante', equipment: 'Peso corporal',
      muscles: ['recto_abdominal'],
      desc: 'Flexiona el tronco sin tirar del cuello. Rango corto con máxima contracción.',
      video_url: 'https://www.youtube.com/watch?v=MKmrqcoCZ-M' },
    { id: 21, name: 'Plancha lateral', group: 'core', level: 'Principiante', equipment: 'Peso corporal',
      muscles: ['oblicuos', 'cuadrado_lumbar'],
      desc: 'Apoyado en un codo y pie. Excelente para oblicuos y estabilidad lateral.',
      video_url: 'https://www.youtube.com/watch?v=K2KACpntlE4' },
    { id: 22, name: 'Rueda abdominal', group: 'core', level: 'Avanzado', equipment: 'Rueda',
      muscles: ['recto_abdominal', 'transverso', 'lumbar'],
      desc: 'Extender y contraer con control. Uno de los ejercicios de core más exigentes.',
      video_url: 'https://www.youtube.com/watch?v=sDNfJlnUuAI',
      affiliate: { icon: '⚙️', name: 'Rueda abdominal doble rueda', desc: 'Rodamientos de bola, rodillera incluida', url: 'https://www.amazon.es/s?k=rueda+abdominal+doble&tag=healthstackpro-21' } },

    // ── PIERNAS ──
    { id: 23, name: 'Sentadilla con barra', group: 'piernas', level: 'Avanzado', equipment: 'Barra',
      muscles: ['cuadriceps', 'gluteos', 'isquiotibiales', 'core'],
      desc: 'La reina de los ejercicios. Baja hasta al menos 90° manteniendo espalda neutra.',
      video_url: 'https://www.youtube.com/watch?v=ultWZbUMPL8',
      affiliate: { icon: '👟', name: 'Zapatillas halterofilia suela plana', desc: 'Suela de madera, tacón elevado para sentadilla', url: 'https://www.amazon.es/s?k=zapatillas+halterofilia+squat&tag=healthstackpro-21' } },
    { id: 24, name: 'Prensa de piernas', group: 'piernas', level: 'Principiante', equipment: 'Máquina',
      muscles: ['cuadriceps', 'gluteos', 'isquiotibiales'],
      desc: 'Alternativa más segura a la sentadilla. Posición de pies modifica el énfasis muscular.',
      video_url: 'https://www.youtube.com/watch?v=IZxyjW7MPJQ' },
    { id: 25, name: 'Extensión de cuádriceps', group: 'piernas', level: 'Principiante', equipment: 'Máquina',
      muscles: ['cuadriceps'],
      desc: 'Aislamiento puro de cuádriceps. Útil para rehabilitación y finisher de entrenamiento.',
      video_url: 'https://www.youtube.com/watch?v=YyvSfVjQeL0' },
    { id: 26, name: 'Curl femoral tumbado', group: 'piernas', level: 'Principiante', equipment: 'Máquina',
      muscles: ['isquiotibiales'],
      desc: 'Aislamiento de isquiotibiales. Imprescindible para equilibrio muscular rodilla.',
      video_url: 'https://www.youtube.com/watch?v=1Tq3QdYUuHs' },
    { id: 27, name: 'Zancada búlgara', group: 'piernas', level: 'Intermedio', equipment: 'Mancuernas',
      muscles: ['cuadriceps', 'gluteos', 'isquiotibiales'],
      desc: 'Pie trasero elevado en banco. Mayor ROM y trabajo unilateral que la sentadilla.',
      video_url: 'https://www.youtube.com/watch?v=2C-uNgKwPLE' },

    // ── GLÚTEOS ──
    { id: 28, name: 'Hip thrust con barra', group: 'gluteos', level: 'Intermedio', equipment: 'Barra',
      muscles: ['gluteos', 'isquiotibiales', 'core'],
      desc: 'Espalda alta en banco, empuja las caderas hacia arriba. El mejor ejercicio para glúteo mayor.',
      video_url: 'https://www.youtube.com/watch?v=xDmFkJxPzeM',
      affiliate: { icon: '🛡', name: 'Pad acolchado para hip thrust', desc: 'Protector de cadera para barra — imprescindible', url: 'https://www.amazon.es/s?k=pad+acolchado+barra+hip+thrust&tag=healthstackpro-21' } },
    { id: 29, name: 'Patada trasera en polea', group: 'gluteos', level: 'Principiante', equipment: 'Polea',
      muscles: ['gluteos'],
      desc: 'De pie ante la polea baja, extiende la pierna hacia atrás. Aislamiento de glúteo.',
      video_url: 'https://www.youtube.com/watch?v=rlGgPLVhYek' },
    { id: 30, name: 'Puente de glúteos', group: 'gluteos', level: 'Principiante', equipment: 'Peso corporal',
      muscles: ['gluteos', 'isquiotibiales'],
      desc: 'Acostado boca arriba, eleva las caderas. Variante sin carga del hip thrust.',
      video_url: 'https://www.youtube.com/watch?v=wPM8icPu6H8',
      affiliate: { icon: '🟡', name: 'Mini bandas elásticas de glúteos', desc: 'Set de 5 resistencias — activa glúteos al máximo', url: 'https://www.amazon.es/s?k=bandas+elasticas+gluteos+mini&tag=healthstackpro-21' } },

    // ── CARDIO ──
    { id: 31, name: 'Burpee', group: 'cardio', level: 'Intermedio', equipment: 'Peso corporal',
      muscles: ['cuerpo_completo'],
      desc: 'Flexión + salto en un movimiento. Cardio HIIT de alta intensidad.',
      video_url: 'https://www.youtube.com/watch?v=dZgVxmf6jkA' },
    { id: 32, name: 'Jump rope (comba)', group: 'cardio', level: 'Principiante', equipment: 'Comba',
      muscles: ['gemelos', 'core', 'hombros'],
      desc: '10 min de comba = 15 min de carrera. Coordinación y cardio en uno.',
      video_url: 'https://www.youtube.com/watch?v=FJmRQ5iTXKE',
      affiliate: { icon: '🪢', name: 'Comba de velocidad ajustable', desc: 'Rodamientos de bola, cable de acero recubierto', url: 'https://www.amazon.es/s?k=comba+velocidad+crossfit+acero&tag=healthstackpro-21' } },
    { id: 33, name: 'Remo en máquina', group: 'cardio', level: 'Principiante', equipment: 'Máquina',
      muscles: ['dorsal', 'piernas', 'core'],
      desc: 'Cardio de bajo impacto que trabaja todo el cuerpo. Ideal para lesionados de rodilla.',
      video_url: 'https://www.youtube.com/watch?v=H0r_QGS1XSM' },
  ];

  // ── SVG anatómico minimalista ──────────────────────────────
  // Silueta humana frontal con regiones identificadas por data-muscle
  const ANATOMY_SVG = `
<svg viewBox="0 0 220 480" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:340px">
  <defs>
    <style>
      .m { fill: rgba(255,255,255,0.06); stroke: rgba(255,255,255,0.15); stroke-width:1; transition: fill 0.3s, stroke 0.3s; cursor:default; }
      .m.active { fill: rgba(108,99,255,0.55); stroke: #6c63ff; stroke-width:1.5; }
      .m.secondary { fill: rgba(0,210,255,0.3); stroke: #00d2ff; stroke-width:1; }
    </style>
  </defs>
  <!-- Cabeza -->
  <ellipse class="m" data-muscle="cabeza" cx="110" cy="36" rx="22" ry="26"/>
  <!-- Cuello -->
  <rect class="m" data-muscle="cuello" x="102" y="60" width="16" height="18" rx="4"/>
  <!-- Trapecio -->
  <path class="m" data-muscle="trapecio" d="M78 78 Q110 70 142 78 L148 95 Q110 88 72 95Z"/>
  <!-- Clavícula / deltoides ant -->
  <ellipse class="m" data-muscle="deltoides_ant" cx="74" cy="96" rx="16" ry="11"/>
  <ellipse class="m" data-muscle="deltoides_ant" cx="146" cy="96" rx="16" ry="11"/>
  <!-- Deltoides med -->
  <ellipse class="m" data-muscle="deltoides_med" cx="62" cy="112" rx="13" ry="10"/>
  <ellipse class="m" data-muscle="deltoides_med" cx="158" cy="112" rx="13" ry="10"/>
  <!-- Deltoides post -->
  <ellipse class="m" data-muscle="deltoides_post" cx="58" cy="126" rx="11" ry="8"/>
  <ellipse class="m" data-muscle="deltoides_post" cx="162" cy="126" rx="11" ry="8"/>
  <!-- Pecho mayor -->
  <path class="m" data-muscle="pecho_mayor" d="M82 88 Q110 84 138 88 L136 130 Q110 140 84 130Z"/>
  <!-- Pecho sup -->
  <path class="m" data-muscle="pecho_mayor_sup" d="M84 86 Q110 80 136 86 L134 103 Q110 98 86 103Z"/>
  <!-- Bíceps izq -->
  <path class="m" data-muscle="biceps" d="M55 130 Q48 145 50 165 Q58 170 66 165 Q68 145 62 130Z"/>
  <!-- Bíceps der -->
  <path class="m" data-muscle="biceps" d="M165 130 Q172 145 170 165 Q162 170 154 165 Q152 145 158 130Z"/>
  <!-- Braquial -->
  <ellipse class="m" data-muscle="braquial" cx="58" cy="168" rx="8" ry="6"/>
  <ellipse class="m" data-muscle="braquial" cx="162" cy="168" rx="8" ry="6"/>
  <!-- Braquiorradial -->
  <path class="m" data-muscle="braquiorradial" d="M50 170 Q44 195 46 215 L56 215 Q58 195 62 172Z"/>
  <path class="m" data-muscle="braquiorradial" d="M170 170 Q176 195 174 215 L164 215 Q162 195 158 172Z"/>
  <!-- Antebrazo -->
  <path class="m" data-muscle="antebrazo" d="M44 218 Q42 245 44 258 L58 258 Q60 245 58 218Z"/>
  <path class="m" data-muscle="antebrazo" d="M176 218 Q178 245 176 258 L162 258 Q160 245 162 218Z"/>
  <!-- Tríceps izq (lado) -->
  <path class="m" data-muscle="triceps" d="M52 130 Q44 145 46 165 Q50 168 56 168 Q54 145 60 130Z"/>
  <path class="m" data-muscle="triceps" d="M168 130 Q176 145 174 165 Q170 168 164 168 Q166 145 160 130Z"/>
  <!-- Serrato -->
  <path class="m" data-muscle="serrato" d="M78 125 Q72 140 74 155 L84 155 Q82 140 86 128Z"/>
  <path class="m" data-muscle="serrato" d="M142 125 Q148 140 146 155 L136 155 Q138 140 134 128Z"/>
  <!-- Recto abdominal -->
  <path class="m" data-muscle="recto_abdominal" d="M90 138 L130 138 L128 210 Q110 215 92 210Z"/>
  <!-- Oblicuos -->
  <path class="m" data-muscle="oblicuos" d="M78 152 Q84 175 86 210 L92 210 Q90 175 88 152Z"/>
  <path class="m" data-muscle="oblicuos" d="M142 152 Q136 175 134 210 L128 210 Q130 175 132 152Z"/>
  <!-- Transverso (debajo recto abd) -->
  <path class="m" data-muscle="transverso" d="M88 205 L132 205 L130 218 Q110 222 90 218Z"/>
  <!-- Cadera / psoas -->
  <path class="m" data-muscle="psoas" d="M90 218 L110 218 L108 235 Q100 238 92 235Z"/>
  <path class="m" data-muscle="psoas" d="M110 218 L130 218 L128 235 Q120 238 112 235Z"/>
  <!-- Glúteo mayor (frontal: tensor fascia lata) -->
  <path class="m" data-muscle="gluteos" d="M82 228 Q86 245 90 260 L110 260 L110 228Z"/>
  <path class="m" data-muscle="gluteos" d="M138 228 Q134 245 130 260 L110 260 L110 228Z"/>
  <!-- Cuádriceps izq -->
  <path class="m" data-muscle="cuadriceps" d="M86 262 Q80 300 82 340 L110 340 L108 262Z"/>
  <!-- Cuádriceps der -->
  <path class="m" data-muscle="cuadriceps" d="M134 262 Q140 300 138 340 L110 340 L112 262Z"/>
  <!-- Isquiotibiales (visible lateralmente) -->
  <path class="m" data-muscle="isquiotibiales" d="M80 262 Q74 300 76 340 L84 340 Q82 300 88 262Z"/>
  <path class="m" data-muscle="isquiotibiales" d="M140 262 Q146 300 144 340 L136 340 Q138 300 132 262Z"/>
  <!-- Rodilla -->
  <ellipse class="m" data-muscle="rodilla" cx="91" cy="345" rx="11" ry="9"/>
  <ellipse class="m" data-muscle="rodilla" cx="129" cy="345" rx="11" ry="9"/>
  <!-- Gemelos izq -->
  <path class="m" data-muscle="gemelos" d="M78 356 Q72 385 76 415 L90 415 Q94 385 90 356Z"/>
  <!-- Gemelos der -->
  <path class="m" data-muscle="gemelos" d="M142 356 Q148 385 144 415 L130 415 Q126 385 130 356Z"/>
  <!-- Tibial ant -->
  <path class="m" data-muscle="tibial" d="M90 356 Q88 385 90 415 L100 415 Q102 385 102 356Z"/>
  <path class="m" data-muscle="tibial" d="M130 356 Q132 385 130 415 L120 415 Q118 385 118 356Z"/>
  <!-- Pie -->
  <ellipse class="m" data-muscle="pie" cx="84" cy="430" rx="18" ry="9"/>
  <ellipse class="m" data-muscle="pie" cx="136" cy="430" rx="18" ry="9"/>
  <!-- Lumbar (posterior visible frontal como cadera baja) -->
  <path class="m" data-muscle="lumbar" d="M94 215 L126 215 L124 228 Q110 232 96 228Z"/>
  <!-- Erector espinal (visible en cintura) -->
  <path class="m" data-muscle="erector_espinal" d="M92 195 L102 195 L100 215 L90 215Z"/>
  <path class="m" data-muscle="erector_espinal" d="M118 195 L128 195 L130 215 L120 215Z"/>
  <!-- Cuadrado lumbar -->
  <path class="m" data-muscle="cuadrado_lumbar" d="M80 210 Q84 220 86 228 L92 228 Q90 220 88 210Z"/>
  <path class="m" data-muscle="cuadrado_lumbar" d="M140 210 Q136 220 134 228 L128 228 Q130 220 132 210Z"/>
  <!-- Dorsal (visible lateralmente) -->
  <path class="m" data-muscle="dorsal" d="M68 102 Q58 130 62 170 L74 170 Q72 130 80 104Z"/>
  <path class="m" data-muscle="dorsal" d="M152 102 Q162 130 158 170 L146 170 Q148 130 140 104Z"/>
  <!-- Romboides (entre escápulas) -->
  <path class="m" data-muscle="romboides" d="M88 105 Q110 100 132 105 L130 125 Q110 118 90 125Z"/>
  <!-- Trapecio medio -->
  <path class="m" data-muscle="trapecio_medio" d="M84 120 Q110 115 136 120 L134 135 Q110 128 86 135Z"/>
  <!-- Rotadores externos -->
  <ellipse class="m" data-muscle="rotadores_ext" cx="68" cy="105" rx="8" ry="6"/>
  <ellipse class="m" data-muscle="rotadores_ext" cx="152" cy="105" rx="8" ry="6"/>
  <!-- Cuerpo completo overlay (para cardio) -->
  <rect class="m" data-muscle="cuerpo_completo" x="62" y="62" width="96" height="350" rx="20" style="opacity:0"/>
</svg>`;

  // ── Estado ────────────────────────────────────────────────
  let currentGroup  = 'all';
  let searchQuery   = '';
  let activeExId    = null;

  // ── Utilidades ────────────────────────────────────────────
  function levelColor(level) {
    return level === 'Principiante' ? '#10b981'
         : level === 'Intermedio'   ? '#f59e0b'
         : '#ff6584';
  }

  function filtered() {
    return DB.filter(ex => {
      const groupOk = currentGroup === 'all' || ex.group === currentGroup;
      const searchOk = !searchQuery || ex.name.toLowerCase().includes(searchQuery);
      return groupOk && searchOk;
    });
  }

  // ── Renderizar tabs ───────────────────────────────────────
  function renderTabs() {
    const wrap = document.getElementById('muscle-tabs');
    if (!wrap) return;
    wrap.innerHTML = MUSCLE_GROUPS.map(g => `
      <button class="muscle-tab${currentGroup === g.id ? ' active' : ''}"
              data-group="${g.id}"
              style="${currentGroup === g.id ? `background:${g.color}22;border-color:${g.color};color:${g.color}` : ''}">
        ${g.label}
      </button>
    `).join('');

    wrap.querySelectorAll('.muscle-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentGroup = btn.dataset.group;
        activeExId   = null;
        renderTabs();
        renderGrid();
        resetAnatomy();
      });
    });
  }

  // ── Renderizar cards ──────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('exercises-grid');
    if (!grid) return;
    const list = filtered();
    if (!list.length) {
      grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;padding:24px">No se encontraron ejercicios.</p>';
      return;
    }
    grid.innerHTML = list.map(ex => `
      <div class="exercise-card${activeExId === ex.id ? ' active' : ''}" data-id="${ex.id}" tabindex="0" role="button">
        <div class="ex-header">
          <span class="ex-name">${ex.name}</span>
          <span class="ex-level" style="color:${levelColor(ex.level)}">${ex.level}</span>
        </div>
        <div class="ex-meta">
          <span class="ex-tag">${MUSCLE_GROUPS.find(g => g.id === ex.group)?.label || ex.group}</span>
          <span class="ex-equip">${ex.equipment}</span>
        </div>
        <p class="ex-desc">${ex.desc}</p>
        ${ex.video_url ? `<a class="ex-video-link" href="${ex.video_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Ver técnica</a>` : ''}
      </div>
    `).join('');

    grid.querySelectorAll('.exercise-card').forEach(card => {
      card.addEventListener('click', () => selectExercise(parseInt(card.dataset.id)));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectExercise(parseInt(card.dataset.id)); });
    });
  }

  // ── Seleccionar ejercicio → visor anatómico ───────────────
  function selectExercise(id) {
    activeExId = (activeExId === id) ? null : id;
    renderGrid();

    if (!activeExId) { resetAnatomy(); return; }

    const ex = DB.find(e => e.id === id);
    if (!ex) return;

    highlightMuscles(ex.muscles);
    renderLegend(ex.muscles);
    renderAffiliate(ex);

    const hint = document.getElementById('anatomy-hint');
    if (hint) hint.style.display = 'none';
  }

  // ── Animar SVG ────────────────────────────────────────────
  function highlightMuscles(muscles) {
    const svg = document.querySelector('#anatomy-svg-wrap svg');
    if (!svg) return;

    // Reset
    svg.querySelectorAll('.m').forEach(el => {
      el.classList.remove('active', 'secondary');
    });

    if (muscles.includes('cuerpo_completo')) {
      svg.querySelectorAll('.m').forEach(el => el.classList.add('secondary'));
      return;
    }

    // Primario: primer músculo; resto: secundarios
    muscles.forEach((m, i) => {
      svg.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => {
        el.classList.add(i === 0 ? 'active' : 'secondary');
      });
    });
  }

  function resetAnatomy() {
    const svg = document.querySelector('#anatomy-svg-wrap svg');
    if (svg) svg.querySelectorAll('.m').forEach(el => el.classList.remove('active', 'secondary'));
    const hint = document.getElementById('anatomy-hint');
    if (hint) hint.style.display = '';
    const legend = document.getElementById('anatomy-legend');
    if (legend) legend.innerHTML = '';
    const aff = document.getElementById('anatomy-affiliate');
    if (aff) aff.innerHTML = '';
  }

  function renderLegend(muscles) {
    const legend = document.getElementById('anatomy-legend');
    if (!legend) return;
    legend.innerHTML = muscles.map((m, i) => `
      <span class="legend-item">
        <span class="legend-dot" style="background:${i === 0 ? '#6c63ff' : '#00d2ff'}"></span>
        ${muscleLabel(m)}
      </span>
    `).join('');
  }

  function renderAffiliate(ex) {
    const wrap = document.getElementById('anatomy-affiliate');
    if (!wrap) return;
    if (!ex.affiliate) { wrap.innerHTML = ''; return; }
    const a = ex.affiliate;
    wrap.innerHTML = `
      <a class="affiliate-card" href="${a.url}" target="_blank" rel="sponsored noopener">
        <span class="aff-icon">${a.icon}</span>
        <div class="aff-info">
          <span class="aff-label">Equipamiento recomendado</span>
          <strong>${a.name}</strong>
          <small>${a.desc}</small>
        </div>
        <span class="aff-arrow">→</span>
      </a>`;
  }

  function muscleLabel(id) {
    const map = {
      pecho_mayor:'Pectoral mayor', pecho_mayor_sup:'Pectoral superior',
      triceps:'Tríceps', deltoides_ant:'Deltoides ant.',
      deltoides_med:'Deltoides med.', deltoides_post:'Deltoides post.',
      biceps:'Bíceps', braquial:'Braquial', braquiorradial:'Braquiorradial',
      dorsal:'Dorsal ancho', romboides:'Romboides', trapecio:'Trapecio',
      trapecio_medio:'Trapecio medio', erector_espinal:'Erector espinal',
      recto_abdominal:'Recto abdominal', oblicuos:'Oblicuos',
      transverso:'Transverso', cuadrado_lumbar:'Cuadrado lumbar',
      lumbar:'Lumbar', psoas:'Psoas ilíaco',
      cuadriceps:'Cuádriceps', isquiotibiales:'Isquiotibiales',
      gluteos:'Glúteos', gemelos:'Gemelos', tibial:'Tibial anterior',
      rotadores_ext:'Rotadores externos', serrato:'Serrato anterior',
      core:'Core', cuerpo_completo:'Cuerpo completo',
    };
    return map[id] || id;
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    const svgWrap = document.getElementById('anatomy-svg-wrap');
    if (svgWrap) svgWrap.innerHTML = ANATOMY_SVG;

    renderTabs();
    renderGrid();

    const searchEl = document.getElementById('exercise-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        searchQuery = searchEl.value.trim().toLowerCase();
        renderGrid();
      });
    }
  }

  return { init };
})();
