import type {
  BoinvRow,
  ProdStdRow,
  ItemppRow,
  ItemStdRow,
  BomRow,
  DesignWasteRow,
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

/**
 * When a sheet is rotated 90°, its fiber direction flips relative to the die.
 * Rotation is grain-safe only when stock and BOM material have OPPOSITE grain directions.
 */
function grainsCompatibleRotated(a: string | null, b: string | null): boolean {
  if (!a || !b) return true // benefit of the doubt if data missing
  return normalizeGrain(a) !== normalizeGrain(b)
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

// ─── Lógica 2 — Grid inference ────────────────────────────────────────────────

/** Returns all integer divisor pairs (c, r) where c * r === n, c >= 1, r >= 1 */
function getDivisorPairs(n: number): Array<{ c: number; r: number }> {
  const pairs: Array<{ c: number; r: number }> = []
  for (let c = 1; c <= n; c++) {
    if (n % c === 0) {
      pairs.push({ c, r: n / c })
    }
  }
  return pairs
}

interface GridBest {
  cols: number
  rows: number
  rotated: boolean
  diff: number
  useGridModel: boolean
}

/**
 * Finds the best (cols × rows) layout that approximates the standard sheet.
 * Returns whether the grid model should be used (diff <= threshold).
 */
function inferBestGrid(
  lanes: number,
  dieW: number,
  dieH: number,
  shtW: number,
  shtH: number,
  thresholdMm: number,
  allowNormal = true,
  allowRotated = true,
): GridBest | null {
  if (lanes <= 0 || dieW <= 0 || dieH <= 0 || shtW <= 0 || shtH <= 0) return null

  const pairs = getDivisorPairs(lanes)
  let best: GridBest | null = null

  for (const { c, r } of pairs) {
    if (allowNormal) {
      const diffNormal = Math.abs(c * dieW - shtW) + Math.abs(r * dieH - shtH)
      if (!best || diffNormal < best.diff) {
        best = { cols: c, rows: r, rotated: false, diff: diffNormal, useGridModel: false }
      }
    }
    if (allowRotated) {
      const diffRotated = Math.abs(c * dieH - shtW) + Math.abs(r * dieW - shtH)
      if (!best || diffRotated < best.diff) {
        best = { cols: c, rows: r, rotated: true, diff: diffRotated, useGridModel: false }
      }
    }
  }

  if (best) {
    best.useGridModel = best.diff <= thresholdMm
  }
  return best
}

interface Logic2Candidate {
  lanesProposed: number
  reqWidth: number
  reqHeight: number
  method: 'grilla' | 'proporcional'
  rotated: boolean  // true if the proposed sheet must be rotated 90° relative to stock
}

/**
 * Grid model: iterate all (cNew, rNew) reductions and find the one that
 * maximizes units while fitting within stock dimensions.
 */
function calcGridCandidate(
  best: GridBest,
  dieW: number,
  dieH: number,
  dwWastePct: number,
  stockW: number,
  stockH: number,
  allowNormal: boolean,
  allowRotated: boolean,
): Logic2Candidate | null {
  let topCandidate: Logic2Candidate | null = null

  for (let cNew = 1; cNew <= best.cols; cNew++) {
    for (let rNew = 1; rNew <= best.rows; rNew++) {
      const netW = best.rotated ? cNew * dieH : cNew * dieW
      const netH = best.rotated ? rNew * dieW : rNew * dieH

      const factor = dwWastePct < 1 ? 1 / (1 - dwWastePct) : 1
      const reqW = netW * factor
      const reqH = netH * factor

      const normalFit = reqW <= stockW && reqH <= stockH
      const rotatedFit = reqW <= stockH && reqH <= stockW
      const fits = (allowNormal && normalFit) || (allowRotated && rotatedFit)

      if (fits) {
        const units = cNew * rNew
        // When both fit, prefer normal (no extra rotation of the sheet)
        const isRotated = allowNormal && normalFit ? false : true
        if (!topCandidate || units > topCandidate.lanesProposed) {
          topCandidate = { lanesProposed: units, reqWidth: reqW, reqHeight: reqH, method: 'grilla', rotated: isRotated }
        }
      }
    }
  }

  return topCandidate
}

/**
 * Proportional model: reduce N from lanes-1 downward until a sheet fits.
 */
function calcProportionalCandidate(
  lanes: number,
  shtW: number,
  shtH: number,
  dwWastePct: number,
  stockW: number,
  stockH: number,
  allowNormal: boolean,
  allowRotated: boolean,
): Logic2Candidate | null {
  const areaStd = shtW * shtH
  const denominator = dwWastePct < 1 ? (1 - dwWastePct) : 1
  const areaNetPerUnit = (areaStd * denominator) / lanes
  const ratio = shtW / shtH

  for (let n = lanes - 1; n >= 1; n--) {
    const areaNew = (areaNetPerUnit * n) / denominator
    const newH = Math.sqrt(areaNew / ratio)
    const newW = newH * ratio

    const normalFit = newW <= stockW && newH <= stockH
    const rotatedFit = newW <= stockH && newH <= stockW
    const fits = (allowNormal && normalFit) || (allowRotated && rotatedFit)

    if (fits) {
      const isRotated = allowNormal && normalFit ? false : true
      return { lanesProposed: n, reqWidth: newW, reqHeight: newH, method: 'proporcional', rotated: isRotated }
    }
  }

  return null
}

// ─── Lógica 2 internal record ─────────────────────────────────────────────────

interface Logic2Record {
  fgArticleNo: string
  fgDescription: string
  kunde: string
  lanes: number
  dieWidth: number
  dieHeight: number
  bomId: string
  matArticleNo: string
  matArticleGroup: string
  shtWidth: number
  shtHeight: number
  grammage: number
  dwWastePct: number
  grainDirection: string
  matVariant: string
}

/**
 * Joins ITEM-STD × BOM × Design Waste and returns one Logic2Record per BOM row.
 * Indexed by matArticleNo for fast lookup.
 */
function buildLogic2Index(
  itemStdRows: ItemStdRow[],
  bomRows: BomRow[],
  designWasteRows: DesignWasteRow[],
  grainIndex: Map<string, string>
): Map<string, Logic2Record[]> {
  const itemStdByArticleNo = new Map<string, ItemStdRow>()
  for (const r of itemStdRows) {
    if (!itemStdByArticleNo.has(r.articleNo)) {
      itemStdByArticleNo.set(r.articleNo, r)
    }
  }

  const dwByBomId = new Map<string, number>()
  for (const r of designWasteRows) {
    dwByBomId.set(r.bomId, r.cadWastePct)
  }

  const index = new Map<string, Logic2Record[]>()

  for (const bom of bomRows) {
    const item = itemStdByArticleNo.get(bom.fgArticleNo)
    if (!item) continue

    const dims = parseDimsFromString(bom.matVariant)
    if (!dims) continue

    const grammage = parseGrammage(bom.matDescription)
    if (!grammage) continue

    const lanes = item.lanesFormat3 || item.lanesFormat6
    if (lanes <= 0) continue

    if (item.dieWidth <= 0 || item.dieHeight <= 0) continue

    const dwWastePct = dwByBomId.get(bom.bomId) ?? 0
    if (dwWastePct >= 1) {
      console.warn(`Design Waste >= 100% for BOM ${bom.bomId}, skipping`)
      continue
    }

    const grainDirection = grainIndex.get(`${bom.matArticleNo}|${bom.matVariant}`) ?? ''

    const record: Logic2Record = {
      fgArticleNo: bom.fgArticleNo,
      fgDescription: item.description,
      kunde: item.primaryCustomer,
      lanes,
      dieWidth: item.dieWidth,
      dieHeight: item.dieHeight,
      bomId: bom.bomId,
      matArticleNo: bom.matArticleNo,
      matArticleGroup: bom.matArticleGroup,
      shtWidth: dims.width,
      shtHeight: dims.height,
      grammage,
      dwWastePct,
      grainDirection,
      matVariant: bom.matVariant,
    }

    const existing = index.get(bom.matArticleNo) ?? []
    existing.push(record)
    index.set(bom.matArticleNo, existing)
  }

  return index
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function runAnalysis(
  boinvRows: BoinvRow[],
  prodStdRows: ProdStdRow[],
  itemppRows: ItemppRow[],
  config: AppConfig,
  itemStdRows?: ItemStdRow[],
  bomRows?: BomRow[],
  designWasteRows?: DesignWasteRow[]
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

  // 3. Build Lógica 2 index (if data available)
  const hasLogic2 = !!(itemStdRows?.length && bomRows?.length)
  const logic2Index = hasLogic2
    ? buildLogic2Index(itemStdRows!, bomRows!, designWasteRows ?? [], grainIndex)
    : null

  // 4. Filter aged stock
  const agedStock = boinvRows.filter((r) => r.stockAge > config.minStockAgeDays)

  // 5. Analyze each aged material
  const analyzedMaterials: AnalyzedMaterial[] = []
  let totalMasterdataOnlyCount = 0

  for (const mat of agedStock) {

    const stockDims = parseDimensions(mat.description, mat.variant)
    const totalSheets = stockDims ? kgToSheets(mat.quantity, stockDims) : 0
    const stockGrain = grainIndex.get(`${mat.articleNo}|${mat.variant}`) ?? null
    const stockCert = parseCert(mat.variant)

    // ── Lógica 1: historical matches ──────────────────────────────────────────
    const candidates = prodByConsumedArticle.get(mat.articleNo) ?? []
    const logic1Matches: MaterialMatch[] = []
    const seenFG = new Set<string>()

    for (const prod of candidates) {
      const consumed = parseArticleIn(prod.articleIn)
      if (!consumed) continue

      const consumedDims = parseDimsFromString(consumed.variant)
      if (!consumedDims) continue

      if (!stockDims || !dimsCompatible(stockDims, consumedDims)) continue

      const consumedGrain = grainIndex.get(`${consumed.articleNo}|${consumed.variant}`) ?? null
      if (!grainsCompatible(stockGrain, consumedGrain)) continue

      const consumedCert = parseCert(consumed.variant)
      if (!certsCompatible(stockCert, consumedCert)) continue

      const fgKey = `${prod.articleNo}|${prod.variant}`
      if (seenFG.has(fgKey)) continue
      seenFG.add(fgKey)

      const { lossPct, lossAmountCLP } = calcLoss(stockDims!, consumedDims, mat.valuatedAmount)

      logic1Matches.push({
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
        source: 'historial',
      })
    }

    // ── Lógica 2: master data matches ─────────────────────────────────────────
    const logic2Matches: MaterialMatch[] = []

    if (logic2Index && stockDims) {
      const l2Candidates = logic2Index.get(mat.articleNo) ?? []
      const seenBomId = new Set<string>()

      for (const rec of l2Candidates) {
        // Filter: material article group must match stock article group.
        // Only apply when the column was actually found in the BOM file (non-empty).
        if (rec.matArticleGroup && rec.matArticleGroup !== mat.articleGroup) continue

        // Skip if BOM id already processed for this stock material
        if (seenBomId.has(rec.bomId)) continue
        seenBomId.add(rec.bomId)

        // Skip if this fgArticleNo is already covered by Lógica 1
        if (logic1Matches.some((m) => m.fgArticleNo === rec.fgArticleNo)) continue

        // Check certification (from BOM material variant)
        const matCert = parseCert(rec.matVariant)
        if (!certsCompatible(stockCert, matCert)) continue

        // Check die dimensions fit in stock — determine which orientations are physically possible
        const dieNormalFits = rec.dieWidth <= stockDims.width && rec.dieHeight <= stockDims.height
        const dieRotatedFits = rec.dieHeight <= stockDims.width && rec.dieWidth <= stockDims.height
        if (!dieNormalFits && !dieRotatedFits) continue

        // Grain direction check per orientation:
        // - Normal cut: stock grain must MATCH BOM material grain
        // - Rotated cut: stock grain must be OPPOSITE to BOM material grain
        //   (rotating 90° flips the effective fiber direction relative to the product)
        const matGrain = rec.grainDirection || null
        const canUseNormal = dieNormalFits && grainsCompatible(stockGrain, matGrain)
        const canUseRotated = dieRotatedFits && grainsCompatibleRotated(stockGrain, matGrain)
        if (!canUseNormal && !canUseRotated) continue

        // Infer best grid layout (constrained to grain-valid orientations)
        const gridBest = inferBestGrid(
          rec.lanes,
          rec.dieWidth,
          rec.dieHeight,
          rec.shtWidth,
          rec.shtHeight,
          config.gridThresholdMm,
          canUseNormal,
          canUseRotated,
        )
        if (!gridBest) continue

        // Compute candidate using appropriate model
        let candidate: Logic2Candidate | null = null
        if (gridBest.useGridModel) {
          candidate = calcGridCandidate(
            gridBest,
            rec.dieWidth,
            rec.dieHeight,
            rec.dwWastePct,
            stockDims.width,
            stockDims.height,
            canUseNormal,
            canUseRotated,
          )
        } else {
          candidate = calcProportionalCandidate(
            rec.lanes,
            rec.shtWidth,
            rec.shtHeight,
            rec.dwWastePct,
            stockDims.width,
            stockDims.height,
            canUseNormal,
            canUseRotated,
          )
        }

        if (!candidate) continue

        // Calculate loss using the proposed sheet dimensions (area is rotation-invariant)
        const proposedDims = candidate.rotated
          ? { width: candidate.reqHeight, height: candidate.reqWidth }
          : { width: candidate.reqWidth, height: candidate.reqHeight }
        const { lossPct, lossAmountCLP } = calcLoss(stockDims, proposedDims, mat.valuatedAmount)

        const kgUtilizable = mat.quantity
        const unitsProducible = Math.floor(totalSheets * candidate.lanesProposed)

        logic2Matches.push({
          fgArticleNo: rec.fgArticleNo,
          fgVariant: '',   // ITEM-STD has no variant
          fgDescription: rec.fgDescription,
          kunde: rec.kunde,
          lanes: rec.lanes,
          consumedArticleNo: rec.matArticleNo,
          consumedVariant: rec.matVariant,
          unitsProducible,
          lossPct,
          kgUtilizable,
          lossAmountCLP,
          source: 'masterdata',
          lanesProposed: candidate.lanesProposed,
          method: candidate.method,
          // Show placement dims on the stock (swap when rotated so they read as stockW×stockH orientation)
          proposedSheetDims: candidate.rotated
            ? `${Math.round(candidate.reqHeight)}x${Math.round(candidate.reqWidth)}`
            : `${Math.round(candidate.reqWidth)}x${Math.round(candidate.reqHeight)}`,
        })
      }

      totalMasterdataOnlyCount += new Set(logic2Matches.map((m) => m.fgArticleNo)).size
    }

    const matches = [...logic1Matches, ...logic2Matches]

    const lossPcts = matches.map((m) => m.lossPct)
    const minLossPct = lossPcts.length > 0 ? Math.min(...lossPcts) : 0
    const maxLossPct = lossPcts.length > 0 ? Math.max(...lossPcts) : 0
    const avgLossPct = lossPcts.length > 0 ? lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length : 0
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

  // 6. Compute per-group stock stats from all boinv rows (including non-aged)
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

  // 7. Compute global KPIs
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
    masterdataOnlyCount: totalMasterdataOnlyCount,
  }

  return { materials: analyzedMaterials, kpis, groupStats }
}
