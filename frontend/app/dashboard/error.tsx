"use client";

import { ErrorFallback, type ErrorBoundaryProps } from "@/components/error-fallback";

/** Keeps the dashboard header and nav on screen, so the user can leave the broken page. */
export default function DashboardError(props: ErrorBoundaryProps) {
  return <ErrorFallback {...props} />;
}
