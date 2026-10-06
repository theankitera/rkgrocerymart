import { createRoot } from 'react-dom/client';
import AccountPage from './AccountPage.jsx';
// Module 9: Tailwind utilities for the account MPA entry (preflight disabled
// — see tailwind.config.js — so this only adds utility classes, it does not
// touch or reset account.css, which stays loaded via account.html <link>).
import '../../tailwind.css';
createRoot(document.getElementById('account-root')).render(<AccountPage />);
