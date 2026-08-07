import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: parseInt(process.env.VITE_PORT || "3100", 10),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT || "8200"}`,
        changeOrigin: true,
      },
      "/old": {
        target: `http://127.0.0.1:${process.env.OLD_PORT || "3200"}`,
        changeOrigin: true,
      },
      "/_next": {
        target: `http://127.0.0.1:${process.env.OLD_PORT || "3200"}`,
        changeOrigin: true,
      },
    },
  },
});
