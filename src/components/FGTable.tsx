import { useState } from 'react'
import type { MaterialMatch } from '../lib/types'

const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

// ─── FG row (aggregated across all materials that can produce it) ─────────────

export interface FGRow {
  fgArticleNo: string
  fgDescription: string
  kunde: string
  totalUnits: number
  minLossPct: number
  avgLossPct: number
  maxLossPct: number
  totalLossAmount: number
  source: 'historial' | 'masterdata' | 'mixed'
  materials: FGMaterialOption[]
}

export interface FGMaterialOption {
  matArticleNo: string
  matVariant: string           // original BOM/consumed variant
  proposedSheetDims?: string
  lanes: number
  lanesProposed?: number
  method?: 'grilla' | 'proporcional'
  source: 'historial' | 'masterdata'
  unitsProducible: number
  kgAvailable: number
  lossPct: number
  lossAmountCLP: number
}

// ─── Build FG rows from flat list of (material, match) pairs ─────────────────

export interface MaterialMatchPair {
  matArticleNo: string
  matVariant: string
  matQuantity: number
  match: MaterialMatch
}

export function buildFGRows(pairs: MaterialMatchPair[]): FGRow[] {
  const byFG = new Map<string, { match: MaterialMatch; mats: FGMaterialOption[] }>()

  for (const { matArticleNo, matVariant, matQuantity, match } of pairs) {
    const existing = byFG.get(match.fgArticleNo)
    const opt: FGMaterialOption = {
      matArticleNo,
      matVariant,
      proposedSheetDims: match.proposedSheetDims,
      lanes: match.lanes,
      lanesProposed: match.lanesProposed,
      method: match.method,
      source: match.source,
      unitsProducible: match.unitsProducible,
      kgAvailable: matQuantity,
      lossPct: match.lossPct,
      lossAmountCLP: match.lossAmountCLP,
    }
    if (existing) {
      existing.mats.push(opt)
    } else {
      byFG.set(match.fgArticleNo, { match, mats: [opt] })
    }
  }

  return [...byFG.entries()].map(([fgArticleNo, { match, mats }]) => {
    const lossPcts = mats.map((o) => o.lossPct)
    const sources = new Set(mats.map((o) => o.source))
    const source: FGRow['source'] = sources.size > 1 ? 'mixed' : (sources.has('historial') ? 'historial' : 'masterdata')
    return {
      fgArticleNo,
      fgDescription: match.fgDescription,
      kunde: match.kunde,
      totalUnits: mats.reduce((s, o) => s + o.unitsProducible, 0),
      minLossPct: Math.min(...lossPcts),
      avgLossPct: lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length,
      maxLossPct: Math.max(...lossPcts),
      totalLossAmount: mats.reduce((s, o) => s + o.lossAmountCLP, 0),
      source,
      materials: mats,
    }
  })
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortKey = 'fgArticleNo' | 'kunde' | 'totalUnits' | 'matCount' | 'avgLossPct' | 'totalLossAmount'
type SortDir = 'asc' | 'desc'
interface SortEntry { key: SortKey; dir: SortDir }

function getValue(row: FGRow, key: SortKey): number | string {
  switch (key) {
    case 'fgArticleNo': return row.fgArticleNo
    case 'kunde': return row.kunde
    case 'totalUnits': return row.totalUnits
    case 'matCount': return row.materials.length
    case 'avgLossPct': return row.avgLossPct
    case 'totalLossAmount': return row.totalLossAmount
  }
}

function sortRows(rows: FGRow[], sorts: SortEntry[]): FGRow[] {
  if (sorts.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const { key, dir } of sorts) {
      const av = getValue(a, key)
      const bv = getValue(b, key)
      let cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
    }
    return 0
  })
}

interface SortableThProps {
  label: string
  sortKey: SortKey
  sorts: SortEntry[]
  align?: 'left' | 'right'
  onSort: (key: SortKey, add: boolean) => void
}

