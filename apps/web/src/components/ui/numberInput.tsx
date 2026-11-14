import { useState } from 'react';
import { numberLocale } from '../../i18n';
import { Field, inputClass } from './Field';

const isEn = (): boolean => numberLocale() === 'en-GB';

/**
 * „12 500,50” / „12500.5” -> 12500.5; pusty lub niepełny zapis -> null.
 * Po angielsku przecinek jest separatorem tysięcy („12,500.50”), po polsku dziesiętnym.
 */
export function parseDecimal(text: string): number | null {
  const noSpace = text.replace(/[\s\u00a0\u202f]/g, '');
  const clean = isEn() ? noSpace.replace(/,/g, '') : noSpace.replace(',', '.');
  if (clean === '' || clean === '.') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Dozwolone znaki wpisu: cyfry, spacje, jeden separator dziesiętny (przecinek lub kropka). */
const ALLOWED = /^[\d\s\u00a0\u202f]*[,.]?[\d]*$/;
const ALLOWED_NEGATIVE = /^-?[\d\s\u00a0\u202f]*[,.]?[\d]*$/;
const ALLOWED_EN = /^[\d\s,]*\.?\d*$/;
const ALLOWED_EN_NEGATIVE = /^-?[\d\s,]*\.?\d*$/;

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
  /** Dopuszcza wiodący minus (np. spread lokaty o ujemnej wartości). */
  allowNegative?: boolean;
  /** Duże pole „wyświetlacza” (kafelek pozycji portfela): lekka kwota z dolną kreską zamiast ramki. */
  display?: boolean;
}

function show(v: number | null, scale: number): string {
  if (v === null) return '';
  const t = String(Math.round(v * scale * 1e8) / 1e8);
  return isEn() ? t : t.replace('.', ',');
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
  allowNegative,
  display,
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
            className={
              display
                ? `num w-full min-w-0 rounded-none border-0 border-b border-border-strong/50 bg-transparent px-0 pb-2 pt-0 text-[40px] leading-[1.15] font-light tracking-[-0.04em] text-fg outline-none transition-colors focus:border-accent-text aria-[invalid=true]:border-danger ${suffix ? 'pr-10' : ''}`
                : `${inputClass} ${suffix ? 'pr-14' : ''}`
            }
            onChange={(e) => {
              const next = e.target.value;
              const allowed = isEn() ? (allowNegative ? ALLOWED_EN_NEGATIVE : ALLOWED_EN) : allowNegative ? ALLOWED_NEGATIVE : ALLOWED;
              if (!allowed.test(next)) return;
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
              className={
                display
                  ? 'pointer-events-none absolute inset-y-0 right-0 flex items-end pb-2.5 text-[22px] font-light tracking-[-0.02em] text-accent-text'
                  : 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted'
              }
            >
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
