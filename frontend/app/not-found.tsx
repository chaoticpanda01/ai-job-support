import type { Metadata } from "next";
import { NotFoundContent } from "@/components/not-found-content";

// Metadata is server-side and the chosen language is client state, so the
// title stays in the default language.
export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Shown for any URL that matches no route. It replaces the page inside the root
 * layout, so it supplies the <main id="main-content"> the skip link targets.
 */
export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="container focus:outline-none">
      <NotFoundContent />
    </main>
  );
}
