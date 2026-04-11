# Lógica 2 — Propuesta de uso basada en Master Data de Productos

## Descripción

Esta es la segunda lógica de análisis del módulo board-check dentro del Forecast Hub.

A diferencia de la Lógica 1 (que busca coincidencias en producciones históricas), esta lógica trabaja contra la **base de datos completa de productos activos**. No existe historial de consumo para estos productos respecto al material en stock, por lo tanto el objetivo es **proponer posibilidades nuevas** calculando si el material inmovilizado podría ser técnicamente utilizado para fabricar cada producto.

El resultado de esta lógica debe integrarse en la misma pantalla de Análisis existente, añadiéndose como fuente adicional de candidatos junto a los resultados de la Lógica 1.

El exito de esta logico y la complejida a la vez es identificar setups que no existen, tomamos como referencia lo que existe como master data pero vemos si es posible achicar el tamaño del pleigo quitanto unidades al pliego para buscar algun uso.

Si uno producto tiene 16 unidades al pliego en una distribucion de 4x4 (col x rows) si usamos un pliego inmovilizados quizas tendramos que asumir una perdida de 015 lo cual significa que ahora las unidades sean 12 al pliego 3x4. 

La forma de diferenciarlas sera poniendo un badge que esta descrito mas abajo.

---

## Nuevas fuentes de datos requeridas

Para implementar esta lógica se necesitan **3 archivos adicionales** que deben incorporarse a la pantalla de Carga de Datos existente.

---

### Archivo 4: ITEM-STD — Master data de productos activos

Este archivo contiene la información dimensional y productiva de cada producto (FG).

| Columna en el archivo | Descripción |
|---|---|---|
| `[Article no.]` |  | Código del producto terminado (ej: FGxxxxx) |
| `[Article description]`| Nombre/descripción del producto |
| `[Primary customer name]` | Cliente al que pertenece el producto |
| `[Lanes on standard format 3]` | Unidades al pliego (pcs/SHT) para formato 3 |
| `[Lanes on standard format 6]` | Unidades al pliego (pcs/SHT) para formato 6 |
| `[Article net width]` | Ancho del corte de troquel en mm |
| `[Article net height]` | Largo del corte de troquel en mm |

Nota: Hay dos columnas con unidades al pliego y es que depende de si el producto es formato 3 o 6. El formato define al tamaño del pliego

---

### Archivo 5: BOM — Relación producto-material

Este archivo vincula cada producto (FG article_no + variant) con el material de cartulina que consume.
Es la clave de join entre ITEM-STD y el stock (BOINV). La logica del joint es bastante similar a la ya implementada en la parte 1.

| Columna en el archivo | Descripción |
|---|---|---|
| `[Finished good article no.]` | Código del producto terminado — join con `Article no.` de ITEM-STD |
| `[Article no.]` | Article no. del material consumido (cartulina) — join con BOINV |
| `[Variant]` | Variant del material — contiene las dimensiones del pliego estándar del producto mismo formato que el presente en BOINV|
| `[Article description]` | Descripción del material (incluye gramaje en formato `xxxg`) |
| `[Bom Id]` | codigo que identifica ese setup de producto - material se usa como join con el design waste |

---

### Archivo 6: Design Waste Table — Merma de diseño por producto

Este archivo contiene el porcentaje de merma de diseño por producto. La clave de join es con el BOM code.

| Columna en el archivo  | Descripción |
|---|---|---|
| `[BOM]`  | Ccodigo de bom — join con `Bom Id` de BOM |
| `[CAD- Waste]` | Merma de diseño en porcentaje (el formato es: ej. `18,5%`) |

---

## Modelo de datos — Join entre los 3 archivos

ITEM-STD se relaciona con BOM mediante el article no. + variant del producto y luego BOM se relaciona con la merma de diseño con el BOM code

```
ITEM-STD  ──(item_article_no + item_variant)──►  BOM
                                                   │
                                                   ├── bom_mat_article_no + bom_mat_variant
                                                   │      └── join con BOINV (stock)
                                                   │      └── join con ITEMPP (sentido de fibra) ← ya existe en Lógica 1
                                                   │
BOM  ──(BOM Code)──►  Design Waste
```

