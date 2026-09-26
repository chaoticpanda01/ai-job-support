"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { UserButton } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

/**
 * Below lg: a slim bar, and the sidebar in a left-side drawer. The drawer is a
 * Radix Dialog, so focus is trapped, Escape closes it, the page behind can't
 * scroll, and focus goes back to the menu button. It only slides in when the
 * OS allows motion.
 */
export function MobileTopBar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang } = useLang();

  // The drawer is portalled, so the bar's lg:hidden doesn't reach it: widen
  // the window past lg (Tailwind's 1024px) with it open and its overlay and
  // scroll lock would sit over the desktop sidebar. Close it instead.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const closeIfWide = (event: { matches: boolean }) => {
      if (event.matches) onOpenChange(false);
    };
    wide.addEventListener("change", closeIfWide);
    return () => wide.removeEventListener("change", closeIfWide);
  }, [open, onOpenChange]);
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-2 lg:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("nav", "openMenu", lang)}>
            <Menu aria-hidden="true" />
          </Button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-card shadow-xl focus:outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-left"
          >
            <DialogPrimitive.Title className="sr-only">
              {t("nav", "menu", lang)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3"
                aria-label={t("nav", "closeMenu", lang)}
              >
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
            {/* No account block: Clerk's menu opens inside this modal dialog
                with pointer-events: none and can't be clicked. The avatar in
                the bar above is the phone's account menu. */}
            <SidebarNav onNavigate={() => onOpenChange(false)} showAccount={false} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <Link
        href="/dashboard"
        className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark compact />
      </Link>

      <div className="flex h-10 w-10 items-center justify-center">
        <UserButton />
      </div>
    </header>
  );
}
