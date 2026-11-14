import type { ReactNode } from 'react';

/**
 * Szkielet strony: nagłówek `h1` i treść. `hideTitle` zostawia nagłówek dla czytników ekranu i nawigacji
 * (ekrany Wynik i Portfel w projekcie v3 zaczynają od paska danych, bez widocznego tytułu).
 */
export function Page({ title, children, hideTitle = false }: { title: ReactNode; children: ReactNode; hideTitle?: boolean }) {
  return (
    <div className="flex flex-col gap-[clamp(20px,2.4vw,28px)]">
      <h1
        className={
          hideTitle
            ? 'sr-only'
            : 'm-0 text-[clamp(28px,3vw,40px)] leading-[1.15] font-light tracking-[-0.03em]'
        }
      >
        {title}
      </h1>
      {children}
    </div>
  );
}
