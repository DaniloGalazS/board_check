import type { MaterialMatch } from '../lib/types'

const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

interface Props {
  matches: MaterialMatch[]
  colSpan: number
}

function deduplicateByArticleNo(matches: MaterialMatch[]): MaterialMatch[] {
  const best = new Map<string, MaterialMatch>()
  for (const m of matches) {
    const existing = best.get(m.fgArticleNo)
    if (!existing || m.lossPct < existing.lossPct) {
      best.set(m.fgArticleNo, m)
    }
  }
  return Array.from(best.values())
}

export default function ExpandedProductRow({ matches, colSpan }: Props) {
  const deduped = deduplicateByArticleNo(matches)
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-slate-100 border-t border-b border-slate-200 dark:bg-slate-800/60 dark:border-t dark:border-b dark:border-slate-700 px-6 py-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Productos candidatos ({deduped.length})
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left pb-2 pr-4 font-medium">Article no.</th>
                <th className="text-left pb-2 pr-4 font-medium">Variante</th>
                <th className="text-left pb-2 pr-4 font-medium">Descripción</th>
                <th className="text-left pb-2 pr-4 font-medium">Cliente</th>
                <th className="text-left pb-2 pr-4 font-medium">Cartulina utilizada</th>
                <th className="text-right pb-2 pr-4 font-medium">Uds. posibles</th>
                <th className="text-right pb-2 pr-4 font-medium">Kilos util.</th>
                <th className="text-right pb-2 pr-4 font-medium">% Pérdida</th>
                <th className="text-right pb-2 pr-4 font-medium">Monto pérdida</th>
                <th className="text-left pb-2 pr-4 font-medium">Fuente</th>
                <th className="text-left pb-2 font-medium">Método</th>
              </tr>
            </thead>
            <tbody>
              {deduped.map((m, i) => (
                <tr key={i} className="border-b border-slate-200/70 dark:border-slate-700/50 last:border-0">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-300 font-medium">{m.fgArticleNo}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{m.fgVariant || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">{m.fgDescription}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{m.kunde}</td>
                  <td className="py-2 pr-4">
                    <span className="text-slate-800 dark:text-slate-300 font-medium">{m.consumedArticleNo}</span>
                    <span className="text-slate-400 dark:text-slate-500 ml-1">/ {m.consumedVariant}</span>
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-900 dark:text-slate-200 font-medium">
                    {numFmt.format(m.unitsProducible)}
                    {m.lanesProposed !== undefined && m.lanesProposed !== m.lanes && (
                      <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">
                        ({m.lanesProposed}/SHT)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">{numFmt.format(m.kgUtilizable)}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className={`font-medium ${m.lossPct < 10 ? 'text-emerald-600 dark:text-emerald-400' : m.lossPct < 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {numFmt.format(m.lossPct)}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">{clpFmt.format(m.lossAmountCLP)}</td>
                  <td className="py-2 pr-4">
                    {m.source === 'historial' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        Historial
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        Master Data
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {m.method === 'grilla' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Grilla
                      </span>
                    )}
                    {m.method === 'proporcional' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Proporcional
                      </span>
                    )}
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
