import { Trans, useLingui } from '@lingui/react/macro';
import { useId, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Sheet';
import { Gate } from '../../entitlements/Gate';
import type { Locale } from '../../i18n';
import { db } from '../../state/db';
import { CURRENT_DATASET_VERSION } from '../../state/defaults';
import { useLocaleStore } from '../../state/localeStore';
import { useScenarioStore } from '../../state/scenarioStore';
import { useThemeStore, type Theme } from '../../state/themeStore';
import { downloadText, exportScenario, parseImport } from './exportImport';
import { UpdateBanner } from './UpdateBanner';

/** Grupa przycisków radiowych w stylu karty ustawień (motyw, język). */
function RadioChoice<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: { id: T; label: string; lang?: string }[];
  onChange: (v: T) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="eyebrow-sm mb-2.5 mt-0">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            lang={o.lang}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-[9px] rounded-full border px-4 text-[14px] text-fg transition-[background,border-color] duration-300 before:size-1.5 before:rounded-full before:content-[''] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
              value === o.id
                ? 'border-[rgba(157,185,255,0.45)] bg-[rgba(42,85,255,0.18)] before:bg-accent-text before:shadow-[0_0_10px_var(--glow)]'
                : 'border-border bg-field before:bg-fg/30 hover:bg-soft'
            }`}
          >
            <input type="radio" name={name} className="sr-only" checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function ThemeCard() {
  const { t } = useLingui();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const themes: { id: Theme; label: string }[] = [
    { id: 'system', label: t`Jak w systemie` },
    { id: 'light', label: t`Jasny` },
    { id: 'dark', label: t`Ciemny` },
  ];
  // nazwy języków zawsze we własnym języku (z atrybutem lang dla czytników ekranu)
  const languages: { id: Locale; label: string; lang: string }[] = [
    { id: 'pl', label: 'Polski', lang: 'pl' },
    { id: 'en', label: 'English', lang: 'en' },
  ];
  return (
    <Card title={t`Wygląd`}>
      <div className="flex flex-col gap-4">
        <RadioChoice name="theme" label={t`Motyw`} value={theme} options={themes} onChange={setTheme} />
        <RadioChoice name="locale" label={t`Język`} value={locale} options={languages} onChange={(l) => void setLocale(l)} />
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
            <label htmlFor={fileId} className="eyebrow-sm">
              <Trans>Wczytaj plik JSON</Trans>
            </label>
            <input
              id={fileId}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onImport(e)}
              className="min-h-11 w-fit cursor-pointer rounded-full text-[0px] text-transparent file:min-h-11 file:cursor-pointer file:rounded-full file:border file:border-solid file:border-border file:bg-field file:px-[22px] file:text-[15px] file:text-fg file:transition-colors hover:file:bg-soft"
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
