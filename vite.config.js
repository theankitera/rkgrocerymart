import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// MPA mode: har HTML file ek alag Vite entry point hai.
// Build hone par Vite har page ko independently bundle karta hai —
// sirf index.html React (src/) use karta hai, baaki pages apne
// original vanilla JS (public/js/*.js) ke saath jaise the waise hi chalte hain.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        account: resolve(__dirname, 'account.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
        forgotPassword: resolve(__dirname, 'forgot-password.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
        emailVerified: resolve(__dirname, 'email-verified.html'),
        support: resolve(__dirname, 'support.html'),
        offline: resolve(__dirname, 'offline.html'),
      },
    },
  },
});
