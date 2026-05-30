import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Crown, LogIn, Plus, Users } from 'lucide-react';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App icons={{ Crown, LogIn, Plus, Users }} />
  </StrictMode>,
);
