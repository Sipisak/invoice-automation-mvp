import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api -> Functions host, so the browser sees same-origin and there's NO
// CORS to configure locally. In production set VITE_API_BASE to the real API URL (or serve
// this build same-origin as the API) — see src/client/invoicesClient.ts.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4321,
    proxy: {
      '/api': { target: 'http://localhost:7071', changeOrigin: true },
    },
  },
});
