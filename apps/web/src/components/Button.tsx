import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors select-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover active:translate-y-px",
  secondary:
    "border border-border-strong bg-surface-2 text-text hover:border-text/60 active:translate-y-px",
  // Quieter than secondary (no fill), but still outlined so it reads as a button.
  quiet: "border border-border-strong text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-danger/60 text-danger hover:bg-danger-bg",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-13 px-6 text-lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button type={type} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}
