"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MobileTopBar } from "@/components/app-shell/mobile-top-bar";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer whenever the page changes. Links close it on click too;
  // this also covers back/forward and programmatic navigation. Adjusted during
  // render rather than in an effect, so the old page never shows it open.
  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card lg:block">
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar open={menuOpen} onOpenChange={setMenuOpen} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-10"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
