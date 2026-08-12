import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Split rarely-changing vendor libraries into their own chunks so
          // browsers can cache them across deploys (only app code re-downloads).
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase-vendor';
            if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'motion-vendor';
            // The map engine is the single largest dependency. It only loads inside the lazy
            // /courts route, but without its own chunk it was bundled with app code and
            // re-downloaded on every deploy.
            if (id.includes('maplibre') || id.includes('react-map-gl')) return 'map-vendor';
            if (
              id.includes('/react-router') ||
              id.includes('/react-dom/') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor';
            }
          },
        },
      },
    },
    server: {
      host: true,
      allowedHosts: ["lvh.me"],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});
