import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Applied before the first render (ThemeProvider owns this afterwards -- see
// context/ThemeContext.tsx) so the very first paint already has the right theme instead
// of flashing light before switching to a saved dark preference.
try {
  const stored = localStorage.getItem('dineiq.theme')
  const dark = stored === 'dark' || (stored !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch {
  /* no persisted preference available yet; ThemeProvider will resolve it */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
