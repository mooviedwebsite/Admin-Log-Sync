/**
 * GitHub Pages build script for MOOVIED
 *
 * Usage: node build-gh-pages.mjs [--base /Admin-Log-Sync/]
 *
 * Builds the Vite app with the correct base path and copies
 * index.html to 404.html for SPA client-side routing support.
 */

import { build } from "vite";
import { copyFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse --base argument (default: /Admin-Log-Sync/)
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "/Admin-Log-Sync/";

console.log(`Building MOOVIED for GitHub Pages with base: "${base}"`);

await build({
  base,
  configFile: false,
  root: resolve(__dirname),
  plugins: [
    (await import("@vitejs/plugin-react")).default(),
    (await import("@tailwindcss/vite")).default(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: resolve(__dirname, "dist/gh-pages"),
    emptyOutDir: true,
  },
});

const outDir = resolve(__dirname, "dist/gh-pages");

// Copy index.html → 404.html so GitHub Pages serves the SPA on all routes
copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));

// Add .nojekyll to prevent GitHub Pages Jekyll processing
writeFileSync(resolve(outDir, ".nojekyll"), "");

console.log("\nDone! Files are in dist/gh-pages/");
console.log("Upload these files to the root of your GitHub repo (gh-pages branch or main branch):");
console.log("  index.html, 404.html, .nojekyll, favicon.svg, assets/");
console.log("\nThe 404.html enables SPA client-side routing (movie detail pages, etc.).");
