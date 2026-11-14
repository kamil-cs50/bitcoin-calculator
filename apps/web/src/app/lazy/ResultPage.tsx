import { Trans } from '@lingui/react/macro';
import { Dashboard } from '../../features/results/Dashboard';
import { Page } from '../../components/Page';

export function ResultPage() {
  return (
    <Page title={<Trans>Wynik</Trans>}>
      <Dashboard />
    </Page>
  );
}
