/* ============================================================
   chatbot.js — Asistente conversacional con respuestas por keywords
   25+ temas de fitness, nutrición y uso de la app
   ============================================================ */

const Chatbot = (function () {
  'use strict';

  // ── Base de conocimiento ──────────────────────────────────
  const KB = [
    {
      keys: ['proteína', 'proteinas', 'cuanta proteina', 'cuanto proteina'],
      ans:  '💪 La recomendación científica para maximizar la síntesis muscular es **1.6-2.2 g de proteína por kg de peso corporal**. Si estás en déficit calórico o eres avanzado, sube hasta 2.4 g/kg. Fuentes de élite: pechuga de pollo, claras, atún, requesón y proteína whey.',
    },
    {
      keys: ['tdee', 'calorías', 'calorias', 'cuantas calorias', 'gasto calórico'],
      ans:  '🔥 El TDEE (Total Daily Energy Expenditure) es el total de calorías que quemas al día incluyendo actividad. Lo calculo con la fórmula Mifflin-St Jeor. Ve a **Nutrición → Calculadora TDEE** e introduce tus datos para obtener tu número exacto.',
    },
    {
      keys: ['perder grasa', 'adelgazar', 'déficit', 'deficit', 'bajar de peso'],
      ans:  '📉 Para perder grasa de forma sostenible necesitas un déficit calórico de **250-500 kcal/día** (0.25-0.5 kg/semana). Prioriza proteína alta (2 g/kg), entrena con pesas para preservar músculo y mantén 7-8 h de sueño. El cardio es el cerecillo, no la base.',
    },
    {
      keys: ['ganar músculo', 'volumen', 'hipertrofia', 'masa muscular'],
      ans:  '💪 Para hipertrofia necesitas: 1) Superávit moderado (+200-300 kcal), 2) Proteína 1.8-2.2 g/kg, 3) Sobrecarga progresiva (más peso/reps cada semana), 4) Sueño 7-9 h. El músculo se construye en el descanso, no en el gym.',
    },
    {
      keys: ['imc', 'índice de masa corporal', 'indice masa'],
      ans:  '📊 El IMC = peso(kg) / talla²(m). Rangos OMS: <18.5 (bajo peso), 18.5-24.9 (normal), 25-29.9 (sobrepeso), ≥30 (obesidad). Recuerda que el IMC no distingue músculo de grasa — un atleta puede tener IMC "sobrepeso" con excelente composición corporal.',
    },
    {
      keys: ['creatina', 'suplemento', 'suplementos'],
      ans:  '💊 La creatina monohidrato es el suplemento más respaldado por la ciencia (+200 estudios). Dosis: 3-5 g/día sin necesidad de carga. Beneficios: +fuerza, +volumen muscular, +recuperación. El momento de ingesta no importa mucho — lo importante es la consistencia diaria.',
    },
    {
      keys: ['ayuno intermitente', 'ayuno', 'intermitente', 'fasting'],
      ans:  '⏰ El ayuno intermitente (16:8, 18:6) funciona porque facilita el déficit calórico reduciendo la ventana de ingesta. No tiene magia metabólica extra comparado con otras estrategias de déficit. Si te resulta cómodo y sostenible, ¡adelante!',
    },
    {
      keys: ['cardio', 'hiit', 'correr', 'aeróbico', 'aerobico'],
      ans:  '🏃 Para composición corporal: HIIT 2-3x/semana (20 min) es tan efectivo como 40 min de cardio moderado. El cardio excesivo puede interferir con la recuperación del entrenamiento de fuerza. Prioriza pesas + déficit calórico + cardio moderado como complemento.',
    },
    {
      keys: ['descanso', 'recuperación', 'sueño', 'dormir'],
      ans:  '😴 El sueño es el anabolizante legal más potente. Durante el sueño profundo se segrega el 70% de la hormona del crecimiento. 7-9 horas es lo óptimo. Con <6 h de sueño, puedes perder hasta un 40% más de músculo en déficit calórico.',
    },
    {
      keys: ['sentadilla', 'squat', 'técnica sentadilla'],
      ans:  '🏋 Técnica de sentadilla: pies a la anchura de hombros, puntas ligeramente hacia afuera, barra sobre trapecios (high bar) o deltoides posteriores (low bar). Baja hasta paralelo o más. Rodillas siguen la dirección de los pies. Espalda neutra durante todo el movimiento.',
    },
    {
      keys: ['peso muerto', 'deadlift', 'técnica peso muerto'],
      ans:  '⚡ Peso muerto: barra sobre mediados del pie, agarre ligeramente fuera de las piernas. Tira la barra "hacia arriba y hacia ti" activando el dorsal. Caderas y hombros suben al mismo ritmo. El back redondo es el error más común — mantén la lordosis lumbar.',
    },
    {
      keys: ['dominadas', 'pull-up', 'pullup'],
      ans:  '🔝 Para aprender dominadas: 1) Trabaja jalón al pecho con peso moderado, 2) Practica dominadas negativas (baja lento 3-5 seg), 3) Usa goma elástica como asistencia, 4) Haz dead hangs para fortalecer el agarre. En 6-8 semanas de práctica constante lograrás tu primera dominada.',
    },
    {
      keys: ['cuántas series', 'volumen de entrenamiento', 'cuantas series'],
      ans:  '📋 Volumen semanal recomendado por grupo muscular: Principiante 8-10 series, Intermedio 12-16 series, Avanzado 16-22 series. Distribuye entre 2 sesiones mínimo por grupo. Más no siempre es mejor — la calidad supera a la cantidad.',
    },
    {
      keys: ['dolor muscular', 'agujetas', 'doms'],
      ans:  '💡 Las agujetas (DOMS) aparecen 24-48 h después del ejercicio y no indican el éxito del entrenamiento. Si siempre tienes agujetas severas, probablemente estás sobrepasando tu capacidad de recuperación. La ausencia de agujetas NO significa entrenamiento ineficaz.',
    },
    {
      keys: ['agua', 'hidratación', 'cuánta agua', 'cuanta agua'],
      ans:  '💧 Hidratación deportiva: 35-40 ml/kg de peso corporal al día. Añade 500-750 ml por hora de ejercicio intenso. Una orina amarillo claro indica hidratación óptima. El agua facilita todas las reacciones metabólicas — es el nutriente más subestimado.',
    },
    {
      keys: ['carbohidratos', 'hidratos', 'carbs', 'azúcar'],
      ans:  '🌾 Los carbohidratos son el combustible principal del ejercicio intenso. No son el enemigo. Prioriza fuentes de índice glucémico bajo-medio (avena, arroz integral, boniato) en general y GI alto (arroz blanco, fruta) post-entreno para recuperación rápida.',
    },
    {
      keys: ['grasa', 'grasas', 'omega', 'aguacate', 'aceite'],
      ans:  '🥑 Las grasas saludables (omega-3, monoinsaturadas) son esenciales para las hormonas, absorción de vitaminas liposolubles y salud cardiovascular. Mínimo 20-25% de las calorías de grasas de calidad: AOVE, aguacate, nueces, pescado azul. Las grasas saturadas en moderación.',
    },
    {
      keys: ['lesión', 'lesion', 'dolor', 'tendinitis'],
      ans:  '⚠️ Si sientes dolor articular agudo, para el ejercicio y consulta a un fisioterapeuta o médico. No confundas dolor muscular (normal) con dolor articular/tendinoso (señal de alarma). La mayoría de lesiones vienen de aumentar el volumen/intensidad demasiado rápido (>10% por semana).',
    },
    {
      keys: ['motivación', 'motivacion', 'no tengo ganas', 'pereza'],
      ans:  '🔥 La motivación es inconsistente — lo que funciona es el **hábito**. Haz que la barrera de inicio sea mínima: ropa de entrenamiento lista la noche anterior, gym cerca de casa o trabajo, horario fijo. Empieza con 2 días/semana y sé consistente durante 8 semanas. Después ya no lo cuestionarás.',
    },
    {
      keys: ['cuánto tiempo', 'cuanto tiempo', 'ver resultados', 'cuando veré'],
      ans:  '⏳ Expectativas realistas: Fuerza notable en 4-6 semanas. Cambios estéticos visibles en 8-12 semanas. Transformación significativa en 6-12 meses. Los primeros meses las ganancias son neurales (coordinación) antes que hipertróficas. La consistencia es la clave.',
    },
    {
      keys: ['registrar peso', 'añadir peso', 'como registro'],
      ans:  '⚖️ Ve a la sección **Peso** desde el menú lateral. Pulsa "Añadir registro", introduce la fecha, tu peso y notas opcionales. Pésate siempre en las mismas condiciones (por la mañana, en ayunas, después de orinar) para datos consistentes.',
    },
    {
      keys: ['rutina', 'generar rutina', 'plan de entrenamiento'],
      ans:  '🗓 Ve a **Rutinas** en el menú lateral. Responde el cuestionario de 7 pasos (días disponibles, nivel, objetivo, lesiones...) y el generador creará tu plan semanal personalizado con ejercicios, series y repeticiones.',
    },
    {
      keys: ['planner', 'plan de comidas', 'dieta semanal'],
      ans:  '📅 El **Planner de comidas** te permite arrastrar recetas desde el panel izquierdo hasta el calendario semanal. Tenemos 25 recetas con macros calculados. Las calorías y macros totales de la semana se suman automáticamente en el gráfico inferior.',
    },
    {
      keys: ['hola', 'buenos días', 'buenas tardes', 'saludos', 'hey'],
      ans:  '👋 ¡Hola! Soy el asistente de HealthStack Pro. Puedo ayudarte con nutrición, entrenamiento, técnica de ejercicios, suplementación y cómo usar la app. ¿En qué puedo ayudarte hoy?',
    },
    {
      keys: ['gracias', 'perfecto', 'genial', 'ok gracias'],
      ans:  '😊 ¡De nada! Si tienes más preguntas sobre fitness o nutrición, aquí estaré. ¡A entrenar!',
    },
    {
      keys: ['xp', 'puntos', 'nivel', 'gamificación', 'gamificacion', 'badge', 'logro'],
      ans:  '🏆 El sistema de gamificación premia tu actividad con XP: +50 XP por registro de peso, +100 XP por calcular tu TDEE, +150 XP por generar una rutina. Sube de Novato a Leyenda y desbloquea badges. Ve a la sección **Gamificación** para ver tus logros y desafíos semanales.',
    },
  ];

  // ── Temas adicionales ─────────────────────────────────────
  const KB_EXTRA = [
    {
      keys: ['colesterol', 'trigliceridos', 'hdl', 'ldl'],
      ans: '🩺 El ejercicio de fuerza + cardio moderado mejora el perfil lipídico en 8-12 semanas. Aumenta el HDL ("bueno") y reduce triglicéridos. Dieta: reduce ultraprocesados y azúcares simples; aumenta omega-3, fibra y grasas monoinsaturadas (AOVE, aguacate).',
    },
    {
      keys: ['flexibilidad', 'estiramientos', 'movilidad', 'yoga'],
      ans: '🧘 La flexibilidad y movilidad reducen lesiones y mejoran el rendimiento. Estiramientos dinámicos ANTES de entrenar (10 min), estáticos DESPUÉS (20-30 seg por grupo). El yoga 1-2x/semana puede mejorar la movilidad de caderas y hombros significativamente en 6-8 semanas.',
    },
    {
      keys: ['masa grasa', 'porcentaje grasa', 'grasa corporal', 'body fat'],
      ans: '📏 El % de grasa corporal importa más que el peso. Referencia general: Hombres atléticos 10-20%, Mujeres atléticas 18-28%. Métodos prácticos: plicometría (más preciso), báscula de bioimpedancia (orientativo) o simplemente el espejo + fotos de progreso cada 4 semanas.',
    },
    {
      keys: ['alcohol', 'beber', 'cerveza', 'vino'],
      ans: '🍺 El alcohol inhibe la síntesis proteica hasta 24h después de consumirlo y reduce los niveles de testosterona. Si entrenas en serio, máximo 1-2 bebidas ocasionales. El alcohol tiene 7 kcal/g y no aporta nutrientes — calorías vacías que dificultan composición corporal.',
    },
    {
      keys: ['estreñimiento', 'digestión', 'fibra', 'intestino'],
      ans: '🌿 Para digestión óptima: 25-35 g de fibra al día (verduras, frutas, legumbres, cereales integrales). Bebe 35-40 ml/kg de agua. Los probióticos (yogur, kéfir, chucrut) mejoran la microbiota. Si entrenas con alta proteína, aumenta la fibra para mantener tránsito intestinal.',
    },
    {
      keys: ['calambres', 'calambre', 'contractura'],
      ans: '⚡ Los calambres durante el ejercicio suelen deberse a deshidratación + déficit de electrolitos (sodio, magnesio, potasio). Solución: hidratación adecuada, 300-400 mg de magnesio bisglicinato antes de dormir, plátano post-entreno. Si son frecuentes en reposo, consulta con un médico.',
    },
    {
      keys: ['mi peso', 'cuanto peso', 'mi progreso', 'como voy'],
      ans: () => {
        const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
        if (!entries.length) return '⚖️ Aún no tienes registros de peso. Ve a la sección **Peso** para empezar a trackear tu progreso.';
        const last = entries[entries.length - 1];
        const xp   = typeof Gamification !== 'undefined' ? Gamification.getState().xp : 0;
        const lv   = typeof Gamification !== 'undefined' ? Gamification.getLevel(xp) : { name: 'Novato' };
        return `📊 Tu último registro es **${last.weight} kg** (${last.date}). Llevas **${entries.length} registros** en total y estás en nivel **${lv.icon || ''} ${lv.name}** con **${xp} XP**. ¡Sigue así!`;
      },
    },
    {
      keys: ['cuantos dias', 'frecuencia entreno', 'dias entrenar', 'cuantas veces'],
      ans: '📅 Para principiantes: **3 días/semana** de cuerpo completo es suficiente para progresar. Para intermedios: **4 días** con rutina dividida (PPL o torso/pierna). Para avanzados: **5-6 días** con splits más específicos. El descanso es tan importante como el entrenamiento.',
    },
  ];

  const FALLBACKS = [
    '🤔 Interesante pregunta. Para responderte con precisión necesitaría más contexto. Puedo ayudarte con: nutrición, macros, ejercicios, técnica, suplementación o cómo usar la app.',
    '💡 No tengo respuesta exacta para eso, pero puedes preguntarme sobre proteínas, calorías, rutinas, ejercicios concretos, pérdida de grasa o ganancia muscular.',
    '🏋 Aún estoy aprendiendo ese tema. Mientras tanto, prueba a preguntarme algo como "¿cuánta proteína necesito?" o "¿cómo hago sentadillas correctamente?".',
  ];

  const SUGGESTIONS_POOL = [
    '¿Cuánta proteína necesito?',
    '¿Cómo pierdo grasa?',
    '¿Qué es el TDEE?',
    '¿Cuántas series debo hacer?',
    '¿La creatina funciona?',
    '¿Qué hago ante una lesión?',
    '¿Cómo genero mi rutina?',
    '¿Cómo uso el planner?',
    '¿Cómo voy con mi progreso?',
    '¿Cuántos días debo entrenar?',
  ];

  let fallbackIdx = 0;

  // ── Buscar respuesta ──────────────────────────────────────
  function getResponse(text) {
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const lower = norm(text);

    // Buscar primero en KB principal, luego en KB_EXTRA
    for (const entry of [...KB, ...KB_EXTRA]) {
      if (entry.keys.some(k => lower.includes(norm(k)))) {
        // La respuesta puede ser una función (para respuestas contextuales)
        return typeof entry.ans === 'function' ? entry.ans() : entry.ans;
      }
    }
    const fb = FALLBACKS[fallbackIdx % FALLBACKS.length];
    fallbackIdx++;
    return fb;
  }

  // ── Añadir mensaje al DOM ─────────────────────────────────
  function addMessage(text, isBot) {
    const msgs = document.getElementById('chatbot-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg--${isBot ? 'bot' : 'user'}`;
    // Soporte básico de **negrita**
    const formatted = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = `<div class="chat-bubble">${formatted}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addTypingIndicator() {
    const msgs = document.getElementById('chatbot-messages');
    if (!msgs) return null;
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--bot chat-typing';
    div.innerHTML = '<div class="chat-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  // ── Enviar mensaje ────────────────────────────────────────
  function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMessage(trimmed, false);

    const input = document.getElementById('chatbot-input');
    if (input) input.value = '';

    const typing = addTypingIndicator();
    setTimeout(() => {
      if (typing) typing.remove();
      addMessage(getResponse(trimmed), true);
      renderSuggestions();
    }, 600 + Math.random() * 400);
  }

  // ── Sugerencias ───────────────────────────────────────────
  function renderSuggestions() {
    const wrap = document.getElementById('chatbot-suggestions');
    if (!wrap) return;
    const shuffled = [...SUGGESTIONS_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    wrap.innerHTML = shuffled.map(s => `<button class="chat-suggestion">${s}</button>`).join('');
    wrap.querySelectorAll('.chat-suggestion').forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.textContent));
    });
  }

  // ── Toggle panel ──────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById('chatbot-panel');
    const badge = document.getElementById('chatbot-badge');
    if (!panel) return;
    const open = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = open ? 'flex' : 'none';
    if (open && badge) badge.style.display = 'none';
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    document.getElementById('chatbot-btn')?.addEventListener('click', togglePanel);
    document.getElementById('chatbot-close')?.addEventListener('click', togglePanel);

    const sendBtn = document.getElementById('chatbot-send');
    const inputEl = document.getElementById('chatbot-input');

    sendBtn?.addEventListener('click', () => sendMessage(inputEl?.value || ''));
    inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendMessage(inputEl.value);
    });

    renderSuggestions();

    // Notificación inicial sutil
    setTimeout(() => {
      const badge = document.getElementById('chatbot-badge');
      if (badge) { badge.style.display = ''; badge.textContent = '1'; }
    }, 3000);
  }

  return { init };
})();
