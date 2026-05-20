import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    wasm(),
    tailwindcss()
  ],
  server: {
    fs: {
      allow: ['..', '../core']
    }
  },
  optimizeDeps: {
    exclude: ['webdasm']
  }
})
