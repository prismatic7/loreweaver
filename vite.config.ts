/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: "./",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Baseline measured 2026-08-27 (Increment F). Thresholds start at the
      // measured baseline minus a small buffer so day-one CI is green; tighten
      // in follow-up increments as coverage grows.
      thresholds: {
        lines: 46,
        functions: 38,
        branches: 38,
        statements: 45,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@uiw/react-codemirror")) {
            return "editor-uiw";
          }

          const codemirrorMatch = id.match(
            /node_modules\/@codemirror\/([^/]+)/,
          );
          if (codemirrorMatch) {
            return `editor-codemirror-${codemirrorMatch[1]}`;
          }

          const lezerMatch = id.match(/node_modules\/@lezer\/([^/]+)/);
          if (lezerMatch) {
            return `editor-lezer-${lezerMatch[1]}`;
          }

          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          if (id.includes("node_modules/@tauri-apps/")) {
            return "vendor-tauri";
          }

          if (id.includes("node_modules/pdfjs-dist/")) {
            return "vendor-pdf";
          }

          // Markdown rendering ecosystem (react-markdown + remark/unified deps)
          if (
            id.includes("node_modules/react-markdown/") ||
            id.includes("node_modules/remark-") ||
            id.includes("node_modules/mdast-") ||
            id.includes("node_modules/unist-") ||
            id.includes("node_modules/micromark") ||
            id.includes("node_modules/hast-") ||
            id.includes("node_modules/parse-entities") ||
            id.includes("node_modules/character-entities") ||
            id.includes("node_modules/character-reference-invalid") ||
            id.includes("node_modules/trim-lines") ||
            id.includes("node_modules/ccount") ||
            id.includes("node_modules/escape-string-regexp") ||
            id.includes("node_modules/space-separated-tokens") ||
            id.includes("node_modules/comma-separated-tokens") ||
            id.includes("node_modules/property-information") ||
            id.includes("node_modules/html-void-elements") ||
            id.includes("node_modules/web-namespaces") ||
            id.includes("node_modules/zwitch") ||
            id.includes("node_modules/decode-named-character-reference") ||
            id.includes("node_modules/stringify-entities")
          ) {
            return "vendor-markdown";
          }
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
