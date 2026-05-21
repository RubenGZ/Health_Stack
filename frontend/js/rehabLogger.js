/**
 * rehabLogger.js — Cuestionario de Rehabilitación (3 pasos)
 *
 * Muestra un wizard de 3 pasos para capturar:
 *   1. Zona corporal afectada
 *   2. Tipo de lesión + nivel de dolor
 *   3. Tiempo desde la lesión + notas
 *
 * Llama a POST /api/v1/rehab/protocol y renderiza el protocolo resultante.
 * Freemium: los usuarios Free ven presets; Pro/Elite ven protocolos AI.
 *
 * AVISO LEGAL: Los protocolos son orientativos — no son prescripción médica.
 */

const RehabLogger = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || '/api/v1';

  // ── Protocolos locales (fallback offline) ─────────────────────────────────
  // Estructura: REHAB_PROTOCOLS[body_area][injury_type] → protocol object
  // Formato compatible con _renderResult (phases, red_flags, general_advice, disclaimer)
  const DISCLAIMER = 'Este protocolo es orientativo y no reemplaza la valoración de un fisioterapeuta o médico cualificado. Consulta a un profesional de salud antes de iniciar cualquier programa de rehabilitación.';

  function _makePhases(phase1Exs, phase2Exs, phase3Exs, notes) {
    return {
      phases: [
        {
          phase_name: 'Fase 1 — Control del dolor',
          duration_weeks: 2,
          goal: 'Reducir inflamación y dolor, restaurar rango de movimiento básico',
          precautions: notes ? [notes] : [],
          exercises: phase1Exs,
        },
        {
          phase_name: 'Fase 2 — Recuperación funcional',
          duration_weeks: 3,
          goal: 'Recuperar fuerza y control neuromuscular',
          precautions: [],
          exercises: phase2Exs,
        },
        ...(phase3Exs ? [{
          phase_name: 'Fase 3 — Retorno a la actividad',
          duration_weeks: 3,
          goal: 'Reintroducir cargas progresivas y gestos deportivos',
          precautions: [],
          exercises: phase3Exs,
        }] : []),
      ],
    };
  }

  function _ex(name, description, sets, reps, rest_seconds, freq, prog) {
    return { name, description, sets, reps, rest_seconds, frequency_per_week: freq, progression_note: prog };
  }

  const REHAB_PROTOCOLS = {
    shoulder: {
      tendinopathy: {
        title: 'Protocolo — Tendinopatía de Hombro',
        general_advice: 'Evita movimientos por encima de la cabeza las primeras 2 semanas. Aplica hielo 15 min tras los ejercicios.',
        red_flags: ['Dolor intenso o punzante en reposo', 'Incapacidad total para levantar el brazo', 'Hinchazón importante', 'Fiebre o enrojecimiento'],
        ..._makePhases(
          [
            _ex('Péndulos de Codman', 'Inclínate hacia delante, deja el brazo colgar y haz círculos pequeños con el peso del brazo', 1, '2 min', null, 2, null),
            _ex('Rotaciones externas con banda (0°)', 'Codo pegado al cuerpo, rota hacia afuera contra la banda', 3, '15 reps', 60, 2, 'Progresa cuando no hay dolor'),
            _ex('Encogimientos de hombros con pausa', 'Sube los hombros, mantén 2 s, baja lentamente', 3, '15 reps', 45, 3, null),
          ],
          [
            _ex('Face pulls con banda/polea', 'Lleva las manos hacia la cara separando los codos', 3, '15 reps', 60, 3, 'Aumenta resistencia progresivamente'),
            _ex('Elevaciones laterales con mancuerna ligera', 'Sube hasta 90°, baja en 3 s', 3, '12 reps', 60, 3, null),
            _ex('Remo en polea alta (agarre prono)', 'Lleva los codos hacia atrás y arriba', 3, '12 reps', 60, 3, null),
            _ex('Press overhead con banda ligera', 'Inicia con rango reducido si hay dolor', 3, '10 reps', 90, 2, 'Aumenta rango cuando no haya dolor'),
          ],
          [
            _ex('Press militar con mancuernas', 'Rango completo de movimiento, sin compensar con lumbar', 4, '10 reps', 90, 3, null),
            _ex('Pájaros con mancuernas', 'Inclinado hacia delante, abre los brazos', 3, '12 reps', 60, 3, null),
            _ex('Remo unilateral con mancuerna', 'Apoya rodilla y mano, tira del codo hacia el techo', 4, '10 reps', 60, 3, null),
          ],
          'Evita movimientos por encima de la cabeza las primeras 2 semanas'
        ),
      },
      muscle_strain: {
        title: 'Protocolo — Desgarro Muscular de Hombro',
        general_advice: 'Reposo relativo las primeras 72h. No fuerces el rango de movimiento con dolor.',
        red_flags: ['Pérdida completa de fuerza', 'Crepitación audible', 'Deformidad visible', 'Dolor que no mejora con reposo'],
        ..._makePhases(
          [
            _ex('PRICE (Protección, Reposo, Hielo, Compresión, Elevación)', 'Aplica durante las primeras 48-72h', null, null, null, null, null),
            _ex('Movilización suave en rango indoloro', 'Mueve el hombro solo dentro del rango sin dolor', 2, '10 reps', 60, 2, null),
          ],
          [
            _ex('Rotaciones externas isométricas', 'Empuja contra la pared sin movimiento, mantén 5 s', 3, '10 reps', 60, 3, null),
            _ex('Elevaciones frontales con mancuerna ligera', 'Sube hasta la horizontal, baja lentamente', 3, '12 reps', 60, 3, null),
            _ex('Remo con banda elástica', 'Codos pegados al cuerpo, tira hacia atrás', 3, '15 reps', 45, 3, null),
          ],
          null, null
        ),
      },
      general_pain: {
        title: 'Protocolo — Dolor Inespecífico de Hombro',
        general_advice: 'Identifica y elimina movimientos que reproduzcan el dolor. Trabaja la movilidad torácica.',
        red_flags: ['Dolor irradiado hacia el brazo o la mano', 'Debilidad súbita', 'Dolor nocturno intenso'],
        ..._makePhases(
          [
            _ex('Movilidad torácica en foam roller', 'Extiende la columna dorsal sobre el rodillo, 10 repeticiones lentas', 2, '10 reps', 45, 3, null),
            _ex('Péndulos de Codman', 'Círculos lentos con el peso del brazo', 2, '2 min', null, 3, null),
          ],
          [
            _ex('Rotaciones externas con banda', 'Codo a 90°, banda alrededor de la muñeca', 3, '15 reps', 60, 3, null),
            _ex('Face pulls', 'Lleva las manos hacia la cara', 3, '15 reps', 60, 3, null),
          ],
          null, null
        ),
      },
    },
    knee: {
      tendinopathy: {
        title: 'Protocolo — Tendinopatía Rotuliana',
        general_advice: 'Evita sentadillas profundas y saltos las primeras 2 semanas. El dolor durante el ejercicio no debe superar 3/10.',
        red_flags: ['Hinchazón súbita', 'Bloqueo de la rodilla', 'Dolor al subir escaleras que no mejora', 'Crujido con dolor intenso'],
        ..._makePhases(
          [
            _ex('Isométrico de cuádriceps en pared', 'Espalda contra la pared, rodilla a 60°, mantén 45 s', 4, '45 s', 120, 2, 'Base de la fase 1 — reduce dolor rápidamente'),
            _ex('Masaje con hielo post-ejercicio', 'Aplica hielo envuelto en tela 15 min', null, '15 min', null, 3, null),
          ],
          [
            _ex('Sentadilla isométrica en pared', 'Rodilla a 60-70°, mantén 30 s', 4, '30 s', 90, 3, 'Progresa a 90° cuando no haya dolor'),
            _ex('Curl femoral tumbado con banda', 'Dobla la rodilla contra resistencia', 3, '15 reps', 60, 3, null),
            _ex('Extensión de rodilla en rango corto (0-60°)', 'Solo el rango donde no hay dolor', 3, '12 reps', 60, 3, null),
          ],
          [
            _ex('Sentadilla búlgara', 'Pie trasero elevado, peso en pierna delantera', 4, '10 reps', 90, 3, null),
            _ex('Prensa de piernas a 0-80°', 'Rango limitado para proteger el tendón', 4, '10 reps', 90, 3, null),
            _ex('Step-ups con carga', 'Sube y baja del escalón controladamente', 3, '12 reps', 60, 3, null),
          ],
          null
        ),
      },
      joint_sprain: {
        title: 'Protocolo — Esguince de Rodilla',
        general_advice: 'Valora el grado del esguince con un médico. Grado III puede requerir cirugía. PRICE las primeras 72h.',
        red_flags: ['Inestabilidad marcada al caminar', 'Incapacidad para cargar peso', 'Hinchazón inmediata tras el traumatismo', 'Dolor intenso en reposo'],
        ..._makePhases(
          [
            _ex('PRICE', 'Protección, Reposo relativo, Hielo, Compresión, Elevación — 48-72h', null, null, null, null, null),
            _ex('Movilización activa en rango indoloro', 'Flexión/extensión suave de rodilla', 2, '10 reps', 60, 2, null),
          ],
          [
            _ex('Marcha sin cojear (si posible)', 'Progresa de bastón a marcha libre según tolerancia', null, '10 min', null, 5, null),
            _ex('Elevaciones de talón de pie', 'Sube de puntillas, baja lentamente', 3, '15 reps', 60, 3, null),
            _ex('Mini-sentadilla (0-45°)', 'Peso corporal, rango sin dolor', 3, '10 reps', 60, 3, null),
          ],
          null, null
        ),
      },
      general_pain: {
        title: 'Protocolo — Dolor Inespecífico de Rodilla',
        general_advice: 'Revisa el patrón de sentadilla: rodillas no deben colapsar hacia dentro. Trabaja el glúteo.',
        red_flags: ['Derrame articular', 'Bloqueo de la rodilla', 'Dolor nocturno'],
        ..._makePhases(
          [
            _ex('Movilidad de cadera (rotación interna/externa)', 'Tumbado boca arriba, rueda las rodillas de lado a lado', 2, '15 reps', 30, 3, null),
            _ex('Isométrico de cuádriceps', 'Contrae el cuádriceps con la pierna extendida, mantén 5 s', 3, '10 reps', 45, 3, null),
          ],
          [
            _ex('Puente de glúteos', 'Pies en el suelo, levanta la cadera, mantén 2 s arriba', 3, '15 reps', 60, 3, null),
            _ex('Curl femoral con banda', 'Dobla la rodilla contra resistencia acostado', 3, '15 reps', 60, 3, null),
            _ex('Sentadilla pared con pelota', 'Pelota entre las rodillas para activar aductores', 3, '12 reps', 60, 3, null),
          ],
          null, null
        ),
      },
    },
    lower_back: {
      overuse: {
        title: 'Protocolo — Sobrecarga Lumbar',
        general_advice: 'Evita flexión de columna bajo carga. Mantén la curva natural de la espalda al agacharte.',
        red_flags: ['Dolor irradiado a la pierna (ciática)', 'Incontinencia', 'Pérdida de fuerza en la pierna', 'Dolor que empeora en reposo'],
        ..._makePhases(
          [
            _ex('Respiración diafragmática', 'Tumbado, hincha el abdomen al inspirar y expulsa el aire lentamente', 2, '10 resp.', 30, 3, null),
            _ex('Posición fetal', 'Tumbado de lado, rodillas al pecho — estiramiento suave', 1, '3×30 s', null, 3, null),
            _ex('Movilidad de cadera en cuadrupedia', 'Círculos lentos con la cadera sin mover la columna', 2, '10 reps', 45, 3, null),
          ],
          [
            _ex('Puente de glúteos', 'Pies apoyados, eleva cadera manteniendo zona lumbar neutra', 3, '15 reps', 60, 3, null),
            _ex('Dead bug', 'Boca arriba, extiende brazo y pierna opuestos manteniendo zona lumbar pegada al suelo', 3, '8 reps/lado', 60, 3, null),
            _ex('Plancha abdominal', 'Mantén posición neutra sin hundir las caderas', 3, '20-30 s', 60, 3, 'Progresa 5 s por semana'),
          ],
          [
            _ex('Peso muerto rumano con mancuernas', 'Bisagra de cadera, espalda recta, rodillas ligeramente flexionadas', 4, '10 reps', 90, 3, null),
            _ex('Remo con mancuernas', 'Core activado durante todo el movimiento', 4, '10 reps', 90, 3, null),
          ],
          null
        ),
      },
      muscle_strain: {
        title: 'Protocolo — Desgarro/Contractura Lumbar',
        general_advice: 'Reposo relativo las primeras 48-72h. El calor suave (no hielo) puede ayudar a relajar el espasmo.',
        red_flags: ['Irradiación a la pierna', 'Incontinencia urinaria o fecal', 'Fiebre con dolor', 'Traumatismo reciente'],
        ..._makePhases(
          [
            _ex('Calor local', 'Manta eléctrica o botella caliente 20 min, 3× al día', null, '20 min', null, 3, null),
            _ex('Estiramiento de piriforme', 'Tumbado, cruza el tobillo sobre la rodilla opuesta, lleva la rodilla al pecho', 2, '3×30 s', null, 3, null),
          ],
          [
            _ex('Movilidad de columna (cat-cow)', 'En cuadrupedia, alterna flexión y extensión de columna', 2, '15 reps', 45, 3, null),
            _ex('Puente de glúteos con pausa', 'Mantén arriba 3 s', 3, '12 reps', 60, 3, null),
          ],
          null, null
        ),
      },
      general_pain: {
        title: 'Protocolo — Dolor Lumbar Inespecífico',
        general_advice: 'Mantente activo — el reposo prolongado empeora el dolor lumbar. Caminar es excelente medicina.',
        red_flags: ['Irradiación al pie', 'Pérdida de sensibilidad', 'Dolor nocturno que no cede'],
        ..._makePhases(
          [
            _ex('Caminata diaria', 'Empieza con 15-20 min y progresa gradualmente', null, '20 min', null, 5, null),
            _ex('Posición de McGill (rana)', 'Tumbado boca arriba, pies en el suelo, deja caer las rodillas hacia los lados', 1, '5 min', null, 3, null),
          ],
          [
            _ex('Dead bug', 'Core activado, columna pegada al suelo durante todo el ejercicio', 3, '8 reps/lado', 60, 3, null),
            _ex('Plancha abdominal', 'Posición neutra, sin hundir la cadera', 3, '20 s', 60, 3, 'Progresa 5 s por semana'),
            _ex('Puente de glúteos', 'Activa glúteo y core al subir', 3, '15 reps', 60, 3, null),
          ],
          null, null
        ),
      },
    },
    elbow: {
      tendinopathy: {
        title: 'Protocolo — Epicondilitis (Codo de Tenista / Golfista)',
        general_advice: 'Evita movimientos de agarre con la muñeca extendida. Usa codera si es necesario al cargar objetos.',
        red_flags: ['Dolor en reposo', 'Pérdida de fuerza de agarre súbita', 'Hinchazón importante del codo'],
        ..._makePhases(
          [
            _ex('Excéntrico de muñeca (extensores)', 'Mano en el borde de la mesa, palma abajo. Sube con ambas manos, baja solo con la afectada', 3, '15 reps', 60, 2, 'Lento en la fase excéntrica (3 s bajando)'),
            _ex('Masaje transverso profundo', 'Con el pulgar, masajea el epicóndilo lateral en dirección perpendicular al tendón — 5 min', 1, '5 min', null, 2, null),
          ],
          [
            _ex('Curl de muñeca con mancuerna ligera', 'Muñeca en supinación, rango completo', 3, '15 reps', 60, 3, null),
            _ex('Extensión de muñeca con mancuerna', 'Palma hacia abajo, extiende lentamente', 3, '12 reps', 60, 3, null),
            _ex('Rotación del antebrazo (pronación/supinación)', 'Con mancuerna ligera, rota el antebrazo', 3, '15 reps', 45, 3, null),
          ],
          null, null
        ),
      },
      general_pain: {
        title: 'Protocolo — Dolor Inespecífico de Codo',
        general_advice: 'Revisa la técnica de press banca y curl — el agarre excesivo o la extensión completa bajo carga son causas frecuentes.',
        red_flags: ['Entumecimiento en los dedos', 'Pérdida de fuerza súbita', 'Bloqueo articular'],
        ..._makePhases(
          [
            _ex('Estiramiento de antebrazo en extensión', 'Brazo extendido, mano empujada hacia abajo con la otra mano — 30 s', 2, '3×30 s', null, 3, null),
            _ex('Masaje con rodillo de espuma en antebrazo', 'Rueda suavemente sobre los extensores del antebrazo', 1, '2 min', null, 3, null),
          ],
          [
            _ex('Curl de bíceps con supinación', 'Rango completo, pausa arriba', 3, '12 reps', 60, 3, null),
            _ex('Extensión de tríceps con banda', 'Codo fijo, extiende completamente', 3, '15 reps', 60, 3, null),
          ],
          null, null
        ),
      },
    },
    wrist: {
      joint_sprain: {
        title: 'Protocolo — Esguince de Muñeca',
        general_advice: 'Usa muñequera de soporte las primeras 2 semanas. Evita cargar peso con la muñeca en extensión.',
        red_flags: ['Deformidad visible', 'Incapacidad de mover la muñeca', 'Dolor intenso al presionar el escafoides'],
        ..._makePhases(
          [
            _ex('PRICE', 'Protección, Reposo, Hielo 15 min cada 2h, Compresión, Elevación', null, null, null, null, null),
            _ex('Movilización pasiva suave', 'Con la otra mano, mueve lentamente la muñeca en todos los planos — sin dolor', 2, '10 reps', 45, 3, null),
          ],
          [
            _ex('Flexión/extensión activa de muñeca', 'Lento y controlado en rango sin dolor', 3, '15 reps', 45, 3, null),
            _ex('Agarre con pelota de espuma', 'Aprieta y suelta la pelota', 3, '20 reps', 30, 3, null),
          ],
          null, null
        ),
      },
      general_pain: {
        title: 'Protocolo — Dolor Inespecífico de Muñeca',
        general_advice: 'Revisa la posición de la muñeca en press y curl — evita la extensión excesiva bajo carga.',
        red_flags: ['Hormigueo en los dedos', 'Pérdida de sensibilidad', 'Dolor nocturno que interrumpe el sueño (puede ser túnel carpiano)'],
        ..._makePhases(
          [
            _ex('Estiramiento de flexores (prayer stretch)', 'Palmas juntas frente al pecho, baja las manos manteniendo las palmas unidas — 30 s', 2, '3×30 s', null, 3, null),
            _ex('Estiramiento de extensores', 'Brazo extendido, mano hacia abajo empujada con la otra — 30 s', 2, '3×30 s', null, 3, null),
          ],
          [
            _ex('Rotaciones de muñeca', 'Lentas, rango completo', 2, '15 reps/dir.', 30, 3, null),
            _ex('Curl de muñeca con mancuerna ligera', '1 kg o menos', 3, '15 reps', 45, 3, null),
          ],
          null, null
        ),
      },
    },
    hip: {
      general_pain: {
        title: 'Protocolo — Dolor de Cadera',
        general_advice: 'Trabaja la movilidad de la cadera en todos los planos. La rigidez torácica y de tobillo afecta a la cadera.',
        red_flags: ['Dolor irradiado a la pierna', 'Crepitación con dolor', 'Pérdida de rango de movimiento súbita'],
        ..._makePhases(
          [
            _ex('Movilidad de cadera en 90/90', 'Siéntate con ambas piernas a 90°, rota suavemente entre rotación interna y externa', 2, '10 reps/lado', 45, 3, null),
            _ex('Estiramiento de piriforme', 'Tumbado, cruza el tobillo sobre la rodilla, lleva la rodilla al pecho', 2, '3×30 s/lado', null, 3, null),
          ],
          [
            _ex('Puente de glúteos unilateral', 'Una pierna, mantén la cadera nivelada', 3, '12 reps/lado', 60, 3, null),
            _ex('Abducción de cadera con banda', 'De pie con banda en los tobillos, abre la pierna lateral', 3, '15 reps/lado', 45, 3, null),
            _ex('Hip thrust con mancuerna', 'Espalda en el banco, cadera al suelo y arriba', 4, '10 reps', 90, 3, null),
          ],
          null, null
        ),
      },
      overuse: {
        title: 'Protocolo — Sobrecarga de Cadera',
        general_advice: 'Reduce temporalmente el volumen de sentadillas y peso muerto. Prioriza el trabajo unilateral.',
        red_flags: ['Chasquido articular con dolor', 'Inflamación visible de la ingle', 'Dolor nocturno'],
        ..._makePhases(
          [
            _ex('Descanso relativo', 'Reduce a la mitad el volumen de entrenamiento de cadera', null, null, null, null, null),
            _ex('Movilidad suave de cadera', 'Círculos lentos, windshield wipers tumbado', 2, '10 reps', 45, 3, null),
          ],
          [
            _ex('Sentadilla goblet', 'Talones elevados si es necesario, profundidad cómoda', 3, '12 reps', 90, 3, null),
            _ex('Zancada inversa', 'Paso hacia atrás, rodilla delantera a 90°', 3, '10 reps/lado', 60, 3, null),
          ],
          null, null
        ),
      },
    },
    ankle: {
      joint_sprain: {
        title: 'Protocolo — Esguince de Tobillo',
        general_advice: 'PRICE las primeras 48-72h. El vendaje funcional acelera la recuperación. La movilización precoz es clave.',
        red_flags: ['Incapacidad de cargar peso', 'Deformidad visible', 'Dolor intenso en el peroné o maléolo', 'Hematoma extenso y rápido'],
        ..._makePhases(
          [
            _ex('PRICE', 'Protección, Reposo relativo, Hielo, Compresión, Elevación — 48h', null, null, null, null, null),
            _ex('Alfabeto con el pie', 'Dibuja las letras del alfabeto con el dedo gordo para movilizar el tobillo sin carga', 2, '1 vez', null, 3, null),
          ],
          [
            _ex('Elevaciones de talón de pie (bilateral)', 'Sube de puntillas, baja en 3 s', 3, '15 reps', 60, 3, null),
            _ex('Equilibrio monopodal', 'De pie sobre la pierna lesionada, sin apoyo — progresa cerrando los ojos', 3, '30 s', 60, 3, null),
            _ex('Movilidad de tobillo en cuadrupedia', 'Rodilla sobre el pie, empuja hacia delante sin levantar el talón', 3, '15 reps', 30, 3, null),
          ],
          null, null
        ),
      },
      general_pain: {
        title: 'Protocolo — Dolor Inespecífico de Tobillo',
        general_advice: 'Revisa el calzado. La pronación excesiva puede causar dolor difuso en tobillo y arco.',
        red_flags: ['Dolor súbito tras un giro', 'Hinchazón importante', 'Incapacidad de caminar sin cojear'],
        ..._makePhases(
          [
            _ex('Movilidad de tobillo en cuadrupedia', 'Desliza la rodilla hacia delante sobre el pie sin levantar el talón', 3, '15 reps', 30, 3, null),
          ],
          [
            _ex('Elevaciones de talón', 'Bilateral, luego unilateral', 3, '15 reps', 60, 3, null),
            _ex('Equilibrio monopodal', 'Progresa sobre superficie inestable', 3, '30 s', 60, 3, null),
          ],
          null, null
        ),
      },
    },
    neck: {
      general_pain: {
        title: 'Protocolo — Dolor Cervical Inespecífico',
        general_advice: 'Revisa la ergonomía de tu espacio de trabajo. La cabeza adelantada (text neck) es la causa más común.',
        red_flags: ['Irradiación al brazo o la mano', 'Mareos o vértigo', 'Pérdida de fuerza en el brazo', 'Dolor tras golpe en la cabeza'],
        ..._makePhases(
          [
            _ex('Retracción cervical (chin tuck)', 'Mete la barbilla hacia dentro sin mover la cabeza hacia arriba — 5 s, 10 reps', 3, '10 reps', 45, 3, null),
            _ex('Movilidad cervical suave', 'Flexión, extensión, rotaciones e inclinaciones en rango indoloro', 2, '10 reps/dir.', 30, 3, null),
          ],
          [
            _ex('Isométrico cervical (4 direcciones)', 'Empuja la cabeza contra la mano sin movimiento — 5 s cada dirección', 3, '8 reps', 60, 3, null),
            _ex('Face pulls con banda', 'Activa los rotadores externos del hombro y los retractores escapulares', 3, '15 reps', 60, 3, null),
            _ex('Remo con banda de pie', 'Codos hacia atrás, activa trapecio medio e inferior', 3, '15 reps', 45, 3, null),
          ],
          null, null
        ),
      },
      muscle_strain: {
        title: 'Protocolo — Contractura Cervical',
        general_advice: 'Calor suave en la zona contracturada 15-20 min. Evita el frío en contracturas musculares.',
        red_flags: ['Irradiación a brazo', 'Mareos', 'Pérdida de fuerza'],
        ..._makePhases(
          [
            _ex('Calor local', 'Manta eléctrica o bolsa de agua caliente 20 min', null, '20 min', null, 3, null),
            _ex('Estiramiento del trapecio superior', 'Inclina la cabeza a un lado, mano en el mismo lado tira suavemente — 30 s', 2, '3×30 s/lado', null, 3, null),
          ],
          [
            _ex('Retracción cervical', '10 repeticiones con pausa de 5 s', 3, '10 reps', 45, 3, null),
            _ex('Movilidad torácica en foam roller', 'Extiende la columna dorsal — reduce la tensión en el cuello', 2, '10 reps', 45, 3, null),
          ],
          null, null
        ),
      },
    },
    thoracic: {
      general_pain: {
        title: 'Protocolo — Dolor Dorsal (Zona Torácica)',
        general_advice: 'La rigidez torácica es extremadamente común en personas que trabajan sentadas. La movilidad torácica afecta directamente al hombro y al cuello.',
        red_flags: ['Dolor que empeora con la respiración', 'Irradiación al pecho o al abdomen', 'Fiebre con dolor de espalda'],
        ..._makePhases(
          [
            _ex('Extensión torácica en foam roller', 'Rueda el foam roller desde T4 a T9, 10 repeticiones lentas por segmento', 2, '10 reps', 60, 3, null),
            _ex('Rotación torácica en cuadrupedia', 'Mano detrás de la cabeza, rota el codo hacia el techo', 2, '10 reps/lado', 45, 3, null),
          ],
          [
            _ex('Remo con mancuerna', 'Énfasis en retracción escapular al final del movimiento', 4, '12 reps', 60, 3, null),
            _ex('Face pulls', 'Activa los retractores escapulares', 3, '15 reps', 60, 3, null),
            _ex('Superman (extensión lumbar y dorsal)', 'Tumbado boca abajo, eleva simultáneamente brazos y piernas', 3, '12 reps', 60, 3, null),
          ],
          null, null
        ),
      },
      overuse: {
        title: 'Protocolo — Sobrecarga Dorsal',
        general_advice: 'Frecuente en deportistas que hacen muchos remos y jalones. Reduce el volumen de jalón al pecho temporalmente.',
        red_flags: ['Dolor agudo al respirar', 'Asimetría visible de la espalda', 'Pérdida de fuerza unilateral'],
        ..._makePhases(
          [
            _ex('Foam roller torácico', 'Extensión suave en el rodillo', 2, '10 reps', 60, 3, null),
          ],
          [
            _ex('Extensión torácica activa', 'De rodillas con manos en el suelo, empuja el esternón hacia el suelo', 3, '10 reps', 60, 3, null),
            _ex('Remo TRX o en suspensión', 'Énfasis en retracción final', 3, '12 reps', 60, 3, null),
          ],
          null, null
        ),
      },
    },
  };

  // ── Obtener protocolo local según respuestas ──────────────────────────────
  function _getLocalProtocol(answers) {
    const area = answers.body_area || 'lower_back';
    const type = answers.injury_type || 'general_pain';
    const areaProtos = REHAB_PROTOCOLS[area] || REHAB_PROTOCOLS.lower_back;
    const proto = areaProtos[type] || areaProtos.general_pain || Object.values(areaProtos)[0];
    if (!proto) return null;

    const weeksSince = answers.weeks_since_injury || 1;
    const phase = weeksSince <= 2 ? 0 : weeksSince <= 6 ? 1 : 2;

    return {
      title: proto.title,
      phases: proto.phases.slice(phase > 0 ? phase - 1 : 0), // arranca desde la fase apropiada
      general_advice: proto.general_advice,
      red_flags: proto.red_flags || [],
      disclaimer: DISCLAIMER,
      is_ai_generated: false,
      tier: 'free',
    };
  }

  const BODY_AREAS = [
    { value: 'shoulder',    label: 'Hombro' },
    { value: 'elbow',       label: 'Codo' },
    { value: 'wrist',       label: 'Muñeca' },
    { value: 'lower_back',  label: 'Zona lumbar' },
    { value: 'hip',         label: 'Cadera' },
    { value: 'knee',        label: 'Rodilla' },
    { value: 'ankle',       label: 'Tobillo' },
    { value: 'neck',        label: 'Cuello' },
    { value: 'thoracic',    label: 'Zona dorsal' },
  ];

  const INJURY_TYPES = [
    { value: 'tendinopathy',  label: 'Tendinitis / tendinopatía' },
    { value: 'muscle_strain', label: 'Desgarro muscular' },
    { value: 'joint_sprain',  label: 'Esguince' },
    { value: 'overuse',       label: 'Sobrecarga' },
    { value: 'post_surgery',  label: 'Post-operatorio' },
    { value: 'general_pain',  label: 'Dolor inespecífico' },
  ];

  // ── Estado ────────────────────────────────────────────────────────────────
  let _currentStep = 0;
  let _answers = {};
  let _containerId = null;
  let _onResult = null;

  // ── Paso 1: zona corporal ──────────────────────────────────────────────────
  function _renderStep1(container) {
    container.innerHTML = `
      <div class="rehab-step">
        <div class="rehab-step-header">
          <h3 class="rehab-step-title">¿Qué zona te duele?</h3>
          <p class="rehab-step-sub">Selecciona la zona principal afectada.</p>
        </div>
        <div class="rehab-options rehab-options--grid3">
          ${BODY_AREAS.map(a => `
            <button class="rehab-chip${_answers.body_area === a.value ? ' selected' : ''}"
                    data-val="${a.value}" data-type="area">${a.label}</button>
          `).join('')}
        </div>
      </div>
    `;
    container.querySelectorAll('[data-type="area"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _answers.body_area = btn.dataset.val;
        container.querySelectorAll('[data-type="area"]')
          .forEach(b => b.classList.toggle('selected', b.dataset.val === btn.dataset.val));
      });
    });
  }

  // ── Paso 2: tipo de lesión + nivel de dolor ────────────────────────────────
  function _renderStep2(container) {
    container.innerHTML = `
      <div class="rehab-step">
        <div class="rehab-step-header">
          <h3 class="rehab-step-title">¿Qué tipo de lesión tienes?</h3>
          <p class="rehab-step-sub">Si no estás seguro, elige "Dolor inespecífico".</p>
        </div>
        <div class="rehab-options rehab-options--grid2">
          ${INJURY_TYPES.map(t => `
            <button class="rehab-chip${_answers.injury_type === t.value ? ' selected' : ''}"
                    data-val="${t.value}" data-type="injury">${t.label}</button>
          `).join('')}
        </div>
        <div class="rehab-pain-row">
          <label class="rehab-pain-label">
            Nivel de dolor actual
            <span class="rehab-pain-value" id="rehab-pain-display">${_answers.pain_level ?? 5}</span>/10
          </label>
          <input type="range" id="rehab-pain-slider" class="rehab-pain-slider"
                 min="1" max="10" step="1" value="${_answers.pain_level ?? 5}">
          <div class="rehab-pain-scale">
            <span>Sin dolor</span><span>Máximo</span>
          </div>
        </div>
      </div>
    `;
    container.querySelectorAll('[data-type="injury"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _answers.injury_type = btn.dataset.val;
        container.querySelectorAll('[data-type="injury"]')
          .forEach(b => b.classList.toggle('selected', b.dataset.val === btn.dataset.val));
      });
    });
    const slider = container.querySelector('#rehab-pain-slider');
    const display = container.querySelector('#rehab-pain-display');
    _answers.pain_level = parseInt(slider.value, 10);
    slider.addEventListener('input', () => {
      _answers.pain_level = parseInt(slider.value, 10);
      display.textContent = slider.value;
    });
  }

  // ── Paso 3: tiempo + notas ─────────────────────────────────────────────────
  function _renderStep3(container) {
    container.innerHTML = `
      <div class="rehab-step">
        <div class="rehab-step-header">
          <h3 class="rehab-step-title">¿Cuándo ocurrió?</h3>
          <p class="rehab-step-sub">Esto ayuda a adaptar el protocolo a tu fase de recuperación.</p>
        </div>
        <div class="rehab-field">
          <label class="rehab-field-label" for="rehab-weeks">Semanas desde la lesión</label>
          <div class="rehab-input-row">
            <input type="number" id="rehab-weeks" class="form-input rehab-input"
                   min="0" max="104" value="${_answers.weeks_since_injury ?? 1}" placeholder="1">
            <span class="rehab-input-unit">semanas</span>
          </div>
        </div>
        <div class="rehab-field">
          <label class="rehab-field-label" for="rehab-notes">
            Notas adicionales <span class="rehab-optional">(opcional)</span>
          </label>
          <textarea id="rehab-notes" class="form-input rehab-textarea"
                    rows="3" maxlength="500"
                    placeholder="Cirugía previa, tratamientos, limitaciones específicas...">${_answers.notes ?? ''}</textarea>
        </div>
        <div class="rehab-disclaimer-box">
          <svg class="rehab-disclaimer-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          El protocolo generado es orientativo. No reemplaza la valoración
          de un fisioterapeuta o médico cualificado.
        </div>
      </div>
    `;
    const weeksInput = container.querySelector('#rehab-weeks');
    const notesInput = container.querySelector('#rehab-notes');
    weeksInput.addEventListener('change', () => {
      _answers.weeks_since_injury = Math.max(0, parseInt(weeksInput.value, 10) || 0);
    });
    notesInput.addEventListener('input', () => {
      _answers.notes = notesInput.value.trim() || null;
    });
    _answers.weeks_since_injury = parseInt(weeksInput.value, 10) || 1;
  }

  // ── Validar paso actual ────────────────────────────────────────────────────
  function _validate() {
    if (_currentStep === 0 && !_answers.body_area) {
      _shake(); return false;
    }
    if (_currentStep === 1 && !_answers.injury_type) {
      _shake(); return false;
    }
    return true;
  }

  function _shake() {
    const container = document.getElementById(_containerId);
    const opts = container?.querySelector('.rehab-options');
    if (!opts) return;
    opts.classList.add('rehab-shake');
    setTimeout(() => opts.classList.remove('rehab-shake'), 500);
  }

  // ── Render del wizard ──────────────────────────────────────────────────────
  function _renderWizard(container) {
    container.innerHTML = `
      <div class="rehab-wizard">
        <div class="rehab-wizard-progress">
          <div class="rehab-wizard-bar">
            <div class="rehab-wizard-fill" id="rehab-prog-fill"
                 style="width: ${Math.round((_currentStep + 1) / 3 * 100)}%"></div>
          </div>
          <span class="rehab-wizard-label">Paso ${_currentStep + 1} de 3</span>
        </div>
        <div class="rehab-wizard-body" id="rehab-step-body"></div>
        <div class="rehab-wizard-footer">
          <button class="btn btn--ghost" id="rehab-prev-btn"
                  style="visibility: ${_currentStep === 0 ? 'hidden' : 'visible'}">
            ← Atrás
          </button>
          <button class="btn btn--primary" id="rehab-next-btn">
            ${_currentStep === 2 ? 'Generar protocolo' : 'Continuar →'}
          </button>
        </div>
      </div>
    `;

    const body = container.querySelector('#rehab-step-body');
    if (_currentStep === 0) _renderStep1(body);
    else if (_currentStep === 1) _renderStep2(body);
    else _renderStep3(body);

    container.querySelector('#rehab-prev-btn')?.addEventListener('click', () => {
      if (_currentStep > 0) { _currentStep--; _renderWizard(container); }
    });
    container.querySelector('#rehab-next-btn')?.addEventListener('click', async () => {
      if (!_validate()) return;
      if (_currentStep < 2) {
        _currentStep++;
        _renderWizard(container);
      } else {
        await _submit(container);
      }
    });
  }

  // ── Llamada a la API ───────────────────────────────────────────────────────
  async function _submit(container) {
    const btn = container.querySelector('#rehab-next-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

    const token = (typeof API !== 'undefined' && API.getToken?.())
      || localStorage.getItem('hs_access_token')
      || localStorage.getItem('access_token');

    const payload = {
      injury_type:         _answers.injury_type     || 'general_pain',
      body_area:           _answers.body_area        || 'lower_back',
      pain_level:          _answers.pain_level       ?? 5,
      weeks_since_injury:  _answers.weeks_since_injury ?? 1,
      notes:               _answers.notes            || null,
    };

    try {
      const res = await fetch(`${BASE}/rehab/protocol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        // FastAPI puede devolver detail como array de ValidationError
        let detail;
        if (Array.isArray(errBody.detail)) {
          detail = errBody.detail.map(e => e.msg || e.message || 'Error de validación').join(' · ');
        } else {
          detail = errBody.detail || errBody.message || `Error ${res.status}`;
        }
        throw new Error(detail);
      }

      const protocol = await res.json();
      _renderResult(container, protocol);
      if (typeof _onResult === 'function') _onResult(protocol);

    } catch (err) {
      // API no disponible (modo offline o backend sin módulo rehab) — usar protocolo local
      const localProtocol = _getLocalProtocol(_answers);
      if (localProtocol) {
        // Añadir nota informativa de que es un protocolo estándar local
        localProtocol.general_advice = (localProtocol.general_advice ? localProtocol.general_advice + ' ' : '')
          + '(Protocolo estándar — generado localmente sin conexión al servidor.)';
        _renderResult(container, localProtocol);
        if (typeof _onResult === 'function') _onResult(localProtocol);
      } else {
        const errMsg = (err && typeof err.message === 'string' && !err.message.includes('[object'))
          ? err.message
          : 'Error al conectar con el servidor. Inténtalo de nuevo.';
        container.innerHTML = `
          <div class="rehab-error">
            <p>No se pudo generar el protocolo: ${errMsg}</p>
            <button class="btn btn--ghost" id="rehab-retry-btn">Reintentar</button>
          </div>
        `;
        container.querySelector('#rehab-retry-btn')?.addEventListener('click', () => {
          _currentStep = 0;
          _renderWizard(container);
        });
      }
    }
  }

  // ── Render del resultado ───────────────────────────────────────────────────
  function _renderResult(container, protocol) {
    const tierBadge = protocol.is_ai_generated
      ? '<span class="rehab-badge rehab-badge--pro"><span class="rehab-badge-dot rehab-badge-dot--pro"></span>IA Personalizado</span>'
      : '<span class="rehab-badge rehab-badge--free"><span class="rehab-badge-dot rehab-badge-dot--free"></span>Protocolo Estándar</span>';

    const phases = protocol.phases || [];
    const phasesHtml = phases.map((phase, pi) => `
      <div class="rehab-phase">
        <div class="rehab-phase-header">
          <span class="rehab-phase-num">${pi + 1}</span>
          <div>
            <div class="rehab-phase-name">${phase.phase_name}</div>
            <div class="rehab-phase-meta">
              ${phase.duration_weeks} semana${phase.duration_weeks !== 1 ? 's' : ''} —
              ${phase.goal}
            </div>
          </div>
        </div>
        ${phase.precautions?.length ? `
          <div class="rehab-precautions">
            ${phase.precautions.map(p => `<div class="rehab-precaution">${p}</div>`).join('')}
          </div>` : ''}
        <div class="rehab-exercises">
          ${phase.exercises.map(ex => `
            <div class="rehab-exercise">
              <div class="rehab-exercise-name">${ex.name}</div>
              <div class="rehab-exercise-desc">${ex.description}</div>
              <div class="rehab-exercise-meta">
                ${ex.sets ? `${ex.sets} series` : ''}
                ${ex.sets && ex.reps ? ' × ' : ''}
                ${ex.reps ? ex.reps : ''}
                ${ex.rest_seconds ? ` · ${ex.rest_seconds}s descanso` : ''}
                ${ex.frequency_per_week ? ` · ${ex.frequency_per_week}×/semana` : ''}
              </div>
              ${ex.progression_note ? `
                <div class="rehab-progression">${ex.progression_note}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const redFlagsHtml = protocol.red_flags?.length ? `
      <div class="rehab-red-flags">
        <div class="rehab-red-flags-title">Consulta médica urgente si:</div>
        ${protocol.red_flags.map(f => `<div class="rehab-red-flag">${f}</div>`).join('')}
      </div>` : '';

    container.innerHTML = `
      <div class="rehab-result">
        <div class="rehab-result-header">
          <div class="rehab-result-title-row">
            <h3 class="rehab-result-title">${protocol.title}</h3>
            ${tierBadge}
          </div>
          <p class="rehab-result-meta">
            ${phases.length} fase${phases.length !== 1 ? 's' : ''} ·
            ${phases.reduce((a, p) => a + (p.duration_weeks || 0), 0)} semanas totales
          </p>
        </div>

        <div class="rehab-phases">${phasesHtml}</div>

        ${protocol.general_advice ? `
          <div class="rehab-advice">
            <svg class="rehab-advice-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p>${protocol.general_advice}</p>
          </div>` : ''}

        ${redFlagsHtml}

        <div class="rehab-legal-disclaimer">
          ${protocol.disclaimer}
        </div>

        <div class="rehab-result-footer">
          <button class="btn btn--ghost btn--sm" id="rehab-restart-btn">
            ← Nuevo protocolo
          </button>
          ${!protocol.is_ai_generated && protocol.tier === 'free' ? `
            <div class="rehab-upgrade-hint">
              <strong>Pro</strong>: genera protocolos personalizados con IA para tu perfil y historial.
            </div>` : ''}
        </div>
      </div>
    `;

    container.querySelector('#rehab-restart-btn')?.addEventListener('click', () => {
      _currentStep = 0;
      _answers = {};
      _renderWizard(container);
    });
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /**
   * Monta el widget de rehabilitación en un contenedor HTML.
   *
   * @param {string|HTMLElement} target  - ID del contenedor o el elemento directamente.
   * @param {object}             opts    - Opciones: { onResult(protocol) }
   */
  function mount(target, opts = {}) {
    const container = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!container) {
      console.error('[RehabLogger] Contenedor no encontrado:', target);
      return;
    }
    _containerId = container.id;
    _onResult    = opts.onResult || null;
    _currentStep = 0;
    _answers     = {};
    _renderWizard(container);
  }

  /**
   * Muestra los presets disponibles en un contenedor.
   * Útil para mostrar un listado en la sección de rehab.
   */
  async function renderPresetList(target) {
    const container = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!container) return;

    container.innerHTML = '<div class="rehab-loading">Cargando protocolos…</div>';
    try {
      const res = await fetch(`${BASE}/rehab/presets`);
      const presets = await res.json();

      if (!presets.length) {
        container.innerHTML = '<p class="rehab-empty">No hay protocolos disponibles.</p>';
        return;
      }

      container.innerHTML = `
        <div class="rehab-preset-list">
          ${presets.map(p => `
            <div class="rehab-preset-card">
              <div class="rehab-preset-title">${p.title}</div>
              <div class="rehab-preset-meta">
                ${p.phases_count} fases · ${p.total_weeks} semanas
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch {
      container.innerHTML = '<p class="rehab-empty">Error al cargar protocolos.</p>';
    }
  }

  return { mount, renderPresetList };
})();

// Exponer globalmente para uso desde el HTML
if (typeof window !== 'undefined') {
  window.RehabLogger = RehabLogger;
}
