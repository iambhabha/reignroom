import { useId } from "react";

/**
 * A single-choice control drawn as joined buttons; implemented as a radio group
 * so arrow keys and screen readers behave as expected.
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
  format = String,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  format?: (v: T) => string;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-semibold text-text">{label}</legend>
      <div className="inline-flex w-fit rounded-lg border border-border-strong bg-bg p-1">
        {options.map((opt) => {
          const checked = opt === value;
          return (
            <label
              key={String(opt)}
              className={
                "relative flex min-h-10 min-w-12 cursor-pointer items-center justify-center rounded-md px-3 " +
                "font-display text-lg font-semibold transition-colors " +
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus " +
                "has-[:disabled]:cursor-not-allowed " +
                (checked ? "bg-accent text-accent-ink" : "text-muted hover:text-text")
              }
            >
              <input
                type="radio"
                name={name}
                value={String(opt)}
                aria-label={format(opt)}
                className="sr-only"
                checked={checked}
                onChange={() => onChange(opt)}
              />
              {format(opt)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
