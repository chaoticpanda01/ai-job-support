"use client";

import { ErrorFallback, type ErrorBoundaryProps } from "@/components/error-fallback";

/** Catches errors below the root layout, so the skip link and chat widget stay. */
export default function RootError(props: ErrorBoundaryProps) {
  return (
    <main id="main-content" tabIndex={-1} className="container focus:outline-none">
      <ErrorFallback {...props} />
    </main>
  );
}
