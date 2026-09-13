"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LanguageProvider } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";
import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";

export function Providers({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang: Language;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLang={initialLang}>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
