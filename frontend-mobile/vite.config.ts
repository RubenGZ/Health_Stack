import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/mobile/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5175, base: '/' },
  preview: { port: 5175 },
})
