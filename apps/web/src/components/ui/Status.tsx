import { useLingui } from '@lingui/react/macro';
import { Fragment, type ReactNode } from 'react';

export type VerifyStatus = 'yes' | 'secondary' | 'no';

/**
 * Znacznik statusu weryfikacji w stylu v3 zamiast emoji (✅ ◐ ❌): pełna świecąca kropka (zweryfikowane),
 * połówka (źródło wtórne), pusty pierścień (niezweryfikowane). Sam znak jest ozdobą; znaczenie niesie tekst
 * obok albo ukryty tekst dla czytników ekranu.
 */
export function StatusMark({ status, className = '' }: { status: VerifyStatus; className?: string }) {
  const shape =
    status === 'yes'
      ? 'bg-accent-text shadow-[0_0_10px_var(--glow)]'
      : status === 'secondary'
        ? 'border border-accent-text bg-[linear-gradient(90deg,var(--accent-text)_50%,transparent_50%)]'
        : 'border border-fg/55';
  return <span aria-hidden="true" className={`inline-block size-[7px] shrink-0 rounded-full align-middle ${shape} ${className}`} />;
}

const MARKS: Record<string, VerifyStatus> = { '✅': 'yes', '◐': 'secondary', '❌': 'no' };
const SPLIT = /(✅|◐|❌)/u;

/** Tekst z danych (notatki parametrów, podpowiedzi) z emoji statusu zamienionymi na znaczniki v3. */
export function StatusText({ text }: { text: string }): ReactNode {
  const { t } = useLingui();
  if (!SPLIT.test(text)) return text;
  // dla czytników ekranu „status: …”, żeby nie mylić z samą plakietką statusu parametru
  const spoken: Record<VerifyStatus, string> = { yes: t`status: zweryfikowane`, secondary: t`status: źródło wtórne`, no: t`status: niezweryfikowane` };
  return text.split(SPLIT).map((part, i) => {
    const st = MARKS[part];
    if (!st) return <Fragment key={i}>{part}</Fragment>;
    return (
      <Fragment key={i}>
        <StatusMark status={st} className="mx-[0.15em] -translate-y-px" />
        <span className="sr-only">{spoken[st]}</span>
      </Fragment>
    );
  });
}
