import { useId, type InputHTMLAttributes } from "react";

/** Labelled text input with an optional hint and error, wired up for screen readers. */
export function Field({
  label,
  hint,
  error,
  className = "",
  inputClassName = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  inputClassName?: string;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={
          "min-h-11 rounded-lg border bg-bg px-3 text-base text-text placeholder:text-muted/80 " +
          "focus-visible:outline-2 focus-visible:outline-focus " +
          (error ? "border-danger " : "border-border-strong ") +
          inputClassName
        }
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
