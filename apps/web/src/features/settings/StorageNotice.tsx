import { Trans } from '@lingui/react/macro';
import { Button } from '../../components/ui/Button';
import { useScenarioStore } from '../../state/scenarioStore';
import { downloadText } from './exportImport';

/**
 * Komunikaty o zapisie lokalnym: karta „uszkodzony zapis” (kopia surowych danych albo start od nowa)
 * oraz informacja, że IndexedDB jest niedostępne (aplikacja działa dalej, ale nic nie zapisuje).
 */
export function StorageNotice() {
  const loadStatus = useScenarioStore((s) => s.loadStatus);
  const storageError = useScenarioStore((s) => s.storageError);
  const resetScenario = useScenarioStore((s) => s.resetScenario);

  const onBackup = () => {
    const raw = useScenarioStore.getState().exportRawBackup();
    downloadText(`kopia-zapisu-${new Date().toISOString().slice(0, 10)}.json`, raw);
  };

  if (loadStatus === 'invalid') {
    return (
      <div role="alert" className="mb-2 rounded-card border border-danger bg-danger-soft p-4 text-danger">
        <p className="m-0 font-semibold">
          <Trans>Nie udało się wczytać zapisanego planu</Trans>
        </p>
        <p className="mb-3 mt-1 text-fg">
          <Trans>
            Zapis na tym urządzeniu jest uszkodzony lub pochodzi z nieznanej wersji. Możesz pobrać jego kopię albo
            zacząć od nowa; dopóki nie wybierzesz, nic go nie nadpisze.
          </Trans>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBackup}>
            <Trans>Pobierz kopię danych</Trans>
          </Button>
          <Button onClick={resetScenario}>
            <Trans>Zacznij od nowa</Trans>
          </Button>
        </div>
      </div>
    );
  }
  if (storageError) {
    return (
      <p role="status" className="mb-2 rounded-card border border-border bg-surface p-3 text-sm text-muted">
        <Trans>
          Nie możemy zapisać planu na tym urządzeniu (np. tryb prywatny). Aplikacja działa dalej, ale po zamknięciu
          karty plan zniknie. Pobierz kopię w Ustawieniach.
        </Trans>
      </p>
    );
  }
  return null;
}
