import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import KpiCard from '../components/KpiCard'
import FilterBar from '../components/FilterBar'
import MaterialTable from '../components/MaterialTable'
import { loadRows } from '../lib/storage'
import { runAnalysis } from '../lib/analysisEngine'
import { getConfig } from './Configuration'
import type { AnalysisResult, AnalyzedMaterial } from '../lib/types'

const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })
const pctFmt = (v: number) => `${numFmt.format(v)}%`

/** Compact currency: $1.234MM / $567k / $890 */
function clpCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${numFmt.format(value / 1_000_000)}MM`
  if (abs >= 1_000)     return `$${numFmt.format(value / 1_000)}k`
  return `$${numFmt.format(value)}`
}

interface Filters {
  articleGroup: string
  articleNo: string
  onlyWithAlternative: boolean
  source: 'all' | 'historial' | 'masterdata'
}

const DEFAULT_FILTERS: Filters = {
  articleGroup: 'BO-1',
  articleNo: '',
  onlyWithAlternative: false,
  source: 'all',
}

export default function Analysis() {
  const navigate = useNavigate()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [groupByMaterial, setGroupByMaterial] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [boinv, prodstd, itempp, itemstd, bom, designwaste] = await Promise.all([
          loadRows('boinv'),
          loadRows('prodstd'),
          loadRows('itempp'),
          loadRows('itemstd'),
          loadRows('bom'),
          loadRows('designwaste'),
        ])

        if (!boinv.length || !prodstd.length) {
          setError('Faltan datos. Ve a Carga de Datos y sube los tres archivos antes de continuar.')
          setLoading(false)
          return
        }

        const config = getConfig()
        const res = runAnalysis(
          boinv, prodstd, itempp, config,
          itemstd.length ? itemstd : undefined,
          bom.length ? bom : undefined,
          designwaste.length ? designwaste : undefined,
        )
        setResult(res)
      } catch (err) {
        setError(`Error al procesar los datos: ${err instanceof Error ? err.message : 'Error desconocido'}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const articleGroups = useMemo(() => {
    if (!result) return []
    return [...new Set(result.materials.map((m) => m.articleGroup).filter(Boolean))].sort()
  }, [result])

  const filteredMaterials = useMemo((): AnalyzedMaterial[] => {
    if (!result) return []
    return result.materials.filter((m) => {
      if (filters.articleGroup && m.articleGroup !== filters.articleGroup) return false
      if (filters.articleNo && !m.articleNo.toLowerCase().includes(filters.articleNo.toLowerCase())) return false
      if (filters.onlyWithAlternative && m.matches.length === 0) return false
      if (filters.source !== 'all') {
        const hasSource = m.matches.some((match) => match.source === filters.source)
        if (!hasSource) return false
      }
      return true
    })
  }, [result, filters])

  /** Grouped or ungrouped list of materials for the table */
  const displayMaterials = useMemo((): AnalyzedMaterial[] => {
    if (!groupByMaterial) return filteredMaterials

    const groups = new Map<string, AnalyzedMaterial[]>()
    for (const mat of filteredMaterials) {
      const key = `${mat.articleNo}|${mat.variant}`
      const arr = groups.get(key) ?? []
      arr.push(mat)
      groups.set(key, arr)
    }

    return [...groups.values()].map((group) => {
      if (group.length === 1) return group[0]

      const first = group[0]
      const totalQty = group.reduce((s, m) => s + m.quantity, 0)
      const totalValue = group.reduce((s, m) => s + m.valuatedAmount, 0)
      const totalSheets = group.reduce((s, m) => s + m.totalSheets, 0)
      const maxAge = Math.max(...group.map((m) => m.stockAge))
      const hasMatches = first.matches.length > 0

      const updatedMatches = first.matches.map((m) => ({
        ...m,
        kgUtilizable: totalQty,
        unitsProducible: (m.lanesProposed ?? m.lanes) > 0 ? Math.floor(totalSheets * (m.lanesProposed ?? m.lanes)) : 0,
        lossAmountCLP: (m.lossPct / 100) * totalValue,
      }))

      const lossPcts = updatedMatches.map((m) => m.lossPct)

      return {
        ...first,
        stockAge: maxAge,
        quantity: totalQty,
        valuatedAmount: totalValue,
        batchNo: `${group.length} lotes`,
        totalSheets,
        matches: updatedMatches,
        kgUtilizable: hasMatches ? totalQty : 0,
        lossAmountCLP: hasMatches
          ? updatedMatches.reduce((s, m) => s + m.lossAmountCLP, 0) / updatedMatches.length
          : 0,
        minLossPct: lossPcts.length > 0 ? Math.min(...lossPcts) : 0,
        avgLossPct: lossPcts.length > 0 ? lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length : 0,
        maxLossPct: lossPcts.length > 0 ? Math.max(...lossPcts) : 0,
      }
    })
  }, [filteredMaterials, groupByMaterial])

  /** KPIs recalculated for the currently selected article group */
  const filteredKpis = useMemo(() => {
    if (!result) return null
    const groupKey = filters.articleGroup || '__all__'
    const gs = result.groupStats[groupKey] ?? result.groupStats['__all__'] ?? { totalStockAmount: 0, obsoleteAmount: 0, totalKg: 0, obsoleteKg: 0 }

    // Use filteredMaterials (group + articleNo + onlyWithAlternative filters applied)
    const withMatch = filteredMaterials.filter((m) => m.matches.length > 0)
    const kgPossible = withMatch.reduce((s, m) => s + m.quantity, 0)

    const masterdataOnlyCount = filteredMaterials.reduce((count, mat) => {
      const uniqueMd = new Set(
        mat.matches.filter((m) => m.source === 'masterdata').map((m) => m.fgArticleNo)
      ).size
      return count + uniqueMd
    }, 0)

    return {
      totalStockAmount: gs.totalStockAmount,
      obsoleteAmount: gs.obsoleteAmount,
      obsoletePct: gs.totalStockAmount > 0 ? (gs.obsoleteAmount / gs.totalStockAmount) * 100 : 0,
      articlesWithAlternative: withMatch.length,
      kgPossibleToUse: kgPossible,
      kgPossiblePct: gs.obsoleteKg > 0 ? (kgPossible / gs.obsoleteKg) * 100 : 0,
      totalLossAmount: withMatch.reduce((s, m) => s + m.lossAmountCLP, 0),
      masterdataOnlyCount,
    }
  }, [result, filters.articleGroup, filteredMaterials])

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-2 transition-colors text-sm"
            >
              ← Volver al inicio
            </button>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Análisis de Stock</h1>
          </div>
          <button
            onClick={() => navigate('/upload')}
            className="text-sm text-slate-500 hover:text-slate-900 border border-slate-300 hover:border-slate-400 dark:text-slate-400 dark:hover:text-white dark:border-slate-700 dark:hover:border-slate-500 px-4 py-2 rounded-lg transition-colors"
          >
            Actualizar datos
          </button>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-spin inline-block">⟳</div>
              <p>Procesando datos…</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300 rounded-xl px-6 py-5">
            <p className="font-semibold mb-1">Sin datos disponibles</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => navigate('/upload')}
              className="mt-4 bg-red-600 hover:bg-red-500 dark:bg-red-700 dark:hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Ir a Carga de Datos
            </button>
          </div>
        )}

        {!loading && result && filteredKpis && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-8">
              <KpiCard
                title="Monto total stock"
                value={clpCompact(filteredKpis.totalStockAmount)}
              />
              <KpiCard
                title="Monto obsoleto"
                value={clpCompact(filteredKpis.obsoleteAmount)}
                accent="warning"
              />
              <KpiCard
                title="% Monto obsoleto"
                value={pctFmt(filteredKpis.obsoletePct)}
                accent="warning"
              />
              <KpiCard
                title="Art. con alternativa"
                value={String(filteredKpis.articlesWithAlternative)}
                accent="success"
              />
              <KpiCard
                title="Kilos posibles uso"
                value={`${numFmt.format(filteredKpis.kgPossibleToUse)} kg`}
                accent="success"
              />
              <KpiCard
                title="% kilos posibles"
                value={pctFmt(filteredKpis.kgPossiblePct)}
                accent="success"
              />
              <KpiCard
                title="Monto pérdida total"
                value={clpCompact(filteredKpis.totalLossAmount)}
                accent="danger"
              />
              {filteredKpis.masterdataOnlyCount > 0 && (
                <KpiCard
                  title="FG sin historial"
                  value={String(filteredKpis.masterdataOnlyCount)}
                  subtitle="Solo por master data"
                  accent="success"
                />
              )}
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <div className="flex flex-wrap gap-3 items-center">
                <FilterBar
                  filters={filters}
                  articleGroups={articleGroups}
                  onChange={setFilters}
                />
                <button
                  onClick={() => setGroupByMaterial((v) => !v)}
                  className={`
                    text-sm rounded-lg px-4 py-2 border transition-colors font-medium
                    ${groupByMaterial
                      ? 'bg-blue-600 border-blue-500 text-white dark:bg-blue-700 dark:border-blue-600'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white dark:hover:border-slate-500'
                    }
                  `}
                >
                  Agrupar por material
                </button>
              </div>
              <p className="text-slate-400 dark:text-slate-500 text-sm">
                {displayMaterials.length} de {result.materials.length} materiales
                {groupByMaterial && displayMaterials.length !== filteredMaterials.length && (
                  <span className="ml-1 text-slate-300 dark:text-slate-600">
                    ({filteredMaterials.length} lotes)
                  </span>
                )}
              </p>
            </div>

            {/* Table */}
            <MaterialTable materials={displayMaterials} />
          </>
        )}
      </div>
    </div>
  )
}
