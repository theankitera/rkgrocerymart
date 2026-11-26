/** @type {import('tailwindcss').Config} */
export default {
  // IMPORTANT: preflight OFF — the site already ships a full hand-written
  // CSS reset + design system (see index.html <style> block and public/css/*.css).
  // Tailwind's own reset would clash with that and could break buttons,
  // inputs, the cart drawer, bottom-nav, etc. We only want Tailwind's
  // utility classes, not its base reset.
  corePlugins: {
    preflight: false,
  },

  // The app's dark mode is a MANUAL toggle that sets
  // document.documentElement.setAttribute('data-theme','dark') (see index.html
  // inline script + App.jsx). Tailwind's default 'media' dark mode would
  // follow the OS setting instead and ignore the toggle. This makes
  // `dark:` variants follow the same attribute the app already uses.
  darkMode: ['selector', '[data-theme="dark"]'],

  // Every MPA entry (see vite.config.js rollupOptions.input) + all React
  // source files, so Tailwind scans class names used anywhere in the app.
  content: [
    './index.html',
    './login.html',
    './signup.html',
    './account.html',
    './forgot-password.html',
    './reset-password.html',
    './email-verified.html',
    './support.html',
    './offline.html',
    './src/**/*.{js,jsx}',
  ],

  theme: {
    extend: {
      // Design tokens — brand palette (red + dark pink). NOTE: purane
      // hare/narangi token naam (green/saffron) ab bhi maujood hain taaki
      // purani classes tootein nahi, lekin unke VALUES laal palette se
      // map hain — koi bhi `bg-green-600` ya `bg-saffron-500` class ab
      // hara/narangi nahi, brand red/pink banayegi.
      colors: {
        green: {
          50: '#FDECEA',   // == var(--primary-light)
          100: '#FADBD8',
          500: '#D32F2F',  // == var(--primary)
          600: '#B71C1C',  // == var(--primary-dark)
          700: '#7F1D1D',
        },
        saffron: {
          500: '#C2185B',  // == var(--orange) — dark pink accent
          600: '#AD1457',
        },
        cream: '#FFFBF5',
        charcoal: '#1A1A1A',
        muted: '#6B7280',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
      },
      borderRadius: {
        xl2: '20px',
      },
      boxShadow: {
        soft: '0 2px 12px rgba(0, 0, 0, 0.06)',
        card: '0 4px 16px rgba(0, 0, 0, 0.08)',
      },
      // BUG FIX: pehle 1440px tha — desktop par content bahut faila hua dikhta
      // tha (left/right margin kam). 1280px se wide screens par side margins
      // badh jaate hain, content comfortable rehta hai (standard e-com width).
      maxWidth: {
        site: '1280px',
      },
    },
  },

  plugins: [],
};
