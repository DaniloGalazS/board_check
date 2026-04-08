import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import DataUpload from './pages/DataUpload'
import Analysis from './pages/Analysis'
import Configuration from './pages/Configuration'
import ThemeToggle from './components/ThemeToggle'
import { useTheme } from './lib/useTheme'

export default function App() {
  useTheme() // initialises dark class on <html> from localStorage

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<DataUpload />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/config" element={<Configuration />} />
      </Routes>
      <ThemeToggle />
    </BrowserRouter>
  )
}
