import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const CONFIG_KEY = 'forecast_hub_config'
const DEFAULT_DAYS = 200

function loadConfig(): number {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_DAYS
    const parsed = JSON.parse(raw)
    return typeof parsed.minStockAgeDays === 'number' ? parsed.minStockAgeDays : DEFAULT_DAYS
  } catch {
    return DEFAULT_DAYS
  }
}

export function saveConfig(minStockAgeDays: number): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ minStockAgeDays }))
}

export function getConfig(): { minStockAgeDays: number } {
  return { minStockAgeDays: loadConfig() }
}

export default function Configuration() {
  const navigate = useNavigate()
  const [days, setDays] = useState<number>(loadConfig)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    saveConfig(days)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-8 transition-colors"
        >
          ← Volver al inicio
        </button>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Configuración</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-10">Parámetros del análisis de stock.</p>

        <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl p-8">
          <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Días mínimos de stock age para el análisis
          </label>
          <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
            Solo se analizarán materiales con más de este número de días en stock.
          </p>
          <input
            type="number"
            min={0}
            value={days}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setDays(isNaN(v) ? 0 : v)
            }}
            className="
              w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3
              text-slate-900 text-lg font-semibold
              dark:bg-slate-800 dark:border-slate-700 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            "
          />

          <button
            onClick={handleSave}
            className="
              mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold
              py-3 rounded-lg transition-colors
            "
          >
            {saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
