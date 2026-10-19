import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export const API_PROXY_TARGET = "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": API_PROXY_TARGET,
      "/health": API_PROXY_TARGET,
    },
  },
});
