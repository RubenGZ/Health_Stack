import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    react(),
    // Pre-compress all assets at build time → nginx serves .gz directly (gzip_static on)
    // nginx:1.25-alpine has no brotli module, so only gzip is useful here
    compression({ algorithm: 'gzip', ext: '.gz' }),
  ],

  base: '/landing/',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5174,
  },

  build: {
    chunkSizeWarningLimit: 5000,  // suppress warning for spline — it's lazy-loaded
    reportCompressedSize: false,  // skip gzip size reporting (speeds up build ~10s on Pi)

    rollupOptions: {
      output: {
        /**
         * Manual chunks for long-term caching.
         *   vendor-react   ~142 KB  — React core
         *   vendor-motion  ~108 KB  — framer-motion (hero animations)
         *   vendor-i18n    ~50 KB   — i18next + react-i18next
         *   vendor-lucide  ~6 KB    — Lucide icons (tree-shaken)
         *   vendor-spline  ~4.17 MB — Spline 3D runtime (lazy-loaded after idle)
         *   app-calcs      ~80 KB   — Calculator hub components
         *   index          ~80 KB   — Landing page sections + shell
         */
        manualChunks(id) {
          // Spline runtime — lazy-loaded, never blocks initial paint
          if (id.includes('@splinetool')) return 'vendor-spline'
          // Framer Motion
          if (id.includes('framer-motion')) return 'vendor-motion'
          // i18n
          if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n'
          // Lucide icons (tree-shaken)
          if (id.includes('lucide-react')) return 'vendor-lucide'
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
          // Calculator components (heaviest part of app code)
          if (id.includes('/src/components/demo')) return 'app-calcs'
        },
      },
    },
  },
})
