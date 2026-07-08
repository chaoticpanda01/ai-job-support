"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Resume } from "@/types/api";

const ACCEPTED_MIME = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface Props {
  onUploaded?: (resume: Resume) => void;
}

export function ResumeUploader({ onUploaded }: Props) {
  const queryClient = useQueryClient();
  const [fileError, setFileError] = useState<string | null>(null);
  const { lang } = useLang();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiClient.upload<Resume>("/resumes", form);
    },
    onSuccess: (resume) => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      onUploaded?.(resume);
      toast({ variant: "success", description: t("resumes", "uploadSuccess", lang) });
    },
  });

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setFileError(null);

      if (rejected.length > 0) {
        const firstError = rejected[0]?.errors[0]?.message ?? t("resumes", "invalidFile", lang);
        setFileError(firstError);
        return;
      }

      const file = accepted[0];
      if (!file) return;
      uploadMutation.mutate(file);
    },
    [uploadMutation, lang],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME,
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled: uploadMutation.isPending,
  });

  const uploadError =
    uploadMutation.error instanceof ApiClientError
      ? uploadMutation.error.detail
      : uploadMutation.error
        ? t("resumes", "uploadFailed", lang)
        : null;

  const displayError = fileError ?? uploadError;

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={[
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
          uploadMutation.isPending ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <UploadIcon />
        <p className="mt-3 text-sm font-medium text-foreground">
          {isDragActive ? t("resumes", "dropHere", lang) : t("resumes", "dragDrop", lang)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("resumes", "fileTypeHint", lang)}</p>
        <button
          type="button"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending
            ? t("resumes", "uploading", lang)
            : t("resumes", "chooseFile", lang)}
        </button>
      </div>

      {displayError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {displayError}
        </p>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-10 w-10 text-muted-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}