El resultado del join produce un registro completo por producto:

```
{
  item_article_no,       // FGxxxxx
  item_variant,          // 001xxx
  item_description,
  item_kunde,
  item_lanes,            // pcs/SHT
  item_die_width,        // mm
  item_die_length,       // mm
  bom_mat_article_no,    // tipo de cartulina — join con BOINV
  bom_mat_variant,       // variant del material — incluye dimensiones del pliego estándar
  sht_width,             // parseado desde bom_mat_variant
  sht_length,            // parseado desde bom_mat_variant
  dw_waste_pct,          // merma de diseño en decimal (ej: 0.185)
  grain_direction        // desde ITEMPP, join por bom_mat_article_no + bom_mat_variant
}
```

> **Nota:** El sentido de fibra (`grain_direction`) se obtiene cruzando `bom_mat_article_no` + `bom_mat_variant` contra ITEMPP, que ya está cargado en la Lógica 1. No se necesita archivo adicional para este dato.

---

## Lógica de cálculo — Step by step

### Paso 1 — Filtro de elegibilidad básica

Para cada material en stock con aging > umbral configurado, filtrar los productos del join anterior que cumplan:

1. `bom_mat_article_no` == `stock_article_no` (mismo tipo de cartulina y gramaje)
2. `grain_direction` == `stock_grain_direction` (mismo sentido de fibra)
3. `item_die_width` <= `stock_ancho` Y `item_die_length` <= `stock_largo`
   — o rotado 90°: `item_die_width` <= `stock_largo` Y `item_die_length` <= `stock_ancho`

---

### Paso 2 — Inferencia de grilla (cols × rows)

Los campos de disposición de pliego no están completados en el ERP. Se infieren combinando las dimensiones del troquel (`item_die_width`, `item_die_length`), las dimensiones del pliego estándar (`sht_width`, `sht_length`) y las unidades al pliego (`item_lanes`).

```
candidatos = []

Para cada (c, r) donde c * r == item_lanes y c >= 1 y r >= 1:

  // Orientación normal del troquel
  diff_normal = |c * item_die_width - sht_width| + |r * item_die_length - sht_length|
  candidatos.append({ c, r, diff: diff_normal, rotado: false })

  // Troquel rotado 90°
  diff_rotado = |c * item_die_length - sht_width| + |r * item_die_width - sht_length|
  candidatos.append({ c, r, diff: diff_rotado, rotado: true })

mejor = candidato con menor diff
```

**Umbral de confianza:** Si `mejor.diff` <= `UMBRAL_GRILLA_MM` → usar modelo de grilla (Paso 3a).
Si `mejor.diff` > `UMBRAL_GRILLA_MM` → layout espejado/interdigitado probable → usar modelo de área (Paso 3b).

`UMBRAL_GRILLA_MM` es configurable en la pantalla de Configuración. Valor default: `30` mm.

---

### Paso 3a — Cálculo con modelo de grilla (diff menor o igual al umbral)

Con la grilla inferida `(cols, rows, rotado)`, iterar todas las combinaciones reducidas posibles:

```
Para cada (c_new, r_new) donde c_new <= cols y r_new <= rows y c_new * r_new > 0:

  Si NOT rotado:
    pliego_ancho_neto = c_new * item_die_width
    pliego_largo_neto = r_new * item_die_length
  Si rotado:
    pliego_ancho_neto = c_new * item_die_length
    pliego_largo_neto = r_new * item_die_width

  // Expandir con merma de diseño proporcional
  factor_merma    = 1 / (1 - dw_waste_pct)
  nuevo_ancho     = pliego_ancho_neto * factor_merma
  nuevo_largo     = pliego_largo_neto * factor_merma
  unidades_nuevas = c_new * r_new

  // Verificar si el pliego resultante cabe en el stock (con o sin rotación del pliego)
  cabe = (nuevo_ancho <= stock_ancho AND nuevo_largo <= stock_largo)
      OR (nuevo_ancho <= stock_largo AND nuevo_largo <= stock_ancho)

  Si cabe:
    guardar candidato { c_new, r_new, unidades_nuevas, nuevo_ancho, nuevo_largo,
                        metodo: "grilla_inferida" }

// De todos los candidatos válidos, elegir el que maximiza unidades_nuevas
```

