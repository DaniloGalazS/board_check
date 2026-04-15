import { useState, useRef, useEffect } from 'react'

interface Props {
  placeholder: string
  options: string[]       // all possible values (already sorted)
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function MultiSelectFilter({ placeholder, options, selected, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()) && !selected.includes(o))
    : options.filter((o) => !selected.includes(o))

  function add(value: string) {
    onChange([...selected, value])
    setQuery('')
  }

  function remove(value: string) {
    onChange(selected.filter((s) => s !== value))
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`
          flex flex-wrap items-center gap-1.5 min-w-56 max-w-sm
          bg-white dark:bg-slate-800
          border rounded-lg px-2 py-1.5 cursor-text
          ${open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-300 dark:border-slate-700'}
        `}
        onClick={() => { setOpen(true) }}
      >
        {selected.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full font-medium max-w-[160px]"
          >
            <span className="truncate">{s}</span>
            <button
              onClick={(e) => { e.stopPropagation(); remove(s) }}
              className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 flex-shrink-0"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ''}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="flex-1 min-w-[80px] text-sm bg-transparent text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none"
        />
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          {filtered.slice(0, 50).map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); add(opt) }}
              className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer truncate"
            >
              {opt}
            </li>
          ))}
          {filtered.length > 50 && (
            <li className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
              {filtered.length - 50} más — escribe para filtrar
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
