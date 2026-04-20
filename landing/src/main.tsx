import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'           // ← inicializar i18next antes del render
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
