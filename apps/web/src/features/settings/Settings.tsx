import { Trans, useLingui } from '@lingui/react/macro';
import { useId, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Sheet';
import { Gate } from '../../entitlements/Gate';
import { db } from '../../state/db';
import { CURRENT_DATASET_VERSION } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';
import { useThemeStore, type Theme } from '../../state/themeStore';
import { downloadText, exportScenario, parseImport } from './exportImport';
import { UpdateBanner } from './UpdateBanner';

function ThemeCard() {
  const { t } = useLingui();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const labelId = useId();
  const options: { id: Theme; label: string }[] = [
    { id: 'system', label: t`Jak w systemie` },
    { id: 'light', label: t`Jasny` },
    { id: 'dark', label: t`Ciemny` },
  ];
  return (
    <Card title={t`Wygląd`}>
      <p id={labelId} className="mb-2 mt-0 text-sm font-medium">
        <Trans>Motyw</Trans>
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
              theme === o.id ? 'border-accent bg-accent-soft font-semibold text-accent-soft-fg' : 'border-border-strong bg-surface'
            }`}
          >
            <input type="radio" name="theme" className="sr-only" checked={theme === o.id} onChange={() => setTheme(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </Card>
  );
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function DataCard() {
  const { t } = useLingui();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileId = useId();

  const onExport = () => {
    const s = useScenarioStore.getState().scenario;
    downloadText(`plan-${new Date().toISOString().slice(0, 10)}.json`, exportScenario(s));
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice({ kind: 'error', text: t`Nie udało się wczytać pliku: nie można go odczytać. Twój plan zostaje bez zmian.` });
      return;
    } finally {
      input.value = ''; // pozwala wybrać ten sam plik ponownie
    }
    const r = parseImport(text);
    if (!r.ok) {
      setNotice({ kind: 'error', text: t`Nie udało się wczytać pliku: to nie jest poprawny plan z tej aplikacji. Twój plan zostaje bez zmian.` });
      return;
    }
    useScenarioStore.setState({
      scenario: r.scenario,
      loadStatus: 'ready',
      loadError: null,
      datasetOutdated: r.scenario.datasetVersion !== CURRENT_DATASET_VERSION,
    });
    setNotice({ kind: 'ok', text: t`Wczytano plan z pliku.` });
  };

  const onReset = async () => {
    try {
      await db.scenarios.clear();
    } catch {
      // IndexedDB niedostępne: nie ma czego czyścić, resetujemy sam stan
    }
    useScenarioStore.getState().resetScenario();
    useScenarioStore.setState({ compareList: [] });
    setConfirmOpen(false);
    setNotice({ kind: 'ok', text: t`Dane usunięte. Zaczynasz od nowa.` });
  };

  return (
    <Card title={t`Twoje dane`}>
      <p className="mt-0 text-sm text-muted">
        <Trans>Plan jest zapisany tylko na tym urządzeniu. Możesz zrobić kopię w pliku albo wczytać wcześniejszą.</Trans>
      </p>
      <div className="flex flex-col gap-4">
        <Gate feature="export.json">
          <div>
            <Button variant="secondary" onClick={onExport}>
              <Trans>Pobierz kopię (JSON)</Trans>
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={fileId} className="text-sm font-medium">
              <Trans>Wczytaj plik JSON</Trans>
            </label>
            <input
              id={fileId}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onImport(e)}
              className="min-h-11 text-base file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-border-strong file:bg-surface file:px-4"
            />
            <p className="m-0 text-sm text-muted">
              <Trans>Wczytanie zastępuje bieżący plan.</Trans>
            </p>
          </div>
        </Gate>
        <div>
          <Sheet
            title={t`Usunąć wszystkie dane?`}
            description={t`Plan i portfel zostaną usunięte z tego urządzenia. Tej operacji nie można cofnąć, więc najpierw pobierz kopię, jeśli chcesz zachować plan.`}
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            trigger={
              <Button variant="danger">
                <Trans>Zresetuj dane</Trans>
              </Button>
            }
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => void onReset()}>
                <Trans>Tak, usuń moje dane</Trans>
              </Button>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                <Trans>Anuluj</Trans>
              </Button>
            </div>
          </Sheet>
        </div>
        {notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`m-0 font-medium ${notice.kind === 'error' ? 'text-danger' : 'text-ok'}`}>
            {notice.text}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Ustawienia (trasa /ustawienia): motyw, aktualizacja aplikacji, kopia i reset danych. */
export function Settings() {
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-4">
      <UpdateBanner />
      <ThemeCard />
      <DataCard />
      <Card title={t`O aplikacji`}>
        <p className="m-0 text-sm text-muted">
          <Trans>Zbiór danych {CURRENT_DATASET_VERSION}. Aplikacja działa offline; nowa wersja pojawia się po Twojej zgodzie.</Trans>
        </p>
      </Card>
    </div>
  );
}
