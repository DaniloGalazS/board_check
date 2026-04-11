// ─── Raw parsed rows (direct from Excel) ────────────────────────────────────

export interface BoinvRow {
  articleGroup: string;
  articleNo: string;
  description: string;
  variant: string;
  stockAge: number;
  batchNo: string;
  quantity: number;        // kg
  stockUnit: string;
  valuatedAmount: number;
  millCurrency: string;
}

export interface ProdStdRow {
  jobRef: string;
  articleNo: string;       // finished good article
  variant: string;         // finished good variant
  description: string;
  articleIn: string;       // consumed raw material: "ARTICLE_NO/VARIANT"
  kunde: string;
  lanes: number;
  nominalGoodQty: number;
  productionTime: number;
}

export interface ItemppRow {
  articleNo: string;
  variant: string;
  grainDirection: string;  // "Long" | "Short" | etc.
}

export interface ItemStdRow {
  articleNo: string;
  description: string;
  primaryCustomer: string;
  lanesFormat3: number;    // pcs/SHT para formato 3
  lanesFormat6: number;    // pcs/SHT para formato 6
  dieWidth: number;        // mm — ancho del corte de troquel
  dieHeight: number;       // mm — largo del corte de troquel
}

export interface BomRow {
  fgArticleNo: string;
  matArticleNo: string;
  matArticleGroup: string; // BO-1, PA-1, etc. — identifica el tipo de cartulina
  matVariant: string;      // contiene dims del pliego estándar (ANCHOxLARGO)
  matDescription: string;  // contiene gramaje (ej: "GC1 350g")
  bomId: string;
}

export interface DesignWasteRow {
  bomId: string;
  cadWastePct: number;     // decimal, ej: 0.185 (parseado desde "18,5%")
}

// ─── Parsed / enriched structures ───────────────────────────────────────────

export interface ParsedDimensions {
  width: number;           // mm
  height: number;          // mm
  grammage: number;        // g/m²
}

export interface MaterialMatch {
  fgArticleNo: string;
  fgVariant: string;
  fgDescription: string;
  kunde: string;
  lanes: number;
  consumedArticleNo: string;   // article no. of the board used
  consumedVariant: string;     // variant of the board used
  unitsProducible: number;     // floor(totalSheets × lanes)
  lossPct: number;
  kgUtilizable: number;
  lossAmountCLP: number;
  source: 'historial' | 'masterdata';
  lanesProposed?: number;      // Lógica 2: units/sheet resultantes (puede ser < lanes)
  method?: 'grilla' | 'proporcional'; // Lógica 2: método de cálculo
}

export interface AnalyzedMaterial {
  articleGroup: string;
  articleNo: string;
  variant: string;
  description: string;
  stockAge: number;
  quantity: number;
  stockUnit: string;
  valuatedAmount: number;
  millCurrency: string;
  batchNo: string;
  totalSheets: number;
  matches: MaterialMatch[];
  kgUtilizable: number;
  lossAmountCLP: number;
  minLossPct: number;
  avgLossPct: number;
  maxLossPct: number;
}

export interface KpiSummary {
  totalStockAmount: number;
  obsoleteAmount: number;
  obsoletePct: number;
  articlesWithAlternative: number;
  kgPossibleToUse: number;
  kgPossiblePct: number;
  totalLossAmount: number;
  masterdataOnlyCount: number; // FGs únicos encontrados solo por Lógica 2
}

/** Stock totals broken down by article group, to support filtered KPI cards */
export interface GroupStats {
  totalStockAmount: number;
  obsoleteAmount: number;
  totalKg: number;
  obsoleteKg: number;
}

export interface AnalysisResult {
  materials: AnalyzedMaterial[];
  kpis: KpiSummary;
  /** Keyed by articleGroup (e.g. "BO-1"). Use "__all__" for global totals. */
  groupStats: Record<string, GroupStats>;
}

// ─── Storage metadata ────────────────────────────────────────────────────────

export type FileType = 'boinv' | 'prodstd' | 'itempp' | 'itemstd' | 'bom' | 'designwaste';

export interface StoredFileMetadata {
  fileType: FileType;
  uploadedAt: string;      // ISO string
  rowCount: number;
}

// ─── App config ──────────────────────────────────────────────────────────────

export interface AppConfig {
  minStockAgeDays: number;   // default 200
  gridThresholdMm: number;   // default 30 — tolerancia para inferir grilla cols×rows
}
