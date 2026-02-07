import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Note: We removed ClerkProvider and the Key check entirely

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)