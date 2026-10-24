import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";

const navClass = ({ isActive }: { isActive: boolean }) =>
  "rounded-md px-2 py-1.5 text-sm font-semibold underline-offset-4 hover:underline " +
  (isActive ? "text-text underline decoration-accent decoration-2" : "text-muted hover:text-text");

/** Client-side navigation keeps the scroll position by default; reset it, or go to #anchors. */
function ScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollOnNavigate />
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-wide uppercase"
            aria-label="ReignRoom home"
          >
            Reign<span className="text-accent-text">Room</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
            <NavLink to="/host" className={navClass}>
              Host setup
            </NavLink>
            <NavLink to="/help" className={navClass}>
              Help
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <p className="max-w-2xl">
            Fan project, not affiliated with Bandai Namco or Sony. ReignRoom never provides game or BIOS files: use
            your own legally dumped copies.
          </p>
          <nav aria-label="Legal" className="flex shrink-0 gap-4">
            <Link to="/legal" className="font-semibold underline underline-offset-4 hover:text-text">
              Legal and privacy
            </Link>
            <Link to="/contact" className="font-semibold underline underline-offset-4 hover:text-text">
              DMCA and contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
