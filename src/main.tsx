import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Crown, Eye, EyeOff, LogIn, Minus, Play, Plus, RotateCcw, Save, Settings, Shuffle, Users } from 'lucide-react';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App icons={{ ArrowLeft, Crown, Eye, EyeOff, LogIn, Minus, Play, Plus, RotateCcw, Save, Settings, Shuffle, Users }} />
  </StrictMode>,
);
