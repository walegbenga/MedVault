import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  // Vite automatically loads .env, .env.local, .env.production etc.
  // Variables prefixed with VITE_ are exposed to the browser bundle.
  // Variables WITHOUT the prefix (e.g. DEPLOYER_PRIVATE_KEY) stay server-side only.
})
