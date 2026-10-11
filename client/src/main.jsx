import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { store } from './app/store'
import { applyTheme } from './hooks/useTheme'
import './index.css'

applyTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            className: '!rounded-xl !bg-surface !text-ink !text-sm !shadow-lg !border !border-line',
            success: { iconTheme: { primary: '#8496AD', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
