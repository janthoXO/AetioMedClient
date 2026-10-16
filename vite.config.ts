import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Loki has no CORS headers; node outputs are queried through this proxy.
  server: { proxy: { "/loki": "http://localhost:3100" } },
  preview: { proxy: { "/loki": "http://localhost:3100" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
