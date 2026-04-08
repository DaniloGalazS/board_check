import { useRef, useState } from 'react'

interface Props {
  label: string
  subtitle: string
  onFile: (file: File) => void
  lastUpload?: string
  isLoading: boolean
  isLoaded: boolean
}

export default function FileUploadZone({ label, subtitle, onFile, lastUpload, isLoading, isLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isLoading && inputRef.current?.click()}
      className={`
        relative rounded-xl border-2 border-dashed p-6 cursor-pointer
        transition-all duration-200 select-none
        ${isDragging
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : isLoaded
            ? 'border-emerald-500 bg-emerald-50 hover:border-emerald-400 dark:border-emerald-600 dark:bg-emerald-900/10 dark:hover:border-emerald-400'
            : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-slate-500'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />

      <div className="flex items-start gap-4">
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0
          ${isLoaded
            ? 'bg-emerald-100 dark:bg-emerald-800/50'
            : 'bg-slate-100 dark:bg-slate-800'
          }
        `}>
          {isLoading ? (
            <span className="animate-spin text-base">⟳</span>
          ) : isLoaded ? (
            '✓'
          ) : (
            '📄'
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white text-sm">{label}</p>
          <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>

          {lastUpload ? (
            <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-2">
              Última carga: {lastUpload}
            </p>
          ) : (
            <p className="text-slate-400 dark:text-slate-600 text-xs mt-2">
              Sin datos cargados — arrastra o haz clic para seleccionar
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
