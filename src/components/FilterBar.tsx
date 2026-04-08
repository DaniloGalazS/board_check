interface Filters {
  articleGroup: string
  articleNo: string
  onlyWithAlternative: boolean
}

interface Props {
  filters: Filters
  articleGroups: string[]
  onChange: (f: Filters) => void
}

export default function FilterBar({ filters, articleGroups, onChange }: Props) {
  function set(partial: Partial<Filters>) {
    onChange({ ...filters, ...partial })
  }

  const inputCls = `
    bg-white border border-slate-300 text-slate-700 placeholder-slate-400
    dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder-slate-500
    text-sm rounded-lg px-3 py-2
    focus:outline-none focus:ring-2 focus:ring-blue-500
  `

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Article group */}
      <select
        value={filters.articleGroup}
        onChange={(e) => set({ articleGroup: e.target.value })}
        className={inputCls}
      >
        <option value="">Todos los grupos</option>
        {articleGroups.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      {/* Article no. search */}
      <input
        type="text"
        placeholder="Buscar Article no…"
        value={filters.articleNo}
        onChange={(e) => set({ articleNo: e.target.value })}
        className={`${inputCls} w-48`}
      />

      {/* Only with alternative toggle */}
      <button
        onClick={() => set({ onlyWithAlternative: !filters.onlyWithAlternative })}
        className={`
          text-sm rounded-lg px-4 py-2 border transition-colors font-medium
          ${filters.onlyWithAlternative
            ? 'bg-emerald-600 border-emerald-500 text-white dark:bg-emerald-700 dark:border-emerald-600'
            : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white dark:hover:border-slate-500'
          }
        `}
      >
        Solo con alternativa
      </button>
    </div>
  )
}
