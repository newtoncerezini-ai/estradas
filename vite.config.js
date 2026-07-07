import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    preserveSymlinks: true
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api/auth": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true
      },
      "/api/estradas": {
        target: "http://127.0.0.1:3025",
        changeOrigin: true
      }
    }
  }
});
