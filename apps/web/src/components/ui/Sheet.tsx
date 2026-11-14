import { Trans } from '@lingui/react/macro';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';

export interface SheetProps {
  title: string;
  description?: string;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/** Arkusz dolny na telefonie, wyśrodkowane okno na szerokich ekranach. Fokus uwięziony, Esc zamyka. */
export function Sheet({ title, description, trigger, open, onOpenChange, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="anim-sheet fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-fg hover:bg-surface-2">
              <Trans>Zamknij</Trans>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="mb-3 text-sm text-muted">{description}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
