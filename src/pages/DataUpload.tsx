import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUploadZone from '../components/FileUploadZone'
import { parseBoinv, parseProdStd, parseItempp, parseItemStd, parseBom, parseDesignWaste } from '../lib/excelParser'
import { saveRows, saveMetadata, loadAllMetadata } from '../lib/storage'
import type { StoredFileMetadata } from '../lib/types'

const CHILE_TZ = 'America/Santiago'

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: CHILE_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoString))
}

type LoadingState = Record<string, boolean>

const REQUIRED_FILES: StoredFileMetadata['fileType'][] = ['boinv', 'prodstd', 'itempp']

export default function DataUpload() {
  const navigate = useNavigate()
  const [metadata, setMetadata] = useState<StoredFileMetadata[]>([])
  const [loading, setLoading] = useState<LoadingState>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAllMetadata().then(setMetadata)
  }, [])

  function getMeta(fileType: string) {
    return metadata.find((m) => m.fileType === fileType)
  }

  async function handleFile(
    fileType: StoredFileMetadata['fileType'],
    file: File,
    parser: (f: File) => Promise<unknown[]>,
    store: Parameters<typeof saveRows>[0]
  ) {
    setError(null)
    setLoading((prev) => ({ ...prev, [fileType]: true }))
    try {
      const rows = await parser(file)
      await saveRows(store, rows as never)
      const meta: StoredFileMetadata = {
        fileType,
        uploadedAt: new Date().toISOString(),
        rowCount: rows.length,
      }
      await saveMetadata(meta)
      setMetadata((prev) => {
        const filtered = prev.filter((m) => m.fileType !== fileType)
        return [...filtered, meta]
      })
    } catch (err) {
      setError(`Error al procesar ${file.name}: ${err instanceof Error ? err.message : 'Error desconocido'}`)
    } finally {
      setLoading((prev) => ({ ...prev, [fileType]: false }))
    }
  }

  const canAnalyze = REQUIRED_FILES.every((t) => !!getMeta(t))

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-8 transition-colors"
        >
          ← Volver al inicio
        </button>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Carga de Datos</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-10">
          Sube los archivos Excel. Los datos se guardan localmente hasta la próxima carga.
        </p>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-6">
          {/* Grupo 1 — Análisis por historial de producción */}
          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
              Reemplazos por historial de producción
            </p>
            <div className="flex flex-col gap-4">
              <FileUploadZone
                label="BOINV — Stock de materiales"
                subtitle="Materiales en stock con aging y cantidades"
                onFile={(f) => handleFile('boinv', f, parseBoinv, 'boinv')}
                lastUpload={getMeta('boinv') ? formatDate(getMeta('boinv')!.uploadedAt) : undefined}
                isLoading={!!loading['boinv']}
                isLoaded={!!getMeta('boinv')}
              />

              <FileUploadZone
                label="PROD-STD — Producciones históricas"
                subtitle="Órdenes de producción con materiales consumidos"
                onFile={(f) => handleFile('prodstd', f, parseProdStd, 'prodstd')}
                lastUpload={getMeta('prodstd') ? formatDate(getMeta('prodstd')!.uploadedAt) : undefined}
                isLoading={!!loading['prodstd']}
                isLoaded={!!getMeta('prodstd')}
              />

              <FileUploadZone
                label="ITEMPP — Master data de materiales"
                subtitle="Dirección de fibra y datos maestros"
                onFile={(f) => handleFile('itempp', f, parseItempp, 'itempp')}
                lastUpload={getMeta('itempp') ? formatDate(getMeta('itempp')!.uploadedAt) : undefined}
                isLoading={!!loading['itempp']}
                isLoaded={!!getMeta('itempp')}
              />
            </div>
          </div>

          {/* Grupo 2 — Análisis por master data de productos */}
          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Reemplazos por master data de productos
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Opcional — amplía los candidatos con el catálogo completo de productos activos</p>
            <div className="flex flex-col gap-4">
              <FileUploadZone
                label="ITEM-STD — Master data de productos"
                subtitle="Dimensiones de troquel y unidades al pliego por producto activo"
                onFile={(f) => handleFile('itemstd', f, parseItemStd, 'itemstd')}
                lastUpload={getMeta('itemstd') ? formatDate(getMeta('itemstd')!.uploadedAt) : undefined}
                isLoading={!!loading['itemstd']}
                isLoaded={!!getMeta('itemstd')}
              />

              <FileUploadZone
                label="BOM — Relación producto-material"
                subtitle="Vincula cada producto con el material de cartulina que consume"
                onFile={(f) => handleFile('bom', f, parseBom, 'bom')}
                lastUpload={getMeta('bom') ? formatDate(getMeta('bom')!.uploadedAt) : undefined}
                isLoading={!!loading['bom']}
                isLoaded={!!getMeta('bom')}
              />

              <FileUploadZone
                label="Design Waste — Merma de diseño"
                subtitle="Porcentaje de merma de diseño por producto (CAD Waste)"
                onFile={(f) => handleFile('designwaste', f, parseDesignWaste, 'designwaste')}
                lastUpload={getMeta('designwaste') ? formatDate(getMeta('designwaste')!.uploadedAt) : undefined}
                isLoading={!!loading['designwaste']}
                isLoaded={!!getMeta('designwaste')}
              />
            </div>
          </div>
        </div>

        {canAnalyze && (
          <button
            onClick={() => navigate('/analysis')}
            className="mt-8 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Ir al Análisis →
          </button>
        )}
      </div>
    </div>
  )
}
