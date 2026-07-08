"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV_ITEMS = [
    { href: "/dashboard/resumes",           key: "resumes" },
    { href: "/dashboard/documents",         key: "documents" },
    { href: "/dashboard/jobs",              key: "jobs" },
    { href: "/dashboard/interview",         key: "interview" },
    { href: "/dashboard/visa",              key: "visa" },
    { href: "/dashboard/culture",           key: "culture" },
    { href: "/dashboard/settings",          key: "settings" },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold hover:opacity-80 transition-opacity">
              🏠 Japan Job Support
            </Link>
            <nav className="hidden gap-4 md:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav", item.key, lang)}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <UserButton afterSignOutUrl="/sign-in" />
            <button
              type="button"
              className="text-lg leading-none text-muted-foreground hover:text-foreground md:hidden"
              aria-label={menuOpen ? t("nav", "closeMenu", lang) : t("nav", "openMenu", lang)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" className="border-t bg-background md:hidden">
            <div className="container flex flex-col py-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("nav", item.key, lang)}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
