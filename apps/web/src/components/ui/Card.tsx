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
      className={`glass rounded-card p-4 sm:p-6 ${className}`}
    >
      {title && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id={id} className="text-base font-medium tracking-[-0.01em]">
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
