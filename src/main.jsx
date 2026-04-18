import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { setAIDebug } from './engine/ai.js'

// DIAGNOSTIC: window.__tradeLog(true/false) enables AI decision logging in console.
window.__tradeLog = setAIDebug;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
