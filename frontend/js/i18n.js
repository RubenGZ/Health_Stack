/* ============================================================
   i18n.js — Sistema de traducción ultra-ligero para HealthStack Pro
   Sin dependencias · 5 idiomas embebidos · ~50 líneas de motor
   ============================================================ */
;(function () {

  /* ── Locales ───────────────────────────────────────────────── */
  const LOCALES = {

    /* ── ESPAÑOL ──────────────────────────────────────────────── */
    es: {
      nav: { dashboard:'Dashboard', nutrition:'Nutrición', weight:'Peso', exercises:'Ejercicios', routines:'Rutinas', planner:'Planner', supplements:'Suplementos', timing:'Horario Óptimo', achievements:'Logros', community:'Comunidad' },
      dashboard: { greet_morning:'Buenos días', greet_afternoon:'Buenas tardes', greet_evening:'Buenas noches', stat_weight:'Peso actual', stat_bmi:'IMC', stat_bmi_ph:'Introduce tu talla', stat_tdee:'TDEE', stat_tdee_ph:'Calcula en Nutrición', stat_records:'Registros', stat_records_ph:'Total de entradas', no_data:'Sin datos', chart_title:'Evolución del peso (últimas 8 semanas)', view_all:'Ver todo →', chart_empty:'Añade registros de peso para ver tu progreso', add_weight:'Añadir peso', quick_title:'Acceso rápido', q_weight:'Registrar peso', q_macros:'Calcular macros', q_exercises:'Ver ejercicios', q_planner:'Planner semanal', days:'días' },
      weight: { confirm_delete:'¿Eliminar este registro?', title:'Tracking de Peso', subtitle:'Registra y visualiza tu evolución corporal', export:'Exportar CSV', add:'Añadir registro', chart_title:'Evolución del peso', empty:'No hay registros de peso todavía', add_first:'Añadir mi primer registro', initial:'Inicial', current:'Actual', total_change:'Cambio total', min:'Mínimo', max:'Máximo', avg:'Promedio', history:'Historial de registros', col_date:'Fecha', col_weight:'Peso (kg)', col_change:'Cambio', col_notes:'Notas', col_actions:'Acciones', d30:'30 días', d90:'90 días', y1:'1 año', all:'Todo' },
      nutrition: { title:'Nutrición', subtitle:'Calcula tu TDEE, macros óptimos y timing de nutrientes', tab_tdee:'Calculadora TDEE', tab_macros:'Macronutrientes', tab_timing:'Timing nutrientes', tab_recipes:'Mis Recetas', tdee_title:'Calculadora TDEE', sex:'Sexo', male:'Hombre', female:'Mujer', age:'Edad', weight_f:'Peso', height:'Talla', goal:'Objetivo', activity:'Nivel de actividad', calculate:'Calcular', g_deficit_hard:'Perder peso rápido (−500 kcal)', g_deficit_soft:'Perder peso suave (−250 kcal)', g_maintain:'Mantener peso', g_surplus_soft:'Ganar músculo suave (+250 kcal)', g_surplus_hard:'Ganar músculo rápido (+500 kcal)', a_sed:'Sedentario (sin ejercicio)', a_light:'Ligero (1-3 días/semana)', a_mod:'Moderado (3-5 días/semana)', a_active:'Activo (6-7 días/semana)', a_very:'Muy activo (2 veces/día)', bmr:'TMB (BMR)', tdee_res:'TDEE', target:'Objetivo', kcal:'kcal/día', macro_dist:'Distribución de macros', protein:'Proteína', fat:'Grasa', carbs:'Hidratos', macros_title:'Distribución de Macronutrientes', macros_sub:'Guía basada en evidencia científica para la construcción muscular y la composición corporal', timing_title:'Timing de Nutrientes', timing_sub:'Optimiza tus ventanas de alimentación alrededor del entrenamiento', recipes_title:'Mis Recetas', recipes_sub:'Crea recetas personalizadas con ingredientes reales y cálculo de macros en tiempo real', saved:'Recetas guardadas', recipe_name:'Nombre de la receta', recipe_cat:'Categoría', add_ing:'Añadir ingredientes', ing_list:'Ingredientes de la receta', instructions:'Instrucciones (opcional)', rating:'Tu valoración', cancel:'Cancelar', save_recipe:'💾 Guardar receta', c_breakfast:'Desayuno', c_lunch:'Almuerzo', c_dinner:'Cena', c_snack:'Snack', c_pre:'Pre-entreno', c_post:'Post-entreno', new_recipe:'Nueva Receta' },
      exercises: { title:'Ejercicios', subtitle:'Base de datos de ejercicios con visor anatómico', search:'🔍 Buscar ejercicio...', anatomy_title:'Visor anatómico', anatomy_hint:'Haz clic en un ejercicio para ver los músculos implicados' },
      routines: { title:'Generador de Rutinas', subtitle:'Responde el cuestionario y obtén tu plan semanal personalizado', new_quiz:'↩ Nuevo cuestionario', share:'📤 Compartir rutina', loading:'Cargando atleta', drag:'Arrastra para rotar · Scroll para zoom', prev:'← Anterior', next:'Siguiente →', step:'Paso' },
      planner: { title:'Planner de Comidas', subtitle:'Arrastra recetas al calendario semanal', clear:'🗑 Limpiar semana', predefined:'Recetas predefinidas', my_recipes:'Mis Recetas', recipes_h:'Recetas', search:'🔍 Buscar receta...', search_my:'🔍 Buscar mis recetas...', weekly:'Macros semanales totales', create:'✏️ Crear nueva receta →' },
      gamification: { title:'Gamificación', subtitle:'Tu progreso, niveles, logros y desafíos semanales', achievements:'Logros', challenges:'Desafíos de la semana', streak:'Racha', badges:'Badges', challenges_count:'Desafíos', next_lvl:'— siguiente nivel' },
      community: { title:'Comunidad', subtitle:'Comparte tu progreso e inspírate con otros atletas', publish:'✏️ Publicar', placeholder:'¿Qué lograste hoy?...', cancel:'Cancelar', post:'Publicar', leaderboard:'🏆 Leaderboard' },
      supplements: { title:'Suplementos', subtitle:'Solo lo que realmente funciona — basado en evidencia científica', catalog:'Catálogo de Suplementos', loading:'Cargando suplementos…' },
      timing: { title:'Horario Óptimo', subtitle:'Genera tu horario óptimo de nutrición según tu entreno', config:'Configura tu día', train_time:'Hora de entrenamiento', duration:'Duración (min)', goal:'Objetivo', meals:'Número de comidas', bed_time:'Hora de dormir', suppl:'Suplementos que usas', generate:'⚡ Generar horario óptimo', g_hyp:'Hipertrofia (volumen)', g_def:'Definición (déficit)', g_perf:'Rendimiento deportivo', m3:'3 comidas', m4:'4 comidas', m5:'5 comidas', m6:'6 comidas' },
      chatbot: { name:'Asistente HealthStack', status:'En línea', welcome:'¡Hola! Soy tu asistente de fitness. Pregúntame sobre nutrición, ejercicio, pérdida de peso o cómo usar la app. 💪', placeholder:'Escribe tu pregunta...', send:'Enviar', q1:'¿Cuánta proteína necesito?', q2:'¿Cómo pierdo grasa?', q3:'¿Qué es el TDEE?' },
      modal: { add_weight:'Añadir registro de peso', edit_weight:'Editar registro de peso', date:'Fecha', weight:'Peso (kg)', notes:'Notas (opcional)', cancel:'Cancelar', save:'Guardar' },
      footer: { tagline:'Objetivo: siempre gratuito', support:'¿Te ayuda la app?', coffee:'☕ Invítame a un café', legal:'Los enlaces de afiliado nos ayudan a mantener la app gratuita. Nunca pagas más.' },
    },

    /* ── ENGLISH ──────────────────────────────────────────────── */
    en: {
      nav: { dashboard:'Dashboard', nutrition:'Nutrition', weight:'Weight', exercises:'Exercises', routines:'Routines', planner:'Planner', supplements:'Supplements', timing:'Optimal Schedule', achievements:'Achievements', community:'Community' },
      dashboard: { greet_morning:'Good morning', greet_afternoon:'Good afternoon', greet_evening:'Good evening', stat_weight:'Current weight', stat_bmi:'BMI', stat_bmi_ph:'Enter your height', stat_tdee:'TDEE', stat_tdee_ph:'Calculate in Nutrition', stat_records:'Records', stat_records_ph:'Total entries', no_data:'No data', chart_title:'Weight evolution (last 8 weeks)', view_all:'View all →', chart_empty:'Add weight records to see your progress', add_weight:'Add weight', quick_title:'Quick access', q_weight:'Log weight', q_macros:'Calculate macros', q_exercises:'View exercises', q_planner:'Weekly planner', days:'days' },
      weight: { confirm_delete:'Delete this entry?', title:'Weight Tracking', subtitle:'Log and visualize your body evolution', export:'Export CSV', add:'Add entry', chart_title:'Weight evolution', empty:'No weight records yet', add_first:'Add my first entry', initial:'Initial', current:'Current', total_change:'Total change', min:'Minimum', max:'Maximum', avg:'Average', history:'Entry history', col_date:'Date', col_weight:'Weight (kg)', col_change:'Change', col_notes:'Notes', col_actions:'Actions', d30:'30 days', d90:'90 days', y1:'1 year', all:'All' },
      nutrition: { title:'Nutrition', subtitle:'Calculate your TDEE, optimal macros and nutrient timing', tab_tdee:'TDEE Calculator', tab_macros:'Macronutrients', tab_timing:'Nutrient timing', tab_recipes:'My Recipes', tdee_title:'TDEE Calculator', sex:'Sex', male:'Male', female:'Female', age:'Age', weight_f:'Weight', height:'Height', goal:'Goal', activity:'Activity level', calculate:'Calculate', g_deficit_hard:'Lose weight fast (−500 kcal)', g_deficit_soft:'Lose weight slowly (−250 kcal)', g_maintain:'Maintain weight', g_surplus_soft:'Build muscle slowly (+250 kcal)', g_surplus_hard:'Build muscle fast (+500 kcal)', a_sed:'Sedentary (no exercise)', a_light:'Light (1-3 days/week)', a_mod:'Moderate (3-5 days/week)', a_active:'Active (6-7 days/week)', a_very:'Very active (twice/day)', bmr:'BMR', tdee_res:'TDEE', target:'Target', kcal:'kcal/day', macro_dist:'Macro distribution', protein:'Protein', fat:'Fat', carbs:'Carbs', macros_title:'Macronutrient Distribution', macros_sub:'Evidence-based guide for muscle building and body composition', timing_title:'Nutrient Timing', timing_sub:'Optimize your feeding windows around training', recipes_title:'My Recipes', recipes_sub:'Create custom recipes with real ingredients and real-time macro calculation', saved:'Saved recipes', recipe_name:'Recipe name', recipe_cat:'Category', add_ing:'Add ingredients', ing_list:'Recipe ingredients', instructions:'Instructions (optional)', rating:'Your rating', cancel:'Cancel', save_recipe:'💾 Save recipe', c_breakfast:'Breakfast', c_lunch:'Lunch', c_dinner:'Dinner', c_snack:'Snack', c_pre:'Pre-workout', c_post:'Post-workout', new_recipe:'New Recipe' },
      exercises: { title:'Exercises', subtitle:'Exercise database with anatomical viewer', search:'🔍 Search exercise...', anatomy_title:'Anatomical viewer', anatomy_hint:'Click an exercise to see the muscles involved' },
      routines: { title:'Routine Generator', subtitle:'Answer the questionnaire and get your personalized weekly plan', new_quiz:'↩ New questionnaire', share:'📤 Share routine', loading:'Loading athlete', drag:'Drag to rotate · Scroll to zoom', prev:'← Previous', next:'Next →', step:'Step' },
      planner: { title:'Meal Planner', subtitle:'Drag recipes onto the weekly calendar', clear:'🗑 Clear week', predefined:'Preset recipes', my_recipes:'My Recipes', recipes_h:'Recipes', search:'🔍 Search recipe...', search_my:'🔍 Search my recipes...', weekly:'Weekly total macros', create:'✏️ Create new recipe →' },
      gamification: { title:'Gamification', subtitle:'Your progress, levels, achievements and weekly challenges', achievements:'Achievements', challenges:'Weekly challenges', streak:'Streak', badges:'Badges', challenges_count:'Challenges', next_lvl:'— next level' },
      community: { title:'Community', subtitle:'Share your progress and get inspired by other athletes', publish:'✏️ Post', placeholder:"What did you achieve today?...", cancel:'Cancel', post:'Post', leaderboard:'🏆 Leaderboard' },
      supplements: { title:'Supplements', subtitle:'Only what actually works — evidence-based', catalog:'Supplement Catalog', loading:'Loading supplements…' },
      timing: { title:'Optimal Schedule', subtitle:'Generate your optimal nutrition schedule based on your training', config:'Configure your day', train_time:'Training time', duration:'Duration (min)', goal:'Goal', meals:'Number of meals', bed_time:'Bedtime', suppl:'Supplements you use', generate:'⚡ Generate optimal schedule', g_hyp:'Hypertrophy (bulk)', g_def:'Definition (cut)', g_perf:'Sports performance', m3:'3 meals', m4:'4 meals', m5:'5 meals', m6:'6 meals' },
      chatbot: { name:'HealthStack Assistant', status:'Online', welcome:"Hi! I'm your fitness assistant. Ask me about nutrition, exercise, weight loss or how to use the app. 💪", placeholder:'Type your question...', send:'Send', q1:'How much protein do I need?', q2:'How do I lose fat?', q3:'What is TDEE?' },
      modal: { add_weight:'Add weight entry', edit_weight:'Edit weight entry', date:'Date', weight:'Weight (kg)', notes:'Notes (optional)', cancel:'Cancel', save:'Save' },
      footer: { tagline:'Goal: always free', support:'Is the app helping you?', coffee:'☕ Buy me a coffee', legal:'Affiliate links help us keep the app free. You never pay more.' },
    },

    /* ── FRANÇAIS ─────────────────────────────────────────────── */
    fr: {
      nav: { dashboard:'Tableau de bord', nutrition:'Nutrition', weight:'Poids', exercises:'Exercices', routines:'Routines', planner:'Planificateur', supplements:'Compléments', timing:'Horaire Optimal', achievements:'Succès', community:'Communauté' },
      dashboard: { greet_morning:'Bonjour', greet_afternoon:'Bon après-midi', greet_evening:'Bonsoir', stat_weight:'Poids actuel', stat_bmi:'IMC', stat_bmi_ph:'Entrez votre taille', stat_tdee:'TDEE', stat_tdee_ph:'Calculer dans Nutrition', stat_records:'Entrées', stat_records_ph:'Total des entrées', no_data:'Sans données', chart_title:'Évolution du poids (8 dernières semaines)', view_all:'Voir tout →', chart_empty:'Ajoutez des poids pour voir votre progression', add_weight:'Ajouter poids', quick_title:'Accès rapide', q_weight:'Enregistrer poids', q_macros:'Calculer macros', q_exercises:'Voir exercices', q_planner:'Planificateur', days:'jours' },
      weight: { confirm_delete:'Supprimer cette entrée ?', title:'Suivi du Poids', subtitle:'Enregistrez et visualisez votre évolution corporelle', export:'Exporter CSV', add:'Ajouter entrée', chart_title:'Évolution du poids', empty:"Pas encore d'entrées de poids", add_first:'Ajouter ma première entrée', initial:'Initial', current:'Actuel', total_change:'Changement total', min:'Minimum', max:'Maximum', avg:'Moyenne', history:'Historique des entrées', col_date:'Date', col_weight:'Poids (kg)', col_change:'Variation', col_notes:'Notes', col_actions:'Actions', d30:'30 jours', d90:'90 jours', y1:'1 an', all:'Tout' },
      nutrition: { title:'Nutrition', subtitle:'Calculez votre TDEE, macros optimaux et timing nutritionnel', tab_tdee:'Calculateur TDEE', tab_macros:'Macronutriments', tab_timing:'Timing nutriments', tab_recipes:'Mes Recettes', tdee_title:'Calculateur TDEE', sex:'Sexe', male:'Homme', female:'Femme', age:'Âge', weight_f:'Poids', height:'Taille', goal:'Objectif', activity:"Niveau d'activité", calculate:'Calculer', g_deficit_hard:'Perdre du poids vite (−500 kcal)', g_deficit_soft:'Perdre du poids doucement (−250 kcal)', g_maintain:'Maintenir le poids', g_surplus_soft:'Prendre du muscle doucement (+250 kcal)', g_surplus_hard:'Prendre du muscle vite (+500 kcal)', a_sed:'Sédentaire (sans exercice)', a_light:'Léger (1-3 jours/semaine)', a_mod:'Modéré (3-5 jours/semaine)', a_active:'Actif (6-7 jours/semaine)', a_very:'Très actif (2 fois/jour)', bmr:'MB (BMR)', tdee_res:'TDEE', target:'Objectif', kcal:'kcal/jour', macro_dist:'Répartition des macros', protein:'Protéines', fat:'Lipides', carbs:'Glucides', macros_title:'Répartition des Macronutriments', macros_sub:'Guide basé sur des preuves scientifiques pour la construction musculaire et la composition corporelle', timing_title:'Timing des Nutriments', timing_sub:"Optimisez vos fenêtres d'alimentation autour de l'entraînement", recipes_title:'Mes Recettes', recipes_sub:'Créez des recettes personnalisées avec de vrais ingrédients et calcul des macros en temps réel', saved:'Recettes sauvegardées', recipe_name:'Nom de la recette', recipe_cat:'Catégorie', add_ing:'Ajouter des ingrédients', ing_list:'Ingrédients de la recette', instructions:'Instructions (optionnel)', rating:'Votre note', cancel:'Annuler', save_recipe:'💾 Sauvegarder la recette', c_breakfast:'Petit-déjeuner', c_lunch:'Déjeuner', c_dinner:'Dîner', c_snack:'Collation', c_pre:'Pré-entraînement', c_post:'Post-entraînement', new_recipe:'Nouvelle Recette' },
      exercises: { title:'Exercices', subtitle:'Base de données avec visionneuse anatomique', search:'🔍 Chercher exercice...', anatomy_title:'Visionneuse anatomique', anatomy_hint:"Cliquez sur un exercice pour voir les muscles impliqués" },
      routines: { title:'Générateur de Routines', subtitle:'Répondez au questionnaire et obtenez votre plan hebdomadaire personnalisé', new_quiz:'↩ Nouveau questionnaire', share:'📤 Partager routine', loading:'Chargement athlète', drag:'Faites glisser pour pivoter · Défilez pour zoomer', prev:'← Précédent', next:'Suivant →', step:'Étape' },
      planner: { title:'Planificateur de Repas', subtitle:'Glissez des recettes sur le calendrier hebdomadaire', clear:'🗑 Effacer la semaine', predefined:'Recettes prédéfinies', my_recipes:'Mes Recettes', recipes_h:'Recettes', search:'🔍 Chercher recette...', search_my:'🔍 Chercher mes recettes...', weekly:'Macros hebdomadaires totaux', create:'✏️ Créer nouvelle recette →' },
      gamification: { title:'Gamification', subtitle:'Vos progrès, niveaux, succès et défis hebdomadaires', achievements:'Succès', challenges:'Défis de la semaine', streak:'Série', badges:'Badges', challenges_count:'Défis', next_lvl:'— niveau suivant' },
      community: { title:'Communauté', subtitle:'Partagez vos progrès et inspirez-vous des autres athlètes', publish:"✏️ Publier", placeholder:"Qu'avez-vous accompli aujourd'hui ?...", cancel:'Annuler', post:'Publier', leaderboard:'🏆 Classement' },
      supplements: { title:'Compléments', subtitle:'Seulement ce qui fonctionne vraiment — basé sur des preuves scientifiques', catalog:'Catalogue de Compléments', loading:'Chargement des compléments…' },
      timing: { title:'Horaire Optimal', subtitle:'Générez votre horaire nutritionnel optimal selon votre entraînement', config:'Configurez votre journée', train_time:"Heure d'entraînement", duration:'Durée (min)', goal:'Objectif', meals:'Nombre de repas', bed_time:'Heure du coucher', suppl:'Compléments que vous utilisez', generate:'⚡ Générer horaire optimal', g_hyp:'Hypertrophie (volume)', g_def:'Définition (déficit)', g_perf:'Performance sportive', m3:'3 repas', m4:'4 repas', m5:'5 repas', m6:'6 repas' },
      chatbot: { name:'Assistant HealthStack', status:'En ligne', welcome:"Bonjour ! Je suis votre assistant fitness. Demandez-moi sur la nutrition, l'exercice, la perte de poids ou comment utiliser l'app. 💪", placeholder:'Écrivez votre question...', send:'Envoyer', q1:'De combien de protéines ai-je besoin ?', q2:'Comment perdre de la graisse ?', q3:"Qu'est-ce que le TDEE ?" },
      modal: { add_weight:'Ajouter entrée de poids', edit_weight:'Modifier entrée de poids', date:'Date', weight:'Poids (kg)', notes:'Notes (optionnel)', cancel:'Annuler', save:'Sauvegarder' },
      footer: { tagline:'Objectif : toujours gratuit', support:"L'app vous aide ?", coffee:'☕ Offrez-moi un café', legal:'Les liens affiliés nous aident à garder l\'app gratuite. Vous ne payez jamais plus.' },
    },

    /* ── DEUTSCH ──────────────────────────────────────────────── */
    de: {
      nav: { dashboard:'Dashboard', nutrition:'Ernährung', weight:'Gewicht', exercises:'Übungen', routines:'Routinen', planner:'Planer', supplements:'Supplemente', timing:'Optimaler Zeitplan', achievements:'Erfolge', community:'Community' },
      dashboard: { greet_morning:'Guten Morgen', greet_afternoon:'Guten Tag', greet_evening:'Guten Abend', stat_weight:'Aktuelles Gewicht', stat_bmi:'BMI', stat_bmi_ph:'Körpergröße eingeben', stat_tdee:'TDEE', stat_tdee_ph:'In Ernährung berechnen', stat_records:'Einträge', stat_records_ph:'Gesamteinträge', no_data:'Keine Daten', chart_title:'Gewichtsverlauf (letzte 8 Wochen)', view_all:'Alle ansehen →', chart_empty:'Füge Gewichtseinträge hinzu, um deinen Fortschritt zu sehen', add_weight:'Gewicht hinzufügen', quick_title:'Schnellzugriff', q_weight:'Gewicht erfassen', q_macros:'Makros berechnen', q_exercises:'Übungen ansehen', q_planner:'Wochenplaner', days:'Tage' },
      weight: { confirm_delete:'Diesen Eintrag löschen?', title:'Gewichtsverfolgung', subtitle:'Erfasse und visualisiere deine Körperentwicklung', export:'CSV exportieren', add:'Eintrag hinzufügen', chart_title:'Gewichtsverlauf', empty:'Noch keine Gewichtseinträge', add_first:'Meinen ersten Eintrag hinzufügen', initial:'Anfang', current:'Aktuell', total_change:'Gesamtveränderung', min:'Minimum', max:'Maximum', avg:'Durchschnitt', history:'Eintragshistorie', col_date:'Datum', col_weight:'Gewicht (kg)', col_change:'Änderung', col_notes:'Notizen', col_actions:'Aktionen', d30:'30 Tage', d90:'90 Tage', y1:'1 Jahr', all:'Alle' },
      nutrition: { title:'Ernährung', subtitle:'Berechne deinen TDEE, optimale Makros und Nährstofftiming', tab_tdee:'TDEE-Rechner', tab_macros:'Makronährstoffe', tab_timing:'Nährstofftiming', tab_recipes:'Meine Rezepte', tdee_title:'TDEE-Rechner', sex:'Geschlecht', male:'Mann', female:'Frau', age:'Alter', weight_f:'Gewicht', height:'Größe', goal:'Ziel', activity:'Aktivitätsniveau', calculate:'Berechnen', g_deficit_hard:'Schnell abnehmen (−500 kcal)', g_deficit_soft:'Langsam abnehmen (−250 kcal)', g_maintain:'Gewicht halten', g_surplus_soft:'Langsam Muskeln aufbauen (+250 kcal)', g_surplus_hard:'Schnell Muskeln aufbauen (+500 kcal)', a_sed:'Sitzend (kein Sport)', a_light:'Leicht (1-3 Tage/Woche)', a_mod:'Moderat (3-5 Tage/Woche)', a_active:'Aktiv (6-7 Tage/Woche)', a_very:'Sehr aktiv (2x täglich)', bmr:'Grundumsatz (BMR)', tdee_res:'TDEE', target:'Ziel', kcal:'kcal/Tag', macro_dist:'Makroverteilung', protein:'Protein', fat:'Fett', carbs:'Kohlenhydrate', macros_title:'Makronährstoffverteilung', macros_sub:'Evidenzbasierter Leitfaden für Muskelaufbau und Körperzusammensetzung', timing_title:'Nährstofftiming', timing_sub:'Optimiere deine Ernährungsfenster rund ums Training', recipes_title:'Meine Rezepte', recipes_sub:'Erstelle individuelle Rezepte mit echten Zutaten und Echtzeit-Makroberechnung', saved:'Gespeicherte Rezepte', recipe_name:'Rezeptname', recipe_cat:'Kategorie', add_ing:'Zutaten hinzufügen', ing_list:'Rezeptzutaten', instructions:'Anleitung (optional)', rating:'Deine Bewertung', cancel:'Abbrechen', save_recipe:'💾 Rezept speichern', c_breakfast:'Frühstück', c_lunch:'Mittagessen', c_dinner:'Abendessen', c_snack:'Snack', c_pre:'Pre-Workout', c_post:'Post-Workout', new_recipe:'Neues Rezept' },
      exercises: { title:'Übungen', subtitle:'Übungsdatenbank mit anatomischem Viewer', search:'🔍 Übung suchen...', anatomy_title:'Anatomischer Viewer', anatomy_hint:'Klicke auf eine Übung, um die beteiligten Muskeln zu sehen' },
      routines: { title:'Routine-Generator', subtitle:'Beantworte den Fragebogen und erhalte deinen personalisierten Wochenplan', new_quiz:'↩ Neuer Fragebogen', share:'📤 Routine teilen', loading:'Athlet lädt', drag:'Ziehen zum Drehen · Scrollen zum Zoomen', prev:'← Zurück', next:'Weiter →', step:'Schritt' },
      planner: { title:'Mahlzeitenplaner', subtitle:'Ziehe Rezepte in den Wochenkalender', clear:'🗑 Woche leeren', predefined:'Vordefinierte Rezepte', my_recipes:'Meine Rezepte', recipes_h:'Rezepte', search:'🔍 Rezept suchen...', search_my:'🔍 Meine Rezepte suchen...', weekly:'Wöchentliche Gesamt-Makros', create:'✏️ Neues Rezept erstellen →' },
      gamification: { title:'Gamification', subtitle:'Dein Fortschritt, Level, Erfolge und wöchentliche Challenges', achievements:'Erfolge', challenges:'Wöchentliche Challenges', streak:'Serie', badges:'Badges', challenges_count:'Challenges', next_lvl:'— nächstes Level' },
      community: { title:'Community', subtitle:'Teile deinen Fortschritt und inspiriere dich bei anderen Athleten', publish:'✏️ Veröffentlichen', placeholder:'Was hast du heute erreicht?...', cancel:'Abbrechen', post:'Veröffentlichen', leaderboard:'🏆 Rangliste' },
      supplements: { title:'Supplemente', subtitle:'Nur was wirklich funktioniert — evidenzbasiert', catalog:'Supplement-Katalog', loading:'Supplemente laden…' },
      timing: { title:'Optimaler Zeitplan', subtitle:'Erstelle deinen optimalen Ernährungsplan basierend auf deinem Training', config:'Deinen Tag konfigurieren', train_time:'Trainingszeit', duration:'Dauer (min)', goal:'Ziel', meals:'Anzahl der Mahlzeiten', bed_time:'Schlafenszeit', suppl:'Supplemente die du verwendest', generate:'⚡ Optimalen Plan erstellen', g_hyp:'Hypertrophie (Aufbau)', g_def:'Definition (Diät)', g_perf:'Sportliche Leistung', m3:'3 Mahlzeiten', m4:'4 Mahlzeiten', m5:'5 Mahlzeiten', m6:'6 Mahlzeiten' },
      chatbot: { name:'HealthStack Assistent', status:'Online', welcome:'Hallo! Ich bin dein Fitness-Assistent. Frag mich zu Ernährung, Sport, Gewichtsverlust oder App-Nutzung. 💪', placeholder:'Schreibe deine Frage...', send:'Senden', q1:'Wie viel Protein brauche ich?', q2:'Wie verliere ich Fett?', q3:'Was ist TDEE?' },
      modal: { add_weight:'Gewichtseintrag hinzufügen', edit_weight:'Gewichtseintrag bearbeiten', date:'Datum', weight:'Gewicht (kg)', notes:'Notizen (optional)', cancel:'Abbrechen', save:'Speichern' },
      footer: { tagline:'Ziel: immer kostenlos', support:'Hilft dir die App?', coffee:'☕ Kauf mir einen Kaffee', legal:'Affiliate-Links helfen uns, die App kostenlos zu halten. Du zahlst nie mehr.' },
    },

    /* ── ITALIANO ─────────────────────────────────────────────── */
    it: {
      nav: { dashboard:'Dashboard', nutrition:'Nutrizione', weight:'Peso', exercises:'Esercizi', routines:'Routine', planner:'Pianificatore', supplements:'Integratori', timing:'Orario Ottimale', achievements:'Successi', community:'Community' },
      dashboard: { greet_morning:'Buongiorno', greet_afternoon:'Buon pomeriggio', greet_evening:'Buonasera', stat_weight:'Peso attuale', stat_bmi:'IMC', stat_bmi_ph:'Inserisci la tua altezza', stat_tdee:'TDEE', stat_tdee_ph:'Calcola in Nutrizione', stat_records:'Registrazioni', stat_records_ph:'Totale voci', no_data:'Nessun dato', chart_title:'Evoluzione del peso (ultime 8 settimane)', view_all:'Vedi tutto →', chart_empty:'Aggiungi registrazioni peso per vedere i progressi', add_weight:'Aggiungi peso', quick_title:'Accesso rapido', q_weight:'Registra peso', q_macros:'Calcola macros', q_exercises:'Vedi esercizi', q_planner:'Pianificatore', days:'giorni' },
      weight: { confirm_delete:'Eliminare questa voce?', title:'Monitoraggio Peso', subtitle:'Registra e visualizza la tua evoluzione corporea', export:'Esporta CSV', add:'Aggiungi voce', chart_title:'Evoluzione del peso', empty:'Ancora nessuna registrazione peso', add_first:'Aggiungi la mia prima voce', initial:'Iniziale', current:'Attuale', total_change:'Variazione totale', min:'Minimo', max:'Massimo', avg:'Media', history:'Cronologia voci', col_date:'Data', col_weight:'Peso (kg)', col_change:'Variazione', col_notes:'Note', col_actions:'Azioni', d30:'30 giorni', d90:'90 giorni', y1:'1 anno', all:'Tutto' },
      nutrition: { title:'Nutrizione', subtitle:'Calcola il tuo TDEE, macros ottimali e timing dei nutrienti', tab_tdee:'Calcolatore TDEE', tab_macros:'Macronutrienti', tab_timing:'Timing nutrienti', tab_recipes:'Le Mie Ricette', tdee_title:'Calcolatore TDEE', sex:'Sesso', male:'Uomo', female:'Donna', age:'Età', weight_f:'Peso', height:'Altezza', goal:'Obiettivo', activity:"Livello d'attività", calculate:'Calcola', g_deficit_hard:'Perdere peso velocemente (−500 kcal)', g_deficit_soft:'Perdere peso lentamente (−250 kcal)', g_maintain:'Mantenere il peso', g_surplus_soft:'Aumentare muscoli lentamente (+250 kcal)', g_surplus_hard:'Aumentare muscoli velocemente (+500 kcal)', a_sed:'Sedentario (nessun esercizio)', a_light:'Leggero (1-3 giorni/settimana)', a_mod:'Moderato (3-5 giorni/settimana)', a_active:'Attivo (6-7 giorni/settimana)', a_very:'Molto attivo (2 volte/giorno)', bmr:'MB (BMR)', tdee_res:'TDEE', target:'Obiettivo', kcal:'kcal/giorno', macro_dist:'Distribuzione macros', protein:'Proteine', fat:'Grassi', carbs:'Carboidrati', macros_title:'Distribuzione dei Macronutrienti', macros_sub:"Guida basata su prove scientifiche per la costruzione muscolare e la composizione corporea", timing_title:'Timing dei Nutrienti', timing_sub:"Ottimizza le tue finestre alimentari intorno all'allenamento", recipes_title:'Le Mie Ricette', recipes_sub:'Crea ricette personalizzate con ingredienti reali e calcolo macros in tempo reale', saved:'Ricette salvate', recipe_name:'Nome ricetta', recipe_cat:'Categoria', add_ing:'Aggiungi ingredienti', ing_list:'Ingredienti ricetta', instructions:'Istruzioni (opzionale)', rating:'La tua valutazione', cancel:'Annulla', save_recipe:'💾 Salva ricetta', c_breakfast:'Colazione', c_lunch:'Pranzo', c_dinner:'Cena', c_snack:'Spuntino', c_pre:'Pre-allenamento', c_post:'Post-allenamento', new_recipe:'Nuova Ricetta' },
      exercises: { title:'Esercizi', subtitle:'Database esercizi con visualizzatore anatomico', search:'🔍 Cerca esercizio...', anatomy_title:'Visualizzatore anatomico', anatomy_hint:"Clicca su un esercizio per vedere i muscoli coinvolti" },
      routines: { title:'Generatore di Routine', subtitle:'Rispondi al questionario e ottieni il tuo piano settimanale personalizzato', new_quiz:'↩ Nuovo questionario', share:'📤 Condividi routine', loading:'Caricamento atleta', drag:'Trascina per ruotare · Scorri per zoom', prev:'← Precedente', next:'Avanti →', step:'Passo' },
      planner: { title:'Pianificatore Pasti', subtitle:'Trascina le ricette sul calendario settimanale', clear:'🗑 Svuota settimana', predefined:'Ricette predefinite', my_recipes:'Le Mie Ricette', recipes_h:'Ricette', search:'🔍 Cerca ricetta...', search_my:'🔍 Cerca le mie ricette...', weekly:'Macros settimanali totali', create:'✏️ Crea nuova ricetta →' },
      gamification: { title:'Gamification', subtitle:'I tuoi progressi, livelli, successi e sfide settimanali', achievements:'Successi', challenges:'Sfide della settimana', streak:'Serie', badges:'Badge', challenges_count:'Sfide', next_lvl:'— livello successivo' },
      community: { title:'Community', subtitle:'Condividi i tuoi progressi e ispirati dagli altri atleti', publish:'✏️ Pubblica', placeholder:"Cosa hai realizzato oggi?...", cancel:'Annulla', post:'Pubblica', leaderboard:'🏆 Classifica' },
      supplements: { title:'Integratori', subtitle:'Solo ciò che funziona davvero — basato su evidenze scientifiche', catalog:'Catalogo Integratori', loading:'Caricamento integratori…' },
      timing: { title:'Orario Ottimale', subtitle:'Genera il tuo orario nutrizionale ottimale in base al tuo allenamento', config:'Configura la tua giornata', train_time:'Orario allenamento', duration:'Durata (min)', goal:'Obiettivo', meals:'Numero di pasti', bed_time:'Ora di andare a letto', suppl:'Integratori che usi', generate:'⚡ Genera orario ottimale', g_hyp:'Ipertrofia (massa)', g_def:'Definizione (deficit)', g_perf:'Prestazione sportiva', m3:'3 pasti', m4:'4 pasti', m5:'5 pasti', m6:'6 pasti' },
      chatbot: { name:'Assistente HealthStack', status:'Online', welcome:"Ciao! Sono il tuo assistente fitness. Chiedimi di nutrizione, esercizio, perdita di peso o come usare l'app. 💪", placeholder:'Scrivi la tua domanda...', send:'Invia', q1:'Quante proteine ho bisogno?', q2:'Come perdo grasso?', q3:'Cos\'è il TDEE?' },
      modal: { add_weight:'Aggiungi registrazione peso', edit_weight:'Modifica registrazione peso', date:'Data', weight:'Peso (kg)', notes:'Note (opzionale)', cancel:'Annulla', save:'Salva' },
      footer: { tagline:'Obiettivo: sempre gratuito', support:"L'app ti aiuta?", coffee:'☕ Offrimi un caffè', legal:"I link affiliati ci aiutano a mantenere l'app gratuita. Non paghi mai di più." },
    },

  } /* /LOCALES */

  /* ── Engine ─────────────────────────────────────────────────── */

  const FLAGS  = { es:'🇪🇸', en:'🇬🇧', fr:'🇫🇷', de:'🇩🇪', it:'🇮🇹' }
  const LABELS = { es:'ES', en:'EN', fr:'FR', de:'DE', it:'IT' }
  let current  = localStorage.getItem('hs-app-lang') || 'es'

  function t(key) {
    const keys = key.split('.')
    let val = LOCALES[current]
    for (const k of keys) val = val?.[k]
    if (val !== undefined) return val
    let fb = LOCALES.es
    for (const k of keys) fb = fb?.[k]
    return fb ?? key
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key  = el.dataset.i18n
      const attr = el.dataset.i18nAttr
      const val  = t(key)
      if (attr) el.setAttribute(attr, val)
      else el.textContent = val
    })
    document.documentElement.lang = current
    // Update select options
    document.querySelectorAll('[data-i18n-opts]').forEach(sel => {
      const base = sel.dataset.i18nOpts
      Array.from(sel.options).forEach((opt, i) => {
        const k = `${base}.${opt.dataset.i18nKey || i}`
        const v = t(k)
        if (v !== k) opt.textContent = v
      })
    })
    updateLangBtn()
  }

  function setLanguage(code) {
    if (!LOCALES[code]) return
    current = code
    localStorage.setItem('hs-app-lang', code)
    applyTranslations()
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: code } }))
  }

  function updateLangBtn() {
    const btn = document.getElementById('hs-lang-btn')
    if (btn) btn.innerHTML = `${FLAGS[current]} <span>${LABELS[current]}</span>`
  }

  /* ── Language Selector (injected into sidebar footer) ───────── */
  function injectLangSelector() {
    const footer = document.querySelector('.sidebar__footer')
    if (!footer || document.getElementById('hs-lang-selector')) return

    const wrap = document.createElement('div')
    wrap.id = 'hs-lang-selector'
    wrap.style.cssText = 'position:relative;margin-bottom:10px'

    wrap.innerHTML = `
      <button id="hs-lang-btn" style="
        display:flex;align-items:center;gap:6px;width:100%;
        padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);
        background:rgba(255,255,255,0.04);color:#fff;cursor:pointer;
        font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
        transition:background .15s
      ">${FLAGS[current]} <span>${LABELS[current]}</span>
      <svg style="margin-left:auto;width:12px;height:12px;transition:transform .2s" id="hs-lang-chevron"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
      </svg></button>
      <div id="hs-lang-dd" style="
        display:none;position:absolute;bottom:calc(100% + 6px);left:0;right:0;
        background:#0e0e1a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;
        overflow:hidden;box-shadow:0 -16px 40px rgba(0,0,0,.8);z-index:999
      ">
        ${Object.entries(FLAGS).map(([code, flag]) => `
          <button data-lang="${code}" style="
            display:flex;align-items:center;gap:10px;width:100%;padding:9px 14px;
            background:transparent;border:none;color:#ccc;cursor:pointer;
            font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
            transition:background .12s
          " onmouseover="this.style.background='rgba(255,255,255,0.06)'"
             onmouseout="this.style.background='transparent'">
            <span style="font-size:16px">${flag}</span>
            ${{ es:'Español', en:'English', fr:'Français', de:'Deutsch', it:'Italiano' }[code]}
            ${code === current ? '<svg style="margin-left:auto;width:12px;height:12px;color:#f97316" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
          </button>`).join('')}
      </div>`

    footer.prepend(wrap)

    // Toggle dropdown
    document.getElementById('hs-lang-btn').addEventListener('click', () => {
      const dd  = document.getElementById('hs-lang-dd')
      const ch  = document.getElementById('hs-lang-chevron')
      const open = dd.style.display === 'none'
      dd.style.display = open ? 'block' : 'none'
      ch.style.transform = open ? 'rotate(180deg)' : ''
    })

    // Select language
    wrap.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        setLanguage(btn.dataset.lang)
        document.getElementById('hs-lang-dd').style.display = 'none'
        document.getElementById('hs-lang-chevron').style.transform = ''
        // Re-render active section hint
        document.querySelectorAll('[data-lang]').forEach(b => {
          b.querySelector('svg')?.remove()
          if (b.dataset.lang === current) {
            b.insertAdjacentHTML('beforeend', '<svg style="margin-left:auto;width:12px;height:12px;color:#f97316" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>')
          }
        })
      })
    })

    // Close on outside click
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) {
        document.getElementById('hs-lang-dd').style.display = 'none'
        document.getElementById('hs-lang-chevron').style.transform = ''
      }
    })
  }

  /* ── Init ────────────────────────────────────────────────────── */
  window.t            = t
  window.setLanguage  = setLanguage
  window.getLanguage  = () => current

  // Wait for DOM (defer guarantees it, but double-safe with DOMContentLoaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { injectLangSelector(); applyTranslations() })
  } else {
    injectLangSelector()
    applyTranslations()
  }

})()
