import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_JP } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import { ChatWidget } from "@/components/chat-widget";
import { Toaster } from "@/components/ui/toaster";
import { SkipLink } from "@/components/skip-link";
import { getSavedLanguage } from "@/lib/saved-language";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Japan Job Support",
    template: "%s | Japan Job Support",
  },
  description:
    "AI-powered career enablement platform for Indonesian professionals seeking employment in Japan.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Rendering the saved language on the server makes the first paint and
  // <html lang> right with no flash of English. Reading a cookie makes every
  // route dynamically rendered, which this signed-in app accepts.
  const lang = await getSavedLanguage();

  return (
    <ClerkProvider>
      <html lang={lang} className={`${notoSans.variable} ${notoSansJP.variable}`}>
        <body className="min-h-screen bg-background font-sans antialiased">
          <Providers initialLang={lang}>
            <SkipLink />
            {children}
            <ChatWidget />
            <Toaster />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
