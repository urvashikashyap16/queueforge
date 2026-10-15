import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import './index.css'
import App from './App'
import { ApiProvider } from './lib/context'
import { ToastProvider } from './lib/toast'

// Static hosting without server-side routing (e.g. a demo build) uses hash URLs
const Router = import.meta.env.VITE_HASH_ROUTER === 'true' ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ToastProvider>
        <ApiProvider>
          <App />
        </ApiProvider>
      </ToastProvider>
    </Router>
  </React.StrictMode>,
)
