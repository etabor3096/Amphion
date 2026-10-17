import React from 'react'
import ReactDOM from 'react-dom/client'
// Fonts are bundled locally so the demo makes no network requests.
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import App from './App'
import PhoneFrame from './device/PhoneFrame'
import { getDeviceMode } from './device/deviceMode'
import './index.css'

const mode = getDeviceMode()
if (mode === 'inside-frame') document.documentElement.dataset.device = 'iphone'
if (mode === 'frame-host') document.documentElement.dataset.device = 'host'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {mode === 'frame-host' ? <PhoneFrame /> : <App />}
  </React.StrictMode>,
)
