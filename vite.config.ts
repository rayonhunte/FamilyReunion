import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localFunctionTarget = 'https://us-central1-gtfast-7bf85.cloudfunctions.net/backendApi';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: localFunctionTarget,
        changeOrigin: true,
        rewrite: () => '',
      },
    },
  },
});
