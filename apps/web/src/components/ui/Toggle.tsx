import { Switch } from 'radix-ui';
import { useId } from 'react';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Przełącznik (role=switch), obsługa spacji i klawisza Enter z Radix. */
export function Toggle({ label, checked, onCheckedChange, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-7 w-12 shrink-0 rounded-full border border-border-strong bg-surface-2 transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-fg transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-accent-fg" />
      </Switch.Root>
      <label htmlFor={id} className="text-base">
        {label}
      </label>
    </div>
  );
}
