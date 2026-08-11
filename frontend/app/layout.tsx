import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_JP } from "next/font/google";
import { ClerkProvider, SignedIn } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import { ChatWidget } from "@/components/chat-widget";
import { Toaster } from "@/components/ui/toaster";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="id" className={`${notoSans.variable} ${notoSansJP.variable}`}>
        <body className="min-h-screen bg-background font-sans antialiased">
          <Providers>
            {children}
            {/* Chatbot requires authentication (see chat.py); only render it for
                signed-in users so anonymous visitors aren't shown a widget that
                would reject them with "please sign in". */}
            <SignedIn>
              <ChatWidget />
            </SignedIn>
            <Toaster />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
