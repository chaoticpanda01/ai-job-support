import { describe, expect, it } from "vitest";
import { translations, type Language } from "@/lib/i18n";

const LANGS: Language[] = ["en", "id", "ja"];

type StringTable = Record<string, Record<string, Record<string, string>>>;
const table = translations as unknown as StringTable;

/** Every [section, key, value] triple in the table. */
function everyString(): Array<[string, string, Record<string, string>]> {
  const out: Array<[string, string, Record<string, string>]> = [];
  for (const [section, keys] of Object.entries(table)) {
    for (const [key, value] of Object.entries(keys)) out.push([section, key, value]);
  }
  return out;
}

describe("translations", () => {
  it("has every language for every string", () => {
    const missing: string[] = [];
    for (const [section, key, value] of everyString()) {
      for (const lang of LANGS) {
        // An empty string is allowed and deliberate: Japanese needs no
        // separator where English and Indonesian take a space.
        if (!(lang in value)) missing.push(`${section}.${key} (${lang})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps every placeholder in every language of a string that has one", () => {
    const broken: string[] = [];
    for (const [section, key, value] of everyString()) {
      // Derived from the string itself rather than a hardcoded list, so a
      // new placeholder (e.g. adding `{count}` to only one language) is
      // caught instead of silently skipped.
      const placeholders = new Set(
        [
          ...Object.values(value)
            .join(" ")
            .matchAll(/\{\w+\}/g),
        ].map((m) => m[0]),
      );
      for (const placeholder of placeholders) {
        const langsWith = LANGS.filter((lang) => (value[lang] ?? "").includes(placeholder));
        if (langsWith.length > 0 && langsWith.length !== LANGS.length) {
          broken.push(`${section}.${key} has ${placeholder} in ${langsWith.join(", ")} only`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("has no string left orphaned by the error-message migration", () => {
    // These were replaced by the status table in lib/api-error.ts. Re-adding
    // one means a call site went back to a hand-written fallback.
    const removed = [
      "saveFail",
      "deleteFail",
      "assessFail",
      "buildFail",
      "addToTrackerFailed",
      "createFailed",
      "uploadFailed",
      "photoUploadFail",
      "invalidFile",
      "photoInvalid",
    ];
    const found: string[] = [];
    for (const [section, key] of everyString()) {
      if (removed.includes(key)) found.push(`${section}.${key}`);
    }
    expect(found).toEqual([]);
  });
});
