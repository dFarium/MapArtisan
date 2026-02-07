import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@react-three/drei')) {
              return 'vendor-three-drei';
            }
            if (id.includes('three')) {
              return 'vendor-three-core';
            }
            if (id.includes('lucide')) {
              return 'vendor-icons';
            }
          }
        }
      }
    }
  }
})
