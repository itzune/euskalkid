import { defineConfig } from "vite";

// GitHub Pages deploys to /zeineuski-wasm/
const base = "/zeineuski-wasm/";

export default defineConfig({
  base,
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ["fasttext.wasm.js"],
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
});
