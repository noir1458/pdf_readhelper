import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

const root = resolve(import.meta.dirname);
const dist = resolve(root, "dist");

function copyExtensionAssets(): Plugin {
  return {
    name: "copy-extension-assets",
    closeBundle() {
      copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
      copyFileSync(
        resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
        resolve(dist, "pdf.worker.mjs"),
      );

      for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
        const target = resolve(dist, directory);
        if (existsSync(target)) rmSync(target, { recursive: true });
        mkdirSync(target, { recursive: true });
        cpSync(resolve(root, "node_modules/pdfjs-dist", directory), target, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [copyExtensionAssets()],
  build: {
    chunkSizeWarningLimit: 1_300,
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        viewer: resolve(root, "src/viewer/viewer.html"),
        popup: resolve(root, "src/popup/popup.html"),
        "service-worker": resolve(root, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "service-worker" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
