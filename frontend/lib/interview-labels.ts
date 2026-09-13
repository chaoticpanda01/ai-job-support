import { t, type Language } from "@/lib/i18n";
import type { InterviewType } from "@/types/api";

// Whole titles rather than a type label plus "Interview", because word order
// differs by language: General Interview, Wawancara Umum, 総合面接.
const TITLE_KEYS: Record<InterviewType, string> = {
  general: "titleGeneral",
  behavioral: "titleBehavioral",
  technical: "titleTechnical",
  culture_fit: "titleCulture",
};

/** The translated title for an interview session type. */
export function interviewTitle(type: InterviewType, lang: Language): string {
  const key = TITLE_KEYS[type];
  // A type the frontend doesn't know yet shows as-is rather than blank.
  return key ? t("interview", key, lang) : type;
}
