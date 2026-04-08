interface Props {
  title: string
  value: string
  subtitle?: string
  accent?: 'default' | 'warning' | 'success' | 'danger'
}

const accentStyles: Record<string, string> = {
  default: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  warning: 'border-amber-300/60 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20',
  success: 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-900/20',
  danger:  'border-red-300/60 bg-red-50 dark:border-red-700/50 dark:bg-red-900/20',
}

const valueStyles: Record<string, string> = {
  default: 'text-slate-900 dark:text-white',
  warning: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  danger:  'text-red-600 dark:text-red-400',
}

const titleStyles: Record<string, string> = {
  default: 'text-slate-500 dark:text-slate-400',
  warning: 'text-amber-700 dark:text-amber-500',
  success: 'text-emerald-700 dark:text-emerald-500',
  danger:  'text-red-700 dark:text-red-500',
}

export default function KpiCard({ title, value, subtitle, accent = 'default' }: Props) {
  return (
    <div className={`rounded-xl border p-4 ${accentStyles[accent]}`}>
      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${titleStyles[accent]}`}>{title}</p>
      <p className={`text-2xl font-bold leading-tight ${valueStyles[accent]}`}>{value}</p>
      {subtitle && <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">{subtitle}</p>}
    </div>
  )
}
