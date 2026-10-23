import type { ReactNode } from "react";
import { Link } from "react-router";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-wide uppercase"
            aria-label="ReignRoom home"
          >
            Reign<span className="text-accent-text">Room</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-sm text-muted sm:px-6">
          Fan project, not affiliated with Bandai Namco or Sony. ReignRoom never provides game or BIOS
          files: use your own legally dumped copies.
        </p>
      </footer>
    </div>
  );
}
