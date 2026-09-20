import type { FileRejection } from "react-dropzone";
import { t, type Language } from "@/lib/i18n";

/**
 * A message for a file the dropzone refused, in the reader's language.
 *
 * react-dropzone's own `message` is English ("File is larger than 10485760
 * bytes"), and it quotes the limit in bytes and MIME types, neither of which
 * means anything to a reader. Its `code` is stable, so the message comes from
 * the code and the caller's own limit instead.
 */
export function fileRejectionMessage(
  rejection: FileRejection | undefined,
  maxSizeMb: number,
  lang: Language,
): string {
  switch (rejection?.errors[0]?.code) {
    case "file-too-large":
      return t("common", "fileTooLarge", lang).replace("{n}", String(maxSizeMb));
    case "file-invalid-type":
      return t("common", "errorUnsupportedType", lang);
    case "too-many-files":
      return t("common", "fileOneAtATime", lang);
    default:
      // Includes file-too-small and any code a later version of the library
      // adds: the file was refused, and the control states what it accepts.
      return t("common", "errorUnsupportedType", lang);
  }
}
