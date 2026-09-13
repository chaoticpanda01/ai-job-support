import { cookies } from "next/headers";
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, isLanguage, type Language } from "@/lib/i18n";

/**
 * The language saved by the language switcher, for server components. Reading
 * cookies makes the calling route dynamically rendered.
 */
export async function getSavedLanguage(): Promise<Language> {
  const saved = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
}
