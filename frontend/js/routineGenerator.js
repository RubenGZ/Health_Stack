/* ============================================================
   routineGenerator.js — Elite Coach Methodology v2.0
   Basado en: Volume Landmarks (Dr. Mike Israetel / RP),
   Periodización por nivel (LP / DUP / Block),
   Selección de ejercicios por SFR y equipamiento disponible.
   ============================================================ */

const RoutineGenerator = (function () {
  'use strict';

  const LS_KEY      = 'hs_routine';
  const LS_HISTORY  = 'hs_routine_history';
  const HISTORY_MAX = 5;

  // ── Cuestionario con metodología de entrenador de élite ──────────
  const STEPS = [
    {
      id: 'goal',
      title: '¿Cuál es tu objetivo principal?',
      coaching_why: '🎯 <strong>Por qué te lo preguntamos:</strong> El objetivo determina el esquema de sets/reps, la intensidad (RPE), los periodos de descanso y el modelo de periodización. No existe una rutina universal — cada objetivo activa mecanismos fisiológicos distintos.',
      type: 'options',
      options: [
        { value: 'hypertrophy',   label: '💪 Hipertrofia',        desc: 'Maximizar volumen muscular. 6-15 reps, RPE 7-9, descanso 60-120 s.' },
        { value: 'strength',      label: '🏋️ Fuerza máxima',      desc: 'Aumentar el 1RM. 1-5 reps, RPE 8-10, descanso 3-5 min.' },
        { value: 'fat_loss',      label: '🔥 Pérdida de grasa',    desc: 'Preservar músculo en déficit. Alta densidad, supersets, máximo EPOC.' },
        { value: 'athletic',      label: '⚡ Atlético / Potencia', desc: 'Fuerza + velocidad explosiva. Periodización ondulante con trabajo de potencia.' },
        { value: 'recomposition', label: '⚖️ Recomposición',       desc: 'Ganar músculo + perder grasa simultáneamente. Funciona mejor en principiantes o con déficit moderado.' },
      ],
    },
    {
      id: 'level',
      title: '¿Cuál es tu experiencia real de entrenamiento?',
      coaching_why: '📈 <strong>Por qué te lo preguntamos:</strong> Tu nivel determina el modelo de periodización óptimo. Los principiantes ganan fuerza con cualquier estímulo (LP funciona con 1 solo set). Los intermedios necesitan variación semanal (DUP). Los avanzados requieren bloques de semanas (Block Periodization). Usar el modelo equivocado = estancamiento o sobreentrenamiento.',
      type: 'options',
      options: [
        { value: 'beginner',     label: '🌱 Principiante', desc: 'Menos de 1 año entrenando con consistencia. Progresas cada sesión (LP).' },
        { value: 'intermediate', label: '📈 Intermedio',   desc: '1-3 años. Progresas semana a semana. Necesitas variación de estímulos (DUP).' },
        { value: 'advanced',     label: '🏆 Avanzado',     desc: '3+ años, técnica sólida. Progresas mes a mes. Necesitas bloques (Block Periodization).' },
      ],
    },
    {
      id: 'days',
      title: '¿Cuántos días a la semana puedes entrenar de forma realista?',
      coaching_why: '📅 <strong>Por qué te lo preguntamos:</strong> Los días disponibles determinan el split óptimo. Con 2-3 días la única forma de alcanzar el Volumen Mínimo Efectivo (MEV) es con Full Body. Con 4+ días podemos dividir por grupos musculares y alcanzar el MAV (Volumen Máximo Adaptativo). El mejor split es el que puedes ejecutar con consistencia — no el más complejo.',
      type: 'options',
      options: [
        { value: 2, label: '2 días', desc: 'Full Body x2 · Perfecto para comenzar o vida muy ocupada.' },
        { value: 3, label: '3 días', desc: 'Full Body x3 (principiante) o PPL comprimido (intermedio/avanzado).' },
        { value: 4, label: '4 días', desc: 'Upper/Lower · El split más eficiente por ratio recuperación/volumen.' },
        { value: 5, label: '5 días', desc: 'PPL+2 · Alta frecuencia, ideal para hipertrofia avanzada.' },
        { value: 6, label: '6 días', desc: 'PPL doble · Máximo volumen. Requiere alta capacidad de recuperación.' },
      ],
    },
    {
      id: 'duration',
      title: '¿Cuánto tiempo tienes disponible por sesión?',
      coaching_why: '⏱️ <strong>Por qué te lo preguntamos:</strong> El tiempo limita el número de ejercicios y series posibles. En 45 min podemos hacer 4-5 ejercicios con intensidad alta. En 90 min podemos meter 7-8 ejercicios y mayor variedad de estímulos. No más largo = no mejor: la calidad por encima del volumen.',
      type: 'options',
      options: [
        { value: 30, label: '30 min', desc: '4 ejercicios compuestos. Circuito o superseries obligatorias.' },
        { value: 45, label: '45 min', desc: '5 ejercicios. El mínimo recomendado para hipertrofia efectiva.' },
        { value: 60, label: '60 min', desc: '6-7 ejercicios. El estándar de oro para la mayoría de personas.' },
        { value: 90, label: '90 min', desc: '8-9 ejercicios. Para alto volumen de entrenamiento avanzado.' },
      ],
    },
    {
      id: 'equipment',
      title: '¿Con qué equipamiento cuentas?',
      coaching_why: '🏗️ <strong>Por qué te lo preguntamos:</strong> El equipamiento define la selección de ejercicios y su SFR (Stimulus-to-Fatigue Ratio). Los cables y máquinas aisladas tienen el mayor SFR para hipertrofia: más crecimiento con menos fatiga sistémica. El peso corporal puede alcanzar el mismo estímulo con las progressiones correctas.',
      type: 'options',
      options: [
        { value: 'full_gym',     label: '🏋️ Gimnasio completo',  desc: 'Barra olímpica, mancuernas, máquinas, poleas, banco ajustable.' },
        { value: 'free_weights', label: '🏠 Peso libre (casa)',  desc: 'Barra + mancuernas + banco. Sin máquinas ni poleas.' },
        { value: 'dumbbells',    label: '🥊 Solo mancuernas',    desc: 'Mancuernas ajustables o varios pares. Sin barra ni máquinas.' },
        { value: 'machines',     label: '🤖 Máquinas + poleas',  desc: 'Gimnasio con máquinas y cables. Sin barra libre.' },
        { value: 'bodyweight',   label: '🌿 Solo peso corporal', desc: 'Sin equipamiento. Barra de dominadas opcional.' },
      ],
    },
    {
      id: 'priority',
      title: '¿Tienes algún grupo muscular prioritario o punto débil?',
      coaching_why: '🎯 <strong>Por qué te lo preguntamos:</strong> Los grupos prioritarios se entrenan PRIMERO en la semana (mayor frecuencia) y PRIMERO en la sesión (energía y concentración máximas). Esto se llama "Specialization Block" en el entrenamiento de élite. Ignorar los puntos débiles lleva a desequilibrios posturales y mayor riesgo de lesión a largo plazo.',
      type: 'multicheck',
      options: [
        { value: 'none',      label: '⚖️ Sin preferencia — desarrollo equilibrado' },
        { value: 'chest',     label: '🫁 Pecho' },
        { value: 'back',      label: '🔙 Espalda (ancho y grosor)' },
        { value: 'shoulders', label: '💪 Hombros (especialmente lateral y posterior)' },
        { value: 'legs',      label: '🦵 Piernas (cuádriceps + glúteos)' },
        { value: 'posterior', label: '🔗 Cadena posterior (isquios + glúteos)' },
        { value: 'arms',      label: '💪 Brazos (bíceps + tríceps)' },
      ],
    },
    {
      id: 'recovery',
      title: '¿Cómo calificarías tu capacidad de recuperación?',
      coaching_why: '😴 <strong>Por qué te lo preguntamos:</strong> La recuperación determina tu MRV (Máximo Volumen Recuperable). Con 8h de sueño y bajo estrés puedes acumular el doble de series semanales que con 5h y estrés alto. Superar tu MRV produce sobreentrenamiento, no más músculo. El entrenamiento destruye el tejido — el descanso es cuando crece.',
      type: 'options',
      options: [
        { value: 'high',   label: '🟢 Alta',  desc: '8+ h de sueño, bajo estrés laboral/vida, buena nutrición.' },
        { value: 'medium', label: '🟡 Media', desc: '6-7 h de sueño o estrés moderado. Lo más habitual.' },
        { value: 'low',    label: '🔴 Baja',  desc: 'Menos de 6 h de sueño, alto estrés o trabajo físico exigente.' },
      ],
    },
    {
      id: 'injuries',
      title: '¿Tienes alguna lesión o limitación articular?',
      coaching_why: '🏥 <strong>Por qué te lo preguntamos:</strong> Las lesiones no son excusa para no entrenar — son una señal para adaptar el estímulo. Un hombro lesionado elimina el press con barra, pero permite el press neutro con mancuernas. Una rodilla dañada limita la sentadilla, pero no el leg press en ángulo neutro. Adaptamos los ejercicios, nunca cancelamos el grupo muscular.',
      type: 'multicheck',
      options: [
        { value: 'none',       label: '✅ Ninguna' },
        { value: 'shoulder',   label: '🔴 Hombro' },
        { value: 'knee',       label: '🔴 Rodilla' },
        { value: 'lower_back', label: '🔴 Lumbar' },
        { value: 'wrist',      label: '🔴 Muñeca' },
        { value: 'elbow',      label: '🔴 Codo' },
        { value: 'hip',        label: '🔴 Cadera' },
      ],
    },
  ];

  // ── Volume Landmarks — Dr. Mike Israetel / Renaissance Periodization ──────
  // Sets semanales por grupo muscular: MEV / MAV / MRV
  const VOLUME_LANDMARKS = {
    beginner:     { chest:{mev:8,mav:12,mrv:16},  back:{mev:10,mav:14,mrv:20}, shoulders:{mev:6,mav:10,mrv:14}, quads:{mev:6,mav:10,mrv:16},  hamstrings:{mev:4,mav:8,mrv:12},  glutes:{mev:4,mav:8,mrv:14},   biceps:{mev:4,mav:8,mrv:12},  triceps:{mev:4,mav:8,mrv:12}  },
    intermediate: { chest:{mev:10,mav:16,mrv:22}, back:{mev:10,mav:16,mrv:25}, shoulders:{mev:8,mav:14,mrv:20}, quads:{mev:8,mav:14,mrv:20},  hamstrings:{mev:6,mav:10,mrv:16}, glutes:{mev:6,mav:12,mrv:20},  biceps:{mev:6,mav:12,mrv:16}, triceps:{mev:6,mav:12,mrv:16} },
    advanced:     { chest:{mev:12,mav:18,mrv:26}, back:{mev:14,mav:20,mrv:30}, shoulders:{mev:10,mav:18,mrv:26},quads:{mev:10,mav:16,mrv:24}, hamstrings:{mev:8,mav:14,mrv:20},  glutes:{mev:8,mav:16,mrv:24},  biceps:{mev:8,mav:14,mrv:20}, triceps:{mev:8,mav:14,mrv:20} },
  };

  // ── Modelos de periodización por nivel ────────────────────────────────────
  const PERIODIZATION_MODEL = {
    beginner:     { name: 'Progresión Lineal (LP)',          scheme: 'LP',    mesocycle_weeks: 4, deload_week: 4 },
    intermediate: { name: 'Periodización Ondulante (DUP)',   scheme: 'DUP',   mesocycle_weeks: 4, deload_week: 4 },
    advanced:     { name: 'Periodización por Bloques',       scheme: 'BLOCK', mesocycle_weeks: 6, deload_week: 7 },
  };

  // ── Pool de ejercicios por grupo muscular y equipamiento ──────────────────
  // sfr: 'high' = mejor relación estímulo/fatiga sistémica (ideal para accesorios)
  //      'medium' = balance entre compuesto y aislamiento
  //      'low' = alta fatiga sistémica pero estímulo global (squat, deadlift)
  // primary: true = ejercicio principal del grupo (colocado primero)
  const EX = {
    chest: {
      full_gym:     [
        { name:'Press banca plano (barra)',       sfr:'medium', primary:true  },
        { name:'Press banca inclinado (barra)',   sfr:'medium', primary:true  },
        { name:'Press inclinado mancuernas',      sfr:'high',   primary:true  },
        { name:'Cruce poleas bajo a alto',        sfr:'high'                  },
        { name:'Cruce poleas alto a bajo',        sfr:'high'                  },
        { name:'Pec-Deck (máquina)',              sfr:'high'                  },
        { name:'Press en máquina (pecho)',        sfr:'high'                  },
        { name:'Fondos en paralelas (pecho)',     sfr:'medium'                },
        { name:'Aperturas mancuernas plano',      sfr:'high'                  },
      ],
      free_weights: [
        { name:'Press banca plano (barra)',       sfr:'medium', primary:true  },
        { name:'Press inclinado mancuernas',      sfr:'high',   primary:true  },
        { name:'Press mancuernas plano',          sfr:'high',   primary:true  },
        { name:'Aperturas mancuernas plano',      sfr:'high'                  },
        { name:'Fondos en paralelas (pecho)',     sfr:'medium'                },
        { name:'Pull-over con mancuerna',         sfr:'medium'                },
      ],
      dumbbells:    [
        { name:'Press mancuernas plano',          sfr:'high',   primary:true  },
        { name:'Press mancuernas inclinado',      sfr:'high',   primary:true  },
        { name:'Aperturas mancuernas plano',      sfr:'high'                  },
        { name:'Aperturas mancuernas inclinado',  sfr:'high'                  },
        { name:'Pull-over con mancuerna',         sfr:'medium'                },
      ],
      machines:     [
        { name:'Press en máquina (pecho)',        sfr:'high',   primary:true  },
        { name:'Press cable inclinado',           sfr:'high',   primary:true  },
        { name:'Pec-Deck (máquina)',              sfr:'high'                  },
        { name:'Cruce poleas bajo a alto',        sfr:'high'                  },
        { name:'Cruce poleas alto a bajo',        sfr:'high'                  },
      ],
      bodyweight:   [
        { name:'Flexiones',                       sfr:'medium', primary:true  },
        { name:'Flexiones inclinadas (pies alto)',sfr:'medium', primary:true  },
        { name:'Fondos en paralelas (pecho)',     sfr:'medium'                },
        { name:'Archer push-up',                  sfr:'medium'                },
        { name:'Push-up con pausa abajo',         sfr:'high'                  },
      ],
    },
    back: {
      full_gym:     [
        { name:'Remo con barra (pronación)',      sfr:'medium', primary:true  },
        { name:'Jalón al pecho (agarre prono)',   sfr:'high',   primary:true  },
        { name:'Remo en polea baja (agarre neutro)',sfr:'high', primary:true  },
        { name:'Dominadas (agarre prono)',        sfr:'medium'                },
        { name:'Remo mancuerna (1 brazo)',        sfr:'high'                  },
        { name:'Pulldown agarre neutro',          sfr:'high'                  },
        { name:'Face pull en polea',              sfr:'high'                  },
        { name:'Remo Pendlay',                    sfr:'medium'                },
      ],
      free_weights: [
        { name:'Remo con barra (pronación)',      sfr:'medium', primary:true  },
        { name:'Dominadas (agarre prono)',        sfr:'medium', primary:true  },
        { name:'Remo mancuerna (1 brazo)',        sfr:'high',   primary:true  },
        { name:'Remo Pendlay',                    sfr:'medium'                },
        { name:'Pull-over con mancuerna',         sfr:'medium'                },
        { name:'Good morning (espalda)',          sfr:'medium'                },
      ],
      dumbbells:    [
        { name:'Remo mancuerna (1 brazo)',        sfr:'high',   primary:true  },
        { name:'Remo mancuernas a 2 brazos',      sfr:'high',   primary:true  },
        { name:'Pull-over con mancuerna',         sfr:'medium'                },
        { name:'Remo inclinado mancuernas',       sfr:'high'                  },
      ],
      machines:     [
        { name:'Jalón al pecho (agarre prono)',   sfr:'high',   primary:true  },
        { name:'Remo en polea baja (neutro)',     sfr:'high',   primary:true  },
        { name:'Pulldown agarre neutro',          sfr:'high'                  },
        { name:'Remo en máquina (Hammer)',        sfr:'high'                  },
        { name:'Face pull en polea',              sfr:'high'                  },
        { name:'Pull-over en máquina',            sfr:'medium'                },
      ],
      bodyweight:   [
        { name:'Dominadas (agarre prono)',        sfr:'medium', primary:true  },
        { name:'Chin-up (agarre supino)',         sfr:'medium', primary:true  },
        { name:'Remo invertido (bajo barra)',     sfr:'high'                  },
        { name:'Dominadas agarre neutro',         sfr:'medium'                },
      ],
    },
    shoulders: {
      full_gym:     [
        { name:'Press militar (barra)',           sfr:'medium', primary:true  },
        { name:'Press Arnold (mancuernas)',       sfr:'high',   primary:true  },
        { name:'Elevaciones laterales (cable)',   sfr:'high',   primary:true  },
        { name:'Face pull en polea',              sfr:'high'                  },
        { name:'Press mancuernas sentado',        sfr:'high'                  },
        { name:'Pájaro posterior (mancuernas)',   sfr:'medium'                },
        { name:'Elevaciones laterales (mancuerna)',sfr:'medium'               },
      ],
      free_weights: [
        { name:'Press militar (barra)',           sfr:'medium', primary:true  },
        { name:'Press Arnold (mancuernas)',       sfr:'high',   primary:true  },
        { name:'Elevaciones laterales (mancuerna)',sfr:'medium', primary:true },
        { name:'Pájaro posterior (mancuernas)',   sfr:'medium'                },
        { name:'Press mancuernas sentado',        sfr:'high'                  },
      ],
      dumbbells:    [
        { name:'Press mancuernas sentado',        sfr:'high',   primary:true  },
        { name:'Press Arnold',                    sfr:'high',   primary:true  },
        { name:'Elevaciones laterales (mancuerna)',sfr:'medium'               },
        { name:'Pájaro posterior (mancuernas)',   sfr:'medium'                },
        { name:'Elevaciones frontales (mancuerna)',sfr:'medium'               },
      ],
      machines:     [
        { name:'Press en máquina (hombros)',      sfr:'high',   primary:true  },
        { name:'Elevaciones laterales (cable)',   sfr:'high',   primary:true  },
        { name:'Face pull en polea',              sfr:'high'                  },
        { name:'Rear delt fly (máquina)',         sfr:'high'                  },
      ],
      bodyweight:   [
        { name:'Pike push-up (V invertida)',      sfr:'medium', primary:true  },
        { name:'Handstand push-up (contra pared)',sfr:'medium', primary:true  },
        { name:'Face pull (TRX o toalla)',        sfr:'medium'                },
        { name:'Elevaciones laterales isométricas',sfr:'low'                  },
      ],
    },
    triceps: {
      full_gym:     [
        { name:'Press banca agarre cerrado',      sfr:'medium', primary:true  },
        { name:'Extensión en polea (barra o cuerda)',sfr:'high', primary:true },
        { name:'Press francés (barra EZ)',        sfr:'high'                  },
        { name:'Extensión por encima en polea',   sfr:'high'                  },
        { name:'Fondos tríceps (banco)',          sfr:'medium'                },
        { name:'Kickback con mancuerna',          sfr:'medium'                },
      ],
      free_weights: [
        { name:'Press banca agarre cerrado',      sfr:'medium', primary:true  },
        { name:'Press francés (barra EZ)',        sfr:'high',   primary:true  },
        { name:'Extensión mancuerna por encima',  sfr:'medium'                },
        { name:'Fondos tríceps (banco)',          sfr:'medium'                },
        { name:'Kickback con mancuerna',          sfr:'medium'                },
      ],
      dumbbells:    [
        { name:'Press francés con mancuernas',    sfr:'high',   primary:true  },
        { name:'Extensión mancuerna por encima',  sfr:'medium', primary:true  },
        { name:'Fondos tríceps (banco)',          sfr:'medium'                },
        { name:'Kickback con mancuerna',          sfr:'medium'                },
      ],
      machines:     [
        { name:'Extensión en polea (cuerda)',     sfr:'high',   primary:true  },
        { name:'Extensión por encima en polea',   sfr:'high',   primary:true  },
        { name:'Press máquina agarre cerrado',    sfr:'medium'                },
      ],
      bodyweight:   [
        { name:'Fondos en paralelas (tríceps)',   sfr:'medium', primary:true  },
        { name:'Fondos tríceps (banco)',          sfr:'medium', primary:true  },
        { name:'Diamond push-up',                 sfr:'medium'                },
        { name:'Push-up agarre cerrado',          sfr:'medium'                },
      ],
    },
    biceps: {
      full_gym:     [
        { name:'Curl barra recta / EZ',           sfr:'medium', primary:true  },
        { name:'Curl mancuernas sentado (supino)',sfr:'high',   primary:true  },
        { name:'Curl polea baja (cable)',         sfr:'high'                  },
        { name:'Curl martillo (mancuernas)',      sfr:'medium'                },
        { name:'Curl predicador (máquina)',       sfr:'high'                  },
        { name:'Curl spider (banco inclinado)',   sfr:'high'                  },
      ],
      free_weights: [
        { name:'Curl barra recta / EZ',           sfr:'medium', primary:true  },
        { name:'Curl mancuernas alterno',         sfr:'high',   primary:true  },
        { name:'Curl martillo (mancuernas)',      sfr:'medium'                },
        { name:'Curl predicador con mancuerna',   sfr:'high'                  },
        { name:'Curl concentrado',                sfr:'high'                  },
      ],
      dumbbells:    [
        { name:'Curl mancuernas alterno sentado', sfr:'high',   primary:true  },
        { name:'Curl martillo (mancuernas)',      sfr:'medium', primary:true  },
        { name:'Curl concentrado',                sfr:'high'                  },
        { name:'Curl inclinado (banco)',          sfr:'high'                  },
      ],
      machines:     [
        { name:'Curl predicador (máquina)',       sfr:'high',   primary:true  },
        { name:'Curl polea baja (cable)',         sfr:'high',   primary:true  },
        { name:'Curl en máquina',                 sfr:'high'                  },
      ],
      bodyweight:   [
        { name:'Chin-up (dominadas supinas)',     sfr:'medium', primary:true  },
        { name:'Remo invertido supino',           sfr:'medium'                },
        { name:'Curl TRX',                        sfr:'medium'                },
      ],
    },
    quads: {
      full_gym:     [
        { name:'Sentadilla trasera (barra)',      sfr:'low',    primary:true  },
        { name:'Prensa de piernas',               sfr:'high',   primary:true  },
        { name:'Extensión de cuádriceps',         sfr:'high'                  },
        { name:'Hack squat (máquina)',            sfr:'high'                  },
        { name:'Zancada búlgara (mancuernas)',    sfr:'high'                  },
        { name:'Sentadilla goblet (mancuerna)',   sfr:'medium'                },
        { name:'Leg press 1 pierna',              sfr:'high'                  },
      ],
      free_weights: [
        { name:'Sentadilla trasera (barra)',      sfr:'low',    primary:true  },
        { name:'Sentadilla frontal (barra)',      sfr:'medium', primary:true  },
        { name:'Zancada búlgara (mancuernas)',    sfr:'high'                  },
        { name:'Sentadilla goblet (mancuerna)',   sfr:'medium'                },
        { name:'Zancada andando (mancuernas)',    sfr:'medium'                },
      ],
      dumbbells:    [
        { name:'Sentadilla goblet (mancuerna)',   sfr:'medium', primary:true  },
        { name:'Zancada búlgara (mancuernas)',    sfr:'high',   primary:true  },
        { name:'Sentadilla sumo (mancuerna)',     sfr:'medium'                },
        { name:'Step-up con mancuernas',          sfr:'medium'                },
      ],
      machines:     [
        { name:'Prensa de piernas',               sfr:'high',   primary:true  },
        { name:'Extensión de cuádriceps',         sfr:'high',   primary:true  },
        { name:'Hack squat (máquina)',            sfr:'high'                  },
        { name:'Leg press 1 pierna',              sfr:'high'                  },
      ],
      bodyweight:   [
        { name:'Sentadilla (peso corporal)',      sfr:'low',    primary:true  },
        { name:'Pistol squat (1 pierna)',         sfr:'medium', primary:true  },
        { name:'Step-up (cajón o silla alta)',    sfr:'medium'                },
        { name:'Zancada búlgara peso corporal',   sfr:'medium'                },
        { name:'Wall sit (isométrico)',           sfr:'low'                   },
      ],
    },
    hamstrings: {
      full_gym:     [
        { name:'Peso muerto rumano (barra)',      sfr:'medium', primary:true  },
        { name:'Curl femoral tumbado',            sfr:'high',   primary:true  },
        { name:'Curl femoral sentado',            sfr:'high'                  },
        { name:'Nordic curl',                     sfr:'high'                  },
        { name:'Leg curl en polea baja',          sfr:'high'                  },
        { name:'Good morning (barra)',            sfr:'medium'                },
      ],
      free_weights: [
        { name:'Peso muerto rumano (barra)',      sfr:'medium', primary:true  },
        { name:'Good morning (barra)',            sfr:'medium', primary:true  },
        { name:'Peso muerto 1 pierna (mancuerna)',sfr:'high'                  },
        { name:'Nordic curl',                     sfr:'high'                  },
      ],
      dumbbells:    [
        { name:'Peso muerto rumano (mancuernas)', sfr:'medium', primary:true  },
        { name:'Peso muerto 1 pierna (mancuerna)',sfr:'high',   primary:true  },
        { name:'Curl isquios con mancuerna',      sfr:'medium'                },
      ],
      machines:     [
        { name:'Curl femoral tumbado',            sfr:'high',   primary:true  },
        { name:'Curl femoral sentado',            sfr:'high',   primary:true  },
        { name:'Leg curl en polea baja',          sfr:'high'                  },
      ],
      bodyweight:   [
        { name:'Nordic curl (isquios)',           sfr:'high',   primary:true  },
        { name:'Peso muerto 1 pierna (PC)',       sfr:'medium', primary:true  },
        { name:'Puente de glúteos + elevación',  sfr:'medium'                },
        { name:'Hip hinge peso corporal',         sfr:'low'                   },
      ],
    },
    glutes: {
      full_gym:     [
        { name:'Hip thrust (barra)',              sfr:'high',   primary:true  },
        { name:'Sentadilla profunda (barra)',     sfr:'medium', primary:true  },
        { name:'Patada trasera en polea',         sfr:'high'                  },
        { name:'Abducción de cadera (máquina)',   sfr:'high'                  },
        { name:'Zancada búlgara (mancuernas)',    sfr:'high'                  },
        { name:'Prensa a 45° (pies altos)',       sfr:'high'                  },
      ],
      free_weights: [
        { name:'Hip thrust (barra)',              sfr:'high',   primary:true  },
        { name:'Sentadilla profunda (barra)',     sfr:'medium', primary:true  },
        { name:'Peso muerto rumano (barra)',      sfr:'medium'                },
        { name:'Zancada búlgara (mancuernas)',    sfr:'high'                  },
      ],
      dumbbells:    [
        { name:'Hip thrust (mancuerna)',          sfr:'high',   primary:true  },
        { name:'Zancada búlgara (mancuernas)',    sfr:'high',   primary:true  },
        { name:'Peso muerto rumano (mancuernas)', sfr:'medium'                },
        { name:'Step-up con mancuernas',          sfr:'medium'                },
      ],
      machines:     [
        { name:'Patada trasera en polea',         sfr:'high',   primary:true  },
        { name:'Abducción de cadera (máquina)',   sfr:'high',   primary:true  },
        { name:'Hip thrust en máquina',           sfr:'high'                  },
        { name:'Prensa a 45° (pies altos)',       sfr:'high'                  },
      ],
      bodyweight:   [
        { name:'Hip thrust peso corporal',        sfr:'medium', primary:true  },
        { name:'Puente de glúteos unilateral',    sfr:'medium', primary:true  },
        { name:'Donkey kick con banda',           sfr:'medium'                },
        { name:'Clamshell con banda',             sfr:'medium'                },
        { name:'Sentadilla profunda PC',          sfr:'low'                   },
      ],
    },
    core: {
      full_gym:     [
        { name:'Plancha frontal (60-90 s)',       sfr:'medium', primary:true  },
        { name:'Rueda abdominal (ab wheel)',      sfr:'high'                  },
        { name:'Crunch en polea (cable)',         sfr:'high'                  },
        { name:'Hanging leg raise',               sfr:'high'                  },
        { name:'Pallof press (cable)',            sfr:'high'                  },
      ],
      free_weights: [
        { name:'Plancha frontal (60-90 s)',       sfr:'medium', primary:true  },
        { name:'Rueda abdominal',                 sfr:'high'                  },
        { name:'Hanging leg raise',               sfr:'high'                  },
        { name:'Farmer walk (mancuernas)',        sfr:'medium'                },
      ],
      dumbbells:    [
        { name:'Plancha frontal (60-90 s)',       sfr:'medium', primary:true  },
        { name:'Plancha lateral (30-45 s)',       sfr:'medium'                },
        { name:'Dead bug',                        sfr:'medium'                },
        { name:'Suitcase carry (mancuerna)',      sfr:'medium'                },
      ],
      machines:     [
        { name:'Crunch en máquina',               sfr:'high',   primary:true  },
        { name:'Crunch en polea (cable)',         sfr:'high'                  },
        { name:'Pallof press (cable)',            sfr:'high'                  },
        { name:'Plancha frontal (60-90 s)',       sfr:'medium'                },
      ],
      bodyweight:   [
        { name:'Plancha frontal (60-90 s)',       sfr:'medium', primary:true  },
        { name:'Hollow body hold',                sfr:'high'                  },
        { name:'Hanging leg raise',               sfr:'high'                  },
        { name:'Dead bug',                        sfr:'medium'                },
        { name:'Mountain climbers (20 s)',        sfr:'medium'                },
        { name:'Ab wheel o towel roll-out',       sfr:'high'                  },
      ],
    },
  };

  // ── Esquema de sets/reps por objetivo y nivel ─────────────────────────────
  function getScheme(goal, level) {
    const schemes = {
      hypertrophy:  { beginner:{sets:'3',reps:'8-12',rest:'60-90 s',intensity:'RPE 7-8'},   intermediate:{sets:'3-4',reps:'8-15',rest:'60-90 s',intensity:'RPE 8'},        advanced:{sets:'4-5',reps:'8-15',rest:'60-120 s',intensity:'RPE 8-9'} },
      strength:     { beginner:{sets:'3',reps:'5',   rest:'2-3 min', intensity:'RPE 8'},     intermediate:{sets:'4-5',reps:'3-5', rest:'3-5 min', intensity:'RPE 8-9'},     advanced:{sets:'5-6',reps:'1-5', rest:'4-5 min', intensity:'RPE 9-10'} },
      fat_loss:     { beginner:{sets:'3',reps:'12-15',rest:'45-60 s',intensity:'RPE 7, supersets'}, intermediate:{sets:'3-4',reps:'10-15',rest:'30-45 s',intensity:'RPE 7-8, densidad alta'}, advanced:{sets:'4',reps:'10-20',rest:'30-45 s',intensity:'RPE 8, densidad máxima'} },
      athletic:     { beginner:{sets:'3',reps:'5-8', rest:'2-3 min', intensity:'RPE 7-8, explosivo'}, intermediate:{sets:'4',reps:'3-6',rest:'2-3 min',intensity:'RPE 8, potencia máxima'}, advanced:{sets:'4-5',reps:'1-5',rest:'3-5 min',intensity:'RPE 8-9, velocidad máxima'} },
      recomposition:{ beginner:{sets:'3',reps:'8-12',rest:'60-90 s',intensity:'RPE 7-8'},   intermediate:{sets:'3-4',reps:'8-12',rest:'60-90 s',intensity:'RPE 8'},        advanced:{sets:'4',reps:'8-15',rest:'60 s',intensity:'RPE 7-8'} },
    };
    return (schemes[goal] || schemes.hypertrophy)[level] || schemes.hypertrophy.intermediate;
  }

  // ── Selección de ejercicios con filtro de lesiones y SFR ─────────────────
  function pickExercises(group, equipment, count, skipGroups, injuries) {
    if (skipGroups.has(group)) return [];
    const pool = (EX[group] || {})[equipment] || (EX[group] || {})['full_gym'] || [];

    const filtered = pool.filter(e => {
      const nm = e.name.toLowerCase();
      if (injuries.includes('shoulder') && ['chest','shoulders','triceps'].includes(group)) {
        if (nm.includes('militar') || nm.includes('arnold') || nm.includes('press militar')) return false;
      }
      if (injuries.includes('lower_back') && ['hamstrings','glutes'].includes(group)) {
        if (nm.includes('rumano') || nm.includes('muerto') || nm.includes('morning')) return false;
      }
      if (injuries.includes('knee') && ['quads'].includes(group)) {
        if (nm.includes('sentadilla') || nm.includes('zancada') || nm.includes('pistol') || nm.includes('hack squat')) return false;
      }
      if (injuries.includes('wrist') && ['biceps','triceps','chest'].includes(group)) {
        if (nm.includes('barra recta') || nm.includes('francés')) return false;
      }
      if (injuries.includes('elbow') && ['biceps','triceps'].includes(group)) {
        if (nm.includes('francés') || nm.includes('press banca agarre')) return false;
      }
      if (injuries.includes('hip') && ['quads','glutes'].includes(group)) {
        if (nm.includes('sentadilla') || nm.includes('zancada') || nm.includes('prensa')) return false;
      }
      return true;
    });

    // Ordenar: primero primary, luego SFR alto
    filtered.sort((a, b) => {
      const aS = (a.primary ? 10 : 0) + (a.sfr === 'high' ? 3 : a.sfr === 'medium' ? 1 : 0);
      const bS = (b.primary ? 10 : 0) + (b.sfr === 'high' ? 3 : b.sfr === 'medium' ? 1 : 0);
      return bS - aS;
    });

    return filtered.slice(0, count);
  }

  // ── Generador central de rutina ───────────────────────────────────────────
  function generateRoutine(answers) {
    const { days, level, goal, injuries: injRaw, duration, equipment, priority, recovery } = answers;
    const d           = parseInt(days);
    const injuries    = (injRaw || ['none']).filter(v => v !== 'none');
    const priorityList= (priority || ['none']).filter(p => p !== 'none');
    const eq          = equipment || 'full_gym';
    const scheme      = getScheme(goal, level);
    const periodModel = PERIODIZATION_MODEL[level] || PERIODIZATION_MODEL.intermediate;

    // Grupos a saltar por lesión severa
    const skip = new Set();
    if (injuries.includes('shoulder')) skip.add('shoulders');
    if (injuries.includes('knee'))     skip.add('quads');
    if (injuries.includes('hip'))      skip.add('glutes');

    // Ejercicios por sesión según duración
    const exPerSession = duration <= 30 ? 4 : duration <= 45 ? 5 : duration <= 60 ? 6 : 8;

    // Construir una sesión: ordena grupos prioritarios primero
    function makeSession(dayName, sessionName, groups) {
      const prio   = groups.filter(g =>
        (priorityList.includes('chest')     && g === 'chest') ||
        (priorityList.includes('back')      && g === 'back') ||
        (priorityList.includes('shoulders') && g === 'shoulders') ||
        (priorityList.includes('legs')      && ['quads','hamstrings','glutes'].includes(g)) ||
        (priorityList.includes('posterior') && ['hamstrings','glutes'].includes(g)) ||
        (priorityList.includes('arms')      && ['biceps','triceps'].includes(g))
      );
      const normal = groups.filter(g => !prio.includes(g));
      const ordered= [...prio, ...normal];

      let exercises = [];
      ordered.forEach(g => {
        const n = g === 'core' ? 1 : 2;
        pickExercises(g, eq, n, skip, injuries).forEach(e =>
          exercises.push({ name:e.name, sets:scheme.sets, reps:scheme.reps, rest:scheme.rest, group:g, sfr:e.sfr })
        );
      });
      return { day: dayName, name: sessionName, exercises: exercises.slice(0, exPerSession) };
    }

    const D = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    let sessions = [], splitName = '', splitRationale = '';

    if (d <= 2) {
      splitName = 'Full Body × 2';
      splitRationale = 'Con 2 días disponibles, el Full Body es la única forma de alcanzar el MEV (Volumen Mínimo Efectivo) para cada grupo muscular. Frecuencia 2×/semana produce +34% más hipertrofia que 1× con el mismo volumen total (Schoenfeld et al., 2016). Cada sesión trabaja todo el cuerpo con estímulo diferenciado A/B.';
      sessions = [
        makeSession(D[0], 'Full Body A — Énfasis Empuje', ['chest','back','shoulders','quads','core']),
        makeSession(D[3], 'Full Body B — Énfasis Tirón + Posterior', ['back','chest','hamstrings','glutes','biceps','core']),
      ];
    } else if (d === 3) {
      if (level === 'beginner') {
        splitName = 'Full Body × 3';
        splitRationale = 'Para principiantes con 3 días, el Full Body × 3 maximiza la señal de síntesis proteica muscular semanal. Las adaptaciones neurológicas son prioritarias en esta fase — la frecuencia alta acelera el aprendizaje motor. Variación A/B/C asegura estímulos distintos y previene la acomodación.';
        sessions = [
          makeSession(D[0], 'Full Body A — Compuestos horizontales', ['chest','back','quads','core']),
          makeSession(D[2], 'Full Body B — Compuestos verticales', ['shoulders','back','hamstrings','glutes','biceps']),
          makeSession(D[4], 'Full Body C — Volumen + accesorios', ['chest','back','quads','triceps','core']),
        ];
      } else {
        splitName = 'Push-Pull-Legs (PPL)';
        splitRationale = 'El PPL es el split más eficiente para intermedios/avanzados con 3 días. Los músculos sinérgicos se entrenan juntos (pecho+tríceps, espalda+bíceps) maximizando el pump y la señal anabólica en cada sesión. Permite alcanzar el MAV (Volumen Máximo Adaptativo) por grupo muscular con 1 sesión semanal de volumen alto.';
        sessions = [
          makeSession(D[0], 'Push — Pecho + Hombros + Tríceps', ['chest','shoulders','triceps']),
          makeSession(D[2], 'Pull — Espalda + Bíceps + Core',    ['back','biceps','core']),
          makeSession(D[4], 'Legs — Cuádriceps + Posterior + Core', ['quads','hamstrings','glutes','core']),
        ];
      }
    } else if (d === 4) {
      splitName = 'Upper / Lower (4 días)';
      splitRationale = 'El Upper/Lower es el split más equilibrado para 4 días — cada grupo muscular se trabaja 2×/semana (frecuencia óptima para hipertrofia según meta-análisis). La sesión Upper A es horizontal (pecho/espalda), Upper B es vertical (hombros/jalones). Lower A enfatiza cuádriceps, Lower B la cadena posterior.';
      sessions = [
        makeSession(D[0], 'Upper A — Énfasis Horizontal',           ['chest','back','biceps','triceps']),
        makeSession(D[1], 'Lower A — Énfasis Cuádriceps + Core',    ['quads','hamstrings','core']),
        makeSession(D[3], 'Upper B — Énfasis Vertical + Hombros',   ['back','shoulders','biceps','triceps']),
        makeSession(D[4], 'Lower B — Énfasis Posterior + Glúteos',  ['hamstrings','glutes','quads','core']),
      ];
    } else if (d === 5) {
      splitName = 'PPL + Especialización (5 días)';
      splitRationale = '5 días combina la eficiencia del PPL con frecuencia extra para grupos prioritarios. Espalda y cuádriceps (grupos más grandes = más volumen) se entrenan 2×/semana. La 5ª sesión se dedica a puntos débiles o cadena posterior, que suele ser el mayor limitante de la estética y la lesión.';
      sessions = [
        makeSession(D[0], 'Push A — Pecho + Tríceps (compuestos)',      ['chest','triceps']),
        makeSession(D[1], 'Pull A — Espalda + Bíceps (compuestos)',      ['back','biceps']),
        makeSession(D[2], 'Legs A — Cuádriceps + Core',                  ['quads','core']),
        makeSession(D[3], 'Push B — Hombros + Pecho (accesorios)',       ['shoulders','chest','triceps']),
        makeSession(D[4], 'Pull B + Legs B — Posterior + Cadena trasera',['back','hamstrings','glutes','biceps']),
      ];
    } else {
      splitName = 'PPL Doble (6 días)';
      splitRationale = 'El PPL doble da a cada grupo muscular 2 sesiones semanales de volumen PPL completo. Permite alcanzar el MRV (Máximo Volumen Recuperable) para los grupos más respondedores. Solo recomendado para avanzados con recuperación ≥ media. La semana 4 de cada mesociclo es OBLIGATORIAMENTE una deload — sin ella, este volumen lleva a sobreentrenamiento.';
      sessions = [
        makeSession(D[0], 'Push A — Pecho + Hombros + Tríceps',          ['chest','shoulders','triceps']),
        makeSession(D[1], 'Pull A — Espalda (ancho) + Bíceps + Core',    ['back','biceps','core']),
        makeSession(D[2], 'Legs A — Cuádriceps + Core',                   ['quads','core']),
        makeSession(D[3], 'Push B — Hombros + Pecho (aislamiento)',       ['shoulders','chest','triceps']),
        makeSession(D[4], 'Pull B — Espalda (grosor) + Bíceps',          ['back','biceps']),
        makeSession(D[5], 'Legs B — Posterior + Glúteos',                 ['hamstrings','glutes','core']),
      ];
    }

    const coachingNotes = buildCoachingNotes(answers, scheme, periodModel, injuries, priorityList);
    return { sessions, cfg: scheme, answers, splitName, splitRationale, coachingNotes, periodModel };
  }

  // ── Notas de coaching personalizadas ─────────────────────────────────────
  function buildCoachingNotes(answers, scheme, periodModel, injuries, priorityList) {
    const notes = [];

    notes.push({
      icon: '📊',
      title: `Modelo: ${periodModel.name}`,
      text: periodModel.scheme === 'LP'
        ? 'Cada sesión, intenta añadir 2,5 kg en compuestos o 1 rep extra en accesorios. Si fallas el mismo peso 2 sesiones seguidas, haz un reset del 10-15% y reinicia. Este es el método más eficiente para principiantes — no lo compliques.'
        : periodModel.scheme === 'DUP'
        ? 'Alterna la intensidad entre sesiones del mismo grupo: Sesión A = pesado (5-6 reps, RPE 8-9), Sesión B = moderado (8-10 reps, RPE 7-8). Esta variación previene la acomodación neural, que es el mayor limitante del progreso intermedio.'
        : 'Tu mesociclo de 6 semanas: Semanas 1-3 = acumulación de volumen (sets altos, RPE 7-8). Semanas 4-5 = intensificación (sets reducidos, cargas máximas, RPE 9). Semana 6 = peaking. Semana 7 = deload completo (40% del volumen habitual).',
    });

    notes.push({
      icon: '⚡',
      title: `Deload: semana ${periodModel.deload_week} del mesociclo`,
      text: 'Cada ' + periodModel.mesocycle_weeks + ' semanas, haz una semana de descarga: -40% de series, mismos ejercicios, 70-75% de la carga habitual. El crecimiento muscular NO ocurre durante el entrenamiento — ocurre durante la recuperación. Saltarte el deload limita tu MRV a largo plazo.',
    });

    notes.push({
      icon: '🎚️',
      title: 'RPE y Reps en Reserva (RIR) — aprende a calibrarlo',
      text: `RPE ${scheme.intensity.split('RPE')[1]?.split(',')[0]?.trim() || '7-8'} significa que al terminar la serie tienes 1-3 reps en reserva antes del fallo real. Para hipertrofia el rango óptimo es 1-3 RIR. El fallo muscular total en TODOS los sets no solo no es necesario para crecer — aumenta el riesgo de lesión y la fatiga acumulada. Aprende a calibrar tu RPE: es la habilidad técnica más valiosa del entrenamiento avanzado.`,
    });

    if (priorityList.length > 0) {
      const gNames = { chest:'Pecho', back:'Espalda', shoulders:'Hombros', legs:'Piernas', posterior:'Cadena posterior', arms:'Brazos' };
      notes.push({
        icon: '🎯',
        title: `Especialización: ${priorityList.map(p => gNames[p] || p).join(', ')}`,
        text: 'Los grupos prioritarios están colocados primero en su sesión — cuando la energía y la concentración son máximas. Para acelerar un punto débil, considera la técnica de "pre-fatiga": 1-2 series de aislamiento del músculo objetivo ANTES del ejercicio compuesto de la sesión.',
      });
    }

    if (injuries.length > 0) {
      notes.push({
        icon: '🏥',
        title: 'Adaptaciones por lesión activas',
        text: 'Los ejercicios han sido filtrados para minimizar el estrés en las zonas lesionadas. Regla de oro: si un ejercicio produce dolor agudo (≥3/10) durante la ejecución, sustitúyelo por la variante de menor impacto articular de la lista. La incomodidad muscular (quemación) es normal. El dolor articular NO.',
      });
    }

    if (answers.recovery === 'low') {
      notes.push({
        icon: '😴',
        title: 'Recuperación baja — protocolo ajustado',
        text: 'Se ha ajustado el ejercicio por sesión a tu capacidad de recuperación actual. Prioridad máxima fuera del gym: 7-9 horas de sueño. El 95% de la síntesis proteica muscular ocurre durante las horas 3-7 del sueño (pico de GH y IGF-1). Sin sueño suficiente, el entrenamiento cataboliza músculo en lugar de construirlo.',
      });
    }

    notes.push({
      icon: '📅',
      title: 'Estructura del mesociclo (4-6 semanas)',
      text: 'Semana 1: empieza conservador (1-2 reps alejado del fallo). Semana 2-3: lleva la intensidad al RPE objetivo. Semana 4: deload o peak. NO intentes hacer máximos en la semana 1 — acumula fatiga progresivamente. Los records se baten en la semana 3, no en la semana 1.',
    });

    return notes;
  }

  // ── Estado del quiz ───────────────────────────────────────────────────────
  let currentStep = 0;
  let answers     = {};

  // ── Renderizar paso ───────────────────────────────────────────────────────
  function renderStep() {
    const step    = STEPS[currentStep];
    const total   = STEPS.length;
    const pct     = Math.round(((currentStep + 1) / total) * 100);
    const fillEl  = document.getElementById('quiz-fill');
    const labelEl = document.getElementById('quiz-step-label');
    const card    = document.getElementById('quiz-card');
    const prev    = document.getElementById('quiz-prev');
    const next    = document.getElementById('quiz-next');

    if (fillEl)  fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `Pregunta ${currentStep + 1} de ${total}`;
    if (prev)    prev.style.visibility = currentStep === 0 ? 'hidden' : '';
    if (next)    next.textContent = currentStep === total - 1 ? '✨ Generar mi rutina' : 'Siguiente →';
    if (!card)   return;

    let html = `<h3 class="quiz-question">${step.title}</h3>`;
    if (step.coaching_why) {
      html += `<div class="quiz-coaching-why">${step.coaching_why}</div>`;
    }
    if (step.hint) html += `<p class="quiz-hint">${step.hint}</p>`;

    if (step.type === 'number') {
      const val = answers[step.id] || '';
      html += `<div class="quiz-number-wrap">
        <input type="number" id="quiz-input" class="form-input quiz-number-input"
               value="${val}" min="${step.min}" max="${step.max}" placeholder="${step.placeholder}">
        <span class="input-unit">${step.unit}</span>
      </div>`;
    } else if (step.type === 'options') {
      html += `<div class="quiz-options">` +
        step.options.map(o => `
          <label class="quiz-option${answers[step.id] === o.value ? ' selected' : ''}" data-val="${o.value}">
            <input type="radio" name="q_${step.id}" value="${o.value}"${answers[step.id] === o.value ? ' checked' : ''} style="display:none">
            <span class="quiz-opt-label">${o.label}</span>
            <span class="quiz-opt-desc">${o.desc}</span>
          </label>`).join('') + `</div>`;
    } else if (step.type === 'multicheck') {
      const selected = answers[step.id] || [];
      html += `<div class="quiz-options quiz-options--multi">` +
        step.options.map(o => `
          <label class="quiz-option${selected.includes(o.value) ? ' selected' : ''}" data-val="${o.value}">
            <input type="checkbox" name="q_${step.id}" value="${o.value}"${selected.includes(o.value) ? ' checked' : ''} style="display:none">
            <span class="quiz-opt-label">${o.label}</span>
          </label>`).join('') + `</div>`;
    }

    card.innerHTML = html;

    card.querySelectorAll('.quiz-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const rawVal = opt.dataset.val;
        const val    = isNaN(rawVal) ? rawVal : parseFloat(rawVal);
        if (step.type === 'options') {
          answers[step.id] = val;
          card.querySelectorAll('.quiz-option').forEach(o => o.classList.toggle('selected', o.dataset.val == rawVal));
        } else {
          let sel = answers[step.id] || [];
          const strVal = String(rawVal);
          if (strVal === 'none') {
            sel = sel.includes('none') ? [] : ['none'];
          } else {
            sel = sel.filter(v => v !== 'none');
            sel.includes(strVal) ? sel = sel.filter(v => v !== strVal) : sel.push(strVal);
          }
          answers[step.id] = sel;
          card.querySelectorAll('.quiz-option').forEach(o => o.classList.toggle('selected', sel.includes(o.dataset.val)));
        }
      });
    });
  }

  // ── Validar paso ──────────────────────────────────────────────────────────
  function validateStep() {
    const step = STEPS[currentStep];
    if (step.type === 'number') {
      const input = document.getElementById('quiz-input');
      const val   = parseFloat(input?.value);
      if (!val || val < step.min || val > step.max) {
        input?.classList.add('error');
        setTimeout(() => input?.classList.remove('error'), 800);
        return false;
      }
      answers[step.id] = val;
    } else if (step.type === 'options') {
      if (answers[step.id] === undefined) {
        const card = document.getElementById('quiz-card');
        card?.classList.add('shake');
        setTimeout(() => card?.classList.remove('shake'), 500);
        return false;
      }
    } else if (step.type === 'multicheck') {
      if (!answers[step.id] || !answers[step.id].length) answers[step.id] = ['none'];
    }
    return true;
  }

  // ── Mostrar resultado ─────────────────────────────────────────────────────
  function showResult(routine) {
    const questionnaire = document.getElementById('routine-questionnaire');
    const resultEl      = document.getElementById('routine-result');
    const resetBtn      = document.getElementById('btn-reset-routine');
    const shareBtn      = document.getElementById('btn-share-routine');
    const coachEl       = document.getElementById('routine-coaching-notes');

    if (questionnaire) questionnaire.style.display = 'none';
    if (resultEl)      resultEl.style.display = '';
    if (resetBtn)      resetBtn.style.display = '';
    if (shareBtn)      shareBtn.style.display = '';

    const cfg = routine.cfg;
    const ans = routine.answers;
    const goalMap = { hypertrophy:'Hipertrofia', strength:'Fuerza', fat_loss:'Pérdida de grasa', athletic:'Atlético', recomposition:'Recomposición' };
    const lvlMap  = { beginner:'Principiante', intermediate:'Intermedio', advanced:'Avanzado' };
    const eqMap   = { full_gym:'Gimnasio completo', free_weights:'Peso libre', dumbbells:'Mancuernas', machines:'Máquinas + poleas', bodyweight:'Peso corporal' };
    const recMap  = { high:'Alta 🟢', medium:'Media 🟡', low:'Baja 🔴' };

    const summary = document.getElementById('routine-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="routine-meta">
          <span class="rmeta-item"><strong>Objetivo:</strong> ${goalMap[ans.goal] || ans.goal}</span>
          <span class="rmeta-item"><strong>Nivel:</strong> ${lvlMap[ans.level] || ans.level}</span>
          <span class="rmeta-item"><strong>Split:</strong> ${routine.splitName || `${ans.days} días`}</span>
          <span class="rmeta-item"><strong>Equipamiento:</strong> ${eqMap[ans.equipment] || ans.equipment || '—'}</span>
          <span class="rmeta-item"><strong>Recuperación:</strong> ${recMap[ans.recovery] || '—'}</span>
          <span class="rmeta-item"><strong>Intensidad:</strong> ${cfg.intensity}</span>
        </div>
        ${routine.splitRationale ? `<div class="routine-rationale"><span class="rationale-icon">🧠</span><p>${routine.splitRationale}</p></div>` : ''}`;
    }

    const week = document.getElementById('routine-week');
    if (week) {
      week.innerHTML = routine.sessions.map(s => `
        <div class="routine-day card">
          <div class="routine-day-header">
            <span class="routine-day-name">${s.day}</span>
            <span class="routine-day-session">${s.name}</span>
          </div>
          <div class="routine-exercises">
            ${s.exercises.length === 0
              ? `<p class="no-exercises">Descanso activo — movilidad y stretching</p>`
              : s.exercises.map(ex => `
                <div class="routine-ex">
                  <span class="rex-name">${ex.name}</span>
                  <span class="rex-meta">
                    <span class="rex-scheme">${ex.sets} × ${ex.reps}</span>
                    <span class="rex-rest">⏱ ${ex.rest}</span>
                    ${ex.sfr === 'high' ? '<span class="rex-sfr" title="Alto SFR — máxima relación estímulo/fatiga sistémica">⭐</span>' : ''}
                  </span>
                </div>`).join('')
            }
          </div>
        </div>`).join('');
    }

    if (routine.coachingNotes?.length && coachEl) {
      coachEl.style.display = '';
      coachEl.innerHTML = `
        <h4 class="coaching-notes-title">🏅 Notas de entrenador de élite</h4>
        <div class="coaching-notes-grid">
          ${routine.coachingNotes.map(n => `
            <div class="coaching-note">
              <div class="cn-header"><span class="cn-icon">${n.icon}</span><strong>${n.title}</strong></div>
              <p class="cn-text">${n.text}</p>
            </div>`).join('')}
        </div>`;
    }

    if (typeof Gamification !== 'undefined') Gamification.addXP('routine');
    localStorage.setItem(LS_KEY, JSON.stringify({ routine, ts: Date.now() }));
    saveToHistory(routine);
    renderHistory();
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  function saveToHistory(routine) {
    try {
      const history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      const gMap = { hypertrophy:'Hipertrofia', strength:'Fuerza', fat_loss:'Pérdida de grasa', athletic:'Atlético', recomposition:'Recomposición' };
      const lMap = { beginner:'Principiante', intermediate:'Intermedio', advanced:'Avanzado' };
      history.unshift({
        ts:    Date.now(),
        label: `${gMap[routine.answers?.goal] || 'Rutina'} · ${lMap[routine.answers?.level] || ''} · ${routine.answers?.days || '?'} días`,
        days:  routine.answers?.days,
        routine,
      });
      localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, HISTORY_MAX)));
    } catch { /* ignorar */ }
  }

  function renderHistory() {
    const wrap = document.getElementById('routine-history');
    if (!wrap) return;
    try {
      const history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      if (!history.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = '';
      wrap.innerHTML = `
        <h3 class="history-title">Historial de rutinas</h3>
        <div class="history-list">
          ${history.map((h, i) => `
            <div class="history-item" data-idx="${i}">
              <div class="history-info">
                <span class="history-label">${h.label}</span>
                <span class="history-date">${new Date(h.ts).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })}</span>
              </div>
              <button class="btn btn--ghost btn--sm history-load-btn" data-idx="${i}">Cargar</button>
            </div>`).join('')}
        </div>`;
      wrap.querySelectorAll('.history-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx  = parseInt(btn.dataset.idx);
          const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
          if (hist[idx]) showResult(hist[idx].routine);
        });
      });
    } catch { wrap.style.display = 'none'; }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function reset() {
    currentStep = 0;
    answers     = {};
    const questionnaire = document.getElementById('routine-questionnaire');
    const resultEl      = document.getElementById('routine-result');
    const resetBtn      = document.getElementById('btn-reset-routine');
    const shareBtn      = document.getElementById('btn-share-routine');
    const coachEl       = document.getElementById('routine-coaching-notes');
    if (questionnaire) questionnaire.style.display = '';
    if (resultEl)      resultEl.style.display = 'none';
    if (resetBtn)      resetBtn.style.display = 'none';
    if (shareBtn)      shareBtn.style.display = 'none';
    if (coachEl)       coachEl.style.display = 'none';
    renderStep();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    renderStep();

    document.getElementById('quiz-next')?.addEventListener('click', () => {
      if (!validateStep()) return;
      if (currentStep < STEPS.length - 1) {
        currentStep++;
        renderStep();
      } else {
        const routine = generateRoutine(answers);
        showResult(routine);
      }
    });

    document.getElementById('quiz-prev')?.addEventListener('click', () => {
      if (currentStep > 0) { currentStep--; renderStep(); }
    });

    document.getElementById('btn-reset-routine')?.addEventListener('click', reset);
    document.getElementById('btn-share-routine')?.addEventListener('click', shareRoutine);
    document.getElementById('share-close')?.addEventListener('click', closeShareOverlay);
    document.getElementById('share-close-2')?.addEventListener('click', closeShareOverlay);

    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved?.routine) showResult(saved.routine);
    } catch { /* ignorar */ }

    renderHistory();
  }

  // ── Compartir rutina ──────────────────────────────────────────────────────
  function shareRoutine() {
    const overlay    = document.getElementById('share-overlay');
    const canvasWrap = document.getElementById('share-canvas-wrap');
    const resultEl   = document.getElementById('routine-result');
    if (!overlay || !canvasWrap || !resultEl) return;
    canvasWrap.innerHTML = '';

    if (typeof html2canvas !== 'undefined') {
      html2canvas(resultEl, { backgroundColor:'#0f172a', scale:2, useCORS:true, logging:false })
        .then(canvas => {
          canvas.style.cssText = 'max-width:100%;border-radius:12px';
          canvasWrap.appendChild(canvas);
          document.getElementById('btn-download-share')?.addEventListener('click', () => {
            const a = document.createElement('a');
            a.download = 'mi-rutina-healthstack.png';
            a.href = canvas.toDataURL('image/png');
            a.click();
          }, { once: true });
          overlay.style.display = 'flex';
        }).catch(() => shareAsFallback(overlay, canvasWrap));
    } else {
      shareAsFallback(overlay, canvasWrap);
    }
  }

  function shareAsFallback(overlay, canvasWrap) {
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        this.beginPath(); this.moveTo(x+r,y); this.lineTo(x+w-r,y);
        this.quadraticCurveTo(x+w,y,x+w,y+r); this.lineTo(x+w,y+h-r);
        this.quadraticCurveTo(x+w,y+h,x+w-r,y+h); this.lineTo(x+r,y+h);
        this.quadraticCurveTo(x,y+h,x,y+h-r); this.lineTo(x,y+r);
        this.quadraticCurveTo(x,y,x+r,y); this.closePath();
      };
    }
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,800,480);
    const grad = ctx.createLinearGradient(0,0,800,0);
    grad.addColorStop(0,'#6c63ff'); grad.addColorStop(1,'#00d2ff');
    ctx.fillStyle = grad; ctx.fillRect(0,0,800,6);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px system-ui,sans-serif';
    ctx.fillText('Mi Rutina — HealthStack Pro', 40, 60);
    ctx.fillStyle = '#94a3b8'; ctx.font = '16px system-ui,sans-serif';
    ctx.fillText('healthstack.pro', 40, 90);
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    (saved?.routine?.sessions || []).slice(0, 6).forEach((s, i) => {
      const col = i%3, row = Math.floor(i/3);
      const x = 40+col*250, y = 130+row*160;
      ctx.fillStyle = '#1e293b'; ctx.beginPath();
      ctx.roundRect(x,y,220,140,12); ctx.fill();
      ctx.fillStyle = '#6c63ff'; ctx.font = 'bold 13px system-ui,sans-serif';
      ctx.fillText(s.day, x+14, y+26);
      ctx.fillStyle = '#94a3b8'; ctx.font = '11px system-ui,sans-serif';
      ctx.fillText(s.name.substring(0,28), x+14, y+42);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '12px system-ui,sans-serif';
      s.exercises.slice(0,4).forEach((ex, j) => {
        ctx.fillText(`• ${ex.name.substring(0,24)} ${ex.sets}×${ex.reps}`, x+14, y+62+j*18);
      });
    });
    canvas.style.cssText = 'max-width:100%;border-radius:12px';
    canvasWrap.appendChild(canvas);
    document.getElementById('btn-download-share')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = 'mi-rutina-healthstack.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    }, { once: true });
    overlay.style.display = 'flex';
  }

  function closeShareOverlay() {
    const overlay = document.getElementById('share-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  return { init };
})();
