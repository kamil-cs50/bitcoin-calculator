import type { ReactNode } from 'react';

/** Szkielet strony: nagłówek `h1` i treść. */
export function Page({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
