import { Trans } from '@lingui/react/macro';
import { Page } from '../components/Page';
import { Card } from '../components/ui/Card';
import { Onboarding } from '../features/onboarding/Onboarding';
import { PlanEditor } from '../features/plan/PlanEditor';
import { PortfolioEditor } from '../features/portfolio/PortfolioEditor';
import { APP_NAME } from './appConfig';

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
export function NotFoundPage() {
  return (
    <Page title={<Trans>Nie ma takiej strony</Trans>}>
      <p>
        <Trans>Wybierz coś z menu na górze.</Trans>
      </p>
    </Page>
  );
}
