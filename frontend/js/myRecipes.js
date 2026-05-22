/* ============================================================
   myRecipes.js — Creador y gestión de recetas personalizadas
   Ingredientes desde HS_CONFIG.INGREDIENTS (142 opciones).
   Cálculo de macros en tiempo real. Persistencia localStorage.
   Las recetas se integran en el Planner via evento 'hs:recipes-updated'.
   ============================================================ */

const MyRecipes = (function () {
  'use strict';

  const LS_KEY = 'hs_my_recipes';
  const LS_NEXT_ID = 'hs_my_recipes_next_id';
  const MAX_CUSTOM_RECIPES = 5; // Tier gratuito

  // ── Estado ─────────────────────────────────────────────────────────────────
  let recipes = [];      // {id, name, category, ingredients, instructions, rating, kcal, p, c, f, inf}
  let selectedIngredients = []; // [{id, name, grams, ...macros}]
  let editingId = null;
  let searchQuery = '';
  let catFilter = 'all';
  // Estado recetas nutricionista
  let nutCatFilter = 'all';
  let nutSearchQuery = '';

  const CATS = [
    { id: 'all',      label: 'Todas' },
    { id: 'desayuno', label: 'Desayuno' },
    { id: 'almuerzo', label: 'Almuerzo' },
    { id: 'cena',     label: 'Cena' },
    { id: 'snack',    label: 'Snack' },
    { id: 'pre',      label: 'Pre-entreno' },
    { id: 'post',     label: 'Post-entreno' },
  ];

  const INF_LABEL = { low: 'Bajo', medium: 'Medio', high: 'Alto' };

  // ── 100 recetas de nutricionista deportivo ──────────────────────────────────
  // Formato: { id, name, cat, kcal, p, c, f, inf, ingredients (texto), desc }
  // inf: 1=bajo, 2=medio, 3=alto
  const NUTRITIONIST_RECIPES = [
    // DESAYUNO
    { id:'n1',  cat:'desayuno', name:'Oatmeal proteico de arándanos',       kcal:420, p:32, c:52, f:8,  inf:1, ingredients:'80g avena, 1 scoop proteína vainilla, 100g arándanos, 15g nueces, 200ml leche desnatada', desc:'Rica en beta-glucanos y antioxidantes. Ideal para días de cardio.' },
    { id:'n2',  cat:'desayuno', name:'Tortilla de clara y espinacas',        kcal:290, p:38, c:6,  f:12, inf:1, ingredients:'5 claras, 1 yema, 60g espinacas baby, 30g queso fresco, 1 cdta AOVE', desc:'Alto en leucina. Activa la síntesis proteica desde la mañana.' },
    { id:'n3',  cat:'desayuno', name:'Bowl de yogur griego proteico',        kcal:360, p:28, c:38, f:10, inf:1, ingredients:'200g yogur griego 0%, 1 scoop proteína, 40g granola sin azúcar, 80g fresas', desc:'Probióticos + proteína completa. Perfecto post-ayuno.' },
    { id:'n4',  cat:'desayuno', name:'Tostadas con salmón ahumado',          kcal:390, p:30, c:34, f:14, inf:1, ingredients:'2 rebanadas pan centeno, 80g salmón ahumado, 30g queso crema light, alcaparras, eneldo', desc:'Omega-3 + proteína de alta calidad. Anti-inflamatorio.' },
    { id:'n5',  cat:'desayuno', name:'Batido pre-entreno matutino',          kcal:380, p:36, c:44, f:6,  inf:1, ingredients:'2 scoops proteína whey, 1 plátano maduro, 30g avena, 200ml leche semidesnatada, hielo', desc:'Carbos rápidos + whey para entrenamiento matutino.' },
    { id:'n6',  cat:'desayuno', name:'Pancakes de avena y proteína',         kcal:440, p:35, c:50, f:10, inf:1, ingredients:'80g avena molida, 2 huevos, 1 scoop proteína, 100ml leche, 1 cdta levadura, arándanos', desc:'Versión saludable con balance perfecto macro.' },
    { id:'n7',  cat:'desayuno', name:'Pudding de chía con mango',            kcal:340, p:22, c:38, f:12, inf:1, ingredients:'40g chía, 200ml leche coco light, 1 scoop proteína, 100g mango, 10g coco rallado', desc:'Omega-3 vegetal + fibra. Preparar la noche anterior.' },
    { id:'n8',  cat:'desayuno', name:'Revuelto de huevos con pavo y queso',  kcal:350, p:40, c:4,  f:18, inf:1, ingredients:'3 huevos, 60g pechuga pavo loncheada, 30g queso manchego, pimiento verde, cebolla', desc:'Bajo en carbos. Ideal para déficit calórico o keto.' },
    { id:'n9',  cat:'desayuno', name:'Muesli deportivo casero',              kcal:430, p:18, c:60, f:12, inf:1, ingredients:'50g copos avena, 20g nueces mixtas, 15g semillas girasol, 30g pasas, 200ml leche', desc:'Energía de liberación lenta para mañanas de fuerza.' },
    { id:'n10', cat:'desayuno', name:'Crêpe de proteína y crema cacahuete',  kcal:400, p:34, c:35, f:14, inf:2, ingredients:'2 huevos, 1 scoop proteína chocolate, 30g harina avena, 1 cdta aceite, 15g mantequilla cacahuete', desc:'Alta saciedad. Ideal como desayuno de volumen.' },

    // ALMUERZO
    { id:'n11', cat:'almuerzo', name:'Pollo teriyaki con arroz integral',    kcal:560, p:50, c:62, f:8,  inf:1, ingredients:'200g pechuga pollo, 150g arroz integral, brócoli, salsa teriyaki casera, sésamo', desc:'Fuente completa de macros. Favorito de pretemporada.' },
    { id:'n12', cat:'almuerzo', name:'Salmón glaseado con quinoa tricolor',  kcal:610, p:48, c:46, f:20, inf:1, ingredients:'220g salmón fresco, 120g quinoa tricolor, espárragos, limón, eneldo, AOVE', desc:'DHA/EPA + proteína completa. Máxima recuperación.' },
    { id:'n13', cat:'almuerzo', name:'Atún con pasta integral y tomate',     kcal:540, p:44, c:62, f:10, inf:1, ingredients:'150g atún en agua, 130g pasta integral, 200g tomate triturado, ajo, AOVE, albahaca', desc:'Clásico de fuerza. Carbos de absorción media.' },
    { id:'n14', cat:'almuerzo', name:'Ternera magra con boniato y brócoli',  kcal:580, p:52, c:50, f:12, inf:1, ingredients:'220g filete ternera magra, 200g boniato asado, 150g brócoli al vapor, salsa mostaza-miel', desc:'Hierro + beta-caroteno + sulforafano. Combo antiinflamatorio.' },
    { id:'n15', cat:'almuerzo', name:'Bowl de sushi proteico',               kcal:490, p:38, c:52, f:10, inf:1, ingredients:'150g salmón sashimi, 120g arroz para sushi, aguacate, pepino, alga nori, wasabi, tamari', desc:'Omega-3 + carbos controlados. Versión saludable del sushi.' },
    { id:'n16', cat:'almuerzo', name:'Pechuga en salsa de hongos',           kcal:420, p:48, c:18, f:14, inf:1, ingredients:'220g pechuga pollo, 150g champiñones, 50ml caldo pollo, 30ml leche evaporada, ajo, tomillo', desc:'Alta proteína, bajo en carbos. Para días de corte.' },
    { id:'n17', cat:'almuerzo', name:'Ensalada de pollo y garbanzos',        kcal:480, p:42, c:44, f:14, inf:1, ingredients:'180g pollo a la plancha, 150g garbanzos, tomate cherry, pepino, cebolla morada, limón, AOVE', desc:'Proteína completa + fibra. Saciante y antiinflamatoria.' },
    { id:'n18', cat:'almuerzo', name:'Bacalao al horno con patata',          kcal:420, p:44, c:40, f:8,  inf:1, ingredients:'250g bacalao fresco, 200g patata, pimiento rojo, cebolla, tomate, AOVE, ajo, pimentón', desc:'Proteína magra + carbos moderados. Clásico mediterráneo.' },
    { id:'n19', cat:'almuerzo', name:'Wrap de pavo y aguacate',              kcal:460, p:40, c:38, f:14, inf:1, ingredients:'200g pechuga pavo, 2 tortillas integrales, 80g aguacate, lechuga, tomate, mostaza Dijon', desc:'Portable y completo. Perfecto para deportistas con poco tiempo.' },
    { id:'n20', cat:'almuerzo', name:'Estofado de ternera y lentejas',       kcal:520, p:46, c:52, f:10, inf:1, ingredients:'180g ternera dados, 150g lentejas, zanahoria, cebolla, tomate, pimentón, AOVE', desc:'Hierro hemo + no-hemo. Potencia la absorción con vitamina C.' },

    // CENA
    { id:'n21', cat:'cena',     name:'Merluza al vapor con verduras',        kcal:300, p:42, c:12, f:8,  inf:1, ingredients:'280g merluza, calabacín, zanahoria, judías verdes, limón, eneldo, AOVE', desc:'Proteína magra + baja carga glucémica. Cena ideal de corte.' },
    { id:'n22', cat:'cena',     name:'Pollo con vegetales asados',           kcal:380, p:44, c:20, f:12, inf:1, ingredients:'220g muslo pollo sin piel, pimiento, berenjena, calabacín, cebolla, tomillo, AOVE', desc:'Saciante y anti-inflamatorio. Carbos nocturnos reducidos.' },
    { id:'n23', cat:'cena',     name:'Salmón al horno con espárragos',       kcal:440, p:46, c:8,  f:24, inf:1, ingredients:'220g salmón, 200g espárragos, limón, ajo, AOVE, sal, pimienta', desc:'Omega-3 + bajo en carbos. Favorece el sueño reparador.' },
    { id:'n24', cat:'cena',     name:'Tortilla española ligera',             kcal:320, p:24, c:22, f:14, inf:1, ingredients:'3 huevos, 1 clara, 200g patata, cebolla, AOVE, sal', desc:'Versión light con más proteína. Satisface sin exceso calórico.' },
    { id:'n25', cat:'cena',     name:'Dorada a la sal con ensalada',         kcal:360, p:46, c:6,  f:16, inf:1, ingredients:'300g dorada entera, 1kg sal gorda, limón, perejil; ensalada: lechuga, tomate, pepino', desc:'Cocción en sal mantiene humedad. Proteína de alta digestibilidad.' },
    { id:'n26', cat:'cena',     name:'Pavo al limón con judías verdes',      kcal:340, p:46, c:10, f:10, inf:1, ingredients:'220g pechuga pavo, 200g judías verdes, limón, ajo, AOVE, sal, pimienta negra', desc:'Triptófano + bajo en carbos. Mejora la calidad del sueño.' },
    { id:'n27', cat:'cena',     name:'Revuelto de gambas y verduras',        kcal:280, p:36, c:8,  f:12, inf:1, ingredients:'200g gambas peladas, 2 huevos, 2 claras, puerro, pimiento, AOVE, sal', desc:'Proteína de mar + proteína de huevo. Muy baja en carbos.' },
    { id:'n28', cat:'cena',     name:'Crema de calabaza con queso fresco',   kcal:240, p:16, c:24, f:8,  inf:1, ingredients:'400g calabaza, 200g queso fresco, caldo vegetal, cebolla, jengibre, cúrcuma, AOVE', desc:'Antioxidante + probióticos. Cena ligera y reconfortante.' },
    { id:'n29', cat:'cena',     name:'Poke bowl nocturno',                   kcal:420, p:38, c:38, f:12, inf:1, ingredients:'150g atún rojo, 80g arroz integral frío, edamame, aguacate, alga wakame, sésamo, tamari', desc:'Buenas grasas + proteína. Carbos moderados para la noche.' },
    { id:'n30', cat:'cena',     name:'Pollo marinado con yogur',             kcal:360, p:48, c:10, f:12, inf:1, ingredients:'220g pechuga pollo, 100g yogur griego, ajo, limón, comino, pimentón, cilantro', desc:'Tierno y jugoso. Marinado en yogur mejora digestibilidad.' },

    // SNACK
    { id:'n31', cat:'snack',    name:'Yogur proteico con nueces y miel',     kcal:250, p:20, c:18, f:10, inf:1, ingredients:'150g yogur griego proteico, 20g nueces, 1 cdta miel, canela', desc:'Proteína + grasas saciantes. Snack anticatabólico.' },
    { id:'n32', cat:'snack',    name:'Huevos duros con sal en escamas',      kcal:180, p:16, c:1,  f:12, inf:1, ingredients:'2 huevos L, sal en escamas, pimienta negra', desc:'Proteína completa portable. Sin carbos. Ideal para corte.' },
    { id:'n33', cat:'snack',    name:'Requesón con melocotón y almendras',   kcal:220, p:22, c:14, f:8,  inf:1, ingredients:'150g requesón, 100g melocotón, 15g almendras laminadas, menta', desc:'Caseína natural + fruta. Ideal entre comidas o antes de dormir.' },
    { id:'n34', cat:'snack',    name:'Barrita energética de dátiles y avena',kcal:200, p:8,  c:34, f:6,  inf:1, ingredients:'50g dátiles, 30g copos avena, 15g mantequilla cacahuete, 15g semillas calabaza', desc:'Energía de dátiles + fibra de avena. Sin azúcar añadida.' },
    { id:'n35', cat:'snack',    name:'Licuado verde deportivo',              kcal:180, p:16, c:22, f:3,  inf:1, ingredients:'1 scoop proteína vegetal, 1 manzana verde, 30g espinacas, 1 trozo jengibre, 200ml agua', desc:'Antioxidante + proteína. Alcalinizante.' },
    { id:'n36', cat:'snack',    name:'Tosta de ricotta con pavo',            kcal:200, p:18, c:16, f:6,  inf:1, ingredients:'1 rebanada pan centeno, 50g ricotta, 60g pavo cocido, tomate cherry, orégano', desc:'Casein + triptófano. Perfecto snack vespertino.' },
    { id:'n37', cat:'snack',    name:'Mix de frutos secos proteico',         kcal:220, p:10, c:12, f:14, inf:1, ingredients:'15g almendras, 10g nueces, 10g pistachos, 10g arándanos secos, 10g pepitas calabaza', desc:'Ácidos grasos esenciales + antioxidantes. Conveniente.' },
    { id:'n38', cat:'snack',    name:'Edamame con sal marina',               kcal:160, p:14, c:10, f:6,  inf:1, ingredients:'150g edamame en vaina, sal marina, limón (opcional)', desc:'Proteína vegetal completa + fibra. Bajo índice glucémico.' },

    // PRE-ENTRENO
    { id:'n39', cat:'pre',      name:'Arroz blanco con miel y whey',        kcal:380, p:32, c:56, f:2,  inf:1, ingredients:'100g arroz blanco cocido, 1 scoop proteína whey, 1 cdta miel, plátano opcional', desc:'Carbos rápidos + whey. Tomar 60-90 min antes del entrenamiento.' },
    { id:'n40', cat:'pre',      name:'Tosta con pavo y mermelada',           kcal:320, p:24, c:44, f:4,  inf:1, ingredients:'2 rebanadas pan blanco, 80g pavo cocido, 1 cdta mermelada sin azúcar, queso light', desc:'Glucosa rápida + proteína moderada. Ventana pre 45-60 min.' },
    { id:'n41', cat:'pre',      name:'Batido de plátano y cacahuete',        kcal:360, p:28, c:42, f:10, inf:1, ingredients:'1 plátano grande, 1 scoop proteína, 15g mantequilla cacahuete, 200ml leche, hielo', desc:'Carbos + proteína + grasa. Buen pre-entreno de volumen.' },
    { id:'n42', cat:'pre',      name:'Avena con plátano y proteína',         kcal:400, p:30, c:58, f:6,  inf:1, ingredients:'70g avena, 1 scoop proteína sabor neutro, 1 plátano, 15ml sirope arce, agua', desc:'Glucógeno muscular lento + rápido. Ideal para sesiones largas.' },
    { id:'n43', cat:'pre',      name:'Patata dulce con proteína y canela',   kcal:350, p:28, c:50, f:4,  inf:1, ingredients:'200g boniato cocido, 1 scoop proteína cinnamon roll, 1 cdta canela, nuez moscada', desc:'Carbos complejos + whey. Pre-entreno 2h antes.' },

    // POST-ENTRENO
    { id:'n44', cat:'post',     name:'Batido recovery de chocolate',         kcal:420, p:44, c:52, f:6,  inf:1, ingredients:'2 scoops proteína chocolate, 50g dextrosa, 5g creatina, 3g leucina, agua fría', desc:'Ventana anabólica. Tomar dentro de los 30 min post-entreno.' },
    { id:'n45', cat:'post',     name:'Pollo con arroz blanco y zumo',        kcal:550, p:50, c:64, f:8,  inf:1, ingredients:'200g pechuga pollo, 150g arroz blanco, 200ml zumo naranja natural, sal', desc:'Reposición de glucógeno + proteína completa. Clásico de culturismo.' },
    { id:'n46', cat:'post',     name:'Batido de fresas y proteína vegetal',  kcal:340, p:36, c:38, f:4,  inf:1, ingredients:'2 scoops proteína arroz/guisante, 150g fresas, 200ml leche avena, miel', desc:'Para intolerantes al suero. Igual de efectivo post-entreno.' },
    { id:'n47', cat:'post',     name:'Wrap de atún con arroz y maíz',        kcal:480, p:44, c:52, f:8,  inf:1, ingredients:'200g atún en agua, 100g arroz blanco, maíz, 2 tortillas integrales, salsa yogur-limón', desc:'Completo y portable. Perfecto cuando no tienes tiempo de cocinar.' },
    { id:'n48', cat:'post',     name:'Tortilla proteica de recuperación',    kcal:360, p:42, c:20, f:12, inf:1, ingredients:'4 claras, 2 huevos, 80g requesón, 1 scoop proteína, verduras salteadas, AOVE', desc:'Mezcla de digestión rápida (huevo) + lenta (caseína). Ideal en 1h post.' },
    { id:'n49', cat:'post',     name:'Rice cakes con queso y salmón',        kcal:300, p:30, c:28, f:8,  inf:1, ingredients:'4 tortitas de arroz, 80g salmón ahumado, 60g queso fresco, eneldo, limón', desc:'Carbos simples + proteína de calidad. Recuperación rápida.' },
    { id:'n50', cat:'post',     name:'Smoothie bowl antiinflamatorio',       kcal:380, p:28, c:48, f:8,  inf:1, ingredients:'1 scoop proteína, 100g frutos rojos congelados, 50g plátano, 30g espinacas, granola, semillas', desc:'Antioxidantes + proteína. Reduce daño muscular post-entreno.' },

    // ALMUERZO (continuación)
    { id:'n51', cat:'almuerzo', name:'Curry de pollo y garbanzos',           kcal:520, p:46, c:52, f:12, inf:1, ingredients:'200g pollo, 150g garbanzos, leche coco light, curry en polvo, jengibre, tomate, cilantro', desc:'Antiinflamatorio por cúrcuma + jengibre. Fuerte en proteína.' },
    { id:'n52', cat:'almuerzo', name:'Bowl de salmón y boniato asado',       kcal:580, p:44, c:48, f:16, inf:1, ingredients:'200g salmón, 180g boniato, aguacate, rúcula, sésamo negro, vinagre arroz, tamari', desc:'DHA + beta-caroteno + grasas monoinsaturadas. Máxima densidad nutricional.' },
    { id:'n53', cat:'almuerzo', name:'Lentejas rojas con ternera y cúrcuma', kcal:500, p:44, c:48, f:10, inf:1, ingredients:'150g ternera dados, 120g lentejas rojas, cebolla, ajo, cúrcuma, comino, AOVE', desc:'Hierro hemo + no-hemo. La vitamina C del tomate potencia la absorción.' },
    { id:'n54', cat:'almuerzo', name:'Pechuga con salsa verde y arroz',      kcal:480, p:46, c:52, f:8,  inf:1, ingredients:'210g pechuga pollo, 130g arroz integral, perejil, ajo, aceite, limón, espinacas', desc:'Clorofila + proteína magra. Limpia y eficiente.' },
    { id:'n55', cat:'almuerzo', name:'Mejillones con pasta integral',        kcal:480, p:38, c:60, f:8,  inf:1, ingredients:'300g mejillones, 120g pasta integral, tomate, ajo, vino blanco, perejil, AOVE', desc:'Vitamina B12 + omega-3 + carbos complejos. Económico y nutritivo.' },

    // SNACK adicionales
    { id:'n56', cat:'snack',    name:'Proteína de caseína antes de dormir',  kcal:200, p:24, c:8,  f:6,  inf:1, ingredients:'1,5 scoops caseína vainilla, 100ml leche, canela, nuez moscada', desc:'Digestión lenta (7h). Anticatabólico nocturno por excelencia.' },
    { id:'n57', cat:'snack',    name:'Tarta de queso light sin horno',       kcal:230, p:22, c:16, f:8,  inf:1, ingredients:'200g queso crema light, 150g yogur griego, 2 hojas gelatina, 30g edulcorante, frutos rojos', desc:'Postre saciante sin azúcar añadida. Fuerte en proteína.' },
    { id:'n58', cat:'snack',    name:'Cracker de arroz con atún y aguacate', kcal:190, p:18, c:14, f:8,  inf:1, ingredients:'3 crackers de arroz, 80g atún al natural, 40g aguacate, limón, sal, pimienta', desc:'Carbos simples + omega-3 + proteína. Snack completo.' },

    // PRE y POST adicionales
    { id:'n59', cat:'pre',      name:'Café con leche y tortitas de avena',   kcal:280, p:12, c:44, f:6,  inf:1, ingredients:'200ml café con leche desnatada, 2 tortitas de avena, 10g mantequilla cacahuete', desc:'Cafeína pre-entreno + carbos. Aumenta rendimiento +10-15%.' },
    { id:'n60', cat:'post',     name:'Paella de pollo y verduras (mini)',    kcal:520, p:42, c:62, f:8,  inf:1, ingredients:'180g pollo, 100g arroz bomba, pimiento, guisantes, zanahoria, caldo pollo, azafrán', desc:'Reposición completa de glucógeno + proteína. Cultura deportiva española.' },

    // DESAYUNO adicionales
    { id:'n61', cat:'desayuno', name:'French toast proteico',                kcal:400, p:34, c:42, f:10, inf:1, ingredients:'2 rebanadas pan brioche integral, 2 huevos, 1 scoop proteína vainilla, canela, arándanos', desc:'Versión fitness del clásico. Carbos moderados + alta proteína.' },
    { id:'n62', cat:'desayuno', name:'Smoothie bowl de mango y proteína',    kcal:350, p:26, c:48, f:6,  inf:1, ingredients:'1 scoop proteína tropical, 150g mango, 100g piña, 30g espinacas, granola, coco', desc:'Vitamina C + enzimas digestivas de la piña. Digestión fácil.' },
    { id:'n63', cat:'desayuno', name:'Wrap de huevo y vegetales',            kcal:320, p:28, c:28, f:10, inf:1, ingredients:'2 huevos, 1 tortilla integral, espinacas, tomate, queso fresco, orégano', desc:'Portable y saciante. Para días de entreno matutino.' },

    // CENA adicionales
    { id:'n64', cat:'cena',     name:'Lubina al vapor con quinoa',           kcal:380, p:44, c:28, f:10, inf:1, ingredients:'250g lubina, 80g quinoa, espinacas salteadas, limón, AOVE, eneldo', desc:'Proteína blanca + aminoácidos completos de quinoa. Cena perfecta.' },
    { id:'n65', cat:'cena',     name:'Pollo con tahini y berenjenas',        kcal:400, p:42, c:16, f:18, inf:1, ingredients:'200g pollo, 1 berenjena grande, 30g tahini, limón, ajo, perejil, pimentón', desc:'Sésamo + proteína magra. Grasas saludables de tahini.' },
    { id:'n66', cat:'cena',     name:'Ensalada de gambas y aguacate',        kcal:330, p:32, c:8,  f:18, inf:1, ingredients:'200g gambas cocidas, 1 aguacate, tomate cherry, rúcula, limón, AOVE, sal', desc:'Proteína + grasas monoinsaturadas. Muy bajo en carbos.' },

    // ALMUERZO adicionales
    { id:'n67', cat:'almuerzo', name:'Hamburguesa de pavo fitness',          kcal:480, p:48, c:38, f:14, inf:1, ingredients:'200g carne pavo picada, 1 pan integral, lechuga, tomate, cebolla, mostaza Dijon', desc:'Versión saludable de la hamburguesa. Baja en grasa saturada.' },
    { id:'n68', cat:'almuerzo', name:'Budín de arroz con leche y proteína',  kcal:420, p:28, c:58, f:6,  inf:1, ingredients:'100g arroz, 400ml leche desnatada, 1 scoop proteína vainilla, canela, limón', desc:'Confort food saludable. Ideal para días de volumen.' },
    { id:'n69', cat:'almuerzo', name:'Noodles de arroz con pollo y verduras',kcal:500, p:42, c:58, f:8,  inf:1, ingredients:'200g pollo, 120g noodles de arroz, bok choy, zanahoria, soja, jengibre, AOVE', desc:'Inspiración asiática. Perfecto post-entreno o pre-competición.' },
    { id:'n70', cat:'almuerzo', name:'Sepia a la plancha con garbanzos',     kcal:420, p:44, c:36, f:8,  inf:1, ingredients:'250g sepia, 150g garbanzos cocidos, pimiento, cebolla, pimentón, AOVE', desc:'Marisco bajo en grasa + legumbre. Hierro + proteína.' },

    // SNACK adicionales
    { id:'n71', cat:'snack',    name:'Gelatina proteica casera',             kcal:120, p:18, c:6,  f:1,  inf:1, ingredients:'500ml zumo frutas 100%, 4 hojas gelatina, 1 scoop proteína, edulcorante', desc:'Postre casi sin calorías con alta proteína. Para fase de definición.' },
    { id:'n72', cat:'snack',    name:'Brownies de proteína y aguacate',      kcal:180, p:12, c:16, f:8,  inf:1, ingredients:'1 aguacate, 2 huevos, 1 scoop proteína chocolate, cacao puro 100%, edulcorante', desc:'Grasa saludable + proteína. Sin harina. Sin azúcar.' },
    { id:'n73', cat:'snack',    name:'Palomitas de maíz proteicas',          kcal:160, p:10, c:20, f:4,  inf:1, ingredients:'30g maíz para palomitas, 1/2 scoop proteína sabor mantequilla, sal, AOVE spray', desc:'Snack de volumen bajo en calorías. Alta saciedad.' },
    { id:'n74', cat:'snack',    name:'Panna cotta de proteína',              kcal:200, p:20, c:10, f:8,  inf:1, ingredients:'200ml leche coco, 1 scoop proteína vainilla, 2 hojas gelatina, frambuesas frescas', desc:'Postre sofisticado fit. Impresiona sin arruinar la dieta.' },
    { id:'n75', cat:'snack',    name:'Dip de hummus con bastones',           kcal:190, p:8,  c:22, f:8,  inf:1, ingredients:'150g hummus casero, zanahoria, apio, pepino, pimiento en bastones', desc:'Fibra + proteína vegetal. Snack anti-antojos.' },

    // PRE adicionales
    { id:'n76', cat:'pre',      name:'Gelatina de frutas pre-entreno',       kcal:120, p:4,  c:28, f:0,  inf:1, ingredients:'zumo naranja natural, gelatina sin sabor, glucosa', desc:'Electrolitos + glucosa rápida. Ideal 20-30 min antes.' },
    { id:'n77', cat:'pre',      name:'Energy ball de dátil y almendra',      kcal:250, p:8,  c:34, f:10, inf:1, ingredients:'50g dátiles, 25g almendras, 15g cacao, 10g semillas hemp, coco rallado', desc:'Bola energética sin hornear. Portable y natural.' },
    { id:'n78', cat:'pre',      name:'Batido verde pre-cardio',              kcal:200, p:18, c:26, f:2,  inf:1, ingredients:'30g espinacas, 1 manzana verde, 1 kiwi, 0,5 scoop proteína, agua, hielo', desc:'Nitratoss de espinacas + fructosa de fruta. Pre-cardio optimal.' },

    // POST adicionales
    { id:'n79', cat:'post',     name:'Carne picada con arroz y egg whites', kcal:520, p:52, c:54, f:10, inf:2, ingredients:'200g carne picada 5%mg, 130g arroz, 3 claras, pimiento, tomate, AOVE', desc:'Clásico de culturismo natural. Máxima reposición post-entreno.' },
    { id:'n80', cat:'post',     name:'Sopa de pollo post-entreno',           kcal:380, p:42, c:32, f:8,  inf:1, ingredients:'200g pollo, fideos, zanahoria, apio, cebolla, caldo casero, cúrcuma', desc:'Hidratante + electrolitos + proteína. Recuperación completa.' },

    // Recetas adicionales (desayuno/almuerzo/cena)
    { id:'n81', cat:'desayuno', name:'Kéfir con semillas y fruta',           kcal:280, p:16, c:32, f:8,  inf:1, ingredients:'200ml kéfir, 15g chía, 10g lino molido, 100g fresas, 10g nueces', desc:'Probióticos + omega-3 + antioxidantes. Microbioma feliz.' },
    { id:'n82', cat:'almuerzo', name:'Gambas al ajillo con arroz integral',  kcal:480, p:40, c:50, f:10, inf:1, ingredients:'200g gambas, 130g arroz integral, ajo, guindilla, perejil, AOVE', desc:'Proteína magra + carbos complejos + capsaicina termogénica.' },
    { id:'n83', cat:'cena',     name:'Ensalada templada de quinoa y pollo',  kcal:400, p:40, c:34, f:10, inf:1, ingredients:'180g pollo, 80g quinoa, espinacas, tomate, pepino, limón, AOVE, sésamo', desc:'Proteína completa doble. Fácil digestión nocturna.' },
    { id:'n84', cat:'almuerzo', name:'Chili con carne magra',                kcal:500, p:46, c:44, f:10, inf:2, ingredients:'200g carne picada magra, judías rojas, tomate triturado, pimiento, cebolla, comino, chile', desc:'Iron Man de los guisos. Hierro + fibra + proteína.' },
    { id:'n85', cat:'cena',     name:'Tofu a la plancha con edamame',        kcal:330, p:30, c:14, f:16, inf:1, ingredients:'200g tofu firme, 100g edamame, soja, jengibre, ajo, sésamo, cebolla spring', desc:'Proteína vegetal completa. Isoflavonas para la recuperación muscular.' },
    { id:'n86', cat:'snack',    name:'Cottage cheese con piña y menta',      kcal:190, p:20, c:16, f:4,  inf:1, ingredients:'150g cottage cheese, 80g piña fresca, menta, limón, pizca de sal', desc:'Caseína + bromelaína (enzima de piña). Anti-inflamatorio natural.' },
    { id:'n87', cat:'pre',      name:'Smoothie de mango y proteína',         kcal:320, p:26, c:42, f:4,  inf:1, ingredients:'1 scoop proteína, 150g mango, 1 plátano pequeño, 200ml agua de coco, hielo', desc:'Electrolitos de agua de coco + carbos de mango. Pre 60-90 min.' },
    { id:'n88', cat:'post',     name:'Leche caliente con miel y whey',       kcal:280, p:30, c:28, f:4,  inf:1, ingredients:'250ml leche desnatada caliente, 1 scoop proteína, 1 cdta miel, pizca cúrcuma', desc:'Triptófano + melatonina precursora. Post-entreno nocturno.' },
    { id:'n89', cat:'almuerzo', name:'Pimientos rellenos de carne y quinoa', kcal:480, p:40, c:44, f:12, inf:1, ingredients:'3 pimientos, 150g carne picada, 80g quinoa, tomate, cebolla, queso, orégano', desc:'Presentación espectacular + nutrición completa.' },
    { id:'n90', cat:'cena',     name:'Cazuela de bacalao con garbanzos',     kcal:420, p:46, c:36, f:8,  inf:1, ingredients:'250g bacalao desalado, 150g garbanzos, espinacas, tomate, pimentón, azafrán, AOVE', desc:'Omega-3 + fibra de garbanzo. Plato mediterráneo de altura.' },
    { id:'n91', cat:'desayuno', name:'Granola proteica casera',              kcal:380, p:18, c:48, f:14, inf:1, ingredients:'100g avena, 30g proteína en polvo, 20g miel, 30g mix frutos secos, aceite coco', desc:'Crujiente y sabrosa. Preparar en batch los domingos.' },
    { id:'n92', cat:'snack',    name:'Helado proteico de plátano',           kcal:200, p:16, c:28, f:2,  inf:1, ingredients:'2 plátanos congelados, 1 scoop proteína, 1 cdta extracto vainilla, leche vegetal', desc:'Nice cream fitness. Sin azúcar añadida. Solo 200 kcal.' },
    { id:'n93', cat:'almuerzo', name:'Tataki de atún con ensalada',          kcal:400, p:48, c:8,  f:18, inf:1, ingredients:'250g atún rojo, sésamo, salsa ponzu, jengibre rallado, aguacate, rúcula', desc:'Técnica japonesa. DHA + proteína. Ultra-bajo en carbos.' },
    { id:'n94', cat:'cena',     name:'Sopa miso con tofu y algas',           kcal:200, p:18, c:12, f:6,  inf:1, ingredients:'200g tofu sedoso, pasta miso, alga wakame, cebolleta, soja, dashi (caldo kombu)', desc:'Fermentado + proteína vegetal. Reconfortante y ligero.' },
    { id:'n95', cat:'pre',      name:'Arroz con leche y dextrosa',           kcal:350, p:10, c:66, f:4,  inf:1, ingredients:'100g arroz blanco, 250ml leche desnatada, 30g dextrosa, canela, vainilla', desc:'Carga glucémica alta controlada. Pre-entreno de fuerza.' },
    { id:'n96', cat:'post',     name:'Batido post HIIT anti-inflamatorio',   kcal:310, p:34, c:34, f:6,  inf:1, ingredients:'1 scoop proteína, 100g cereza (congelada), 30g remolacha en polvo, 200ml leche', desc:'Antocianinas de cereza + nitratos de remolacha. Recuperación acelerada.' },
    { id:'n97', cat:'almuerzo', name:'Codfish cakes con ensalada',           kcal:400, p:40, c:30, f:12, inf:1, ingredients:'250g bacalao cocido, 200g patata, perejil, cebolla, huevo, pan rallado, AOVE', desc:'Pescado azul + carbos. Versión atlética de las croquetas.' },
    { id:'n98', cat:'desayuno', name:'Acaí bowl proteico',                   kcal:420, p:24, c:52, f:12, inf:1, ingredients:'100g pulpa acaí, 1 scoop proteína, plátano, frutos rojos, granola, semillas hemp', desc:'Antioxidantes del acaí + proteína. Alto poder antiinflamatorio.' },
    { id:'n99', cat:'cena',     name:'Pollo con pesto y judías',             kcal:420, p:46, c:16, f:18, inf:1, ingredients:'220g pechuga pollo, 2 cdas pesto genovés, 200g judías verdes, tomate cherry, piñones', desc:'Albahaca antioxidante + proteína magra + grasas de piñones.' },
    { id:'n100',cat:'almuerzo', name:'Paella de marisco fit',               kcal:520, p:42, c:62, f:8,  inf:1, ingredients:'150g gambas, 100g mejillones, 80g calamar, 120g arroz, pimiento, caldo marisco, azafrán', desc:'La paella de los campeones. Proteína de mar + carbos controlados.' },
  ];

  // ── Persistencia ───────────────────────────────────────────────────────────
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(recipes));
    document.dispatchEvent(new CustomEvent('hs:recipes-updated', { detail: recipes }));
  }

  function load() {
    try { recipes = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { recipes = []; }
  }

  function nextId() {
    const n = parseInt(localStorage.getItem(LS_NEXT_ID) || '1000');
    localStorage.setItem(LS_NEXT_ID, String(n + 1));
    return n;
  }

  // ── Cálculo de macros ──────────────────────────────────────────────────────
  function calcMacros(items) {
    let kcal = 0, p = 0, c = 0, f = 0;
    let infScores = [];
    const infMap = { low: 1, medium: 2, high: 3 };

    items.forEach(item => {
      const factor = item.grams / 100;
      kcal += item.calories * factor;
      p    += item.protein  * factor;
      c    += item.carbs    * factor;
      f    += item.fat      * factor;
      infScores.push(infMap[item.inflammation_base] || 1);
    });

    const avgInf = infScores.length
      ? infScores.reduce((a, b) => a + b, 0) / infScores.length
      : 1;
    const inf = avgInf < 1.5 ? 'low' : avgInf < 2.3 ? 'medium' : 'high';

    return {
      kcal: Math.round(kcal),
      p: Math.round(p * 10) / 10,
      c: Math.round(c * 10) / 10,
      f: Math.round(f * 10) / 10,
      inf,
    };
  }

  // ── Render buscador de ingredientes ───────────────────────────────────────
  function renderIngredientSearch() {
    const searchEl = document.getElementById('ing-search');
    const resultsEl = document.getElementById('ing-results');
    if (!searchEl || !resultsEl) return;

    const q = searchEl.value.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }

    const ingredients = window.HS_CONFIG ? HS_CONFIG.INGREDIENTS : [];
    const filtered = ingredients.filter(i =>
      i.name.toLowerCase().includes(q) &&
      !selectedIngredients.find(s => s.id === i.id)
    ).slice(0, 8);

    if (!filtered.length) {
      resultsEl.innerHTML = '<div class="ing-no-result">Sin resultados</div>';
      return;
    }

    resultsEl.innerHTML = filtered.map(i => `
      <div class="ing-result-item" data-id="${i.id}">
        <span class="ing-result-name">${i.name}</span>
        <span class="ing-result-macros">${i.protein}p · ${i.carbs}h · ${i.fat}g · ${i.calories} kcal <small>/100g</small></span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.ing-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const ing = ingredients.find(i => i.id === parseInt(el.dataset.id));
        if (!ing) return;
        selectedIngredients.push({ ...ing, grams: 100 });
        searchEl.value = '';
        resultsEl.innerHTML = '';
        renderSelectedIngredients();
        updateMacroPreview();
      });
    });
  }

  // ── Render ingredientes seleccionados ─────────────────────────────────────
  function renderSelectedIngredients() {
    const list = document.getElementById('selected-ingredients');
    if (!list) return;

    if (!selectedIngredients.length) {
      list.innerHTML = '<p class="ing-empty">Busca y añade ingredientes arriba</p>';
      return;
    }

    list.innerHTML = selectedIngredients.map((ing, idx) => `
      <div class="sel-ing-row">
        <span class="sel-ing-name">${ing.name}</span>
        <div class="sel-ing-controls">
          <button class="sel-ing-step" data-idx="${idx}" data-delta="-25" title="−25 g">−</button>
          <input type="number" class="sel-ing-grams" data-idx="${idx}"
                 value="${ing.grams}" min="1" max="5000" step="25">
          <span class="sel-ing-unit">g</span>
          <button class="sel-ing-step" data-idx="${idx}" data-delta="25" title="+25 g">+</button>
          <span class="sel-ing-macro">${Math.round(ing.protein * ing.grams / 100)}p · ${Math.round(ing.carbs * ing.grams / 100)}h · ${Math.round(ing.fat * ing.grams / 100)}g</span>
          <button class="sel-ing-remove" data-idx="${idx}" title="Quitar">×</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.sel-ing-grams').forEach(input => {
      input.addEventListener('input', e => {
        const idx = parseInt(e.target.dataset.idx);
        const val = Math.max(1, parseFloat(e.target.value) || 1);
        selectedIngredients[idx].grams = val;
        updateMacroPreview();
        // Solo actualiza los macros del propio row sin re-renderizar todo
        const row = e.target.closest('.sel-ing-row');
        const macroEl = row?.querySelector('.sel-ing-macro');
        if (macroEl) {
          const ing = selectedIngredients[idx];
          macroEl.textContent = `${Math.round(ing.protein * val / 100)}p · ${Math.round(ing.carbs * val / 100)}h · ${Math.round(ing.fat * val / 100)}g`;
        }
      });
      // Actualizar al perder el foco (por si se borra el campo)
      input.addEventListener('blur', e => {
        const idx = parseInt(e.target.dataset.idx);
        if (!e.target.value || parseFloat(e.target.value) < 1) {
          selectedIngredients[idx].grams = 25;
          e.target.value = 25;
          renderSelectedIngredients();
          updateMacroPreview();
        }
      });
    });

    list.querySelectorAll('.sel-ing-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx   = parseInt(btn.dataset.idx);
        const delta = parseInt(btn.dataset.delta);
        const cur   = selectedIngredients[idx].grams;
        selectedIngredients[idx].grams = Math.max(25, cur + delta);
        renderSelectedIngredients();
        updateMacroPreview();
      });
    });

    list.querySelectorAll('.sel-ing-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        selectedIngredients.splice(idx, 1);
        renderSelectedIngredients();
        updateMacroPreview();
      });
    });
  }

  // ── Actualizar preview de macros en tiempo real ────────────────────────────
  function updateMacroPreview() {
    const preview = document.getElementById('recipe-macro-preview');
    if (!preview) return;

    if (!selectedIngredients.length) {
      preview.innerHTML = '<span class="macro-preview-empty">Añade ingredientes para ver los macros</span>';
      return;
    }

    const m = calcMacros(selectedIngredients);
    preview.innerHTML = `
      <div class="macro-preview-grid">
        <div class="mpg-item mpg-kcal">
          <span class="mpg-val">${m.kcal}</span>
          <span class="mpg-label">kcal</span>
        </div>
        <div class="mpg-item mpg-p">
          <span class="mpg-val">${m.p}g</span>
          <span class="mpg-label">Proteína</span>
        </div>
        <div class="mpg-item mpg-c">
          <span class="mpg-val">${m.c}g</span>
          <span class="mpg-label">Hidratos</span>
        </div>
        <div class="mpg-item mpg-f">
          <span class="mpg-val">${m.f}g</span>
          <span class="mpg-label">Grasa</span>
        </div>
        <div class="mpg-item mpg-inf">
          <span class="mpg-val">${INF_LABEL[m.inf]}</span>
          <span class="mpg-label">Inflamación</span>
        </div>
      </div>
    `;
  }

  // ── Render estrellas de valoración ─────────────────────────────────────────
  function renderStars(containerId, currentRating) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = Array.from({ length: 5 }, (_, i) => `
      <span class="star${i < currentRating ? ' star--on' : ''}" data-val="${i + 1}">★</span>
    `).join('');
    el.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.val);
        el.dataset.rating = val;
        el.querySelectorAll('.star').forEach((s, i) => {
          s.classList.toggle('star--on', i < val);
        });
      });
    });
    el.dataset.rating = currentRating;
  }

  // ── Guardar receta ─────────────────────────────────────────────────────────
  function saveRecipe() {
    const nameEl = document.getElementById('recipe-name-input');
    const catEl  = document.getElementById('recipe-cat-select');
    const instEl = document.getElementById('recipe-instructions');
    const ratingEl = document.getElementById('recipe-stars');

    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); showToast('Introduce un nombre para la receta.', 'warning'); return; }
    if (!selectedIngredients.length) { showToast('Añade al menos un ingrediente.', 'warning'); return; }

    const m = calcMacros(selectedIngredients);
    const recipe = {
      id: editingId ?? nextId(),
      name,
      category: catEl?.value || 'almuerzo',
      ingredients: selectedIngredients.map(i => ({
        id: i.id, name: i.name, grams: i.grams,
      })),
      instructions: instEl?.value.trim() || '',
      rating: parseInt(ratingEl?.dataset.rating || '5'),
      kcal: m.kcal,
      p: m.p, c: m.c, f: m.f,
      inf: m.inf,
      createdAt: editingId
        ? (recipes.find(r => r.id === editingId)?.createdAt || Date.now())
        : Date.now(),
    };

    if (editingId !== null) {
      const idx = recipes.findIndex(r => r.id === editingId);
      if (idx !== -1) recipes[idx] = recipe;
    } else {
      // Free tier: máximo 5 recetas personalizadas
      if (recipes.length >= MAX_CUSTOM_RECIPES) {
        showToast(`Límite de ${MAX_CUSTOM_RECIPES} recetas alcanzado. Elimina una receta para crear otra.`, 'warning');
        return;
      }
      recipes.unshift(recipe);
    }

    save();
    resetForm();
    renderGrid();
    showToast(`Receta "${name}" guardada (${recipes.length}/${MAX_CUSTOM_RECIPES})`);
  }

  // ── Reset formulario ───────────────────────────────────────────────────────
  function resetForm() {
    editingId = null;
    selectedIngredients = [];
    const fields = ['recipe-name-input', 'recipe-instructions'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const cat = document.getElementById('recipe-cat-select');
    if (cat) cat.value = 'almuerzo';
    renderSelectedIngredients();
    updateMacroPreview();
    renderStars('recipe-stars', 5);
    document.getElementById('recipe-form-title')?.textContent
      && (document.getElementById('recipe-form-title').textContent = 'Nueva Receta');
    document.getElementById('recipe-save-btn')
      && (document.getElementById('recipe-save-btn').textContent = 'Guardar receta');
  }

  // ── Editar receta ──────────────────────────────────────────────────────────
  function editRecipe(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;

    editingId = id;
    const ingredients = window.HS_CONFIG ? HS_CONFIG.INGREDIENTS : [];

    selectedIngredients = rec.ingredients.map(ri => {
      const full = ingredients.find(i => i.id === ri.id) || {};
      return { ...full, ...ri };
    });

    document.getElementById('recipe-name-input').value = rec.name;
    document.getElementById('recipe-cat-select').value = rec.category;
    document.getElementById('recipe-instructions').value = rec.instructions || '';
    renderStars('recipe-stars', rec.rating);
    renderSelectedIngredients();
    updateMacroPreview();

    document.getElementById('recipe-form-title').textContent = 'Editar Receta';
    document.getElementById('recipe-save-btn').textContent = 'Actualizar receta';

    // Scroll al formulario
    document.getElementById('recipe-creator-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Eliminar receta ────────────────────────────────────────────────────────
  function deleteRecipe(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;
    showConfirm(`¿Eliminar la receta "<strong>${rec.name}</strong>"?`, {
      type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar',
    }).then(ok => {
      if (!ok) return;
      recipes = recipes.filter(r => r.id !== id);
      if (editingId === id) resetForm();
      save();
      renderGrid();
      showToast(`Receta "${rec.name}" eliminada.`, 'info');
    });
  }

  // ── Render grid de recetas guardadas ──────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('my-recipes-grid');
    if (!grid) return;

    let filtered = recipes.filter(r => {
      const catOk = catFilter === 'all' || r.category === catFilter;
      const searchOk = !searchQuery || r.name.toLowerCase().includes(searchQuery);
      return catOk && searchOk;
    });

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="recipes-empty-state">
          <div class="empty-icon"></div>
          <h3>Aún no tienes recetas guardadas</h3>
          <p>Usa el formulario de abajo para crear tu primera receta personalizada.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(r => `
      <div class="my-recipe-card" data-id="${r.id}">
        <div class="mrc-header">
          <span class="mrc-cat">${r.category}</span>
          <div class="mrc-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
        </div>
        <h3 class="mrc-name">${r.name}</h3>
        <div class="mrc-macros">
          <span class="mrc-kcal">${r.kcal} kcal</span>
          <span class="rmacro rmacro--p">P ${r.p}g</span>
          <span class="rmacro rmacro--c">H ${r.c}g</span>
          <span class="rmacro rmacro--f">G ${r.f}g</span>
          <span class="inf-dot inf-${r.inf === 'low' ? 1 : r.inf === 'medium' ? 2 : 4}"
                title="Inflamación: ${r.inf}"></span>
        </div>
        <p class="mrc-ing-count">${r.ingredients.length} ingrediente${r.ingredients.length !== 1 ? 's' : ''}</p>
        <div class="mrc-actions">
          <button class="btn btn--ghost btn--sm mrc-btn-edit" data-id="${r.id}">Editar</button>
          <button class="btn btn--ghost btn--sm mrc-btn-planner" data-id="${r.id}" title="Añadir al Planner">
            Planner
          </button>
          <button class="btn btn--ghost btn--sm mrc-btn-delete" data-id="${r.id}" title="Eliminar">×</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.mrc-btn-edit').forEach(btn =>
      btn.addEventListener('click', () => editRecipe(parseInt(btn.dataset.id)))
    );
    grid.querySelectorAll('.mrc-btn-delete').forEach(btn =>
      btn.addEventListener('click', () => deleteRecipe(parseInt(btn.dataset.id)))
    );
    grid.querySelectorAll('.mrc-btn-planner').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = recipes.find(r => r.id === parseInt(btn.dataset.id));
        if (!rec) return;
        document.dispatchEvent(new CustomEvent('hs:add-to-planner', { detail: rec }));
        showToast(`"${rec.name}" lista para arrastrar al Planner`);
      });
    });
  }

  // ── Recetas de Nutricionista — filter tabs ─────────────────────────────────
  function renderNutritionistFilterTabs() {
    const wrap = document.getElementById('nut-recipes-filter-tabs');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(c => `
      <button class="chip${nutCatFilter === c.id ? ' chip--active' : ''}" data-cat="${c.id}">${c.label}</button>
    `).join('');
    wrap.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        nutCatFilter = btn.dataset.cat;
        renderNutritionistFilterTabs();
        renderNutritionistRecipes();
      });
    });
  }

  // ── Recetas de Nutricionista — grid ────────────────────────────────────────
  function renderNutritionistRecipes() {
    const grid = document.getElementById('nut-recipes-grid');
    if (!grid) return;

    const catLabel = {
      desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena',
      snack: 'Snack', pre: 'Pre-entreno', post: 'Post-entreno',
    };
    const infLabel = { 1: 'bajo', 2: 'medio', 3: 'alto' };

    const filtered = NUTRITIONIST_RECIPES.filter(r => {
      const catOk = nutCatFilter === 'all' || r.cat === nutCatFilter;
      const searchOk = !nutSearchQuery || r.name.toLowerCase().includes(nutSearchQuery)
        || r.ingredients.toLowerCase().includes(nutSearchQuery)
        || r.desc.toLowerCase().includes(nutSearchQuery);
      return catOk && searchOk;
    });

    if (!filtered.length) {
      grid.innerHTML = `<div class="recipes-empty-state"><div class="empty-icon"></div><p>Sin resultados para esta búsqueda</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(r => `
      <div class="my-recipe-card" data-nid="${r.id}" style="position:relative">
        <div class="mrc-header">
          <span class="mrc-cat">${catLabel[r.cat] || r.cat}</span>
          <span style="font-size:.75rem">${infLabel[r.inf] || ''}</span>
        </div>
        <h3 class="mrc-name">${r.name}</h3>
        <p style="font-size:.78rem;color:var(--text-muted);margin:4px 0 8px;line-height:1.4">${r.desc}</p>
        <div class="mrc-macros">
          <span class="mrc-kcal">${r.kcal} kcal</span>
          <span class="rmacro rmacro--p">P ${r.p}g</span>
          <span class="rmacro rmacro--c">H ${r.c}g</span>
          <span class="rmacro rmacro--f">G ${r.f}g</span>
        </div>
        <p style="font-size:.72rem;color:var(--text-muted);margin:8px 0 10px;line-height:1.5;border-top:1px solid var(--glass-border);padding-top:8px">
          ${r.ingredients}
        </p>
        <div class="mrc-actions">
          <button class="btn btn--primary btn--sm nut-btn-copy" data-nid="${r.id}">
            Copiar y personalizar
          </button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.nut-btn-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = NUTRITIONIST_RECIPES.find(x => x.id === btn.dataset.nid);
        if (r) _copyNutritionistRecipe(r);
      });
    });
  }

  // ── Copiar plantilla al formulario de creación ──────────────────────────────
  function _copyNutritionistRecipe(r) {
    if (recipes.length >= MAX_CUSTOM_RECIPES && editingId === null) {
      alert(
        `Has alcanzado el límite de ${MAX_CUSTOM_RECIPES} recetas personalizadas (Tier gratuito).\n` +
        `Elimina una receta existente para poder copiar esta plantilla.`
      );
      return;
    }

    editingId = null;
    selectedIngredients = [];

    const nameEl  = document.getElementById('recipe-name-input');
    const catEl   = document.getElementById('recipe-cat-select');
    const instEl  = document.getElementById('recipe-instructions');
    const titleEl = document.getElementById('recipe-form-title');
    const saveEl  = document.getElementById('recipe-save-btn');

    if (nameEl)  nameEl.value  = r.name;
    if (catEl)   catEl.value   = r.cat;
    if (instEl)  instEl.value  =
      `Ingredientes de referencia:\n${r.ingredients}\n\nPasos / notas:\n${r.desc}`;
    if (titleEl) titleEl.textContent = `Personalizar: ${r.name}`;
    if (saveEl)  saveEl.textContent  = 'Guardar receta';

    renderSelectedIngredients();
    updateMacroPreview();
    renderStars('recipe-stars', 5);

    document.getElementById('recipe-creator-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast(`Plantilla "${r.name}" cargada · Añade ingredientes para calcular macros`);
  }

  // ── Filter tabs ────────────────────────────────────────────────────────────
  function renderFilterTabs() {
    const wrap = document.getElementById('my-recipes-filter-tabs');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(c => `
      <button class="chip${catFilter === c.id ? ' chip--active' : ''}" data-cat="${c.id}">${c.label}</button>
    `).join('');
    wrap.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        catFilter = btn.dataset.cat;
        renderFilterTabs();
        renderGrid();
      });
    });
  }

  // ── Toast notification ─────────────────────────────────────────────────────
  function showToast(msg) {
    let t = document.getElementById('hs-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'hs-toast';
      t.className = 'hs-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('hs-toast--visible');
    setTimeout(() => t.classList.remove('hs-toast--visible'), 2800);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    load();
    renderFilterTabs();
    renderGrid();
    renderSelectedIngredients();
    updateMacroPreview();
    renderStars('recipe-stars', 5);

    // Recetas de nutricionista
    renderNutritionistFilterTabs();
    renderNutritionistRecipes();

    // Toggle colapso sección nutricionista
    const nutToggle = document.getElementById('nut-recipes-toggle');
    const nutBody   = document.getElementById('nut-recipes-body');
    const nutIcon   = document.getElementById('nut-toggle-icon');
    if (nutToggle && nutBody) {
      nutToggle.addEventListener('click', () => {
        const isOpen = nutBody.style.display !== 'none';
        nutBody.style.display   = isOpen ? 'none' : '';
        if (nutIcon) nutIcon.style.transform = isOpen ? 'rotate(-90deg)' : '';
      });
    }

    document.getElementById('nut-recipes-search')?.addEventListener('input', e => {
      nutSearchQuery = e.target.value.trim().toLowerCase();
      renderNutritionistRecipes();
    });

    document.getElementById('ing-search')?.addEventListener('input', renderIngredientSearch);
    document.getElementById('ing-search')?.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.getElementById('ing-results').innerHTML = '';
        e.target.value = '';
      }
    });

    document.getElementById('recipe-save-btn')?.addEventListener('click', saveRecipe);
    document.getElementById('recipe-cancel-btn')?.addEventListener('click', resetForm);

    document.getElementById('my-recipes-search')?.addEventListener('input', e => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderGrid();
    });

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', e => {
      const searchEl = document.getElementById('ing-search');
      const resultsEl = document.getElementById('ing-results');
      if (resultsEl && searchEl && !searchEl.contains(e.target) && !resultsEl.contains(e.target)) {
        resultsEl.innerHTML = '';
      }
    });
  }

  // ── API pública (usada por planner.js) ────────────────────────────────────
  return {
    init,
    getRecipes: () => recipes,
    // Convierte una receta de usuario al formato de RECIPES del planner
    toPlanner: (rec) => ({
      id: `user_${rec.id}`,
      cat: rec.category,
      name: rec.name,
      kcal: rec.kcal,
      p: rec.p,
      c: rec.c,
      f: rec.f,
      inf: rec.inf === 'low' ? 1 : rec.inf === 'medium' ? 2 : 4,
      desc: `Receta personalizada · ${rec.ingredients.length} ingredientes`,
      isUserRecipe: true,
    }),
  };
})();
