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
  const HISTORY_MAX = 1; // Tier gratuito: máximo 1 rutina IA guardada

  // ── Cuestionario con metodología de entrenador de élite ──────────
  const STEPS = [
    {
      id: 'goal',
      title: '¿Cuál es tu objetivo principal?',
      coaching_why: 'Define tus rangos de series, repeticiones e intensidad.',
      type: 'options',
      options: [
        { value: 'hypertrophy',   label: 'Hipertrofia',        desc: 'Maximizar volumen muscular. 6-15 reps, RPE 7-9, descanso 60-120 s.' },
        { value: 'strength',      label: 'Fuerza máxima',      desc: 'Aumentar el 1RM. 1-5 reps, RPE 8-10, descanso 3-5 min.' },
        { value: 'fat_loss',      label: 'Pérdida de grasa',   desc: 'Preservar músculo en déficit. Alta densidad, supersets, máximo EPOC.' },
        { value: 'athletic',      label: 'Atlético / Potencia',desc: 'Fuerza + velocidad explosiva. Periodización ondulante con trabajo de potencia.' },
        { value: 'recomposition', label: 'Recomposición',      desc: 'Ganar músculo + perder grasa simultáneamente. Funciona mejor en principiantes o con déficit moderado.' },
      ],
    },
    {
      id: 'level',
      title: '¿Cuál es tu experiencia real de entrenamiento?',
      coaching_why: 'Determina cómo progresar semana a semana de forma efectiva.',
      type: 'options',
      options: [
        { value: 'beginner',     label: 'Principiante', desc: 'Menos de 1 año entrenando con consistencia. Progresas cada sesión (LP).' },
        { value: 'intermediate', label: 'Intermedio',   desc: '1-3 años. Progresas semana a semana. Necesitas variación de estímulos (DUP).' },
        { value: 'advanced',     label: 'Avanzado',     desc: '3+ años, técnica sólida. Progresas mes a mes. Necesitas bloques (Block Periodization).' },
      ],
    },
    {
      id: 'days',
      title: '¿Cuántos días a la semana puedes entrenar de forma realista?',
      coaching_why: 'Los días disponibles determinan cómo dividir los grupos musculares.',
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
      coaching_why: 'Ajustamos el número de ejercicios al tiempo que tienes disponible.',
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
      coaching_why: 'Los ejercicios se adaptan al equipo que tienes disponible.',
      type: 'options',
      options: [
        { value: 'full_gym',     label: 'Gimnasio completo',  desc: 'Barra olímpica, mancuernas, máquinas, poleas, banco ajustable.' },
        { value: 'free_weights', label: 'Peso libre (casa)',  desc: 'Barra + mancuernas + banco. Sin máquinas ni poleas.' },
        { value: 'dumbbells',    label: 'Solo mancuernas',    desc: 'Mancuernas ajustables o varios pares. Sin barra ni máquinas.' },
        { value: 'machines',     label: 'Máquinas + poleas',  desc: 'Gimnasio con máquinas y cables. Sin barra libre.' },
        { value: 'bodyweight',   label: 'Solo peso corporal', desc: 'Sin equipamiento. Barra de dominadas opcional.' },
      ],
    },
    {
      id: 'priority',
      title: '¿Tienes algún grupo muscular prioritario o punto débil?',
      coaching_why: 'Los grupos prioritarios se colocan primero en cada sesión, cuando tienes más energía.',
      type: 'multicheck',
      options: [
        { value: 'none',      label: 'Sin preferencia — desarrollo equilibrado' },
        { value: 'chest',     label: 'Pecho' },
        { value: 'back',      label: 'Espalda (ancho y grosor)' },
        { value: 'shoulders', label: 'Hombros (especialmente lateral y posterior)' },
        { value: 'legs',      label: 'Piernas (cuádriceps + glúteos)' },
        { value: 'posterior', label: 'Cadena posterior (isquios + glúteos)' },
        { value: 'arms',      label: 'Brazos (bíceps + tríceps)' },
      ],
    },
    {
      id: 'recovery',
      title: '¿Cómo calificarías tu capacidad de recuperación?',
      coaching_why: 'Ajustamos el volumen semanal a tu capacidad real de recuperación.',
      type: 'options',
      options: [
        { value: 'high',   label: 'Alta',  desc: '8+ h de sueño, bajo estrés laboral/vida, buena nutrición.' },
        { value: 'medium', label: 'Media', desc: '6-7 h de sueño o estrés moderado. Lo más habitual.' },
        { value: 'low',    label: 'Baja',  desc: 'Menos de 6 h de sueño, alto estrés o trabajo físico exigente.' },
      ],
    },
    {
      id: 'injuries',
      title: '¿Tienes alguna lesión o limitación articular?',
      coaching_why: 'Filtramos ejercicios que puedan agravar las zonas sensibles.',
      type: 'multicheck',
      options: [
        { value: 'none',       label: 'Ninguna' },
        { value: 'shoulder',   label: 'Hombro' },
        { value: 'knee',       label: 'Rodilla' },
        { value: 'lower_back', label: 'Lumbar' },
        { value: 'wrist',      label: 'Muñeca' },
        { value: 'elbow',      label: 'Codo' },
        { value: 'hip',        label: 'Cadera' },
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
      splitRationale = 'Full Body × 2: todo el cuerpo en cada sesión, con variación A/B para estímulos distintos.';
      sessions = [
        makeSession(D[0], 'Full Body A — Énfasis Empuje', ['chest','back','shoulders','quads','core']),
        makeSession(D[3], 'Full Body B — Énfasis Tirón + Posterior', ['back','chest','hamstrings','glutes','biceps','core']),
      ];
    } else if (d === 3) {
      if (level === 'beginner') {
        splitName = 'Full Body × 3';
        splitRationale = 'Full Body × 3: alta frecuencia ideal para principiantes, con variación A/B/C en cada sesión.';
        sessions = [
          makeSession(D[0], 'Full Body A — Compuestos horizontales', ['chest','back','quads','core']),
          makeSession(D[2], 'Full Body B — Compuestos verticales', ['shoulders','back','hamstrings','glutes','biceps']),
          makeSession(D[4], 'Full Body C — Volumen + accesorios', ['chest','back','quads','triceps','core']),
        ];
      } else {
        splitName = 'Push-Pull-Legs (PPL)';
        splitRationale = 'Push/Pull/Legs: músculos sinérgicos juntos en cada sesión — el split más eficiente para 3 días.';
        sessions = [
          makeSession(D[0], 'Push — Pecho + Hombros + Tríceps', ['chest','shoulders','triceps']),
          makeSession(D[2], 'Pull — Espalda + Bíceps + Core',    ['back','biceps','core']),
          makeSession(D[4], 'Legs — Cuádriceps + Posterior + Core', ['quads','hamstrings','glutes','core']),
        ];
      }
    } else if (d === 4) {
      splitName = 'Upper / Lower (4 días)';
      splitRationale = 'Upper/Lower: cada grupo muscular 2× por semana — el equilibrio perfecto entre frecuencia y volumen.';
      sessions = [
        makeSession(D[0], 'Upper A — Énfasis Horizontal',           ['chest','back','biceps','triceps']),
        makeSession(D[1], 'Lower A — Énfasis Cuádriceps + Core',    ['quads','hamstrings','core']),
        makeSession(D[3], 'Upper B — Énfasis Vertical + Hombros',   ['back','shoulders','biceps','triceps']),
        makeSession(D[4], 'Lower B — Énfasis Posterior + Glúteos',  ['hamstrings','glutes','quads','core']),
      ];
    } else if (d === 5) {
      splitName = 'PPL + Especialización (5 días)';
      splitRationale = 'PPL + día extra: más frecuencia para grupos prioritarios y cadena posterior.';
      sessions = [
        makeSession(D[0], 'Push A — Pecho + Tríceps (compuestos)',      ['chest','triceps']),
        makeSession(D[1], 'Pull A — Espalda + Bíceps (compuestos)',      ['back','biceps']),
        makeSession(D[2], 'Legs A — Cuádriceps + Core',                  ['quads','core']),
        makeSession(D[3], 'Push B — Hombros + Pecho (accesorios)',       ['shoulders','chest','triceps']),
        makeSession(D[4], 'Pull B + Legs B — Posterior + Cadena trasera',['back','hamstrings','glutes','biceps']),
      ];
    } else {
      splitName = 'PPL Doble (6 días)';
      splitRationale = 'PPL doble: máximo volumen semanal. Requiere buena recuperación y una semana de descarga cada 4 semanas.';
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
      icon: '',
      title: `Modelo: ${periodModel.name}`,
      text: periodModel.scheme === 'LP'
        ? 'Sube 2,5 kg o 1 rep cada sesión. Si fallas el mismo peso dos veces seguidas, baja un 10% y vuelve a subir.'
        : periodModel.scheme === 'DUP'
        ? 'Alterna intensidad: sesión A más pesada (5-6 reps), sesión B más moderada (8-10 reps). La variación evita estancarte.'
        : 'Semanas 1-3: acumula volumen. Semanas 4-5: sube la carga al máximo. Semana 6: descarga completa.',
    });

    notes.push({
      icon: '',
      title: `Descarga: semana ${periodModel.deload_week}`,
      text: 'Cada ' + periodModel.mesocycle_weeks + ' semanas: mismos ejercicios, -40% series, 70-75% de la carga habitual. Es cuando el músculo realmente crece.',
    });

    notes.push({
      icon: '',
      title: `Intensidad: ${scheme.intensity.split(',')[0]}`,
      text: 'Termina cada serie sintiendo que podrías hacer 1-2 reps más. No es necesario llegar al fallo — ni más efectivo.',
    });

    if (priorityList.length > 0) {
      const gNames = { chest:'Pecho', back:'Espalda', shoulders:'Hombros', legs:'Piernas', posterior:'Cadena posterior', arms:'Brazos' };
      notes.push({
        icon: '',
        title: `Foco en: ${priorityList.map(p => gNames[p] || p).join(', ')}`,
        text: 'Estos grupos van primero en cada sesión para trabajarlos con la máxima energía disponible.',
      });
    }

    if (injuries.length > 0) {
      notes.push({
        icon: '',
        title: 'Ejercicios adaptados a tus lesiones',
        text: 'Si algún ejercicio causa dolor articular, sustitúyelo por otra variante. Quemación muscular: normal. Dolor en articulación: para.',
      });
    }

    if (answers.recovery === 'low') {
      notes.push({
        icon: '',
        title: 'Volumen ajustado a tu recuperación',
        text: 'El entrenamiento está limitado a lo que puedes recuperar. Duerme 7-9 h — es cuando el músculo crece.',
      });
    }

    notes.push({
      icon: '',
      title: 'Progresión del mesociclo',
      text: 'Semana 1: empieza conservador. Semana 2-3: lleva la intensidad al máximo. Semana 4: descarga. Los records se baten en semana 3.',
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
    if (next)    next.textContent = currentStep === total - 1 ? 'Generar mi rutina' : 'Siguiente →';
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
  function showResult(routine, fromHistory = false) {
    const questionnaire = document.getElementById('routine-questionnaire');
    const resultEl      = document.getElementById('routine-result');
    const resetBtn      = document.getElementById('btn-reset-routine');
    const shareBtn      = document.getElementById('btn-share-routine');
    const coachEl       = document.getElementById('routine-coaching-notes');

    if (questionnaire) questionnaire.style.display = 'none';
    if (resultEl)      resultEl.style.display = '';
    if (resetBtn)      resetBtn.style.display = '';
    if (shareBtn)      shareBtn.style.display = '';

    // Botón "Copiar rutina a entreno" — inyectar solo si no existe ya
    if (!document.getElementById('btn-copy-to-workout')) {
      var copyBtn = document.createElement('button');
      copyBtn.id        = 'btn-copy-to-workout';
      copyBtn.className = 'btn btn--accent';
      copyBtn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:8px;';
      copyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Cargar en Entrenos';
      copyBtn.addEventListener('click', function() {
        copyRoutineToWorkout(routine);
      });
      if (shareBtn && shareBtn.parentNode) {
        shareBtn.parentNode.insertBefore(copyBtn, shareBtn.nextSibling);
      }
    } else {
      // Actualizar handler para la rutina actual
      var existingBtn = document.getElementById('btn-copy-to-workout');
      var newBtn = existingBtn.cloneNode(true);
      newBtn.addEventListener('click', function() { copyRoutineToWorkout(routine); });
      existingBtn.parentNode.replaceChild(newBtn, existingBtn);
    }

    const cfg = routine.cfg;
    const ans = routine.answers;
    const goalMap = { hypertrophy:'Hipertrofia', strength:'Fuerza', fat_loss:'Pérdida de grasa', athletic:'Atlético', recomposition:'Recomposición' };
    const lvlMap  = { beginner:'Principiante', intermediate:'Intermedio', advanced:'Avanzado' };
    const eqMap   = { full_gym:'Gimnasio completo', free_weights:'Peso libre', dumbbells:'Mancuernas', machines:'Máquinas + poleas', bodyweight:'Peso corporal' };
    const recMap  = { high:'Alta', medium:'Media', low:'Baja' };

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
        ${routine.splitRationale ? `<div class="routine-rationale"><span class="rationale-icon"></span><p>${routine.splitRationale}</p></div>` : ''}`;
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
                <div class="routine-ex" data-exercise="${ex.name}" data-planned-reps="${ex.reps}">
                  <span class="rex-name">${ex.name}</span>
                  <span class="rex-meta">
                    <span class="rex-scheme">${ex.sets} × ${ex.reps}</span>
                    <span class="rex-rest">${ex.rest}</span>
                    ${ex.sfr === 'high' ? '<span class="rex-sfr" title="Alto SFR — máxima relación estímulo/fatiga sistémica">SFR</span>' : ''}
                  </span>
                </div>`).join('')
            }
          </div>
        </div>`).join('');
    }

    if (routine.coachingNotes?.length && coachEl) {
      coachEl.style.display = '';
      coachEl.innerHTML = `
        <h4 class="coaching-notes-title">Notas de entrenador de élite</h4>
        <div class="coaching-notes-grid">
          ${routine.coachingNotes.map(n => `
            <div class="coaching-note">
              <div class="cn-header"><span class="cn-icon">${n.icon}</span><strong>${n.title}</strong></div>
              <p class="cn-text">${n.text}</p>
            </div>`).join('')}
        </div>`;
    }

    if (typeof Gamification !== 'undefined') Gamification.addXP('routine');
    document.dispatchEvent(new CustomEvent('routineGenerated', { detail: { routine } }));
    localStorage.setItem(LS_KEY, JSON.stringify({ routine, ts: Date.now() }));

    // Solo pedir guardar si es una rutina nueva (no cargada desde historial)
    if (!fromHistory) {
      const existingHistory = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      if (existingHistory.length >= HISTORY_MAX) {
        _promptSaveRoutine(routine, true); // true = ya hay una existente
      } else {
        _promptSaveRoutine(routine, false);
      }
    }
  }

  // ── Modal de guardado con nombre personalizado ─────────────
  function _promptSaveRoutine(routine, hasExisting) {
    // Crear mini-modal inline
    const existingModal = document.getElementById('save-routine-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'save-routine-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.6);backdrop-filter:blur(4px);padding:16px;
    `;
    const gMap = { hypertrophy:'Hipertrofia', strength:'Fuerza', fat_loss:'Pérd. grasa', athletic:'Atlético', recomposition:'Recomposición' };
    const defaultName = `${gMap[routine.answers?.goal] || 'Rutina'} ${routine.answers?.days || '?'}d — ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'short' })}`;
    const warningHtml = hasExisting
      ? `<p style="color:#f59e0b;font-size:.82rem;margin-bottom:12px;background:rgba(245,158,11,.1);padding:8px 12px;border-radius:8px;border:1px solid rgba(245,158,11,.3)">
           <strong>Tier gratuito — 1 rutina máx.</strong> La rutina anterior será reemplazada.
         </p>`
      : '';
    modal.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:16px;padding:24px;max-width:400px;width:100%">
        <h3 style="margin-bottom:8px;font-size:1rem">Guardar rutina</h3>
        ${warningHtml}
        <label style="font-size:.82rem;color:var(--text-secondary);display:block;margin-bottom:6px">Nombre de la rutina</label>
        <input id="routine-name-input" class="form-input" type="text"
               value="${defaultName}" style="margin-bottom:16px;width:100%"
               maxlength="60">
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="routine-save-cancel" class="btn btn--ghost btn--sm">Cancelar</button>
          <button id="routine-save-confirm" class="btn btn--primary btn--sm">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector('#routine-name-input');
    input?.select();

    modal.querySelector('#routine-save-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#routine-save-confirm').addEventListener('click', () => {
      const name = input?.value.trim() || defaultName;
      saveToHistory(routine, name);
      renderHistory();
      modal.remove();
    });
    // Cerrar al hacer click fuera
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  function saveToHistory(routine, customName) {
    try {
      // Free tier: reemplazar historia existente (no acumular)
      const gMap = { hypertrophy:'Hipertrofia', strength:'Fuerza', fat_loss:'Pérdida de grasa', athletic:'Atlético', recomposition:'Recomposición' };
      const lMap = { beginner:'Principiante', intermediate:'Intermedio', advanced:'Avanzado' };
      const autoLabel = `${gMap[routine.answers?.goal] || 'Rutina'} · ${lMap[routine.answers?.level] || ''} · ${routine.answers?.days || '?'} días`;
      const entry = {
        ts:    Date.now(),
        label: customName || autoLabel,
        days:  routine.answers?.days,
        routine,
      };
      // Sustituir historia completa (tier gratuito = 1 rutina máx.)
      localStorage.setItem(LS_HISTORY, JSON.stringify([entry]));
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
        <h3 class="history-title">Mis rutinas guardadas <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(Tier gratuito: 1 máx.)</span></h3>
        <div class="history-list">
          ${history.map((h, i) => `
            <div class="history-item" data-idx="${i}">
              <div class="history-info">
                <span class="history-label">${h.label}</span>
                <span class="history-date">${new Date(h.ts).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })}</span>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn--ghost btn--sm history-load-btn" data-idx="${i}">Cargar</button>
                <button class="btn btn--sm history-del-btn" data-idx="${i}"
                        style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.3)"
                        title="Eliminar rutina">×</button>
              </div>
            </div>`).join('')}
        </div>`;
      wrap.querySelectorAll('.history-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx  = parseInt(btn.dataset.idx);
          const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
          if (hist[idx]) showResult(hist[idx].routine, true); // fromHistory=true: no reabrir modal de guardado
        });
      });
      wrap.querySelectorAll('.history-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx  = parseInt(btn.dataset.idx);
          const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
          if (!hist[idx]) return;
          const label = hist[idx].label;
          showConfirm(`¿Eliminar la rutina "<strong>${label}</strong>"?`, {
            type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar'
          }).then(ok => {
            if (!ok) return;
            hist.splice(idx, 1);
            localStorage.setItem(LS_HISTORY, JSON.stringify(hist));
            if (!hist.length) {
              localStorage.removeItem(LS_KEY);
              const resultEl = document.getElementById('routine-result');
              if (resultEl) resultEl.style.display = 'none';
              const questionnaire = document.getElementById('routine-questionnaire');
              if (questionnaire) questionnaire.style.display = '';
            }
            renderHistory();
            showToast(`Rutina "${label}" eliminada.`, 'info');
          });
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

  // ── Empty State para nuevos usuarios ──────────────────────────────────────
  function renderRoutineEmptyState() {
    const EMPTY_ID = 'hs-routine-empty';
    if (document.getElementById(EMPTY_ID)) return;

    const saved   = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } })();
    const history = (() => { try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch { return []; } })();

    // Only show if user has never generated a routine
    if (saved?.routine || history.length > 0) return;

    if (typeof window.createEmptyState !== 'function') return;

    const container = document.getElementById('routine-result') ||
                      document.querySelector('.routine-generator-wrap') ||
                      document.querySelector('[id^="section-rutinas"]');
    if (!container) return;

    const el = window.createEmptyState({
      icon: '📋',
      title: 'Aún no tienes rutina',
      message: 'Configura tus preferencias arriba y genera tu primera rutina personalizada con IA.',
      ctaText: 'Generar mi rutina →',
      ctaAction: () => {
        el.remove();
        const btn = document.getElementById('btn-generate') || document.querySelector('[data-action="generate"]');
        if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });
    el.id = EMPTY_ID;
    // Insert before the container (or prepend to parent if container is result area)
    const resultEl = document.getElementById('routine-result');
    if (resultEl && resultEl.parentNode) {
      resultEl.parentNode.insertBefore(el, resultEl);
    } else {
      container.prepend(el);
    }

    // Self-remove when a routine is generated
    function _onRoutineGenerated() {
      document.getElementById(EMPTY_ID)?.remove();
      window.removeEventListener('hs:routine-generated', _onRoutineGenerated);
    }
    window.addEventListener('hs:routine-generated', _onRoutineGenerated);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  // Usamos onclick para que sea idempotente — múltiples llamadas a init() no duplican listeners
  function init() {
    _injectInjuryUI();
    renderStep();

    const nextBtn   = document.getElementById('quiz-next');
    const prevBtn   = document.getElementById('quiz-prev');
    const resetBtn  = document.getElementById('btn-reset-routine');
    const shareBtn2 = document.getElementById('btn-share-routine');
    const closeBtn  = document.getElementById('share-close');
    const closeBtn2 = document.getElementById('share-close-2');

    if (nextBtn) nextBtn.onclick = async () => {
      if (!validateStep()) return;
      if (currentStep < STEPS.length - 1) {
        currentStep++;
        renderStep();
      } else {
        // Try AI endpoint if user has an active token; fall back to local generation
        let routine = null;
        const token = _getToken();
        if (token) {
          nextBtn.disabled = true;
          nextBtn.textContent = 'Generando…';
          routine = await _aiGenerateWithInjuries(answers);
          nextBtn.disabled = false;
          nextBtn.textContent = 'Generar mi rutina';
        }
        if (!routine) {
          routine = generateRoutine(answers);
        }
        showResult(routine);
      }
    };

    if (prevBtn) prevBtn.onclick = () => {
      if (currentStep > 0) { currentStep--; renderStep(); }
    };

    if (resetBtn)  resetBtn.onclick  = reset;
    if (shareBtn2) shareBtn2.onclick = shareRoutine;
    if (closeBtn)  closeBtn.onclick  = closeShareOverlay;
    if (closeBtn2) closeBtn2.onclick = closeShareOverlay;

    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved?.routine) showResult(saved.routine, true); // true = fromHistory, no abrir modal de guardado
    } catch { /* ignorar */ }

    renderHistory();
    renderRoutineEmptyState();
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
    grad.addColorStop(0,'#c4a561'); grad.addColorStop(1,'#00d2ff');
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
      ctx.fillStyle = '#c4a561'; ctx.font = 'bold 13px system-ui,sans-serif';
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

  // ── InjuryManager ─────────────────────────────────────────────────────────
  const _BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || '/api/v1';

  function _getToken() {
    return localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token') || '';
  }

  function _authHeaders() {
    const t = _getToken();
    const h = { 'Content-Type': 'application/json' };
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  // Internal state — array of injury objects from the API
  let _injuries = [];

  const InjuryManager = {
    // Load active injuries from the API and re-render
    load: async function () {
      try {
        const res = await fetch(_BASE + '/routines/injuries', {
          headers: _authHeaders(),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _injuries = await res.json();
      } catch (err) {
        console.warn('[InjuryManager] load error:', err);
        _injuries = [];
        if (window.showToast) window.showToast('No se pudieron cargar las lesiones.', 'error');
      }
      const container = document.getElementById('injury-manager-list');
      if (container) InjuryManager.renderList(container);
    },

    // Post a new injury and refresh
    add: async function (payload) {
      try {
        const res = await fetch(_BASE + '/routines/injuries', {
          method: 'POST',
          headers: _authHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await InjuryManager.load();
        if (window.showToast) window.showToast('Lesión añadida.', 'success');
      } catch (err) {
        console.warn('[InjuryManager] add error:', err);
        if (window.showToast) window.showToast('No se pudo añadir la lesión.', 'error');
      }
    },

    // Soft-delete an injury and refresh
    remove: async function (id) {
      try {
        const res = await fetch(_BASE + '/routines/injuries/' + id, {
          method: 'DELETE',
          headers: _authHeaders(),
        });
        if (!res.ok && res.status !== 204) throw new Error('HTTP ' + res.status);
        await InjuryManager.load();
        if (window.showToast) window.showToast('Lesión eliminada.', 'info');
      } catch (err) {
        console.warn('[InjuryManager] remove error:', err);
        if (window.showToast) window.showToast('No se pudo eliminar la lesión.', 'error');
      }
    },

    // Render injury list into a given DOM element
    renderList: function (container) {
      if (!container) return;
      if (!_injuries.length) {
        container.innerHTML = '<p class="injury-empty">Sin lesiones activas registradas.</p>';
        return;
      }
      const sevColor = { mild: '#4ade80', moderate: '#f59e0b', severe: '#f87171' };
      const sevLabel = { mild: 'Leve', moderate: 'Moderada', severe: 'Severa' };
      container.innerHTML = _injuries.map(function (inj) {
        const color = sevColor[inj.severity] || '#e2e8f0';
        return '<div class="injury-item">' +
          '<span class="injury-badge injury-badge--area">' + _escHtml(inj.body_area) + '</span>' +
          '<span class="injury-label">' + _escHtml(inj.injury_label) + '</span>' +
          '<span class="injury-badge injury-badge--sev" style="color:' + color + ';border-color:' + color + '40">' +
            (sevLabel[inj.severity] || _escHtml(String(inj.severity))) +
          '</span>' +
          '<button class="injury-remove-btn" data-id="' + _escHtml(String(inj.id)) + '" title="Eliminar">×</button>' +
        '</div>';
      }).join('');
      container.querySelectorAll('.injury-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          InjuryManager.remove(btn.dataset.id);
        });
      });
    },

    // Return the current cached list (used by generate flow)
    getActive: function () {
      return _injuries.slice();
    },
  };

  // ── Sanitize helper for injury UI ─────────────────────────────────────────
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Inject InjuryManager UI section ──────────────────────────────────────
  function _injectInjuryUI() {
    if (document.getElementById('injury-manager-section')) return; // idempotent
    const questionnaire = document.getElementById('routine-questionnaire');
    if (!questionnaire) return;

    const section = document.createElement('div');
    section.id = 'injury-manager-section';
    section.innerHTML = [
      '<div class="injury-manager">',
        '<h3 class="injury-manager-title">Lesiones activas</h3>',
        '<p class="injury-manager-hint">Registra lesiones para que la IA las tenga en cuenta al generar tu rutina.</p>',
        '<div id="injury-manager-list" class="injury-list"></div>',
        '<form id="injury-add-form" class="injury-add-form" autocomplete="off">',
          '<div class="injury-form-row">',
            '<input id="inj-area"     class="form-input injury-input" type="text"   placeholder="Zona (p.ej. hombro)" maxlength="60" required>',
            '<input id="inj-label"    class="form-input injury-input" type="text"   placeholder="Descripción (p.ej. tendinitis)" maxlength="120" required>',
            '<select id="inj-sev" class="form-input injury-input">',
              '<option value="mild">Leve</option>',
              '<option value="moderate">Moderada</option>',
              '<option value="severe">Severa</option>',
            '</select>',
            '<input id="inj-notes"    class="form-input injury-input" type="text"   placeholder="Notas (opcional)" maxlength="200">',
            '<button type="submit" class="btn btn--accent btn--sm">Añadir</button>',
          '</div>',
        '</form>',
      '</div>',
    ].join('');

    // Insert before the questionnaire
    questionnaire.parentNode.insertBefore(section, questionnaire);

    // Inject styles once
    if (!document.getElementById('injury-manager-styles')) {
      const style = document.createElement('style');
      style.id = 'injury-manager-styles';
      style.textContent = [
        '.injury-manager{background:var(--hs-surface-2,#161626);border:1px solid rgba(196,165,97,.18);border-radius:12px;padding:16px 20px;margin-bottom:20px;}',
        '.injury-manager-title{font-size:.95rem;font-weight:600;color:#c4a561;margin:0 0 4px;}',
        '.injury-manager-hint{font-size:.78rem;color:rgba(255,255,255,.45);margin:0 0 12px;}',
        '.injury-list{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}',
        '.injury-empty{font-size:.82rem;color:rgba(255,255,255,.35);margin:0 0 8px;}',
        '.injury-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px;}',
        '.injury-badge{font-size:.72rem;padding:2px 8px;border-radius:6px;border:1px solid;font-weight:600;}',
        '.injury-badge--area{color:#c4a561;border-color:rgba(196,165,97,.4);background:rgba(196,165,97,.1);}',
        '.injury-label{flex:1;font-size:.82rem;color:#e2e8f0;}',
        '.injury-remove-btn{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.3);border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:1rem;line-height:1;padding:0;flex-shrink:0;}',
        '.injury-remove-btn:hover{background:rgba(248,113,113,.25);}',
        '.injury-add-form{margin-top:4px;}',
        '.injury-form-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
        '.injury-input{flex:1;min-width:120px;font-size:.82rem;padding:6px 10px;height:34px;}',
      ].join('');
      document.head.appendChild(style);
    }

    // Wire form submit
    section.querySelector('#injury-add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const area  = document.getElementById('inj-area').value.trim();
      const label = document.getElementById('inj-label').value.trim();
      const sev   = document.getElementById('inj-sev').value;
      const notes = document.getElementById('inj-notes').value.trim();
      if (!area || !label) {
        if (window.showToast) window.showToast('Indica la zona y la descripción de la lesión.', 'error');
        return;
      }
      InjuryManager.add({ body_area: area, injury_label: label, severity: sev, notes: notes || null });
      e.target.reset();
    });

    // Initial load — only if the user is authenticated
    if (_getToken()) InjuryManager.load();
  }

  // ── AI generate with injury context ──────────────────────────────────────
  async function _aiGenerateWithInjuries(answers) {
    const active = InjuryManager.getActive();
    const endpoint = active.length > 0 ? '/routines/ai-generate-injury-aware' : '/routines/ai-generate';
    try {
      const res = await fetch(_BASE + endpoint, {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[RoutineGenerator] AI generate error, falling back to local:', err);
      return null;
    }
  }

  // ── Mapa de nombres canónicos (igual que workoutSession.js) ──────────────
  var EXERCISE_KEY_MAP = {
    'press banca plano':'press_banca_plano','press banca':'press_banca_plano',
    'press inclinado':'press_banca_inclinado','aperturas':'aperturas_mancuernas',
    'fondos':'fondos_pecho','fondos pecho':'fondos_pecho',
    'flexiones diamante':'flexiones_diamante','dominadas':'dominadas_pronas',
    'remo barra':'remo_barra','jalon':'jalon_pecho','jalon pecho':'jalon_pecho',
    'remo mancuerna':'remo_mancuerna','peso muerto':'peso_muerto_convencional',
    'press militar':'press_militar_barra','elevaciones laterales':'elevaciones_laterales',
    'pajaros':'pajaros_mancuernas','face pull':'face_pull',
    'curl barra':'curl_barra','curl martillo':'curl_martillo',
    'extension triceps':'extension_triceps_polea','press frances':'press_frances',
    'plancha':'plancha','crunch':'crunch','ab wheel':'ab_wheel',
    'plancha lateral':'plancha_lateral','sentadilla':'sentadilla',
    'prensa':'prensa_piernas','extension cuadriceps':'extension_cuadriceps',
    'curl femoral':'curl_femoral_tumbado','sentadilla bulgara':'sentadilla_bulgara',
    'hip thrust':'hip_thrust','kickback':'kickback_cable',
    'puente gluteos':'puente_gluteos','burpees':'burpees',
    'comba':'jump_rope','remo maquina':'remo_maquina',
  };

  function resolveExKey(name) {
    var n = name.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return EXERCISE_KEY_MAP[n] || n.replace(/\s+/g, '_');
  }

  // ── Copiar rutina generada a la sección de Entrenos ───────────────────────
  function copyRoutineToWorkout(routine) {
    if (!routine || !routine.sessions) return;

    // Buscar primera sesión con ejercicios
    var session = routine.sessions.find(function(s) { return s.exercises && s.exercises.length > 0; });
    if (!session) { alert('Esta rutina no tiene ejercicios configurados.'); return; }

    // Construir el draft en el formato exacto que usa workoutSession.js
    var now = new Date().toISOString();
    var draft = {
      routineId: null,
      startedAt: now,
      exercises: session.exercises.map(function(ex, i) {
        var key = resolveExKey(ex.name);
        var numSets = parseInt(ex.sets) || 3;
        var targetReps = parseInt(ex.reps) || 8;
        var setsArr = [];
        for (var s = 0; s < numSets; s++) {
          setsArr.push({
            setNumber:   s + 1,
            weightKg:    0,
            reps:        targetReps,
            rpe:         null,
            isWarmup:    false,
            completedAt: null,
          });
        }
        return {
          key:        key,
          name:       ex.name,
          orderIndex: i,
          sets:       setsArr,
          note:       ex.rest ? 'Descanso: ' + ex.rest : '',
        };
      }),
    };

    // Guardar draft en localStorage
    try {
      localStorage.setItem('hs_workout_active', JSON.stringify(draft));
    } catch (e) {
      console.warn('[RoutineGenerator] No se pudo guardar el draft:', e);
      return;
    }

    // Resetear el flag de inicialización del logger para que app.js re-cargue el draft
    var loggerRoot = document.getElementById('workout-logger-root');
    if (loggerRoot) loggerRoot.removeAttribute('data-initialized');

    // Navegar — usar el nav item para que app.js gestione la transición correctamente
    var navItem = document.querySelector('[data-section="workout"]');
    if (navItem) {
      navItem.click();
    } else {
      // Fallback seguro: sólo activar la sección destino sin tocar las demás vía style
      document.querySelectorAll('#main-content .section').forEach(function(s) {
        s.classList.remove('active');
      });
      var ws = document.getElementById('section-workout');
      if (ws) {
        ws.classList.add('active');
        // Re-init manual si el nav falló
        if (window.WorkoutLogger && loggerRoot) window.WorkoutLogger.init(loggerRoot);
      }
    }
  }

  return { init, InjuryManager };
})();
