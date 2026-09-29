import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center">
          <Link
            href="/"
            className="rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark />
          </Link>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center bg-muted/40 focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
