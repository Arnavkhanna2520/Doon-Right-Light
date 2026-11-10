import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the Vite server proxies /api to the FastAPI backend so the
// browser sees a single origin (the session cookie then needs no CORS setup).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
