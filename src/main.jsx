import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import './index.css';

import AuthProvider from './context/auth-context';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
  </React.StrictMode>
);
