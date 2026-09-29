"use client";

import { useEffect, type RefObject } from "react";

/**
 * For a bar pinned to the bottom of the screen, such as the Settings save bar
 * or the interview answer box. It sets --bottom-bar-offset to the bar's height
 * while mounted, which the chat button adds to its bottom margin, so the button
 * never covers the bar's controls.
 */
export function useBottomBarOffset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const setOffset = () => root.style.setProperty("--bottom-bar-offset", `${bar.offsetHeight}px`);
    setOffset();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(setOffset);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--bottom-bar-offset");
    };
  }, [ref]);
}
