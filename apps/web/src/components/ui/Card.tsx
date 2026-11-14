import { useId, type ReactNode } from 'react';

export interface CardProps {
  title?: string;
  /** Element po prawej stronie nagłówka (np. InfoTip). */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Kafel („bento”): region z nazwą nadaną z nagłówka. */
export function Card({ title, aside, className = '', children }: CardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className={`rounded-card border border-border bg-surface p-4 shadow-sm sm:p-5 ${className}`}
    >
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
