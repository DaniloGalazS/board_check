import { useTheme } from '../lib/useTheme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="
        fixed bottom-5 right-5 z-50
        w-10 h-10 rounded-full
        flex items-center justify-center
        bg-slate-200 hover:bg-slate-300 text-slate-700
        dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200
        border border-slate-300 dark:border-slate-600
        shadow-lg transition-colors duration-200
        text-base
      "
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
