import type {
  BoinvRow,
  ProdStdRow,
  ItemppRow,
  AppConfig,
  ParsedDimensions,
  MaterialMatch,
  AnalyzedMaterial,
  AnalysisResult,
  KpiSummary,
} from './types'

// ─── Dimension & grammage parsing ────────────────────────────────────────────

/** Extracts width x height (mm) from a variant or description string */
function parseDimsFromString(s: string): { width: number; height: number } | null {
  const match = s.match(/(\d+)[xX×](\d+)/)
  if (!match) return null
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
}

/** Extracts grammage (g/m²) from article description, e.g. "GC2 250g" */
function parseGrammage(description: string): number | null {
  const match = description.match(/\b(\d+)\s*g(?:[/\\]m[²2])?\b/i)
  if (!match) return null
  return parseInt(match[1], 10)
}

export function parseDimensions(description: string, variant: string): ParsedDimensions | null {
  const dims = parseDimsFromString(variant) ?? parseDimsFromString(description)
  if (!dims) return null
  const grammage = parseGrammage(description)
  if (!grammage) return null
  return { width: dims.width, height: dims.height, grammage }
}

// ─── Unit conversion ─────────────────────────────────────────────────────────

/** Convert kg to sheets given material dimensions (mm) and grammage (g/m²) */
export function kgToSheets(kg: number, dims: ParsedDimensions): number {
  const widthM = dims.width / 1000
  const heightM = dims.height / 1000
  const grammageKgPerM2 = dims.grammage / 1000
  const kgPerSheet = widthM * heightM * grammageKgPerM2
  if (kgPerSheet <= 0) return 0
  return kg / kgPerSheet
}

// ─── article in parsing ───────────────────────────────────────────────────────

/** Parses "ARTICLE_NO/VARIANT" from the articleIn field */
export function parseArticleIn(articleIn: string): { articleNo: string; variant: string } | null {
  if (!articleIn) return null
  const slashIdx = articleIn.indexOf('/')
  if (slashIdx === -1) return null
  const articleNo = articleIn.slice(0, slashIdx).trim()
  const variant = articleIn.slice(slashIdx + 1).trim()
  if (!articleNo || !variant) return null
  return { articleNo, variant }
}

// ─── Certification ───────────────────────────────────────────────────────────

/** Extracts certification from a variant string, e.g. "0906x0563_PEFC" → "PEFC" */
function parseCert(variant: string): string {
  const match = variant.match(/_(PEFC|FSC)(?:[_\s]|$)/i)
  return match ? match[1].toUpperCase() : ''
}

/**
 * Returns true if the stock material can cover the product's certification requirement.
 * - Product requires cert X → stock must have cert X
 * - Product has no cert requirement → stock can have any cert (or none)
 */
function certsCompatible(stockCert: string, consumedCert: string): boolean {
  if (!consumedCert) return true        // product has no requirement → always OK
  return stockCert === consumedCert     // product requires specific cert → must match
}

// ─── Grain direction ──────────────────────────────────────────────────────────

function normalizeGrain(s: string): string {
  return s.trim().toLowerCase()
}

function grainsCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true // benefit of the doubt if data missing
  return normalizeGrain(a) === normalizeGrain(b)
}

// ─── Dimension compatibility ──────────────────────────────────────────────────

/** Returns true if productDims fits within stockDims (both axes) */
function dimsCompatible(stockDims: ParsedDimensions, productDims: { width: number; height: number }): boolean {
  return productDims.width <= stockDims.width && productDims.height <= stockDims.height
}

// ─── Loss calculation ─────────────────────────────────────────────────────────

