import { Switch } from 'radix-ui';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Pełna nazwa dostępna, gdy widoczna etykieta jest skrócona (musi zawierać widoczny tekst). */
  ariaLabel?: string;
}

/**
 * Przełącznik (role=switch) w postaci pastylki ze świecącą kropką (wygląd projektu v3).
 * Obsługa spacji i klawisza Enter z Radix; nazwę dostępną daje treść pastylki.
 */
export function Toggle({ label, checked, onCheckedChange, disabled, ariaLabel }: ToggleProps) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex min-h-9 cursor-pointer items-center gap-[9px] rounded-full border border-border bg-field px-3.5 py-1.5 text-left text-[13px] text-fg transition-[background,border-color] duration-300 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[rgba(157,185,255,0.45)] data-[state=checked]:bg-[rgba(42,85,255,0.18)]"
    >
      <Switch.Thumb className="block size-1.5 shrink-0 rounded-full bg-fg/30 transition-colors duration-300 data-[state=checked]:bg-accent-text data-[state=checked]:shadow-[0_0_10px_var(--glow)]" />
      {label}
    </Switch.Root>
  );
}
