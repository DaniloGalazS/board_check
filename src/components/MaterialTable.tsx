import { useState } from 'react'
import type { AnalyzedMaterial } from '../lib/types'
import ExpandedProductRow from './ExpandedProductRow'

const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

interface Props {
  materials: AnalyzedMaterial[]
}

const COL_COUNT = 12

export default function MaterialTable({ materials }: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function toggleRow(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (materials.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        No se encontraron materiales con los filtros aplicados.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3 font-medium w-8"></th>
            <th className="text-left px-4 py-3 font-medium">Article no.</th>
            <th className="text-left px-4 py-3 font-medium">Variante</th>
            <th className="text-left px-4 py-3 font-medium">Descripción</th>
            <th className="text-right px-4 py-3 font-medium">Días stock</th>
            <th className="text-right px-4 py-3 font-medium">Cantidad</th>
            <th className="text-left px-4 py-3 font-medium">Unidad</th>
            <th className="text-right px-4 py-3 font-medium">N° FG</th>
            <th className="text-right px-4 py-3 font-medium">Valor stock</th>
            <th className="text-right px-4 py-3 font-medium">Kilos util.</th>
            <th className="text-right px-4 py-3 font-medium">Pérdida (min→max)</th>
            <th className="text-right px-4 py-3 font-medium">Prom. pérd.</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((mat, idx) => {
            const key = `${mat.articleNo}|${mat.variant}|${mat.batchNo}|${idx}`
            const isExpanded = expandedKeys.has(key)
            const hasMatches = mat.matches.length > 0

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
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                    {clpFmt.format(mat.valuatedAmount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hasMatches ? (
                      <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-800/50 dark:text-emerald-300 text-xs px-2 py-1 rounded-full font-medium">
                        {mat.matches.length}
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
      </div>
    </div>
  )
}
