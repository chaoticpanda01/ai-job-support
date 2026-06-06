"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();

  const NAV_ITEMS = [
    { href: "/dashboard/resumes",           key: "resumes" },
    { href: "/dashboard/documents",         key: "documents" },
    { href: "/dashboard/jobs",              key: "jobs" },
    { href: "/dashboard/interview",         key: "interview" },
    { href: "/dashboard/visa",              key: "visa" },
    { href: "/dashboard/culture",           key: "culture" },
    { href: "/dashboard/settings",          key: "settings" },
  ];

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
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
