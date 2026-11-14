import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { CURRENT_DATASET_VERSION } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';

/**
 * Plan zapisany ze starszym zbiorem danych: informacja i propozycja aktualizacji parametrów. Do czasu
 * aktualizacji nowe pozycje dostają parametry z bieżącego zbioru, więc w planie mieszają się dwie wersje.
 */
export function DatasetNotice() {
  const outdated = useScenarioStore((s) => s.datasetOutdated);
  const version = useScenarioStore((s) => s.scenario.datasetVersion);
  const update = useScenarioStore((s) => s.updateDataset);
  const [hidden, setHidden] = useState(false);
  if (!outdated || hidden) return null;
  return (
    <div role="status" className="mb-2 rounded-card border border-border bg-surface p-4">
      <p className="m-0 font-semibold">
        <Trans>Plan korzysta ze starszych danych rynkowych</Trans>
      </p>
      <p className="mb-3 mt-1 text-sm text-muted">
        <Trans>
          Zapisano go ze zbiorem danych {version}, a aplikacja ma już {CURRENT_DATASET_VERSION}. Parametry planu
          zostały zachowane. Aktualizacja podmienia założenia aktywów i rynku na nowe (Twoje zmiany tych
          parametrów przepadną); pozycje i plan zostają. Do czasu aktualizacji nowo dodane pozycje dostają
          parametry z nowego zbioru.
        </Trans>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={update}>
          <Trans>Zaktualizuj parametry</Trans>
        </Button>
        <Button variant="ghost" onClick={() => setHidden(true)}>
          <Trans>Zostaw bez zmian</Trans>
        </Button>
      </div>
    </div>
  );
}
