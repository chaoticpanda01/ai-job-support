"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useMe, useUploadPhoto } from "@/hooks/useMe";
import { ApiClientError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

const ACCEPTED_MIME = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function PhotoUploader() {
  const { data: me } = useMe();
  const uploadPhoto = useUploadPhoto();
  const [fileError, setFileError] = useState<string | null>(null);
  const { lang } = useLang();

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setFileError(null);
      if (rejected.length > 0) {
        const firstError = rejected[0]?.errors[0]?.message ?? t("settings", "photoInvalid", lang);
        setFileError(firstError);
        return;
      }
      const file = accepted[0];
      if (!file) return;
      uploadPhoto.mutate(file);
    },
    [uploadPhoto, lang],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME,
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled: uploadPhoto.isPending,
  });

  const photoUrl = me?.profile?.photo_url ?? null;

  const uploadError =
    uploadPhoto.error instanceof ApiClientError
      ? uploadPhoto.error.detail
      : uploadPhoto.error
        ? t("settings", "photoUploadFail", lang)
        : null;

  const displayError = fileError ?? uploadError;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1 text-center text-[10px] text-muted-foreground">
              {t("settings", "photoNone", lang)}
            </span>
          )}
        </div>
        <div
          {...getRootProps()}
          className={[
            "flex-1 cursor-pointer rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
            uploadPhoto.isPending ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          {uploadPhoto.isPending
            ? t("settings", "photoUploading", lang)
            : t("settings", "photoUpload", lang)}
        </div>
      </div>
      {displayError && <p className="text-xs text-destructive">{displayError}</p>}
    </div>
  );
}
