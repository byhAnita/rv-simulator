import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Before anything else renders. A boot-time error - a bad import, a throw inside
// a module's top level - is the one this project cannot see on a phone, and it
// happens before any component could install a handler.
import { installDebugCapture } from './tools/debugConsole'

installDebugCapture()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
