// Registers toBeInTheDocument, toHaveAttribute and the rest of the jest-dom
// matchers with vitest's expect.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react only auto-registers its afterEach(cleanup) when
// `afterEach` is a global, which this project's vitest config deliberately
// doesn't enable (see vitest.config.ts). Without this, each test's render()
// output stays in the DOM for the next test in the same file.
afterEach(() => {
  cleanup();
});
