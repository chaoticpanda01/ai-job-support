import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center">
          <Link href="/" className="text-sm font-semibold transition-opacity hover:opacity-80">
            🏠 Japan Job Support
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center bg-muted/40">{children}</main>
    </div>
  );
}
