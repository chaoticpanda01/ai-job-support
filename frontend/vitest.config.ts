// Vite prints an "ESM syntax in a file loaded as CommonJS" warning for this
// file on every run, and suggests two fixes. Do NOT take the second one --
// setting `"type": "module"` in package.json -- it would break the build:
// frontend/postcss.config.js is CommonJS, and Next's build loads it. The
// warning is expected and safe to ignore; if it needs to go, the safe fix is
// renaming this file to vitest.config.mts instead.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // Mirrors tsconfig.json's paths, so tests import exactly as source does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
