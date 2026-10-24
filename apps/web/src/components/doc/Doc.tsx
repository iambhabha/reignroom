import type { ReactNode } from "react";

/** Long-form page: readable line length, clear heading rhythm. */
export function DocPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 leading-relaxed">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight font-bold uppercase">{title}</h1>
        {intro && <div className="text-lg text-muted">{intro}</div>}
      </header>
      {children}
    </article>
  );
}

/** A numbered step with its own heading, so the page outline reads as the procedure. */
export function Step({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex items-baseline gap-3 font-display text-2xl font-bold uppercase">
        <span className="text-accent-text tabular-nums">{n}.</span>
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-2xl font-bold uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Highlighted note. "legal" and "warning" are the only kinds; use sparingly. */
export function Callout({ kind, title, children }: { kind: "legal" | "warning"; title: string; children: ReactNode }) {
  return (
    <aside
      className={
        "flex flex-col gap-1.5 rounded-lg border-l-4 bg-surface px-4 py-3 " +
        (kind === "legal" ? "border-accent" : "border-danger")
      }
    >
      <p className="font-semibold">{title}</p>
      <div className="text-sm text-muted [&_strong]:text-text">{children}</div>
    </aside>
  );
}

/** Menu path like Settings → Emulation → …, readable by screen readers as text. */
export function Path({ children }: { children: string }) {
  return <strong className="font-semibold text-text">{children}</strong>;
}

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-accent-text underline underline-offset-4">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function Code({ children }: { children: string }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>;
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-6 marker:text-muted">{children}</ol>;
}
