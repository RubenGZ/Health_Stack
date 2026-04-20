/* ============================================================
   config.js — Configuración de afiliados, suplementos e ingredientes

   INSTRUCCIONES PARA MONETIZACIÓN:
   1. Sustituye los valores AFFILIATE_* con tus URLs reales de afiliado
      (Amazon Associates, MyProtein, HSN, etc.)
   2. Los suplementos e ingredientes se cargan desde este fichero
      cuando la API no está disponible (modo offline/standalone).
   3. Las donaciones se configuran con DONATION_URL y BUYMECOFFEE_URL.
   ============================================================ */

window.HS_CONFIG = (function () {
  'use strict';

  // ── URLs de afiliado ───────────────────────────────────────────────────────
  // Sustituye con tus URLs reales. Ejemplo Amazon Associates:
  // https://www.amazon.es/dp/B07XYZ?tag=TU_TAG-21
  const AFFILIATE_LINKS = {
    AFFILIATE_WHEY:       'https://www.amazon.es/s?k=proteina+whey&tag=healthstackpro-21',
    AFFILIATE_CREATINE:   'https://www.amazon.es/s?k=creatina+monohidrato&tag=healthstackpro-21',
    AFFILIATE_CAFFEINE:   'https://www.amazon.es/s?k=cafeina+200mg+capsulas&tag=healthstackpro-21',
    AFFILIATE_OMEGA3:     'https://www.amazon.es/s?k=omega+3+EPA+DHA&tag=healthstackpro-21',
    AFFILIATE_VITAMIND:   'https://www.amazon.es/s?k=vitamina+D3+K2&tag=healthstackpro-21',
    AFFILIATE_MAGNESIUM:  'https://www.amazon.es/s?k=magnesio+bisglicinato&tag=healthstackpro-21',
    AFFILIATE_BETAALANINE:'https://www.amazon.es/s?k=beta+alanina&tag=healthstackpro-21',
    AFFILIATE_ZINC:       'https://www.amazon.es/s?k=zinc+gluconato&tag=healthstackpro-21',
  };

  // ── Donaciones y apoyo ─────────────────────────────────────────────────────
  const DONATION_LINKS = {
    PAYPAL:       'https://www.paypal.me/healthstackpro',
    BUYMECOFFEE:  'https://www.buymeacoffee.com/healthstack',
  };

  // ── Patrocinador (banner no intrusivo en footer) ───────────────────────────
  const SPONSOR = {
    name:    'MyProtein',
    tagline: 'Nutrición deportiva de calidad',
    url:     'https://www.myprotein.es/?affil=healthstackpro',
    logo:    '💪',   // Sustituir por <img> si se dispone de logo
    active:  true,   // false = oculta el banner
  };

  // ── Datos de suplementos (fallback si la API no responde) ──────────────────
  const SUPPLEMENTS = [
    {
      id: 1, sort_order: 1,
      name: 'Proteína Whey',
      dose: '20-40 g',
      timing: 'Post-entreno',
      level: 'essential',
      icon_emoji: '🥛',
      evidence_level: 'high',
      affiliate_link_placeholder: 'AFFILIATE_WHEY',
      description: 'La proteína de suero tiene el perfil de aminoácidos más completo y la mayor concentración de leucina (activador principal del mTOR). Resultados: +25-35% de fuerza y mayor volumen posible. Tómala los días que entrenes. Versión vegana: mezcla arroz + guisante.',
    },
    {
      id: 2, sort_order: 2,
      name: 'Creatina Monohidrato',
      dose: '3-5 g',
      timing: 'Cualquier hora (diario)',
      level: 'essential',
      icon_emoji: '⚡',
      evidence_level: 'high',
      affiliate_link_placeholder: 'AFFILIATE_CREATINE',
      description: 'El suplemento más estudiado de la historia del deporte. Mejora la potencia, la resistencia y la recuperación muscular. Resultado: +8-15% de fuerza. Tómala todos los días. No necesitas fase de carga.',
    },
    {
      id: 3, sort_order: 3,
      name: 'Cafeína',
      dose: '3-6 mg/kg',
      timing: '30-60 min antes del entreno',
      level: 'essential',
      icon_emoji: '☕',
      evidence_level: 'high',
      affiliate_link_placeholder: 'AFFILIATE_CAFFEINE',
      description: 'El estimulante más estudiado del mundo. Mejora la fuerza, la resistencia y reduce la percepción del esfuerzo. Para 70 kg: 200-400 mg. Evita tolerancia: úsala 3-4 días/semana.',
    },
    {
      id: 4, sort_order: 4,
      name: 'Omega-3 (EPA+DHA)',
      dose: '2-3 g EPA+DHA',
      timing: 'Con las comidas',
      level: 'optional',
      icon_emoji: '🐟',
      evidence_level: 'high',
      affiliate_link_placeholder: 'AFFILIATE_OMEGA3',
      description: 'Antiinflamatorio potente que mejora la recuperación muscular, la salud cardiovascular y la función cognitiva. Especialmente relevante si no consumes pescado azul 3+ veces por semana.',
    },
    {
      id: 5, sort_order: 5,
      name: 'Vitamina D3 + K2',
      dose: '2000-4000 UI D3',
      timing: 'Con la comida principal',
      level: 'optional',
      icon_emoji: '☀️',
      evidence_level: 'medium',
      affiliate_link_placeholder: 'AFFILIATE_VITAMIND',
      description: 'El 80% de la población tiene déficit en invierno. La D3 optimiza la testosterona, la función inmune y la densidad ósea. Tomar con K2 (100-200 mcg MK-7) para correcta distribución del calcio.',
    },
    {
      id: 6, sort_order: 6,
      name: 'Magnesio Bisglicinato',
      dose: '300-400 mg',
      timing: 'Antes de dormir',
      level: 'optional',
      icon_emoji: '🌙',
      evidence_level: 'medium',
      affiliate_link_placeholder: 'AFFILIATE_MAGNESIUM',
      description: 'Participa en más de 300 reacciones enzimáticas. Forma bisglicinato: mejor biodisponibilidad sin malestar digestivo. Mejora el sueño, reduce calambres musculares y optimiza la función nerviosa.',
    },
    {
      id: 7, sort_order: 7,
      name: 'Beta-Alanina',
      dose: '3.2-6.4 g',
      timing: 'Pre-entreno',
      level: 'optional',
      icon_emoji: '🔥',
      evidence_level: 'medium',
      affiliate_link_placeholder: 'AFFILIATE_BETAALANINE',
      description: 'Precursor de carnosina intramuscular, que actúa como tampón del ácido láctico en ejercicios de 1-4 minutos. Produce hormigueo (parestesia) inofensivo. Más efectiva en HIIT y circuitos.',
    },
    {
      id: 8, sort_order: 8,
      name: 'Zinc',
      dose: '15-30 mg',
      timing: 'Con la cena (lejos del calcio)',
      level: 'optional',
      icon_emoji: '💊',
      evidence_level: 'medium',
      affiliate_link_placeholder: 'AFFILIATE_ZINC',
      description: 'Interviene directamente en la síntesis de testosterona y GH. Los deportistas de fuerza tienen mayor riesgo de déficit. Tomar lejos de suplementos cálcicos. No superar 40 mg/día.',
    },
  ];

  // ── Datos de ingredientes (fallback si la API no responde) ─────────────────
  // Macros expresados por 100 g de producto
  const INGREDIENTS = [
    // Proteínas alta calidad
    { id:1,  name:'Pechuga de pollo',        category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:31.0, carbs:0.0,  fat:3.6,   calories:165, inflammation_base:'low' },
    { id:2,  name:'Pechuga de pavo',         category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:29.0, carbs:0.0,  fat:2.5,   calories:135, inflammation_base:'low' },
    { id:3,  name:'Salmón',                  category:'protein_high',   quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:25.0, carbs:0.0,  fat:13.0,  calories:208, inflammation_base:'low' },
    { id:4,  name:'Atún en agua',            category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:26.0, carbs:0.0,  fat:1.0,   calories:116, inflammation_base:'low' },
    { id:5,  name:'Clara de huevo',          category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:11.0, carbs:0.7,  fat:0.2,   calories:52,  inflammation_base:'low' },
    { id:6,  name:'Huevo entero',            category:'protein_high',   quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:13.0, carbs:1.1,  fat:11.0,  calories:155, inflammation_base:'low' },
    { id:7,  name:'Ternera magra',           category:'protein_high',   quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:26.0, carbs:0.0,  fat:9.0,   calories:189, inflammation_base:'medium' },
    { id:8,  name:'Merluza',                 category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:17.0, carbs:0.0,  fat:1.3,   calories:82,  inflammation_base:'low' },
    { id:9,  name:'Proteína Whey en polvo',  category:'protein_high',   quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:75.0, carbs:8.0,  fat:4.0,   calories:370, inflammation_base:'low' },
    { id:10, name:'Requesón',                category:'protein_medium', quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:14.0, carbs:3.3,  fat:4.0,   calories:105, inflammation_base:'low' },
    { id:11, name:'Yogur griego 0%',         category:'protein_medium', quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:10.0, carbs:4.0,  fat:0.4,   calories:59,  inflammation_base:'low' },
    { id:12, name:'Tofu firme',              category:'protein_medium', quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:8.0,  carbs:1.9,  fat:4.8,   calories:76,  inflammation_base:'low' },
    { id:13, name:'Tempeh',                  category:'protein_medium', quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:19.0, carbs:9.0,  fat:11.0,  calories:193, inflammation_base:'low' },
    // Carbohidratos
    { id:14, name:'Avena',                   category:'carb_high',      quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:13.0, carbs:67.0, fat:7.0,   calories:379, inflammation_base:'low' },
    { id:15, name:'Arroz integral',          category:'carb_high',      quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:2.7,  carbs:23.0, fat:0.9,   calories:111, inflammation_base:'low' },
    { id:16, name:'Arroz blanco (cocido)',   category:'carb_high',      quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:2.7,  carbs:28.0, fat:0.3,   calories:130, inflammation_base:'low' },
    { id:17, name:'Quinoa (cocida)',         category:'carb_high',      quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:4.4,  carbs:21.0, fat:1.9,   calories:120, inflammation_base:'low' },
    { id:18, name:'Patata (cocida)',         category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:2.0,  carbs:17.0, fat:0.1,   calories:77,  inflammation_base:'low' },
    { id:19, name:'Boniato',                 category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:1.6,  carbs:20.0, fat:0.1,   calories:86,  inflammation_base:'low' },
    { id:20, name:'Plátano',                 category:'carb_high',      quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.1,  carbs:23.0, fat:0.3,   calories:89,  inflammation_base:'low' },
    { id:21, name:'Pan integral',            category:'carb_medium',    quality:'medium', calorie_density:'medium', satiety_index:'medium', protein:9.0,  carbs:41.0, fat:3.0,   calories:247, inflammation_base:'low' },
    { id:22, name:'Pasta integral (cocida)', category:'carb_high',      quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:5.3,  carbs:25.0, fat:0.9,   calories:124, inflammation_base:'low' },
    { id:23, name:'Garbanzos (cocidos)',     category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:8.9,  carbs:27.0, fat:2.6,   calories:164, inflammation_base:'low' },
    { id:24, name:'Lentejas (cocidas)',      category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:9.0,  carbs:20.0, fat:0.4,   calories:116, inflammation_base:'low' },
    // Grasas saludables
    { id:25, name:'Aguacate',               category:'fat_medium',     quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:2.0,  carbs:9.0,  fat:15.0,  calories:160, inflammation_base:'low' },
    { id:26, name:'Aceite de oliva AOVE',   category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'low',    protein:0.0,  carbs:0.0,  fat:100.0, calories:884, inflammation_base:'low' },
    { id:27, name:'Nueces',                 category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:15.0, carbs:14.0, fat:65.0,  calories:654, inflammation_base:'low' },
    { id:28, name:'Almendras',              category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:21.0, carbs:22.0, fat:50.0,  calories:579, inflammation_base:'low' },
    { id:29, name:'Mantequilla cacahuete',  category:'fat_high',       quality:'medium', calorie_density:'high',   satiety_index:'high',   protein:25.0, carbs:20.0, fat:50.0,  calories:598, inflammation_base:'low' },
    // Verduras y micronutrientes
    { id:30, name:'Espinacas',              category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:2.9,  carbs:3.6,  fat:0.4,   calories:23,  inflammation_base:'low' },
    { id:31, name:'Brócoli',                category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:2.8,  carbs:7.0,  fat:0.4,   calories:34,  inflammation_base:'low' },
    { id:32, name:'Zanahoria',              category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.9,  carbs:10.0, fat:0.2,   calories:41,  inflammation_base:'low' },
    { id:33, name:'Frutos rojos (mix)',     category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.7,  carbs:14.0, fat:0.3,   calories:57,  inflammation_base:'low' },
    { id:34, name:'Leche entera',           category:'mixed',          quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:3.2,  carbs:4.8,  fat:3.5,   calories:61,  inflammation_base:'low' },
    { id:35, name:'Leche desnatada',        category:'protein_medium', quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:3.5,  carbs:5.0,  fat:0.1,   calories:34,  inflammation_base:'low' },
    // Más proteínas de calidad
    { id:36, name:'Sardinas al natural',    category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:24.0, carbs:0.0,  fat:3.0,   calories:127, inflammation_base:'low' },
    { id:37, name:'Bacalao',                category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:20.0, carbs:0.0,  fat:0.7,   calories:82,  inflammation_base:'low' },
    { id:38, name:'Gambas / Langostinos',   category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:24.0, carbs:0.0,  fat:1.0,   calories:99,  inflammation_base:'low' },
    { id:39, name:'Pavo picado (magro)',    category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:22.0, carbs:0.0,  fat:8.0,   calories:163, inflammation_base:'low' },
    { id:40, name:'Edamame (cocido)',       category:'protein_medium', quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:11.0, carbs:8.5,  fat:5.2,   calories:122, inflammation_base:'low' },
    { id:41, name:'Queso cottage',         category:'protein_medium', quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:11.0, carbs:3.4,  fat:4.3,   calories:98,  inflammation_base:'low' },
    { id:42, name:'Lomo de cerdo magro',   category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:22.0, carbs:0.0,  fat:6.0,   calories:143, inflammation_base:'low' },
    { id:43, name:'Calamar / Pota',        category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:18.0, carbs:3.0,  fat:1.5,   calories:92,  inflammation_base:'low' },
    // Frutas
    { id:44, name:'Manzana',               category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.3,  carbs:14.0, fat:0.2,   calories:52,  inflammation_base:'low' },
    { id:45, name:'Naranja',               category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.9,  carbs:12.0, fat:0.1,   calories:47,  inflammation_base:'low' },
    { id:46, name:'Fresas',                category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.8,  carbs:7.7,  fat:0.3,   calories:32,  inflammation_base:'low' },
    { id:47, name:'Arándanos',             category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.7,  carbs:14.0, fat:0.3,   calories:57,  inflammation_base:'low' },
    { id:48, name:'Mango',                 category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.8,  carbs:15.0, fat:0.4,   calories:60,  inflammation_base:'low' },
    { id:49, name:'Kiwi',                  category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.1,  carbs:15.0, fat:0.5,   calories:61,  inflammation_base:'low' },
    { id:50, name:'Uvas',                  category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.7,  carbs:17.0, fat:0.2,   calories:67,  inflammation_base:'low' },
    { id:51, name:'Pera',                  category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.4,  carbs:15.0, fat:0.1,   calories:57,  inflammation_base:'low' },
    { id:52, name:'Sandía',                category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.6,  carbs:7.6,  fat:0.2,   calories:30,  inflammation_base:'low' },
    { id:53, name:'Cereza',                category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.0,  carbs:16.0, fat:0.3,   calories:63,  inflammation_base:'low' },
    { id:54, name:'Piña',                  category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.5,  carbs:13.0, fat:0.1,   calories:50,  inflammation_base:'low' },
    { id:55, name:'Melocotón',             category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.9,  carbs:10.0, fat:0.3,   calories:39,  inflammation_base:'low' },
    // Verduras
    { id:56, name:'Tomate',                category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.9,  carbs:3.9,  fat:0.2,   calories:18,  inflammation_base:'low' },
    { id:57, name:'Pimiento rojo',         category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.0,  carbs:6.0,  fat:0.3,   calories:31,  inflammation_base:'low' },
    { id:58, name:'Pimiento verde',        category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.9,  carbs:4.6,  fat:0.2,   calories:20,  inflammation_base:'low' },
    { id:59, name:'Pepino',                category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.7,  carbs:3.6,  fat:0.1,   calories:15,  inflammation_base:'low' },
    { id:60, name:'Lechuga romana',        category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.2,  carbs:3.3,  fat:0.3,   calories:17,  inflammation_base:'low' },
    { id:61, name:'Kale (col rizada)',     category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:4.3,  carbs:9.0,  fat:0.9,   calories:49,  inflammation_base:'low' },
    { id:62, name:'Champiñones',           category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:3.1,  carbs:3.3,  fat:0.3,   calories:22,  inflammation_base:'low' },
    { id:63, name:'Cebolla',               category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.1,  carbs:9.3,  fat:0.1,   calories:40,  inflammation_base:'low' },
    { id:64, name:'Calabacín',             category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.2,  carbs:3.1,  fat:0.3,   calories:17,  inflammation_base:'low' },
    { id:65, name:'Berenjena',             category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.0,  carbs:6.0,  fat:0.2,   calories:25,  inflammation_base:'low' },
    { id:66, name:'Coliflor',              category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.9,  carbs:5.0,  fat:0.3,   calories:25,  inflammation_base:'low' },
    { id:67, name:'Coles de Bruselas',     category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:3.4,  carbs:9.0,  fat:0.3,   calories:43,  inflammation_base:'low' },
    // Snacks saludables
    { id:68, name:'Chocolate negro 85%',   category:'mixed',          quality:'high',   calorie_density:'high',   satiety_index:'medium', protein:11.5, carbs:13.0, fat:43.0,  calories:501, inflammation_base:'low' },
    { id:69, name:'Hummus',                category:'mixed',          quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:8.0,  carbs:14.0, fat:9.0,   calories:166, inflammation_base:'low' },
    { id:70, name:'Galletas de avena',     category:'carb_medium',    quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:6.0,  carbs:64.0, fat:10.0,  calories:370, inflammation_base:'low' },
    { id:71, name:'Barrita proteica',      category:'mixed',          quality:'medium', calorie_density:'medium', satiety_index:'medium', protein:20.0, carbs:30.0, fat:10.0,  calories:290, inflammation_base:'low' },
    { id:72, name:'Mix frutos secos',      category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:12.0, carbs:16.0, fat:52.0,  calories:571, inflammation_base:'low' },
    { id:73, name:'Tortas de arroz',       category:'carb_medium',    quality:'medium', calorie_density:'medium', satiety_index:'low',    protein:7.0,  carbs:80.0, fat:1.0,   calories:381, inflammation_base:'low' },
    { id:74, name:'Palomitas (sin grasa)', category:'carb_medium',    quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:3.5,  carbs:74.0, fat:4.0,   calories:375, inflammation_base:'low' },
    // Grasas de calidad
    { id:75, name:'Semillas de chía',      category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:16.5, carbs:42.1, fat:30.7,  calories:486, inflammation_base:'low' },
    { id:76, name:'Semillas de lino',      category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:18.3, carbs:28.9, fat:42.2,  calories:534, inflammation_base:'low' },
    { id:77, name:'Tahini (pasta sésamo)', category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'medium', protein:17.0, carbs:21.0, fat:54.0,  calories:595, inflammation_base:'low' },
    { id:78, name:'Mantequilla almendra',  category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:21.0, carbs:20.0, fat:56.0,  calories:634, inflammation_base:'low' },
    { id:79, name:'Semillas de girasol',   category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:20.8, carbs:20.0, fat:51.0,  calories:584, inflammation_base:'low' },
    { id:80, name:'Pistachos',             category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:20.2, carbs:27.5, fat:45.4,  calories:562, inflammation_base:'low' },
    { id:81, name:'Semillas de calabaza',  category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:30.2, carbs:10.7, fat:49.1,  calories:559, inflammation_base:'low' },
    { id:82, name:'Aceite de coco virgen', category:'fat_high',       quality:'medium', calorie_density:'high',   satiety_index:'low',    protein:0.0,  carbs:0.0,  fat:100.0, calories:862, inflammation_base:'low' },
    // Proteínas fitness adicionales
    { id:83,  name:'Caseína en polvo',          category:'protein_high',   quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:82.0, carbs:4.0,  fat:1.0,   calories:355, inflammation_base:'low' },
    { id:84,  name:'Proteína vegana (guisante)', category:'protein_high',  quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:77.0, carbs:6.0,  fat:3.0,   calories:363, inflammation_base:'low' },
    { id:85,  name:'Seitán',                    category:'protein_high',   quality:'medium', calorie_density:'medium', satiety_index:'high',   protein:25.0, carbs:14.0, fat:2.0,   calories:185, inflammation_base:'low' },
    { id:86,  name:'Soja texturizada (TVP)',    category:'protein_high',   quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:51.0, carbs:30.0, fat:3.4,   calories:334, inflammation_base:'low' },
    { id:87,  name:'Kéfir natural',             category:'protein_medium', quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:3.5,  carbs:4.5,  fat:3.5,   calories:63,  inflammation_base:'low' },
    { id:88,  name:'Trucha',                    category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:20.0, carbs:0.0,  fat:6.5,   calories:141, inflammation_base:'low' },
    { id:89,  name:'Lubina / Dorada',           category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:18.4, carbs:0.0,  fat:2.0,   calories:97,  inflammation_base:'low' },
    { id:90,  name:'Mejillones (cocidos)',       category:'protein_high',   quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:18.0, carbs:7.0,  fat:2.0,   calories:121, inflammation_base:'low' },
    { id:91,  name:'Queso parmesano',           category:'protein_high',   quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:38.0, carbs:0.0,  fat:26.0,  calories:392, inflammation_base:'low' },
    // Carbohidratos fitness adicionales
    { id:92,  name:'Pan de centeno integral',   category:'carb_medium',    quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:8.5,  carbs:48.0, fat:2.6,   calories:259, inflammation_base:'low' },
    { id:93,  name:'Pasta de legumbre',         category:'carb_high',      quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:22.0, carbs:58.0, fat:4.0,   calories:350, inflammation_base:'low' },
    { id:94,  name:'Cuscús (cocido)',           category:'carb_high',      quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:3.8,  carbs:23.0, fat:0.2,   calories:112, inflammation_base:'low' },
    { id:95,  name:'Remolacha (cocida)',        category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.7,  carbs:10.0, fat:0.2,   calories:44,  inflammation_base:'low' },
    { id:96,  name:'Maíz dulce (cocido)',       category:'carb_medium',    quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:3.3,  carbs:19.0, fat:1.4,   calories:96,  inflammation_base:'low' },
    { id:97,  name:'Dátiles',                  category:'carb_high',      quality:'high',   calorie_density:'high',   satiety_index:'medium', protein:2.5,  carbs:75.0, fat:0.4,   calories:282, inflammation_base:'low' },
    // Especiales fitness
    { id:98,  name:'Aceite MCT',               category:'fat_high',       quality:'high',   calorie_density:'high',   satiety_index:'low',    protein:0.0,  carbs:0.0,  fat:100.0, calories:884, inflammation_base:'low' },
    { id:99,  name:'Cacao puro en polvo',      category:'mixed',          quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:19.6, carbs:57.9, fat:13.7,  calories:228, inflammation_base:'low' },
    { id:100, name:'Rúcula',                   category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:2.6,  carbs:3.7,  fat:0.7,   calories:25,  inflammation_base:'low' },
    { id:101, name:'Miso (pasta fermentada)',  category:'mixed',          quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:11.0, carbs:25.0, fat:3.0,   calories:182, inflammation_base:'low' },
    { id:102, name:'Miel pura',                category:'carb_high',      quality:'medium', calorie_density:'high',   satiety_index:'low',    protein:0.3,  carbs:82.0, fat:0.0,   calories:304, inflammation_base:'low' },
    // Legumbres adicionales
    { id:103, name:'Judías blancas (cocidas)', category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:9.0,  carbs:23.0, fat:0.5,   calories:139, inflammation_base:'low' },
    { id:104, name:'Judías negras (cocidas)',  category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:8.9,  carbs:23.7, fat:0.5,   calories:132, inflammation_base:'low' },
    { id:105, name:'Guisantes (cocidos)',      category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:5.0,  carbs:14.0, fat:0.4,   calories:81,  inflammation_base:'low' },
    { id:106, name:'Habas verdes (cocidas)',   category:'mixed',          quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:7.6,  carbs:19.0, fat:0.4,   calories:110, inflammation_base:'low' },
    // Proteínas animales premium
    { id:107, name:'Pechuga de pato (s/piel)', category:'protein_high',  quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:23.5, carbs:0.0,  fat:5.9,   calories:148, inflammation_base:'low' },
    { id:108, name:'Conejo',                   category:'protein_high',  quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:21.0, carbs:0.0,  fat:5.0,   calories:136, inflammation_base:'low' },
    { id:109, name:'Anchoas (aceite, esc.)',   category:'protein_high',  quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:29.0, carbs:0.0,  fat:10.0,  calories:210, inflammation_base:'low' },
    { id:110, name:'Boquerón fresco',          category:'protein_high',  quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:20.4, carbs:0.0,  fat:4.8,   calories:122, inflammation_base:'low' },
    { id:111, name:'Ternera picada 95%',       category:'protein_high',  quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:21.0, carbs:0.0,  fat:7.0,   calories:152, inflammation_base:'medium' },
    { id:112, name:'Jamón serrano (magro)',    category:'protein_high',  quality:'high',   calorie_density:'medium', satiety_index:'high',   protein:30.0, carbs:0.0,  fat:8.0,   calories:196, inflammation_base:'low' },
    { id:113, name:'Vieiras (cocidas)',        category:'protein_high',  quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:17.0, carbs:3.2,  fat:0.8,   calories:88,  inflammation_base:'low' },
    // Cereales y granos adicionales
    { id:114, name:'Trigo sarraceno (cocido)', category:'carb_high',     quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:3.4,  carbs:19.9, fat:0.6,   calories:92,  inflammation_base:'low' },
    { id:115, name:'Amaranto (cocido)',        category:'carb_high',     quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:3.8,  carbs:18.7, fat:1.6,   calories:102, inflammation_base:'low' },
    { id:116, name:'Teff (cocido)',            category:'carb_high',     quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:3.9,  carbs:22.5, fat:0.7,   calories:101, inflammation_base:'low' },
    { id:117, name:'Espaguetis (cocidos)',     category:'carb_high',     quality:'medium', calorie_density:'low',    satiety_index:'medium', protein:5.8,  carbs:30.9, fat:0.9,   calories:157, inflammation_base:'low' },
    { id:118, name:'Tortita de maíz (wrap)',  category:'carb_medium',   quality:'medium', calorie_density:'medium', satiety_index:'medium', protein:7.3,  carbs:55.0, fat:4.5,   calories:291, inflammation_base:'low' },
    // Frutas adicionales
    { id:119, name:'Pomelo',                  category:'carb_medium',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.8,  carbs:11.0, fat:0.2,   calories:42,  inflammation_base:'low' },
    { id:120, name:'Papaya',                  category:'carb_medium',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.5,  carbs:11.0, fat:0.3,   calories:43,  inflammation_base:'low' },
    { id:121, name:'Mandarina',               category:'carb_medium',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.8,  carbs:13.0, fat:0.3,   calories:53,  inflammation_base:'low' },
    { id:122, name:'Granada (semillas)',      category:'carb_medium',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.7,  carbs:19.0, fat:1.2,   calories:83,  inflammation_base:'low' },
    { id:123, name:'Frambuesas',              category:'carb_medium',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.2,  carbs:12.0, fat:0.7,   calories:52,  inflammation_base:'low' },
    { id:124, name:'Moras',                   category:'carb_medium',   quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.4,  carbs:10.0, fat:0.5,   calories:43,  inflammation_base:'low' },
    // Lácteos y bebidas vegetales
    { id:125, name:'Leche de avena',          category:'carb_medium',   quality:'medium', calorie_density:'low',    satiety_index:'low',    protein:1.0,  carbs:6.5,  fat:1.5,   calories:45,  inflammation_base:'low' },
    { id:126, name:'Bebida de soja s/azúcar', category:'protein_medium',quality:'high',   calorie_density:'low',    satiety_index:'low',    protein:3.3,  carbs:1.2,  fat:1.8,   calories:36,  inflammation_base:'low' },
    { id:127, name:'Queso fresco batido 0%',  category:'protein_medium',quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:8.0,  carbs:3.6,  fat:0.1,   calories:48,  inflammation_base:'low' },
    { id:128, name:'Yogur natural entero',    category:'protein_medium',quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:3.5,  carbs:4.7,  fat:3.3,   calories:61,  inflammation_base:'low' },
    // Superfoods y potenciadores
    { id:129, name:'Espirulina en polvo',     category:'protein_high',  quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:57.5, carbs:23.9, fat:7.7,   calories:290, inflammation_base:'low' },
    { id:130, name:'Levadura nutricional',    category:'protein_high',  quality:'high',   calorie_density:'medium', satiety_index:'medium', protein:50.0, carbs:31.0, fat:8.0,   calories:325, inflammation_base:'low' },
    { id:131, name:'Semillas de sésamo',      category:'fat_high',      quality:'high',   calorie_density:'high',   satiety_index:'medium', protein:17.7, carbs:23.4, fat:49.7,  calories:573, inflammation_base:'low' },
    { id:132, name:'Anacardos',               category:'fat_high',      quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:18.2, carbs:30.2, fat:43.9,  calories:553, inflammation_base:'low' },
    { id:133, name:'Avellanas',               category:'fat_high',      quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:14.1, carbs:16.7, fat:60.8,  calories:628, inflammation_base:'low' },
    // Verduras adicionales
    { id:134, name:'Espárragos',              category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:2.2,  carbs:3.9,  fat:0.1,   calories:20,  inflammation_base:'low' },
    { id:135, name:'Alcachofa (cocida)',      category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'high',   protein:3.3,  carbs:10.5, fat:0.2,   calories:53,  inflammation_base:'low' },
    { id:136, name:'Puerro',                  category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.5,  carbs:14.2, fat:0.3,   calories:61,  inflammation_base:'low' },
    { id:137, name:'Apio',                    category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:0.7,  carbs:3.0,  fat:0.2,   calories:14,  inflammation_base:'low' },
    { id:138, name:'Col lombarda',            category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.4,  carbs:7.4,  fat:0.2,   calories:31,  inflammation_base:'low' },
    { id:139, name:'Berros',                  category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:2.3,  carbs:1.3,  fat:0.1,   calories:11,  inflammation_base:'low' },
    { id:140, name:'Bok choy',                category:'mixed',         quality:'high',   calorie_density:'low',    satiety_index:'medium', protein:1.5,  carbs:2.2,  fat:0.2,   calories:13,  inflammation_base:'low' },
    // Grasas premium
    { id:141, name:'Aceite de aguacate',      category:'fat_high',      quality:'high',   calorie_density:'high',   satiety_index:'low',    protein:0.0,  carbs:0.0,  fat:100.0, calories:884, inflammation_base:'low' },
    { id:142, name:'Crema de cacahuete 100%', category:'fat_high',      quality:'high',   calorie_density:'high',   satiety_index:'high',   protein:25.8, carbs:21.5, fat:50.4,  calories:614, inflammation_base:'low' },
  ];

  // ── API de nutrición (info de macros FitSciPro) ────────────────────────────
  const MACRO_INFO = {
    protein: {
      icon: '🥩',
      title: 'PROTEÍNA',
      range: '2 – 2.4 g/kg · PESO CORPORAL',
      color: '#ff4757',
      description: 'El macronutriente más importante para la hipertrofia. Aporta los aminoácidos que construyen y reparan el tejido muscular. Fuentes de alta biodisponibilidad: pollo, pavo, ternera magra, huevos, pescado, lácteos, whey.',
      details: {
        volumen: '2 g/kg',
        definicion: '2.2–2.4 g/kg para preservar masa magra durante el déficit calórico.',
      },
    },
    carbs: {
      icon: '🌾',
      title: 'CARBOHIDRATOS',
      range: '3 – 6 g/kg · SEGÚN OBJETIVO',
      color: '#2196F3',
      description: 'El combustible principal para los entrenamientos de alta intensidad. El glucógeno muscular determina el rendimiento. No los elimines si quieres progresar en el gimnasio.',
      details: {
        volumen: '5–6 g/kg (superávit calórico)',
        definicion: '2–3 g/kg, priorizando el timing periéntreno.',
      },
    },
    fats: {
      icon: '🥑',
      title: 'GRASAS',
      range: '0.8 – 1.2 g/kg · PESO CORPORAL',
      color: '#f59e0b',
      description: 'Imprescindibles para la producción hormonal (testosterona, estrógenos), absorción de vitaminas liposolubles (A, D, E, K) y función cognitiva. Las grasas dietéticas NO se convierten directamente en grasa corporal — el exceso calórico total sí. Prioriza grasas insaturadas (omega-3, omega-9) y limita las saturadas y trans.',
      details: {
        volumen: '1.0–1.2 g/kg. No elimines las grasas para meter más hidratos; bajar de 0.7 g/kg reduce la testosterona y el rendimiento.',
        definicion: '0.8–1.0 g/kg. Recorta primero los hidratos, luego las grasas. Mantén omega-3 (salmón, sardinas, nueces) para preservar músculo.',
      },
    },
  };

  // ── Timing de nutrientes ───────────────────────────────────────────────────
  const TIMING_INFO = {
    pre: {
      title: 'VENTANA PRE-ENTRENO',
      slots: [
        {
          time: '2-3 h antes',
          label: 'COMIDA PRINCIPAL',
          color: '#ff4757',
          items: [
            'Comida completa: HC complejo + proteína moderada + poca grasa',
            'Objetivo: maximizar glucógeno y aminoácidos disponibles',
            'Ejemplos: pollo + arroz, pasta + atún',
          ],
        },
        {
          time: '30-45 min antes',
          label: 'SNACK',
          color: '#f59e0b',
          items: [
            'En ayunas no es necesario, pero en sesiones largas puede ayudar',
            '50-60 g de carbohidratos de rápida absorción + proteína opcional',
            'Ejemplos: plátano + scoop de whey, arroz inflado + batido',
          ],
        },
      ],
    },
    post: {
      title: 'POST-ENTRENO',
      slots: [
        {
          time: 'Dentro de 60 min',
          label: 'VENTANA ANABÓLICA',
          color: '#00d2ff',
          items: [
            'La síntesis proteica se eleva 24-48 h post-entreno; no solo la primera hora',
            'Proteína + CH en proporción 1:1 o 1:2 es óptimo',
            'Ejemplos: whey + plátano, arroz + pollo, batido de recuperación',
          ],
        },
      ],
    },
    principles: [
      'Proteína distribuida: Come 30-40 g de proteína cada 3-5 horas. Esto maximiza la síntesis proteica muscular durante todo el día.',
      'CH antes de entrenar: El superávit (volumen) > déficit (definición) es más importante que el timing aislado. Sin esto, nada funciona.',
      'CH al entrenar: Son tus aliados en volumen. Solo en pocas situaciones se recomienda limitar durante el entrenamiento.',
      'Hidratación: Mínimo 35 ml/kg. Por cada 1% de deshidratación el rendimiento baja un 2-5%.',
      'No temas los carbohidratos: La insulina no es el enemigo. Es un potente agente anabólico. Lo que importa es el balance calórico total.',
    ],
  };

  // ── Función pública: resolver placeholder de afiliado ─────────────────────
  function resolveAffiliateLink(placeholder) {
    if (!placeholder) return '#';
    const key = placeholder.replace(/[{}]/g, '');
    return AFFILIATE_LINKS[key] || '#';
  }

  // ── API pública ────────────────────────────────────────────────────────────
  return {
    AFFILIATE_LINKS,
    DONATION_LINKS,
    SPONSOR,
    SUPPLEMENTS,
    INGREDIENTS,
    MACRO_INFO,
    TIMING_INFO,
    resolveAffiliateLink,
  };
})();
