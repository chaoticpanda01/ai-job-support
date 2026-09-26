import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { LandingPage } from "@/components/landing/landing-page";

// English only: metadata is static, and search engines and link previews
// don't carry the visitor's language cookie.
export const metadata: Metadata = {
  title: { absolute: "Japan Job Support: your move to Japan, one step at a time" },
  description:
    "Build your 履歴書, practise interviews in Japanese and find the right visa. A free career guide for Indonesian professionals moving to Japan.",
};

/**
 * Decides signed in or out on the server, so the landing page's buttons are
 * right on first paint instead of appearing once Clerk's script has loaded.
 * clerkMiddleware already runs on "/" (see middleware.ts), which auth() needs.
 */
export default async function LandingRoute() {
  const { userId } = await auth();
  return <LandingPage signedIn={userId !== null} />;
}
