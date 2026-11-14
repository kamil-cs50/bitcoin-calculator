import { useId, type ReactNode } from 'react';
import { StatusText } from './Status';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: FieldControlProps) => ReactNode;
}

/** Etykieta + podpowiedź + błąd powiązane z kontrolką przez id i aria-describedby. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="eyebrow-sm">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })}
      {hint && (
        <p id={hintId} className="m-0 text-[12.5px] leading-normal font-light text-muted">
          <StatusText text={hint} />
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'num min-h-11 w-full rounded-2xl border border-border bg-field px-3.5 py-2 text-base font-light text-fg outline-none transition-colors hover:border-border-strong focus:border-accent-text aria-[invalid=true]:border-danger';
