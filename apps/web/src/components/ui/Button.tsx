import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

// Pastylki z projektu v3: główny przycisk to szklany niebieski „Zobacz wynik”, pozostałe to ciche kontury.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'border border-border bg-field text-fg hover:bg-soft',
  ghost: 'border border-transparent bg-transparent text-fg hover:bg-soft',
  danger:
    'border border-border bg-transparent text-fg/80 hover:border-danger hover:text-danger',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full px-[22px] py-2 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}
