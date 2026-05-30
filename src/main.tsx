import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Crown, LogIn, Minus, Plus, Save, Settings, Users } from 'lucide-react';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App icons={{ ArrowLeft, Crown, LogIn, Minus, Plus, Save, Settings, Users }} />
  </StrictMode>,
);
