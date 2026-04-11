import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppConfig } from '../lib/types'

const CONFIG_KEY = 'forecast_hub_config'
const DEFAULTS: AppConfig = { minStockAgeDays: 200, gridThresholdMm: 30, minSheetWidth: 0, minSheetHeight: 0, enableLogic2: true }

function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return {
      minStockAgeDays: typeof parsed.minStockAgeDays === 'number' ? parsed.minStockAgeDays : DEFAULTS.minStockAgeDays,
      gridThresholdMm: typeof parsed.gridThresholdMm === 'number' ? parsed.gridThresholdMm : DEFAULTS.gridThresholdMm,
      minSheetWidth: typeof parsed.minSheetWidth === 'number' ? parsed.minSheetWidth : DEFAULTS.minSheetWidth,
      minSheetHeight: typeof parsed.minSheetHeight === 'number' ? parsed.minSheetHeight : DEFAULTS.minSheetHeight,
      enableLogic2: typeof parsed.enableLogic2 === 'boolean' ? parsed.enableLogic2 : DEFAULTS.enableLogic2,
    }
  } catch {
    return DEFAULTS
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function getConfig(): AppConfig {
  return loadConfig()
}

export default function Configuration() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<AppConfig>(loadConfig)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    saveConfig(config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function setDays(v: number) {
    setConfig((c) => ({ ...c, minStockAgeDays: v }))
  }

  function setThreshold(v: number) {
    setConfig((c) => ({ ...c, gridThresholdMm: v }))
  }

  function setMinSheetWidth(v: number) {
    setConfig((c) => ({ ...c, minSheetWidth: v }))
  }

  function setMinSheetHeight(v: number) {
    setConfig((c) => ({ ...c, minSheetHeight: v }))
  }

  function toggleLogic2() {
    setConfig((c) => ({ ...c, enableLogic2: !c.enableLogic2 }))
  }

  const inputClass = `
    w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3
    text-slate-900 text-lg font-semibold
    dark:bg-slate-800 dark:border-slate-700 dark:text-white
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
  `

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

        <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl p-8 flex flex-col gap-8">
          <div>
            <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Días mínimos de stock age para el análisis
            </label>
            <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
              Solo se analizarán materiales con más de este número de días en stock.
            </p>
            <input
              type="number"
              min={0}
              value={config.minStockAgeDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setDays(isNaN(v) ? 0 : v)
              }}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Umbral de confianza de grilla (mm)
            </label>
            <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
              Tolerancia en mm para inferir la disposición cols×rows del pliego en Lógica 2. Valores menores son más estrictos; si la diferencia supera este umbral se usa el modelo proporcional.
            </p>
            <input
              type="number"
              min={0}
              value={config.gridThresholdMm}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setThreshold(isNaN(v) ? 0 : v)
              }}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Tamaño mínimo de pliego (mm)
            </label>
            <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
              No se mostrarán propuestas de uso con pliego menor a estas dimensiones (limitante de máquina). Dejar en 0 para no aplicar límite.
            </p>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <label className="block mb-1 text-xs text-slate-500 dark:text-slate-400">Ancho</label>
                <input
                  type="number"
                  min={0}
                  value={config.minSheetWidth}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setMinSheetWidth(isNaN(v) ? 0 : v)
                  }}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 text-xs text-slate-500 dark:text-slate-400">Alto</label>
                <input
                  type="number"
                  min={0}
                  value={config.minSheetHeight}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setMinSheetHeight(isNaN(v) ? 0 : v)
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Análisis por Master Data (Lógica 2)
            </label>
            <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
              Activa la búsqueda de candidatos en el catálogo completo de productos activos (ITEM-STD + BOM + Design Waste), además del historial de producción.
            </p>
            <button
              onClick={toggleLogic2}
              className={`
                px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors
                ${config.enableLogic2
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300'
                }
              `}
            >
              {config.enableLogic2 ? 'Activada' : 'Desactivada'}
            </button>
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
