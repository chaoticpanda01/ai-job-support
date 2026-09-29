import { describe, expect, it } from "vitest";
import { LANGS } from "../helpers";
import { t, translations } from "@/lib/i18n";
import { ACTIVITY_LABEL_KEY } from "@/lib/activity";
import { computeJourney } from "@/lib/journey";

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

describe("strings looked up by a key built at runtime", () => {
  // t() falls back to printing the key itself, and the completeness test
  // above only compares languages, so a typo in a built key would ship as
  // "shokumuTitel" on screen. These are the keys Home builds.
  const STEP_IDS = computeJourney({
    me: undefined,
    resumes: undefined,
    primaryAnalysis: undefined,
    documents: undefined,
    applications: undefined,
    interviewSessions: undefined,
    visaConsultations: undefined,
  }).stages.flatMap((stage) => stage.steps.map((step) => step.id));

  const built = [
    ...STEP_IDS.flatMap((id) =>
      ["", "Title", "Why", "Cta"].map((part) => ["journey", `${id}${part}`] as const),
    ),
    ...Object.values(ACTIVITY_LABEL_KEY).map((key) => ["home", key] as const),
  ];

  it("covers every journey step", () => {
    expect(STEP_IDS).toHaveLength(8);
  });

  it.each(LANGS)("has every one of them in %s", (lang) => {
    const missing = built.filter(([section, key]) => t(section, key, lang) === key);
    expect(missing).toEqual([]);
  });
});

describe("Japanese resume terms", () => {
  // Two different things: the CV a user uploads (レジュメ) and the JIS-format
  // form the app generates (履歴書). Using 履歴書 for both made the documents
  // page ask users to "select a 履歴書" in order to make a 履歴書.
  // chat.greeting offers help with writing a Japanese 履歴書, the form.
  const ALLOWED = new Set(["chat.greeting"]);

  it("calls an uploaded resume レジュメ, never 履歴書", () => {
    const mixedUp: string[] = [];
    for (const [section, key, value] of everyString()) {
      const en = value["en"] ?? "";
      const mentionsForm = en.includes("履歴書") || /rirekisho/i.test(en);
      const id = `${section}.${key}`;
      if (/resume/i.test(en) && !mentionsForm && (value["ja"] ?? "").includes("履歴書")) {
        if (!ALLOWED.has(id)) mixedUp.push(id);
      }
    }
    expect(mixedUp).toEqual([]);
  });
});
