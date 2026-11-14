import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Card } from '../components/ui/Card';
import { AssumptionsPanel } from '../features/assumptions/AssumptionsPanel';
import { Dashboard } from '../features/results/Dashboard';
import { Onboarding } from '../features/onboarding/Onboarding';
import { PlanEditor } from '../features/plan/PlanEditor';
import { PortfolioEditor } from '../features/portfolio/PortfolioEditor';
import { APP_NAME } from './appConfig';

function Page({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

// Szkielety stron; treść dochodzi w kolejnych zadaniach (30+).
export function HomePage() {
  return (
    <Page title={APP_NAME}>
      <Card>
        <p>
          <Trans>Sprawdź, jak mogą potoczyć się losy Twojego portfela w 10 000 możliwych przyszłości.</Trans>
        </p>
      </Card>
      <Onboarding />
    </Page>
  );
}
export function PortfolioPage() {
  return (
    <Page title={<Trans>Portfel</Trans>}>
      <PortfolioEditor />
    </Page>
  );
}
export function PlanPage() {
  return <Page title={<Trans>Plan</Trans>}>
      <PlanEditor />
    </Page>;
}
export function ResultPage() {
  return <Page title={<Trans>Wynik</Trans>}>
      <Dashboard />
    </Page>;
}
export function AssumptionsPage() {
  return <Page title={<Trans>Założenia i źródła</Trans>}><AssumptionsPanel /></Page>;
}
export function SettingsPage() {
  return <Page title={<Trans>Ustawienia</Trans>}>{null}</Page>;
}
export function NotFoundPage() {
  return (
    <Page title={<Trans>Nie ma takiej strony</Trans>}>
      <p>
        <Trans>Wybierz coś z menu na górze.</Trans>
      </p>
    </Page>
  );
}
