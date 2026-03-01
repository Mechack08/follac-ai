import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "./public/manifest.json",
    }),
  ],
  resolve: {
    alias: {
      "@follac/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@follac/platform-adapters": path.resolve(
        __dirname,
        "../../packages/platform-adapters/src/index.ts",
      ),
      "@follac/agents": path.resolve(__dirname, "../../packages/agents/src/index.ts"),
      "@follac/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
