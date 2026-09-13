import type { Metadata } from "next";
import { NotFoundContent } from "@/components/not-found-content";
import { t } from "@/lib/i18n";
import { getSavedLanguage } from "@/lib/saved-language";

// A missing URL is always a full page load, so the saved-language cookie is
// available and the tab title can match the translated page body.
export async function generateMetadata(): Promise<Metadata> {
  return { title: t("common", "notFoundTitle", await getSavedLanguage()) };
}

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
