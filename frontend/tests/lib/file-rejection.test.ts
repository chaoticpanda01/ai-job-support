import { describe, expect, it } from "vitest";
import type { FileRejection } from "react-dropzone";
import { fileRejectionMessage } from "@/lib/file-rejection";
import { t } from "@/lib/i18n";
import { LANGS } from "../helpers";

const TEN_MB = 10 * 1024 * 1024;

/** A rejection shaped like react-dropzone's, carrying one error code. */
function rejection(code: string): FileRejection {
  return {
    file: new File(["x"], "cv.pdf"),
    errors: [{ code, message: "English text from the library" }],
  } as unknown as FileRejection;
}

describe("fileRejectionMessage", () => {
  it.each(LANGS)("states the limit in MB, not bytes (%s)", (lang) => {
    const message = fileRejectionMessage(rejection("file-too-large"), TEN_MB, lang);

    expect(message).toBe(t("common", "fileTooLarge", lang).replace("{n}", "10"));
    expect(message).toContain("10");
    expect(message).not.toContain("{n}");
    expect(message).not.toContain("10485760");
  });

  it.each(LANGS)("explains a wrong file type (%s)", (lang) => {
    expect(fileRejectionMessage(rejection("file-invalid-type"), TEN_MB, lang)).toBe(
      t("common", "errorUnsupportedType", lang),
    );
  });

  it.each(LANGS)("explains choosing several files at once (%s)", (lang) => {
    expect(fileRejectionMessage(rejection("too-many-files"), TEN_MB, lang)).toBe(
      t("common", "fileOneAtATime", lang),
    );
  });

  it("stays neutral for a code it does not know", () => {
    // Guessing "wrong file type" would be a false statement about the file.
    expect(fileRejectionMessage(rejection("a-code-from-a-newer-library"), TEN_MB, "ja")).toBe(
      t("common", "error", "ja"),
    );
  });

  it("stays neutral when there is no rejection at all", () => {
    expect(fileRejectionMessage(undefined, TEN_MB, "ja")).toBe(t("common", "error", "ja"));
  });

  it("never leaks the library's own English message", () => {
    for (const code of ["file-too-large", "file-invalid-type", "too-many-files", "unknown"]) {
      for (const lang of LANGS) {
        expect(fileRejectionMessage(rejection(code), TEN_MB, lang)).not.toContain("English text");
      }
    }
  });
});
