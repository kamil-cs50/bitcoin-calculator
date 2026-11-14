import { Trans } from '@lingui/react/macro';
import { Button } from '../../components/ui/Button';
import { useUpdateStore } from '../../state/updateStore';

/** Baner „nowa wersja”: service worker czeka na zgodę, żeby nie przerwać pracy użytkownika. */
export function UpdateBanner() {
  const needRefresh = useUpdateStore((s) => s.needRefresh);
  const apply = useUpdateStore((s) => s.apply);
  if (!needRefresh) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-card border border-accent bg-accent-soft p-3 text-accent-soft-fg">
      <p className="m-0 font-medium">
        <Trans>Dostępna nowa wersja — odśwież</Trans>
      </p>
      <Button onClick={() => apply?.()}>
        <Trans>Odśwież</Trans>
      </Button>
    </div>
  );
}
