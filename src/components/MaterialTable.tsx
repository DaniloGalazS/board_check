import { useState } from 'react'
import type { AnalyzedMaterial } from '../lib/types'
import ExpandedProductRow from './ExpandedProductRow'

const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

interface Props {
  materials: AnalyzedMaterial[]
}

const COL_COUNT = 13

type SortKey = 'articleNo' | 'stockAge' | 'quantity' | 'totalSheets' | 'valuatedAmount' | 'fgCount' | 'kgUtilizable' | 'minLossPct' | 'avgLossPct'
type SortDir = 'asc' | 'desc'
interface SortEntry { key: SortKey; dir: SortDir }

function getValue(mat: AnalyzedMaterial, key: SortKey): number | string {
  switch (key) {
    case 'articleNo': return mat.articleNo
    case 'stockAge': return mat.stockAge
    case 'quantity': return mat.quantity
    case 'totalSheets': return mat.totalSheets
    case 'valuatedAmount': return mat.valuatedAmount
    case 'fgCount': return new Set(mat.matches.map((m) => m.fgArticleNo)).size
    case 'kgUtilizable': return mat.kgUtilizable
    case 'minLossPct': return mat.minLossPct
    case 'avgLossPct': return mat.avgLossPct
  }
}

function sortMaterials(materials: AnalyzedMaterial[], sorts: SortEntry[]): AnalyzedMaterial[] {
  if (sorts.length === 0) return materials
  return [...materials].sort((a, b) => {
    for (const { key, dir } of sorts) {
      const av = getValue(a, key)
      const bv = getValue(b, key)
      let cmp = 0
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv)
      } else {
        cmp = (av as number) - (bv as number)
      }
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
  onSort: (key: SortKey, addToSort: boolean) => void
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
        {align === 'right' && entry && (
          <span className="text-blue-500 dark:text-blue-400 text-xs">
            {entry.dir === 'asc' ? '↑' : '↓'}{rank !== null ? rank : ''}
          </span>
        )}
        {label}
        {align === 'left' && entry && (
          <span className="text-blue-500 dark:text-blue-400 text-xs">
            {entry.dir === 'asc' ? '↑' : '↓'}{rank !== null ? rank : ''}
          </span>
        )}
      </span>
    </th>
  )
}

export default function MaterialTable({ materials }: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [sorts, setSorts] = useState<SortEntry[]>([])

  function handleSort(key: SortKey, addToSort: boolean) {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key)
      if (addToSort) {
        // Shift+click: add/toggle within multi-sort
        if (existing) {
          if (existing.dir === 'asc') return prev.map((s) => s.key === key ? { ...s, dir: 'desc' } : s)
          return prev.filter((s) => s.key !== key)
        }
        return [...prev, { key, dir: 'asc' }]
      } else {
        // Single click: replace sort
        if (existing && prev.length === 1) {
          if (existing.dir === 'asc') return [{ key, dir: 'desc' }]
          return []
        }
        return [{ key, dir: 'asc' }]
      }
    })
  }

  function uniqueArticleCount(matches: AnalyzedMaterial['matches']): number {
    return new Set(matches.map((m) => m.fgArticleNo)).size
  }

  function toggleRow(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sorted = sortMaterials(materials, sorts)

  if (materials.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        No se encontraron materiales con los filtros aplicados.
      </div>
    )
  }

  const thProps = { sorts, onSort: handleSort }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3 font-medium w-8"></th>
            <SortableTh label="Article no." sortKey="articleNo" align="left" {...thProps} />
            <th className="text-left px-4 py-3 font-medium">Variante</th>
            <th className="text-left px-4 py-3 font-medium">Descripción</th>
            <SortableTh label="Días stock" sortKey="stockAge" {...thProps} />
            <SortableTh label="Cantidad" sortKey="quantity" {...thProps} />
            <th className="text-left px-4 py-3 font-medium">Unidad</th>
            <SortableTh label="Pliegos" sortKey="totalSheets" {...thProps} />
            <th className="text-left px-4 py-3 font-medium">SHT</th>
            <SortableTh label="Valor stock" sortKey="valuatedAmount" {...thProps} />
            <SortableTh label="N° FG" sortKey="fgCount" {...thProps} />
            <SortableTh label="Kilos util." sortKey="kgUtilizable" {...thProps} />
            <th className="text-right px-4 py-3 font-medium">Pérdida (min→max)</th>
            <SortableTh label="Prom. pérd." sortKey="avgLossPct" {...thProps} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((mat, idx) => {
            const key = `${mat.articleNo}|${mat.variant}|${mat.batchNo}|${idx}`
            const isExpanded = expandedKeys.has(key)
            const hasMatches = mat.matches.length > 0
            const fgCount = uniqueArticleCount(mat.matches)

            return (
              <>
                <tr
                  key={key}
                  onClick={() => hasMatches && toggleRow(key)}
                  className={`
                    border-b border-slate-200 dark:border-slate-800/70
                    ${hasMatches
                      ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      : 'opacity-60'
                    }
                    ${isExpanded ? 'bg-slate-50 dark:bg-slate-800/30' : 'bg-white dark:bg-transparent'}
                    transition-colors
                  `}
                >
                  <td className="px-4 py-3 text-center">
                    {hasMatches && (
                      <span className={`text-slate-400 text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-200 font-medium">{mat.articleNo}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{mat.variant}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">{mat.description}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${mat.stockAge > 365 ? 'text-red-500 dark:text-red-400' : mat.stockAge > 200 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {mat.stockAge}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{numFmt.format(mat.quantity)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{mat.stockUnit}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {mat.totalSheets > 0 ? Math.ceil(mat.totalSheets).toLocaleString('es-CL') : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">SHT</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                    {clpFmt.format(mat.valuatedAmount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hasMatches ? (
                      <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-800/50 dark:text-emerald-300 text-xs px-2 py-1 rounded-full font-medium">
                        {fgCount}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {hasMatches ? numFmt.format(mat.kgUtilizable) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hasMatches ? (
                      <span className="text-slate-500 dark:text-slate-400 text-xs">
                        <span className={mat.minLossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : mat.minLossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                          {numFmt.format(mat.minLossPct)}%
                        </span>
                        <span className="text-slate-300 dark:text-slate-600 mx-1">→</span>
                        <span className={mat.maxLossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : mat.maxLossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                          {numFmt.format(mat.maxLossPct)}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hasMatches ? (
                      <span className={`font-medium ${mat.avgLossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : mat.avgLossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {numFmt.format(mat.avgLossPct)}%
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <ExpandedProductRow
                    key={`${key}-expanded`}
                    matches={mat.matches}
                    colSpan={COL_COUNT}
                  />
                )}
              </>
            )
          })}
        </tbody>
      </table>

      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
        {materials.length} material{materials.length !== 1 ? 'es' : ''} •{' '}
        {clpFmt.format(materials.reduce((s, m) => s + m.valuatedAmount, 0))} total
        {sorts.length > 0 && (
          <button
            onClick={() => setSorts([])}
            className="ml-3 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          >
            Limpiar orden
          </button>
        )}
      </div>
    </div>
  )
}
