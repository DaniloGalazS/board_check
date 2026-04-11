# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Qué es este proyecto

MVP de análisis de stock inmovilizado para la industria papelera/cartulinas. Dado el inventario en stock, determina qué productos terminados (FG) pueden fabricarse reutilizando materiales con alto aging, calculando la pérdida por usar material sub-óptimo (mayor al necesario).

Forma parte de una aplicación mayor llamada **Forecast Hub**.

## Stack

- **React + TypeScript** (Vite)
- **Tailwind CSS** con `darkMode: 'class'` — modo claro por defecto, oscuro vía clase `dark` en `<html>`
- **IndexedDB** (librería `idb`) para persistencia local de los datos cargados
- **xlsx** para parseo de archivos Excel
- **React Router** para navegación
- **Vercel** para deploy (`vercel.json` incluido)

## Estructura de archivos clave

```
src/
  lib/
    types.ts          — Todas las interfaces TypeScript
    excelParser.ts    — Parseo de los 3 archivos Excel
    analysisEngine.ts — Lógica central del cruce de datos
    storage.ts        — Lectura/escritura en IndexedDB
    useTheme.ts       — Hook de tema claro/oscuro (localStorage + clase html)
  pages/
    Home.tsx          — Menú inicial ("Board Check")
    DataUpload.tsx    — Carga de archivos con drag & drop
    Analysis.tsx      — Pantalla principal de análisis + KPIs
    Configuration.tsx — Configuración de días mínimos de aging
  components/
    KpiCard.tsx            — Card de KPI con variantes de color (default/warning/success/danger)
    MaterialTable.tsx      — Tabla principal con filas expandibles
    ExpandedProductRow.tsx — Detalle de productos candidatos (fila expandida)
    FilterBar.tsx          — Filtros: article group, article no., solo con alternativa
    FileUploadZone.tsx     — Zona drag & drop por archivo
    ThemeToggle.tsx        — Botón flotante ☀️/🌙 (esquina inferior derecha)
files/
  BOINV.xlsx      — Stock de materiales (fuente de datos)
  PROD-STD.xlsx   — Producciones históricas
  ITEMPP.xlsx     — Master data de materiales
references/       — Imágenes de referencia para bugs/UI
```

## Fuentes de datos (Excel)

Los tres archivos tienen una estructura fija con **4 filas de cabecera** antes de los datos:
- Fila 0: resumen/totales
- Fila 1: nombres técnicos internos (ITEMGROUPID, ITEMVARIANTE…)
- Fila 2: vacía
- Fila 3: headers legibles ("Article group", "Article no.", etc.) ← **header real**
- Fila 4+: datos (filas con "D" en columna Row)

El `excelParser.ts` detecta dinámicamente el header real buscando marcadores como `"article group"`, `"stock age"`, `"grain"`, etc.

### BOINV — Materiales en stock
Columnas relevantes: `Article group`, `Article no.`, `Article description`, `Variant`, `Stock Age`, `batch no.`, `Quantity (stock unit)`, `Stock unit`, `Valuated amount`, `Mill currency`

- `Variant` contiene dimensiones en formato `NNNNxNNNN` (ej. `1450x1000`) y opcionalmente sufijo de certificación (`_PEFC`, `_FSC`)
- `Article description` contiene el gramaje: ej. `"MM-Topliner 250g"` → 250 g/m²
- Los valores monetarios usan coma como separador de miles: `"227,250.00"` → 227250

### PROD-STD — Producciones históricas
Columnas relevantes: `JobRef`, `Article no.` (FG fabricado), `Variant` (FG), `Article description`, `article in`, `Kunde`, `Lanes`, `Nominal Good Qty`, `Production Time [h]`

- `article in` = material consumido en formato `"ARTICLE_NO/VARIANT"` (ej. `"BO04990/0906x0563_PEFC"`)
- `Lanes` = unidades por pliego (pcs/SHT), crucial para calcular unidades producibles

### ITEMPP — Master data
Columnas relevantes: `Article no.`, `Variant`, `496, Long-/Short Grain`

- Dirección de fibra: `"1 : Schmalbahn"` (Short Grain) o `"2 : Breitbahn"` (Long Grain)

## Lógica del análisis (`analysisEngine.ts`)

1. **Índice de dirección de fibra** desde ITEMPP: clave `"articleNo|variant"` → grainDirection
2. **Índice PROD-STD** por `articleNo` del material consumido
3. **Filtrar stock aged**: `stockAge > config.minStockAgeDays` (default 200)
4. Por cada material aged, buscar candidatos en PROD-STD que consuman ese `articleNo`
5. Por cada candidato, verificar compatibilidad:
   - **Dimensiones**: `productWidth ≤ stockWidth AND productHeight ≤ stockHeight`
   - **Dirección de fibra**: deben coincidir si ambos tienen dato; si falta uno → compatible
   - **Certificación**: si el producto exige PEFC/FSC, el stock debe tener exactamente esa cert; si el producto no tiene cert → cualquier material sirve
6. Calcular pérdida: `lossPct = (stockArea - productArea) / stockArea * 100`
7. Calcular unidades producibles: `floor(totalSheets × lanes)`
8. Agregar stats por `articleGroup` para KPIs filtrados (`groupStats`)

### Tipos clave en `types.ts`

**`MaterialMatch`** — un producto candidato para un material:
- `fgArticleNo`, `fgVariant`, `fgDescription`, `kunde`, `lanes`
- `consumedArticleNo`, `consumedVariant` — material consumido según PROD-STD (para verificación)
- `unitsProducible` — `floor(totalSheets × lanes)`
- `lossPct`, `kgUtilizable`, `lossAmountCLP`

