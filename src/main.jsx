import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Module 0: Tailwind utilities (preflight disabled — see tailwind.config.js).
// This adds ONLY utility classes; it does not touch or reset any existing
// styling, so this import alone should cause zero visual change.
import './tailwind.css';

createRoot(document.getElementById('root')).render(<App />);
