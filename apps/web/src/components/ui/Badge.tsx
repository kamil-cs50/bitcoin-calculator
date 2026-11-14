import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'ok' | 'danger';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-fg border-border',
  accent: 'bg-accent-soft text-accent-soft-fg border-transparent',
  warning: 'bg-accent-soft text-accent-soft-fg border-accent',
  ok: 'bg-ok-soft text-ok border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

/** Plakietka; znaczenie niesie tekst, nie sam kolor. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
