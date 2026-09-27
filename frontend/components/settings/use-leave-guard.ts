"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * While `dirty`, stops the user leaving without a word:
 * - closing or reloading the tab gets the browser's own "Leave site?";
 * - an in-app link click is cancelled before Next's Link sees it (Link skips
 *   navigation when defaultPrevented), and `confirmLeave` decides whether to
 *   follow it. Links to this same page (the section menu's jumps, the sidebar's
 *   own Settings link) are left alone.
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
      // Same page: a hash jump (the section menu), or a link to Settings
      // itself, which leaves the form mounted and the edits in place anyway.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

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
