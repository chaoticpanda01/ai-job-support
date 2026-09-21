// If a future Vite ever asks for `"type": "module"` in package.json to silence
// a config-loading warning, don't: frontend/postcss.config.js is CommonJS and
// Next's build loads it. Rename this file to vitest.config.mts instead.
//
// Every devDependency here must support the Node version in package.json's
// engines (>=20.9.0) -- CI runs Node 20 and the Docker images are node:20.
// npm only warns about a mismatch, so the failure surfaces as a runtime
// TypeError deep inside jsdom rather than at install time. Check `engines.node`
// before bumping vitest, jsdom, or @testing-library/*.
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
