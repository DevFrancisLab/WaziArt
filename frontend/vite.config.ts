import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The React dev server and `vite preview` forward /api to the Python process.
// Recommendations stay on that process; this config does not add another backend.
const api = process.env.WAZIART_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": api },
  },
  preview: {
    port: 4173,
    proxy: { "/api": api },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    testTimeout: 20000,
  },
});
