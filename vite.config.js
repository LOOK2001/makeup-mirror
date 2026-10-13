import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR requires a secure context; basicSsl gives us HTTPS on the LAN so the
// Pico browser can open https://<pc-ip>:5173 directly.
export default defineConfig({
  base: './', // relative asset paths so dist/ works from any sub-path (e.g. GitHub Pages)
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
});
