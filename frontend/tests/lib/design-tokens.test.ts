// @vitest-environment node
// Reads source files from disk; jsdom's import.meta.url isn't a file: URL.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards on the design tokens in app/globals.css. The contrast pairs are the
 * ones the UI actually sets text on; a token edit that drops one below WCAG
 * AA fails here instead of in an accessibility audit.
 */

const FRONTEND = fileURLToPath(new URL("../..", import.meta.url));
const css = readFileSync(join(FRONTEND, "app/globals.css"), "utf8");
const tailwindConfig = readFileSync(join(FRONTEND, "tailwind.config.ts"), "utf8");

type Hsl = [number, number, number];

/** Every `--name: H S% L%;` declaration. */
function tokens(): Map<string, Hsl> {
  const out = new Map<string, Hsl>();
  for (const [, name, h, s, l] of css.matchAll(
    /--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g,
  )) {
    if (name) out.set(name, [Number(h), Number(s), Number(l)]);
  }
  return out;
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance(hsl: Hsl): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hslToRgb(hsl);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const all = tokens();
  const a = all.get(fg);
  const b = all.get(bg);
  if (!a || !b) throw new Error(`missing token: ${!a ? fg : bg}`);
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("design tokens", () => {
  it("defines every colour token tailwind.config.ts reads", () => {
    const defined = tokens();
    const used = [...tailwindConfig.matchAll(/hsl\(var\(--([\w-]+)\)\)/g)].flatMap((m) =>
      m[1] ? [m[1]] : [],
    );
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("has no dark palette: the app is light only", () => {
    expect(css).not.toMatch(/\.dark\s*\{/);
  });

  it.each([
    ["foreground", "background"],
    ["muted-foreground", "background"],
    ["muted-foreground", "secondary"],
    ["muted-foreground", "card"],
    ["secondary-foreground", "secondary"],
    ["primary-foreground", "primary"],
    ["seal", "background"],
    ["seal", "card"],
    ["indigo", "background"],
    ["indigo", "indigo-soft"],
    ["success", "background"],
    ["success", "success-soft"],
    ["warning", "background"],
    ["warning", "warning-soft"],
    ["destructive", "background"],
    ["destructive", "destructive-soft"],
    ["destructive-foreground", "destructive"],
  ])("%s on %s passes WCAG AA", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("colour roles", () => {
  // primary is ink: right for fills (bg-primary) and selected borders, wrong
  // for accents, where it turns links and focus rings black. Accents use indigo.
  const ACCENT_MISUSES = [
    /\btext-primary(?![-\w])/,
    /\bring-primary\b/,
    /\bbg-primary\/(?:5|10)\b/,
  ];

  it("uses indigo, not primary, for accents", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      const files = readdirSync(join(FRONTEND, dir), { recursive: true }) as string[];
      for (const file of files.filter((f) => f.endsWith(".tsx"))) {
        const source = readFileSync(join(FRONTEND, dir, file), "utf8");
        for (const pattern of ACCENT_MISUSES) {
          if (pattern.test(source)) offenders.push(`${dir}/${file}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
