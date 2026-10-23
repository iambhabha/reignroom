import { useId } from "react";

/** On/off setting drawn as a sliding switch, with a label and a one-line description. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-4">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={`${id}-desc`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors " +
          "disabled:cursor-not-allowed disabled:opacity-50 " +
          (checked ? "border-accent bg-accent" : "border-border-strong bg-surface-2")
        }
      >
        <span
          aria-hidden
          className={
            "inline-block size-5 rounded-full shadow transition-transform " +
            (checked ? "translate-x-5 bg-accent-ink" : "translate-x-0.5 bg-muted")
          }
        />
      </button>
      <div className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer font-semibold">
          {label}
        </label>
        <p id={`${id}-desc`} className="text-sm text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}