function SortableTh({ label, sortKey, sorts, align = 'right', onSort }: SortableThProps) {
  const idx = sorts.findIndex((s) => s.key === sortKey)
  const entry = sorts[idx]
  const rank = sorts.length > 1 && idx !== -1 ? idx + 1 : null
  return (
    <th
      className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-${align}`}
      onClick={(e) => onSort(sortKey, e.shiftKey)}
    >
      <span className="inline-flex items-center gap-1">
        {align === 'right' && entry && <span className="text-blue-500 dark:text-blue-400 text-xs">{entry.dir === 'asc' ? '↑' : '↓'}{rank ?? ''}</span>}
        {label}
        {align === 'left' && entry && <span className="text-blue-500 dark:text-blue-400 text-xs">{entry.dir === 'asc' ? '↑' : '↓'}{rank ?? ''}</span>}
      </span>
    </th>
  )
}

// ─── Expanded material options row ────────────────────────────────────────────

function ExpandedMaterialRow({ materials, colSpan }: { materials: FGMaterialOption[]; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-slate-100 border-t border-b border-slate-200 dark:bg-slate-800/60 dark:border-slate-700 px-6 py-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Materiales disponibles ({materials.length})
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left pb-2 pr-4 font-medium">Material</th>
                <th className="text-left pb-2 pr-4 font-medium">Pliego estándar</th>
                <th className="text-left pb-2 pr-4 font-medium">Pliego propuesto</th>
                <th className="text-right pb-2 pr-4 font-medium">Uds./pliego estd.</th>
                <th className="text-right pb-2 pr-4 font-medium">Uds./pliego prop.</th>
                <th className="text-right pb-2 pr-4 font-medium">Kg disponibles</th>
                <th className="text-right pb-2 pr-4 font-medium">Uds. posibles</th>
                <th className="text-right pb-2 pr-4 font-medium">% Pérdida</th>
                <th className="text-right pb-2 pr-4 font-medium">Monto pérdida</th>
                <th className="text-left pb-2 pr-4 font-medium">Fuente</th>
                <th className="text-left pb-2 font-medium">Método</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((o, i) => (
                <tr key={i} className="border-b border-slate-200/70 dark:border-slate-700/50 last:border-0">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-300 font-medium">{o.matArticleNo}</td>
                  <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                    {o.source === 'masterdata' ? o.matVariant : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-300">
                    {o.proposedSheetDims ?? o.matVariant}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-500 dark:text-slate-400">
                    {o.source === 'masterdata' ? o.lanes : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-900 dark:text-slate-200 font-medium">
                    {o.lanesProposed ?? o.lanes}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">{numFmt.format(o.kgAvailable)}</td>
                  <td className="py-2 pr-4 text-right text-slate-900 dark:text-slate-200 font-medium">{numFmt.format(o.unitsProducible)}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className={`font-medium ${o.lossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : o.lossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {numFmt.format(o.lossPct)}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">{clpFmt.format(o.lossAmountCLP)}</td>
                  <td className="py-2 pr-4">
                    {o.source === 'historial'
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">Historial</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Master Data</span>
                    }
                  </td>
                  <td className="py-2">
                    {o.method === 'grilla' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Grilla</span>}
                    {o.method === 'proporcional' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Proporcional</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

// ─── Main table ───────────────────────────────────────────────────────────────

const COL_COUNT = 8

interface Props {
  rows: FGRow[]
}

export default function FGTable({ rows }: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [sorts, setSorts] = useState<SortEntry[]>([])

  function handleSort(key: SortKey, add: boolean) {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key)
      if (add) {
        if (existing) {
          if (existing.dir === 'asc') return prev.map((s) => s.key === key ? { ...s, dir: 'desc' } : s)
          return prev.filter((s) => s.key !== key)
        }
        return [...prev, { key, dir: 'asc' }]
      } else {
        if (existing && prev.length === 1) {
          if (existing.dir === 'asc') return [{ key, dir: 'desc' }]
          return []
        }
        return [{ key, dir: 'asc' }]
      }
    })
  }

  function toggleRow(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sorted = sortRows(rows, sorts)
  const thProps = { sorts, onSort: handleSort }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        No se encontraron productos con los filtros aplicados.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3 font-medium w-8"></th>
            <SortableTh label="Article no." sortKey="fgArticleNo" align="left" {...thProps} />
            <th className="text-left px-4 py-3 font-medium">Descripción</th>
            <SortableTh label="Cliente" sortKey="kunde" align="left" {...thProps} />
            <SortableTh label="N° materiales" sortKey="matCount" {...thProps} />
            <SortableTh label="Uds. posibles" sortKey="totalUnits" {...thProps} />
            <th className="text-right px-4 py-3 font-medium">Pérdida (min→max)</th>
            <SortableTh label="Prom. pérd." sortKey="avgLossPct" {...thProps} />
            <SortableTh label="Monto pérdida" sortKey="totalLossAmount" {...thProps} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const key = `${row.fgArticleNo}|${idx}`
            const isExpanded = expandedKeys.has(key)
            return (
              <>
                <tr
                  key={key}
                  onClick={() => toggleRow(key)}
                  className={`
                    border-b border-slate-200 dark:border-slate-800/70 cursor-pointer
                    hover:bg-slate-50 dark:hover:bg-slate-800/40
                    ${isExpanded ? 'bg-slate-50 dark:bg-slate-800/30' : 'bg-white dark:bg-transparent'}
                    transition-colors
                  `}
                >
                  <td className="px-4 py-3 text-center">
                    <span className={`text-slate-400 text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-200 font-medium">{row.fgArticleNo}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">{row.fgDescription}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.kunde || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="bg-blue-100 text-blue-700 dark:bg-blue-800/50 dark:text-blue-300 text-xs px-2 py-1 rounded-full font-medium">
                      {row.materials.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900 dark:text-slate-200 font-medium">
                    {numFmt.format(row.totalUnits)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-slate-500 dark:text-slate-400 text-xs">
                      <span className={row.minLossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : row.minLossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                        {numFmt.format(row.minLossPct)}%
                      </span>
                      <span className="text-slate-300 dark:text-slate-600 mx-1">→</span>
                      <span className={row.maxLossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : row.maxLossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                        {numFmt.format(row.maxLossPct)}%
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${row.avgLossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : row.avgLossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {numFmt.format(row.avgLossPct)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {clpFmt.format(row.totalLossAmount)}
                  </td>
                </tr>
                {isExpanded && (
                  <ExpandedMaterialRow
                    key={`${key}-expanded`}
                    materials={row.materials}
                    colSpan={COL_COUNT + 1}
                  />
                )}
              </>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
        {rows.length} producto{rows.length !== 1 ? 's' : ''} •{' '}
        {numFmt.format(rows.reduce((s, r) => s + r.totalUnits, 0))} uds. posibles
        {sorts.length > 0 && (
          <button onClick={() => setSorts([])} className="ml-3 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
            Limpiar orden
          </button>
        )}
      </div>
    </div>
  )
}
