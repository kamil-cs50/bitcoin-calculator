import { Trans } from '@lingui/react/macro';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { downloadText } from '../features/settings/exportImport';
import { useScenarioStore } from '../state/scenarioStore';

function Fallback({ onReset }: { onReset: () => void }) {
  const onBackup = () => {
    try {
      downloadText(`kopia-zapisu-${new Date().toISOString().slice(0, 10)}.json`, useScenarioStore.getState().exportRawBackup());
    } catch {
      // brak danych do skopiowania: nic nie robimy
    }
  };
  return (
    <div role="alert" className="rounded-card border border-danger bg-danger-soft p-4 text-danger">
      <p className="m-0 font-semibold">
        <Trans>Coś poszło nie tak</Trans>
      </p>
      <p className="mb-3 mt-1 text-fg">
        <Trans>
          Ta strona nie mogła się wyświetlić, najpewniej przez uszkodzony lub niespójny zapis planu. Możesz pobrać
          kopię danych albo zacząć od nowa.
        </Trans>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onBackup}>
          <Trans>Pobierz kopię danych</Trans>
        </Button>
        <Button onClick={onReset}>
          <Trans>Zacznij od nowa</Trans>
        </Button>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** Zmiana wartości (np. ścieżki) czyści błąd, więc przejście do innej strony próbuje ją wyrenderować. */
  resetKey?: string;
}

/** Granica błędów: błąd renderu pokazuje kartę z kopią i resetem zamiast białego ekranu. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  private reset = (): void => {
    useScenarioStore.getState().resetScenario();
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    return this.state.failed ? <Fallback onReset={this.reset} /> : this.props.children;
  }
}
