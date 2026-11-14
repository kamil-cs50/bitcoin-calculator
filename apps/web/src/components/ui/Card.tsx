import { useId, type ReactNode } from 'react';

export interface CardProps {
  title?: string;
  /** Widoczny nagłówek, gdy ma być inny niż pełna nazwa regionu (`title`), np. ze znacznikiem koloru. */
  titleNode?: ReactNode;
  /** Element po prawej stronie nagłówka (np. InfoTip). */
  aside?: ReactNode;
  className?: string;
  /** Mniejszy promień (28 px) dla kafelków wskaźników. */
  tile?: boolean;
  children: ReactNode;
}

/** Kafel („bento”): region z nazwą nadaną z nagłówka. */
export function Card({ title, titleNode, aside, className = '', tile = false, children }: CardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={title && !titleNode ? id : undefined}
      aria-label={title && titleNode ? title : undefined}
      className={`glass ${tile ? 'rounded-tile' : 'rounded-card'} p-[clamp(20px,2.2vw,28px)] ${className}`}
    >
      {title && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5">
          <h2 id={id} className="m-0 text-[clamp(20px,1.9vw,26px)] leading-[1.2] font-light tracking-[-0.03em]">
            {titleNode ?? title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
