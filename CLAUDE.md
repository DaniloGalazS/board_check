# Board Check — CLAUDE.md

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
    KpiCard.tsx         — Card de KPI con variantes de color
    MaterialTable.tsx   — Tabla principal con filas expandibles
    ExpandedProductRow  — Detalle de productos candidatos (fila expandida)
    FilterBar.tsx       — Filtros: article group, article no., solo con alternativa
    FileUploadZone.tsx  — Zona drag & drop por archivo
    ThemeToggle.tsx     — Botón flotante ☀️/🌙 (esquina inferior derecha)
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
8. Agregar stats por `articleGroup` para KPIs filtrados

### Conversión kg → pliegos (SHT)
```
sheets = kg / (widthM × heightM × grammageKg_per_m2)
```
El gramaje se extrae de la descripción del material con regex: `/\b(\d+)\s*g/i`

### Certificaciones
Extraídas de la variant con: `/_( PEFC|FSC)(?:[_\s]|$)/i`
- Stock PEFC + producto sin cert → ✓ compatible
- Stock FSC + producto FSC → ✓ compatible
- Stock PEFC + producto FSC → ✗ incompatible
- Stock sin cert + producto PEFC o FSC → ✗ incompatible

## KPIs y filtros

Los KPI cards se recalculan dinámicamente según el `articleGroup` seleccionado. Los totales de stock (incluyendo materiales no-aged) se guardan en `result.groupStats` indexados por grupo (y `"__all__"` para global).

Formato numérico compacto (función `clpCompact`): ≥1MM → `$2.3MM`, ≥1k → `$567k`

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

## Notas importantes

- Los datos se guardan en **IndexedDB** del browser. Después de cambios en el parser o el engine, el usuario debe **volver a cargar los archivos** desde Carga de Datos para que los nuevos cálculos tomen efecto.
- El archivo `files/` contiene los Excel de referencia/prueba. No son estáticos en producción; el usuario los sube desde la UI.
- `vercel.json` tiene la configuración de rewrites para que el router funcione en Vercel.
