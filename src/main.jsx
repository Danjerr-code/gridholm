import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { setTradeDecisionLog } from './engine/ai.js'

// DIAGNOSTIC: window.__tradeLog(true/false) enables AI trade-decision logging in console.
// Each AI turn emits [TRADE_DECISION] JSON: turn, player, chosen action, top-3 candidates, enemy units in range.
window.__tradeLog = setTradeDecisionLog;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