---

### Paso 3b — Cálculo con modelo de área (diff mayor al umbral)

Cuando la grilla no es confiable (espejado/interdigitado probable):

```
area_pliego_std      = sht_width * sht_length
area_neta_por_unidad = area_pliego_std * (1 - dw_waste_pct) / item_lanes

// Iterar desde item_lanes-1 hacia abajo hasta encontrar el primer N que cabe
Para N desde (item_lanes - 1) hasta 1:

  area_pliego_nuevo = (area_neta_por_unidad * N) / (1 - dw_waste_pct)

  // Reconstruir dimensiones manteniendo la proporción ancho/largo del pliego estándar
  ratio       = sht_width / sht_length
  nuevo_largo = sqrt(area_pliego_nuevo / ratio)
  nuevo_ancho = nuevo_largo * ratio

  cabe = (nuevo_ancho <= stock_ancho AND nuevo_largo <= stock_largo)
      OR (nuevo_ancho <= stock_largo AND nuevo_largo <= stock_ancho)

  Si cabe:
    guardar candidato { unidades_nuevas: N, nuevo_ancho, nuevo_largo,
                        metodo: "proporcional" }
    break  // primer N que cabe = máximo aprovechable
```

---

### Paso 4 — Cálculo de pérdida por material sub-óptimo

Para cada candidato válido encontrado en Paso 3a o 3b:

```
// Área aprovechada vs área total del material en stock
area_pliego_usado = nuevo_ancho * nuevo_largo        // mm²
area_stock        = stock_ancho * stock_largo        // mm²
pct_perdida_corte = 1 - (area_pliego_usado / area_stock)

// Convertir stock de kg a pliegos
// Gramaje extraído desde bom_mat_description buscando número seguido de "g"
// Ejemplo: "GC1 350g" → gramaje = 350
gramaje_g_m2      = extraer_gramaje(bom_mat_description)   // reutilizar función de Lógica 1
area_stock_m2     = (stock_ancho / 1000) * (stock_largo / 1000)
peso_por_sht_kg   = area_stock_m2 * gramaje_g_m2 / 1000
total_shts_stock  = stock_kg / peso_por_sht_kg

// Valor por pliego
valor_por_sht_CLP = stock_valuated_amount / total_shts_stock

// Pérdida monetaria
shts_perdidos     = total_shts_stock * pct_perdida_corte
monto_perdida_CLP = shts_perdidos * valor_por_sht_CLP

// Producción posible
shts_utiles          = total_shts_stock * (1 - pct_perdida_corte)
unidades_producibles = floor(shts_utiles * unidades_nuevas)
kilos_utilizables    = shts_utiles * peso_por_sht_kg
```

---

### Paso 5 — Deduplicación con resultados de Lógica 1

Un mismo producto puede aparecer como candidato en ambas lógicas. Regla:

- Si un producto (`item_article_no` + `item_variant`) ya existe como resultado de **Lógica 1** (historial), se muestra **una sola vez** priorizando el dato de Lógica 1.
- Si aparece solo en **Lógica 2**, se muestra con badge `Master Data`.
- Los exclusivos de Lógica 1 conservan su badge `Historial`.

---

## Integración con la UI existente

### Pantalla de Carga de Datos

Agregar 3 nuevas tarjetas de upload con el mismo comportamiento que las existentes (drag & drop, timestamp Chile):
- **ITEM-STD** — Master data de productos activos
- **BOM** — Relación producto-material
- **Design Waste** — Merma de diseño por producto

agrupar en un background especial las 3 cargas ya existentes y poner un titulo que identifique que es la carga minima para reemplazos historicos.

