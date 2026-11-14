import { useState } from 'react';
import { Field, inputClass } from './Field';

/** „12 500,50” / „12500.5” -> 12500.5; pusty lub niepełny zapis -> null. */
export function parseDecimal(text: string): number | null {
  const clean = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (clean === '' || clean === '.') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Dozwolone znaki wpisu: cyfry, spacje, jeden separator dziesiętny (przecinek lub kropka). */
const ALLOWED = /^[\d\s\u00a0\u202f]*[,.]?[\d]*$/;

export interface DecimalInputProps {
  label: string;
  /** Wartość w jednostkach modelu (np. kwota albo ułamek). */
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  error?: string | null;
  /** Dopisek po prawej (waluta, %). */
  suffix?: string;
  /** Mnożnik: wartość wyświetlana = value * scale. */
  scale?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Pole wymagane (aria-required); sama walidacja i komunikat błędu po stronie wywołującego. */
  required?: boolean;
}

function show(v: number | null, scale: number): string {
  if (v === null) return '';
  return String(Math.round(v * scale * 1e8) / 1e8).replace('.', ',');
}

/** Wspólna baza MoneyInput i PercentInput: tekst z polskim zapisem, bez liter. */
export function DecimalInput({
  label,
  value,
  onChange,
  hint,
  error,
  suffix,
  scale = 1,
  placeholder,
  disabled,
  required,
}: DecimalInputProps) {
  const [text, setText] = useState(() => show(value, scale));
  const [lastEmitted, setLastEmitted] = useState<number | null>(value);
  // Zewnętrzna zmiana wartości (np. reset) odświeża tekst; własny wpis nie.
  if (value !== lastEmitted) {
    setLastEmitted(value);
    setText(show(value, scale));
  }
  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => (
        <div className="relative">
          <input
            {...p}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={`${inputClass} ${suffix ? 'pr-14' : ''}`}
            onChange={(e) => {
              const next = e.target.value;
              if (!ALLOWED.test(next)) return;
              setText(next);
              const parsed = parseDecimal(next);
              const out = parsed === null ? null : parsed / scale;
              setLastEmitted(out);
              onChange(out);
            }}
          />
          {suffix && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
            >
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
