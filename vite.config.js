import { defineConfig } from "vite";

const base = "/euskalkid/";

export default defineConfig({
  base,
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ["fasttext.wasm.js"],
  },
  resolve: {
    alias: {
      // fasttext.wasm.js has Node.js codepaths with dynamic
      // import('fs/promises') and import('http'). These never execute
      // in the browser (IS_BROWSER gate), but Rollup still code-splits
      // them. Point to empty stubs that we force into the vendor chunk.
      "fs/promises": "/src/stubs/fs.js",
      "http": "/src/stubs/http.js",
      "url": "/src/stubs/url.js",
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        azpieuskalki: "azpieuskalki.html",
        nongoeuskara: "nongoeuskara/index.html",
      },
      output: {
        // Put all shared dependencies into one chunk — prevents
        // fasttext.wasm.js's dynamic Node-stub imports from being
        // code-split into separate files that 404 on GH Pages.
        manualChunks(id) {
          if (id.includes("node_modules") || id.includes("/stubs/")) return "vendor";
        },
      },
    },
  },
  // Plugin to serve .wasm with correct MIME type in dev
  plugins: [
    {
      name: "wasm-mime-fix",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith(".wasm")) {
            res.setHeader("Content-Type", "application/wasm");
          }
          next();
        });
      },
    },
  ],
});
