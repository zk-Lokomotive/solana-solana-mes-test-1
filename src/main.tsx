import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SolanaProvider } from './providers/SolanaProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SolanaProvider>
      <App />
    </SolanaProvider>
  </React.StrictMode>
);
