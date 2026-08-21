import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration.
 *
 * The dev proxy is what keeps the client honest: `/api` is served from the same
 * origin in development just as it is in production, so there are no CORS
 * special cases in the app code and no absolute API URLs baked into the bundle.
 * `VITE_API_URL` exists only for the split-deploy case (Vercel frontend +
 * Render backend), where the two live on different hosts.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        // Fail fast rather than hanging the browser when the API is not running.
        timeout: 30_000,
      },
    },
  },

  preview: { port: 4173 },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        /**
         * Vendor splitting.
         *
         * Leaflet and the query client are sizeable and change rarely, so
         * isolating them means shipping an app-code fix does not invalidate them
         * in users' caches.
         *
         * Written as a function rather than the object map form: Vite 8 bundles
         * with Rolldown, which only accepts the function signature here.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const path = id.replace(/\\/g, '/');
          if (path.includes('/leaflet')) return 'leaflet';
          if (path.includes('/@tanstack/')) return 'query';
          if (/\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
}));