Agrupar tambien en un background especial las 3 nuevas cargas indicando que esa es la data necesaria para identificar reemplazos en base al historico.

### Pantalla de Análisis — KPIs

Los KPIs existentes se actualizan sumando resultados de ambas lógicas. Agregar un nuevo KPI:
- **Productos propuestos sin historial** — count de productos únicos encontrados solo por Lógica 2

### Pantalla de Análisis — Detalle expandido por material

En la lista expandida de productos candidatos, agregar columnas:

| Columna nueva | Descripción |
|---|---|
| `Unidades/pliego propuestas` | `unidades_nuevas` calculadas (puede ser menor a las originales del producto) |
| `Fuente` | Badge `Historial` (azul) para Lógica 1 / `Master Data` (amarillo) para Lógica 2 |
| `Método` | Solo Lógica 2: badge `Grilla` o `Proporcional` con tooltip |

Tooltip **Grilla**: "Cálculo basado en disposición cols×rows inferida del pliego estándar. Mayor precisión."
Tooltip **Proporcional**: "Cálculo basado en área proporcional. El producto puede tener layout espejado. Usar como referencia."

### Pantalla de Configuración

Agregar campo:
- **Umbral de confianza de grilla (mm)** — numérico, default `30`
- Descripción visible: "Tolerancia en mm para inferir la disposición de unidades en el pliego. Valores menores son más estrictos."

---

## Notas de implementación

- Parsear `sht_width` y `sht_length` desde `bom_mat_variant` con la misma lógica que ya existe para parsear dimensiones en BOINV e ITEMPP (formato esperado: `ANCHOxLARGO` en mm)
- La función `extraer_gramaje()` ya existe en Lógica 1 — reutilizarla directamente
- El join de los 3 archivos se ejecuta una sola vez al cargar los archivos y se cachea en memoria
- Si un producto no tiene registro en Design Waste Table, asumir `dw_waste_pct = 0` y loguear advertencia en consola
- Si un producto no tiene registro en BOM, se descarta silenciosamente (no se puede evaluar sin saber qué material consume)
- Todos los montos en CLP, dimensiones en mm, pesos en kg

---

## Resumen de placeholders a completar

| # | Archivo | Placeholder | Qué necesito saber |
|---|---|---|---|
| 1 | ITEM-STD | `[COL_ITEM_*]` | Nombres exactos de todas las columnas listadas |
| 2 | ITEM-STD | `[VALOR_ACTIVO]` | Valor del campo status que indica producto activo (ej: "A", "Active", 1) |
| 3 | ITEM-STD | Unidad troquel | Confirmar si `die_width` / `die_length` están en mm |
| 4 | BOM | `[COL_BOM_*]` | Nombres exactos de columnas |
| 5 | BOM | Múltiples materiales | ¿El BOM tiene más de una línea de material por FG+variant? ¿Cómo identificar solo la cartulina (BO-1)? |
| 6 | BOM | Formato variant | ¿`bom_mat_variant` tiene el mismo formato `ANCHOxLARGO` que en BOINV? |
| 7 | Design Waste | `[COL_DW_*]` | Nombres exactos de columnas |
| 8 | Design Waste | Formato merma | ¿La merma es `18.5` (porcentaje entero) o `0.185` (decimal)? |
| 9 | Design Waste | Join key | Confirmar que el join es por FG article_no + variant (igual que ITEM-STD y BOM) |
| 10 | Design Waste | Duplicados | ¿Puede haber más de un registro por FG article_no + variant? ¿Cuál usar? |

El exito de esta logico y la complejida a la vez es identificar setups que no existen, tomamos como referencia lo que existe como master data pero vemos si es posible achicar el tamaño del pleigo quitanto unidades al pliego para buscar algun uso.

Si uno producto tiene 16 unidades al pliego en una distribucion de 4x4 (col x rows) si usamos un pliego inmovilizados quizas tendramos que asumir una perdida de 015 lo cual significa que ahora las unidades sean 12 al pliego 3x4. 