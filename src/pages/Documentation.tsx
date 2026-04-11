import { useNavigate } from 'react-router-dom'

interface Section {
  title: string
  content: React.ReactNode
}

export default function Documentation() {
  const navigate = useNavigate()

  const sections: Section[] = [
    {
      title: '¿Qué es Board Check?',
      content: (
        <p>
          Board Check analiza el inventario de cartulinas inmovilizadas (materiales con alto stock age) y determina
          qué productos terminados (FG) podrían fabricarse reutilizando ese material. El objetivo es reducir el
          stock obsoleto proponiendo usos concretos, calculando cuántas unidades se podrían producir y qué
          porcentaje del material se perdería como merma de corte.
        </p>
      ),
    },
    {
      title: 'Fuentes de datos',
      content: (
        <div className="space-y-3">
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">Archivos requeridos (Lógica 1):</span>
            <ul className="mt-1 space-y-1 list-disc list-inside text-slate-600 dark:text-slate-400">
              <li><strong>BOINV</strong> — Stock de cartulinas: artículo, variante, cantidad (kg), valor, días en stock.</li>
              <li><strong>PROD-STD</strong> — Historial de producciones: qué producto se fabricó, con qué cartulina y cuántas unidades por pliego.</li>
              <li><strong>ITEMPP</strong> — Master data de materiales: dirección de fibra (Long/Short Grain) por artículo y variante.</li>
            </ul>
          </div>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">Archivos opcionales (Lógica 2):</span>
            <ul className="mt-1 space-y-1 list-disc list-inside text-slate-600 dark:text-slate-400">
              <li><strong>ITEM-STD</strong> — Catálogo de productos activos: dimensiones de troquel y unidades/pliego por formato.</li>
              <li><strong>BOM</strong> — Relación producto ↔ cartulina: qué material usa cada FG según el BOM vigente.</li>
              <li><strong>Design Waste</strong> — Merma de diseño (CAD waste) por BOM, expresada como porcentaje.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'Lógica 1 — Análisis por historial de producción',
      content: (
        <div className="space-y-2">
          <p>
            Busca en el historial de producciones (PROD-STD) todos los productos que hayan sido fabricados
            consumiendo el artículo de cartulina en análisis. Para cada candidato verifica:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
            <li><strong>Dimensiones:</strong> el pliego histórico debe caber dentro del stock inmovilizado.</li>
            <li><strong>Dirección de fibra:</strong> debe coincidir entre stock y pliego consumido (si falta dato en alguno, se acepta).</li>
            <li><strong>Certificación:</strong> si el producto exige PEFC o FSC, el stock debe tener exactamente esa certificación.</li>
          </ul>
          <p>
            Las unidades producibles se calculan como <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">pliegos × lanes</code>, donde
            <em> lanes</em> es la cantidad de unidades por pliego registrada en el historial.
            La pérdida es el porcentaje de área del pliego stock que no se aprovecha.
          </p>
          <p>Los candidatos de Lógica 1 se muestran con el badge <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">Historial</span>.</p>
        </div>
      ),
    },
    {
      title: 'Lógica 2 — Análisis por Master Data',
      content: (
        <div className="space-y-2">
          <p>
            Amplía la búsqueda al catálogo completo de productos activos (ITEM-STD + BOM), incluyendo productos
            que nunca se hayan fabricado con ese stock pero que podrían hacerse. Si el pliego estándar del BOM
            no cabe en el material inmovilizado, propone reducir las unidades al pliego usando uno de dos modelos:
          </p>
          <div className="space-y-3 mt-2">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Modelo Grilla <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Grilla</span></p>
              <p>
                Infiere la disposición original de troquel en el pliego estándar (cols × rows) y busca la
                reducción de mayor calidad que cabe en el stock. Se usa cuando la diferencia entre la grilla
                inferida y el pliego estándar es menor al <strong>umbral de confianza</strong> configurado (default 30 mm).
                Es el modelo más preciso porque respeta la geometría real de corte.
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Modelo Proporcional <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Proporcional</span></p>
              <p>
                Cuando la grilla no puede inferirse con confianza, escala el pliego manteniendo la relación de
                aspecto y la merma de diseño, reduciendo N de 1 en 1 hasta encontrar un tamaño que entre en el
                stock. Es una estimación conservadora.
              </p>
            </div>
          </div>
          <p className="mt-2">
            En ambos modelos se respetan las restricciones de <strong>dirección de fibra</strong> (considerando
            si el pliego debe rotarse 90°) y <strong>certificación</strong>. Los candidatos exclusivos de Lógica 2
            se muestran con el badge <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Master Data</span>.
            Si un producto ya aparece en Lógica 1, se prioriza ese resultado.
          </p>
        </div>
      ),
    },
    {
      title: 'Cómo leer los resultados',
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
            <li><strong>SHT (pliegos):</strong> cantidad de pliegos calculada desde los kg en stock, las dimensiones y el gramaje.</li>
            <li><strong>Uds. posibles:</strong> unidades de producto que se podrían cortar con ese stock. Para Master Data, puede mostrar las <em>unidades/pliego propuestas</em> entre paréntesis si difieren del estándar.</li>
            <li><strong>Kilos util.:</strong> kg del stock que entran al proceso (siempre el total del stock; la merma es de área, no de material).</li>
            <li><strong>% Pérdida:</strong> porcentaje del área del pliego stock que queda como merma de corte. Verde {"<"}10%, amarillo {"<"}25%, rojo ≥25%.</li>
            <li><strong>Monto pérdida:</strong> valor monetario de la merma estimada, basado en el valor de inventario del stock.</li>
            <li><strong>Cartulina utilizada:</strong> artículo y variante del pliego propuesto. Para Master Data muestra las dimensiones del pliego propuesto (no el pliego estándar del BOM).</li>
          </ul>
        </div>
      ),
    },
    {
      title: 'Configuración',
      content: (
        <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
          <li><strong>Días mínimos de stock age:</strong> solo se analizan materiales con más días que este umbral en el inventario.</li>
          <li><strong>Umbral de confianza de grilla (mm):</strong> tolerancia para decidir si usar el modelo Grilla o Proporcional en Lógica 2. Valores menores son más estrictos y fuerzan el modelo proporcional con más frecuencia.</li>
          <li><strong>Tamaño mínimo de pliego:</strong> descarta propuestas cuyo pliego propuesto sea menor a estas dimensiones (limitante de máquina).</li>
          <li><strong>Lógica 2:</strong> toggle para activar o desactivar el análisis por master data.</li>
        </ul>
      ),
    },
  ]

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-8 transition-colors"
        >
          ← Volver al inicio
        </button>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Documentación</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-10">Cómo funciona Board Check y cómo interpretar los resultados.</p>

        <div className="flex flex-col gap-6">
          {sections.map((s) => (
            <div
              key={s.title}
              className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl p-8"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{s.title}</h2>
              <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {s.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
