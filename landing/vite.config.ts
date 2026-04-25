import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5174,
  },

  build: {
    chunkSizeWarningLimit: 500,

    rollupOptions: {
      output: {
        /**
         * Manual chunks for long-term caching.
         *   vendor-react   ~142 KB  — React core
         *   vendor-motion  ~105 KB  — framer-motion (hero animations)
         *   vendor-i18n    ~50 KB   — i18next + react-i18next
         *   vendor-lucide  ~5 KB    — Lucide icons (tree-shaken)
         *   index          ~87 KB   — app code
         */
        manualChunks(id) {
          // Framer Motion — animaciones de scroll
          if (id.includes('framer-motion')) return 'vendor-motion'
          // i18n — traducciones
          if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n'
          // Lucide — iconos (tree-shaken pero el registry base pesa)
          if (id.includes('lucide-react')) return 'vendor-lucide'
          // React core — siempre cacheado por separado
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})
