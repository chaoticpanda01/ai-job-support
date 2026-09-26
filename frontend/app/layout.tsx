import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
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

// Page titles only (font-display). next/font self-hosts every unicode-range
// file from Google's CSS, so kanji render in Mincho too; `subsets` only
// chooses what is preloaded.
const shipporiMincho = Shippori_Mincho({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Clerk draws its sign-in card and account menu with its own theme. These
// match them to the tokens in globals.css (hex, because Clerk can't read CSS
// variables for colour maths).
const clerkAppearance = {
  variables: {
    colorPrimary: "#1C1B19",
    colorBackground: "#FFFFFF",
    colorText: "#1C1B19",
    colorTextSecondary: "#6B675F",
    colorDanger: "#B42318",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-noto-sans), var(--font-noto-sans-jp), sans-serif",
  },
};

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
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang={lang}
        className={`${notoSans.variable} ${notoSansJP.variable} ${shipporiMincho.variable} motion-safe:scroll-smooth`}
      >
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
