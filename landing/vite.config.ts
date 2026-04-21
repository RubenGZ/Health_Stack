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
    // Sube el warning de chunk a 1 MB — Spline se carga lazy y no cuenta aquí
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        /**
         * Chunks manuales: separan los vendors grandes del bundle inicial.
         *
         * Antes: un solo bundle de ~3.8 MB (Spline + framer-motion + i18n + React)
         * Después:
         *   vendor-react   ~130 KB  — carga siempre (pequeño, cacheable largo plazo)
         *   vendor-motion  ~250 KB  — carga siempre (hero animations)
         *   vendor-i18n    ~90 KB   — carga siempre (i18next + react-i18next)
         *   vendor-lucide  ~110 KB  — carga siempre (iconos)
         *   spline         ~1.8 MB  — carga LAZY (solo cuando el hero renderiza)
         *   index          ~80 KB   — app code
         *
         * El @splinetool/runtime es tan grande que aunque se lazy-load el componente,
         * Rollup lo pone en su propio chunk automáticamente por el import() dinámico.
         */
        manualChunks(id) {
          // Spline runtime — chunk separado para no bloquear el parse inicial
          if (id.includes('@splinetool')) return 'vendor-spline'
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
