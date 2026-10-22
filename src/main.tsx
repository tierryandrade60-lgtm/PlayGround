import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { applyBuildScriptOverrides } from './game/generated/BuildScriptOverrides';
import './index.css';

applyBuildScriptOverrides();

createRoot(document.getElementById('root')!).render(<App />);