function calcLoss(
  stockDims: ParsedDimensions,
  productDims: { width: number; height: number },
  valuatedAmount: number
): { lossPct: number; lossAmountCLP: number } {
  const stockArea = stockDims.width * stockDims.height
  const productArea = productDims.width * productDims.height
  if (stockArea <= 0) return { lossPct: 0, lossAmountCLP: 0 }
  const lossPct = ((stockArea - productArea) / stockArea) * 100
  const lossAmountCLP = (lossPct / 100) * valuatedAmount
  return { lossPct: Math.max(0, lossPct), lossAmountCLP: Math.max(0, lossAmountCLP) }
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function runAnalysis(
  boinvRows: BoinvRow[],
  prodStdRows: ProdStdRow[],
  itemppRows: ItemppRow[],
  config: AppConfig
): AnalysisResult {
  // 1. Build grain direction index: "articleNo|variant" → grainDirection
  const grainIndex = new Map<string, string>()
  for (const row of itemppRows) {
    if (row.grainDirection) {
      grainIndex.set(`${row.articleNo}|${row.variant}`, row.grainDirection)
    }
  }

  // 2. Index PROD-STD by consumed article no.
  const prodByConsumedArticle = new Map<string, ProdStdRow[]>()
  for (const row of prodStdRows) {
    const parsed = parseArticleIn(row.articleIn)
    if (!parsed) continue
    const existing = prodByConsumedArticle.get(parsed.articleNo) ?? []
    existing.push(row)
    prodByConsumedArticle.set(parsed.articleNo, existing)
  }

  // 3. Filter aged stock
  const agedStock = boinvRows.filter((r) => r.stockAge > config.minStockAgeDays)

  // 4. Analyze each aged material (one row per BOINV row — multiple batches shown separately)
  const analyzedMaterials: AnalyzedMaterial[] = []

  for (const mat of agedStock) {

    const stockDims = parseDimensions(mat.description, mat.variant)
    const totalSheets = stockDims ? kgToSheets(mat.quantity, stockDims) : 0
    const stockGrain = grainIndex.get(`${mat.articleNo}|${mat.variant}`) ?? null
    const stockCert = parseCert(mat.variant)

    // Find candidate productions using this material's article no.
    const candidates = prodByConsumedArticle.get(mat.articleNo) ?? []
    const matches: MaterialMatch[] = []
    const seenFG = new Set<string>() // deduplicate FG by articleNo+variant

    for (const prod of candidates) {
      const consumed = parseArticleIn(prod.articleIn)
      if (!consumed) continue

      // Parse consumed material variant dimensions
      const consumedDims = parseDimsFromString(consumed.variant)
      if (!consumedDims) continue

      // Check dimension compatibility
      if (!stockDims || !dimsCompatible(stockDims, consumedDims)) continue

      // Check grain direction
      const consumedGrain = grainIndex.get(`${consumed.articleNo}|${consumed.variant}`) ?? null
      if (!grainsCompatible(stockGrain, consumedGrain)) continue

      // Check certification compatibility
      const consumedCert = parseCert(consumed.variant)
      if (!certsCompatible(stockCert, consumedCert)) continue

      const fgKey = `${prod.articleNo}|${prod.variant}`
      if (seenFG.has(fgKey)) continue
      seenFG.add(fgKey)

      const { lossPct, lossAmountCLP } = calcLoss(stockDims!, consumedDims, mat.valuatedAmount)

      matches.push({
        fgArticleNo: prod.articleNo,
        fgVariant: prod.variant,
        fgDescription: prod.description,
        kunde: prod.kunde,
        lanes: prod.lanes,
        consumedArticleNo: consumed.articleNo,
        consumedVariant: consumed.variant,
        unitsProducible: prod.lanes > 0 ? Math.floor(totalSheets * prod.lanes) : 0,
        lossPct,
        kgUtilizable: mat.quantity,
        lossAmountCLP,
      })
    }

    const lossPcts = matches.map((m) => m.lossPct)
    const minLossPct = lossPcts.length > 0 ? Math.min(...lossPcts) : 0
    const maxLossPct = lossPcts.length > 0 ? Math.max(...lossPcts) : 0
    const avgLossPct = lossPcts.length > 0 ? lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length : 0
    // Use average loss amount for the material-level summary
    const totalLossAmt = matches.length > 0
      ? matches.reduce((s, m) => s + m.lossAmountCLP, 0) / matches.length
      : 0

    analyzedMaterials.push({
      articleGroup: mat.articleGroup,
      articleNo: mat.articleNo,
      variant: mat.variant,
      description: mat.description,
      stockAge: mat.stockAge,
      quantity: mat.quantity,
      stockUnit: mat.stockUnit,
      valuatedAmount: mat.valuatedAmount,
      millCurrency: mat.millCurrency,
      batchNo: mat.batchNo,
      totalSheets,
      matches,
      kgUtilizable: matches.length > 0 ? mat.quantity : 0,
      lossAmountCLP: totalLossAmt,
      minLossPct,
      avgLossPct,
      maxLossPct,
    })
  }

  // 5. Compute per-group stock stats from all boinv rows (including non-aged)
  const groupStatsMap = new Map<string, { totalStockAmount: number; obsoleteAmount: number; totalKg: number; obsoleteKg: number }>()

  function getGroupStat(group: string) {
    if (!groupStatsMap.has(group)) {
      groupStatsMap.set(group, { totalStockAmount: 0, obsoleteAmount: 0, totalKg: 0, obsoleteKg: 0 })
    }
    return groupStatsMap.get(group)!
  }

  for (const row of boinvRows) {
    const g = getGroupStat(row.articleGroup)
    const all = getGroupStat('__all__')
    const isAged = row.stockAge > config.minStockAgeDays
    g.totalStockAmount += row.valuatedAmount
    g.totalKg += row.quantity
    all.totalStockAmount += row.valuatedAmount
    all.totalKg += row.quantity
    if (isAged) {
      g.obsoleteAmount += row.valuatedAmount
      g.obsoleteKg += row.quantity
      all.obsoleteAmount += row.valuatedAmount
      all.obsoleteKg += row.quantity
    }
  }

  const groupStats: AnalysisResult['groupStats'] = Object.fromEntries(groupStatsMap)

  // 6. Compute global KPIs
  const { totalStockAmount, obsoleteAmount, totalKg: totalKgInStock } = groupStats['__all__'] ?? { totalStockAmount: 0, obsoleteAmount: 0, totalKg: 0 }
  const materialsWithMatch = analyzedMaterials.filter((m) => m.matches.length > 0)
  const kgPossibleToUse = materialsWithMatch.reduce((s, m) => s + m.quantity, 0)

  const kpis: KpiSummary = {
    totalStockAmount,
    obsoleteAmount,
    obsoletePct: totalStockAmount > 0 ? (obsoleteAmount / totalStockAmount) * 100 : 0,
    articlesWithAlternative: materialsWithMatch.length,
    kgPossibleToUse,
    kgPossiblePct: totalKgInStock > 0 ? (kgPossibleToUse / totalKgInStock) * 100 : 0,
    totalLossAmount: materialsWithMatch.reduce((s, m) => s + m.lossAmountCLP, 0),
  }

  return { materials: analyzedMaterials, kpis, groupStats }
}
