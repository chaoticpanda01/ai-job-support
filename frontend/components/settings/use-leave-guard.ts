"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * While `dirty`, stops the user leaving without a word:
 * - closing or reloading the tab gets the browser's own "Leave site?";
 * - an in-app link click is cancelled before Next's Link sees it (Link skips
 *   navigation when defaultPrevented), and `confirmLeave` decides whether to
 *   follow it. Jumps within the page (the section menu) are left alone.
 */
export function useLeaveGuard(dirty: boolean, confirmLeave: () => Promise<boolean>) {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;

      event.preventDefault();
      void confirmLeave().then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}` as Route);
      });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirmLeave, router]);
}
