import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { DialogProvider } from './context/DialogContext.jsx';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';

// Remember whether focus last moved by keyboard (Tab) or pointer, so the editor's focus ring shows for
// keyboard users without flashing on every click into the text.
const root = document.documentElement;
addEventListener('keydown', (e) => { if (e.key === 'Tab') root.dataset.input = 'keyboard'; }, true);
addEventListener('pointerdown', () => { root.dataset.input = 'pointer'; }, true);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
