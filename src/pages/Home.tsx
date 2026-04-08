import { useNavigate } from 'react-router-dom'

interface NavCard {
  title: string
  description: string
  icon: string
  path: string
  color: string
}

const cards: NavCard[] = [
  {
    title: 'Carga de Datos',
    description: 'Sube los archivos BOINV, PROD-STD e ITEMPP para mantener la información actualizada.',
    icon: '📂',
    path: '/upload',
    color: 'from-blue-600 to-blue-800',
  },
  {
    title: 'Análisis',
    description: 'Visualiza qué productos pueden fabricarse con los materiales inmovilizados en stock.',
    icon: '📊',
    path: '/analysis',
    color: 'from-emerald-600 to-emerald-800',
  },
  {
    title: 'Configuración',
    description: 'Ajusta los parámetros del análisis, como el umbral de días de stock age.',
    icon: '⚙️',
    path: '/config',
    color: 'from-slate-500 to-slate-700',
  },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          Board Check
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
          Optimización de stock inmovilizado
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {cards.map((card) => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            className={`
              bg-gradient-to-br ${card.color}
              rounded-2xl p-8 text-left
              border border-white/10
              hover:scale-105 hover:shadow-2xl hover:border-white/20
              transition-all duration-200 cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-white/30
            `}
          >
            <div className="text-4xl mb-4">{card.icon}</div>
            <h2 className="text-xl font-semibold text-white mb-2">{card.title}</h2>
            <p className="text-white/70 text-sm leading-relaxed">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
