"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "profile", key: "profile" },
  { id: "visa", key: "sectionVisa" },
  { id: "extras", key: "sectionExtras" },
  { id: "career", key: "sectionCareer" },
  { id: "account", key: "sectionAccount" },
] as const;

/**
 * Jumps between the cards and marks the one in view: a sticky list beside the
 * cards on lg+, a sticky row of chips above them on smaller screens.
 */
export function SectionNav({ lang }: { lang: Language }) {
  const [current, setCurrent] = useState<string>(SECTIONS[0].id);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const inView = new Map<string, boolean>();
    function pick() {
      // At the bottom of the page the last card can't scroll up into the band
      // (the delete card below it ends the page first), so it wins there.
      const root = document.documentElement;
      const last = SECTIONS.at(-1);
      if (last && window.scrollY + window.innerHeight >= root.scrollHeight - 2) {
        setCurrent(last.id);
        return;
      }
      // Otherwise the top-most card in the band below the sticky header.
      const top = SECTIONS.find((section) => inView.get(section.id));
      if (top) setCurrent(top.id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView.set(entry.target.id, entry.isIntersecting);
        pick();
      },
      // 112px is the phone's top bar and chip row, and the cards' scroll-mt-28.
      { rootMargin: "-112px 0px -55% 0px" },
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    // Reaching the bottom may not cross any card's edge, so scrolling checks too.
    window.addEventListener("scroll", pick, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
    };
  }, []);

  // On phones the chips overflow their row: keep the current one in view, or
  // Career and Account would be highlighted off-screen. On lg the menu is a
  // column that doesn't overflow, so this does nothing there.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !chip || nav.scrollWidth <= nav.clientWidth) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    nav.scrollTo({
      left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [current]);

  return (
    <nav
      ref={navRef}
      aria-label={t("settings", "sectionsNav", lang)}
      className="sticky top-14 z-30 -mx-4 mb-6 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:top-8 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
        {SECTIONS.map((section) => {
          const active = current === section.id;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                aria-current={active ? "true" : undefined}
                onClick={() => setCurrent(section.id)}
                className={cn(
                  "block whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  "lg:relative lg:rounded-md lg:border-0 lg:px-3 lg:py-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground lg:bg-secondary lg:font-semibold lg:text-foreground lg:before:absolute lg:before:inset-y-1.5 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-r lg:before:bg-seal"
                    : "border-input text-secondary-foreground hover:bg-secondary",
                )}
              >
                {t("settings", section.key, lang)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
