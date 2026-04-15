import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import KpiCard from '../components/KpiCard'
import FilterBar from '../components/FilterBar'
import MaterialTable from '../components/MaterialTable'
import FGTable, { buildFGRows } from '../components/FGTable'
import type { MaterialMatchPair } from '../components/FGTable'
import MultiSelectFilter from '../components/MultiSelectFilter'
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
  fgArticleNo: string
  descriptions: string[]
  onlyWithAlternative: boolean
  source: 'all' | 'historial' | 'masterdata'
  method: 'all' | 'grilla' | 'proporcional'
}

const DEFAULT_FILTERS: Filters = {
  articleGroup: 'BO-1',
  articleNo: '',
  fgArticleNo: '',
  descriptions: [],
  onlyWithAlternative: false,
  source: 'all',
  method: 'all',
}

type Tab = 'materials' | 'fg'

export default function Analysis() {
  const navigate = useNavigate()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [groupByMaterial, setGroupByMaterial] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('materials')
  const [fgSearch, setFgSearch] = useState('')
  const [kundeSearch, setKundeSearch] = useState('')

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

  const descriptionOptions = useMemo(() => {
    if (!result) return []
    const base = filters.articleGroup
      ? result.materials.filter((m) => m.articleGroup === filters.articleGroup)
      : result.materials
    return [...new Set(base.map((m) => m.description).filter(Boolean))].sort()
  }, [result, filters.articleGroup])

  const filteredMaterials = useMemo((): AnalyzedMaterial[] => {
    if (!result) return []

    const needsMatchFilter = filters.source !== 'all' || filters.method !== 'all' || filters.fgArticleNo

    return result.materials
      .map((m) => {
        if (!needsMatchFilter) return m
        const matches = m.matches.filter((match) => {
          if (filters.source !== 'all' && match.source !== filters.source) return false
          if (filters.method !== 'all' && match.method !== filters.method) return false
          if (filters.fgArticleNo && !match.fgArticleNo.toLowerCase().includes(filters.fgArticleNo.toLowerCase())) return false
          return true
        })
        const lossPcts = matches.map((match) => match.lossPct)
        return {
          ...m,
          matches,
          minLossPct: lossPcts.length > 0 ? Math.min(...lossPcts) : 0,
          avgLossPct: lossPcts.length > 0 ? lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length : 0,
          maxLossPct: lossPcts.length > 0 ? Math.max(...lossPcts) : 0,
        }
      })
      .filter((m) => {
        if (filters.articleGroup && m.articleGroup !== filters.articleGroup) return false
        if (filters.articleNo && !m.articleNo.toLowerCase().includes(filters.articleNo.toLowerCase())) return false
        if (filters.descriptions.length > 0 && !filters.descriptions.includes(m.description)) return false
        if (filters.onlyWithAlternative && m.matches.length === 0) return false
        if (needsMatchFilter && m.matches.length === 0) return false
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

  /** FG Overview: build FGRows from displayMaterials (same filters applied) */
  const fgRows = useMemo(() => {
    const pairs: MaterialMatchPair[] = []
    for (const mat of displayMaterials) {
      for (const match of mat.matches) {
        pairs.push({
          matArticleNo: mat.articleNo,
          matVariant: mat.variant,
          matQuantity: mat.quantity,
          match,
        })
      }
    }
    let rows = buildFGRows(pairs)
    if (fgSearch) rows = rows.filter((r) => r.fgArticleNo.toLowerCase().includes(fgSearch.toLowerCase()) || r.fgDescription.toLowerCase().includes(fgSearch.toLowerCase()))
    if (kundeSearch) rows = rows.filter((r) => r.kunde.toLowerCase().includes(kundeSearch.toLowerCase()))
    return rows
  }, [displayMaterials, fgSearch, kundeSearch])

  /** KPIs recalculated for the currently selected article group */
  const filteredKpis = useMemo(() => {
    if (!result) return null
    const groupKey = filters.articleGroup || '__all__'
    const gs = result.groupStats[groupKey] ?? result.groupStats['__all__'] ?? { totalStockAmount: 0, obsoleteAmount: 0, totalKg: 0, obsoleteKg: 0 }

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

  const tabCls = (tab: Tab) => `
    px-5 py-2.5 text-sm font-medium rounded-lg transition-colors
    ${activeTab === tab
      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700'
      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
    }
  `

  const inputCls = `
    bg-white border border-slate-300 text-slate-700 placeholder-slate-400
    dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder-slate-500
    text-sm rounded-lg px-3 py-2
    focus:outline-none focus:ring-2 focus:ring-blue-500
  `

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
              <KpiCard title="Monto total stock" value={clpCompact(filteredKpis.totalStockAmount)} />
              <KpiCard title="Monto obsoleto" value={clpCompact(filteredKpis.obsoleteAmount)} accent="warning" />
              <KpiCard title="% Monto obsoleto" value={pctFmt(filteredKpis.obsoletePct)} accent="warning" />
              <KpiCard title="Art. con alternativa" value={String(filteredKpis.articlesWithAlternative)} accent="success" />
              <KpiCard title="Kilos posibles uso" value={`${numFmt.format(filteredKpis.kgPossibleToUse)} kg`} accent="success" />
              <KpiCard title="% kilos posibles" value={pctFmt(filteredKpis.kgPossiblePct)} accent="success" />
              <KpiCard title="Monto pérdida total" value={clpCompact(filteredKpis.totalLossAmount)} accent="danger" />
              {filteredKpis.masterdataOnlyCount > 0 && (
                <KpiCard title="FG sin historial" value={String(filteredKpis.masterdataOnlyCount)} subtitle="Solo por master data" accent="success" />
              )}
            </div>

            {/* Shared filters + tabs */}
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <div className="flex flex-wrap gap-3 items-center">
                <FilterBar filters={filters} articleGroups={articleGroups} onChange={setFilters} />
                {activeTab === 'materials' && (
                  <MultiSelectFilter
                    placeholder="Filtrar por descripción…"
                    options={descriptionOptions}
                    selected={filters.descriptions}
                    onChange={(descriptions) => setFilters((f) => ({ ...f, descriptions }))}
                  />
                )}
                {activeTab === 'materials' && (
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
                )}
              </div>
              <p className="text-slate-400 dark:text-slate-500 text-sm">
                {activeTab === 'materials'
                  ? <>
                      {displayMaterials.length} de {result.materials.length} materiales
                      {groupByMaterial && displayMaterials.length !== filteredMaterials.length && (
                        <span className="ml-1 text-slate-300 dark:text-slate-600">({filteredMaterials.length} lotes)</span>
                      )}
                    </>
                  : <>{fgRows.length} productos</>
                }
              </p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 rounded-xl p-1 mb-4 w-fit">
              <button className={tabCls('materials')} onClick={() => setActiveTab('materials')}>
                Raw Material Overview
              </button>
              <button className={tabCls('fg')} onClick={() => setActiveTab('fg')}>
                FG Overview
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'materials' && (
              <MaterialTable materials={displayMaterials} />
            )}

            {activeTab === 'fg' && (
              <>
                {/* FG-specific filters */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <input
                    type="text"
                    placeholder="Buscar FG o descripción…"
                    value={fgSearch}
                    onChange={(e) => setFgSearch(e.target.value)}
                    className={`${inputCls} w-56`}
                  />
                  <input
                    type="text"
                    placeholder="Filtrar por cliente…"
                    value={kundeSearch}
                    onChange={(e) => setKundeSearch(e.target.value)}
                    className={`${inputCls} w-48`}
                  />
                </div>
                <FGTable rows={fgRows} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
