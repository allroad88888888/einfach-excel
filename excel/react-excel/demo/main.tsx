import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './workbook-header.css'
import './workbook-ribbon.css'
import './formula-bar.css'
import './worksheet.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing React demo root element.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
