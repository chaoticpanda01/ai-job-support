import { LANGUAGES, t, type Language } from "@/lib/i18n";
import type { InterviewLanguage, InterviewType } from "@/types/api";

// i18n keys for each session type, in the order the new-session form lists them.
// Titles are whole phrases rather than a type label plus "Interview": Indonesian
// puts the noun first (Wawancara Umum) and Japanese joins without a space (総合面接).
const TYPE_KEYS = {
  general: { label: "typeGeneral", description: "typeGeneralDesc", title: "titleGeneral" },
  behavioral: {
    label: "typeBehavioral",
    description: "typeBehavioralDesc",
    title: "titleBehavioral",
  },
  technical: { label: "typeTechnical", description: "typeTechnicalDesc", title: "titleTechnical" },
  culture_fit: { label: "typeCulture", description: "typeCultureDesc", title: "titleCulture" },
} satisfies Record<InterviewType, { label: string; description: string; title: string }>;

const LANGUAGE_KEYS: Record<InterviewLanguage, string> = {
  ja: "langJa",
  en: "langEn",
  id: "langId",
};

/** Session types, in the order the new-session form lists them. */
export const INTERVIEW_TYPES = Object.keys(TYPE_KEYS) as InterviewType[];

/** Interview languages, in the order the new-session form lists them. */
export const INTERVIEW_LANGUAGES = Object.keys(LANGUAGE_KEYS) as InterviewLanguage[];

// Object.hasOwn rather than a plain lookup: a string such as "toString" would
// otherwise find an inherited property instead of falling back.
function typeText(
  type: InterviewType,
  text: "label" | "description" | "title",
  lang: Language,
): string {
  return Object.hasOwn(TYPE_KEYS, type) ? t("interview", TYPE_KEYS[type][text], lang) : type;
}

/** Short label for a session type, such as "Culture Fit". */
export function interviewTypeLabel(type: InterviewType, lang: Language): string {
  return typeText(type, "label", lang);
}

/** One-sentence description of a session type, for the new-session form. */
export function interviewTypeDescription(type: InterviewType, lang: Language): string {
  return typeText(type, "description", lang);
}

/**
 * Whole title for a session type, such as "Culture Fit Interview". A type the
 * frontend doesn't know yet returns its raw string (e.g. "mock_panel") rather
 * than a blank.
 */
export function interviewTitle(type: InterviewType, lang: Language): string {
  return typeText(type, "title", lang);
}

/** A language's name in the UI language, such as "Japanese" or 日本語. */
export function interviewLanguageName(code: InterviewLanguage, lang: Language): string {
  return Object.hasOwn(LANGUAGE_KEYS, code) ? t("interview", LANGUAGE_KEYS[code], lang) : code;
}

/**
 * A language picker option: the name in the UI language, then the language's
 * own name when that differs, so each option is recognisable in any UI
 * language, e.g. "Japanese (日本語)" or "英語 (English)".
 */
export function interviewLanguageOption(code: InterviewLanguage, lang: Language): string {
  const name = interviewLanguageName(code, lang);
  const ownName = LANGUAGES.find((l) => l.code === code)?.name ?? name;
  return name === ownName ? name : `${name} (${ownName})`;
}
