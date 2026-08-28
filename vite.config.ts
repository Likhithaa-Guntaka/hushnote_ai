import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Tailwind only. The app is a static index.html plus a plain app.js, so
    // Vite is here to compile src/index.css and to serve the page in dev.
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      // The HMR websocket port is derived from PORT so a second HushNote
      // checkout running concurrently doesn't collide on the 24678 default.
      hmr: process.env.DISABLE_HMR === 'true'
        ? false
        : {port: Number(process.env.HMR_PORT) || Number(process.env.PORT) + 21678 || 24678},
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
