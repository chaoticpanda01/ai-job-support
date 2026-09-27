import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useBottomBarOffset } from "@/hooks/useBottomBarOffset";

function Bar() {
  const ref = useRef<HTMLDivElement>(null);
  useBottomBarOffset(ref);
  return <div ref={ref} />;
}

const offset = () => document.documentElement.style.getPropertyValue("--bottom-bar-offset");

afterEach(() => {
  document.documentElement.style.removeProperty("--bottom-bar-offset");
});

describe("useBottomBarOffset", () => {
  it("lifts the chat button by the bar's height, and lets it back down on unmount", () => {
    // jsdom has no layout, so give the bar a height to report.
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 72,
    });
    try {
      const { unmount } = render(<Bar />);
      expect(offset()).toBe("72px");
      unmount();
      expect(offset()).toBe("");
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, "offsetHeight", own);
    }
  });
});
