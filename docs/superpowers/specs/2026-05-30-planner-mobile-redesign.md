# Planner de Comidas — Mobile Redesign

**Fecha:** 2026-05-30  
**Branch:** feat/planner-mobile-redesign

## Problema

El planner actual es un grid 7×5 diseñado para desktop con drag & drop. En móvil es inusable: tabla horizontal con scroll, interacción de arrastre torpe, sin vista de "hoy".

## Diseño aprobado

### Layout
- **Strip semanal** (L–D) en la parte superior con punto indicador de comidas por día
- **Vista diaria** como pantalla principal (MFP-style), navegable con flechas y swipe
- Botón **[Hoy]** en el header para volver al día actual

### Comidas configurables (2–6, por defecto 4)
- Controles **[−] n comidas [+]** en el header del día
- Botón **⚙** para aplicar configuración a todo el día o toda la semana
- Sets predefinidos por número:
  - 2: Comida · Cena
  - 3: Desayuno · Almuerzo · Cena
  - 4: Desayuno · Almuerzo · Merienda · Cena *(default)*
  - 5: Desayuno · Media mañana · Almuerzo · Merienda · Cena
  - 6: Desayuno · Media mañana · Almuerzo · Merienda · Cena · Post-entreno

### Bottom sheet de recetas
- Se abre al pulsar **[+ Añadir]** en cualquier comida
- Muestra **Mis Recetas primero** (del módulo MyRecipes)
- Catálogo predefinido debajo con chips de categoría pre-seleccionada por tipo de comida
- Búsqueda en tiempo real sobre ambas secciones
- Tap en receta → añade y cierra el sheet

### Datos
- Nuevo LS key: `hs_planner_v2` → `{ "YYYY-MM-DD": { "Desayuno": recipeId } }`
- Config: `hs_planner_cfg` → `{ mealsPerDay: 4, perDay: { "YYYY-MM-DD": 3 } }`
- Migración automática desde `hs_planner` (formato antiguo)

## Archivos modificados
- `frontend/js/planner.js` — reescritura completa
- `frontend/index.html` — sección planner reemplazada
- `frontend/css/main.css` — nuevos estilos, los viejos de grid se conservan