**`AnalyzedMaterial`** — un material aged del BOINV con sus candidatos:
- `minLossPct`, `avgLossPct`, `maxLossPct` — rango y promedio de pérdida entre todos los candidatos
- `totalSheets` — pliegos totales calculados desde kg+dims+gramaje
- `batchNo` — número de lote (o `"N lotes"` cuando se agrupa)

**`GroupStats`** — totales de stock por article group (incluyendo no-aged):
- `totalStockAmount`, `obsoleteAmount`, `totalKg`, `obsoleteKg`
- Guardado en `result.groupStats` con clave `articleGroup` o `"__all__"`

### Conversión kg → pliegos (SHT)
```
sheets = kg / (widthM × heightM × grammageKg_per_m2)
```
El gramaje se extrae de la descripción del material con regex: `/\b(\d+)\s*g/i`

### Certificaciones
Extraídas de la variant con: `/_(PEFC|FSC)(?:[_\s]|$)/i`
- Stock PEFC + producto sin cert → ✓ compatible
- Stock FSC + producto FSC → ✓ compatible
- Stock PEFC + producto FSC → ✗ incompatible
- Stock sin cert + producto PEFC o FSC → ✗ incompatible

## KPIs y filtros (`Analysis.tsx`)

Los KPI cards se recalculan dinámicamente según el `articleGroup` seleccionado usando `filteredKpis` (useMemo). Los totales de stock (incluyendo materiales no-aged) vienen de `result.groupStats`.

Formato numérico compacto (función `clpCompact`): ≥1MM → `$2.3MM`, ≥1k → `$567k`

### Columnas de la tabla de materiales
Article no. · Variante · Descripción · Días stock · Cantidad · **SHT** · Unidad · **Valor stock** · N° FG · Kilos util. · Pérdida (min→max) · Prom. pérd.

SHT = pliegos totales, calculados desde kg ÷ (área m² × gramaje). Se muestra redondeado al entero superior.

### Agrupación por material (`groupByMaterial`, default: `true`)
Activo por defecto. Agrupa filas con mismo `articleNo|variant` (distintos lotes/batches):
- `stockAge` → máximo entre lotes
- `quantity`, `valuatedAmount` → suma
- `totalSheets` → suma (base para recalcular `unitsProducible`)
- `matches` → del primer lote (mismas dims/cert/fibra), con `kgUtilizable` y `unitsProducible` recalculados con los totales
- `batchNo` → `"N lotes"`

El contador muestra `"X materiales (Y lotes)"` cuando hay diferencia.

## Tema claro/oscuro

- Preferencia guardada en `localStorage` con clave `"boardcheck_theme"`
- `useTheme()` hook: gestiona clase `dark` en `document.documentElement`
- Script inline en `index.html` previene flash de tema incorrecto (FOUC)
- Convención Tailwind: clases light como default, `dark:` para modo oscuro

## Comandos

```bash
npm run dev      # servidor local
npm run build    # build para producción
npm run preview  # preview del build
npx tsc --noEmit # verificar tipos sin compilar
```

## Lógica 2 — Análisis por Master Data (en diseño)

Especificación completa en `logica2_master_data.md`. Resumen para contexto:

Lógica 1 (ya implementada) busca candidatos en **historial de producción** (PROD-STD). Lógica 2 busca candidatos en la **base completa de productos activos** aunque no haya historial de consumo — proponiendo reducir unidades al pliego si el pliego estándar no cabe en el material inmovilizado.

### Nuevos archivos de entrada (no implementados aún)
- **ITEM-STD** — Master data de productos: dimensiones de troquel, unidades/pliego por formato
- **BOM** — Relación FG ↔ material consumido (join key con BOINV y con Design Waste)
- **Design Waste** — Merma de diseño por producto (join por `Bom Id`)

### Flujo de cálculo Lógica 2
1. Join ITEM-STD × BOM × Design Waste → registro completo por producto
2. Filtro elegibilidad: mismo `articleNo` de cartulina, dirección de fibra coincidente, troquel entra en el stock
3. **Inferir grilla** (cols × rows) desde dimensiones troquel + pliego estándar + `lanes`
4. Si `diff_grilla ≤ UMBRAL_GRILLA_MM` (default 30mm config): modelo de grilla — iterar reducciones cols×rows
5. Si `diff > umbral`: modelo proporcional — reducir N desde `lanes-1` hasta que el pliego quepa
6. Calcular pérdida y unidades producibles igual que Lógica 1
7. **Deduplicar**: si un producto ya aparece en Lógica 1, priorizar ese resultado; exclusivos de Lógica 2 reciben badge `Master Data`

### Impacto en UI
- DataUpload: 2 grupos visuales (3 archivos Lógica 1 + 3 archivos Lógica 2)
- Analysis: nuevo KPI "Productos propuestos sin historial"; columnas nuevas en fila expandida: `Unidades/pliego propuestas`, `Fuente` (badge Historial/Master Data), `Método` (badge Grilla/Proporcional)
- Configuration: nuevo campo `Umbral de confianza de grilla (mm)`

---

## Notas importantes

- Los datos se guardan en **IndexedDB** del browser. Después de cambios en el parser o el engine, el usuario debe **volver a cargar los archivos** desde Carga de Datos para que los nuevos cálculos tomen efecto.
- El archivo `files/` contiene los Excel de referencia/prueba. No son estáticos en producción; el usuario los sube desde la UI.
- `vercel.json` tiene la configuración de rewrites para que el router funcione en Vercel.
