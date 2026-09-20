import type { FileRejection } from "react-dropzone";
import type { CommonMessageKey } from "@/lib/api-error";
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
  maxSizeBytes: number,
  lang: Language,
): string {
  const code = rejection?.errors[0]?.code;
  if (code === "file-too-large") {
    // Bytes in, MB out: every size limit in this codebase is declared in bytes,
    // and no reader wants to be told a limit in bytes.
    const megabytes = Math.round(maxSizeBytes / 1024 / 1024);
    return t("common", "fileTooLarge", lang).replace("{n}", String(megabytes));
  }
  const key: CommonMessageKey =
    code === "file-invalid-type"
      ? "errorUnsupportedType"
      : code === "too-many-files"
        ? "fileOneAtATime"
        : // file-too-small (neither uploader sets minSize) and any code a later
          // version of the library or a custom validator adds. Saying the type
          // is wrong would be a guess, so this stays neutral.
          "error";
  return t("common", key, lang);
}
