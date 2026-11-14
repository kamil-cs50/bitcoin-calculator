import { Popover } from 'radix-ui';
import type { ReactNode } from 'react';

export interface InfoTipProps {
  /** Nazwa przycisku dla czytnika ekranu, np. „Czym jest zmienność”. */
  label: string;
  children: ReactNode;
}

/** Ikona ⓘ z objaśnieniem; Popover działa na dotyk i klawiaturę (w przeciwieństwie do samego tooltipu). */
export function InfoTip({ label, children }: InfoTipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <span aria-hidden="true">ⓘ</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={16}
          className="anim-fade z-50 max-w-72 rounded-xl border border-border-strong bg-surface p-3 text-sm text-fg shadow-lg"
        >
          {children}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
