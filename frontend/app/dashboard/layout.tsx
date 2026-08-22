"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AiQuotaBadge } from "@/components/ai-quota-badge";
import { useMe } from "@/hooks/useMe";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { data: me } = useMe();

  const NAV_ITEMS = [
    { href: "/dashboard/resumes" as const, key: "resumes" as const },
    { href: "/dashboard/documents" as const, key: "documents" as const },
    { href: "/dashboard/jobs" as const, key: "jobs" as const },
    { href: "/dashboard/interview" as const, key: "interview" as const },
    { href: "/dashboard/visa" as const, key: "visa" as const },
    { href: "/dashboard/culture" as const, key: "culture" as const },
    { href: "/dashboard/settings" as const, key: "settings" as const },
    // /admin sits outside /dashboard and 403s for non-admins, so it is only
    // offered to those who can actually use it.
    ...(me?.user.role === "admin" ? [{ href: "/admin" as const, key: "admin" as const }] : []),
  ];

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            {/* shrink-0 + nowrap: without these flex squeezes the wordmark
                first, wrapping it onto three lines inside a h-14 header. */}
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap text-sm font-semibold transition-opacity hover:opacity-80"
            >
              🏠 Japan Job Support
            </Link>
            <nav className="hidden gap-4 md:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "text-sm transition-colors hover:text-foreground",
                    isActive(item.href) ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t("nav", item.key, lang)}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* Only at lg+. Between md and lg the eight nav links already fill
                the header exactly — measured, adding the badge there overflows
                the page by ~78px. Below md the nav collapses and the drawer
                carries the badge instead. */}
            <AiQuotaBadge className="hidden lg:inline-flex" />
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
              <AiQuotaBadge className="mb-1 self-start" />
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted hover:text-foreground",
                    isActive(item.href)
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
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
