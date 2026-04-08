import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'boardcheck_theme'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  function toggle() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggle }
}
