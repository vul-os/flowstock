import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri expects a fixed dev port (see src-tauri/tauri.conf.json devUrl).
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  build: {
    target: "es2022",
  },
});
