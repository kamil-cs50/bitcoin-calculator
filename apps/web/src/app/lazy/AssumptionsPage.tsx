import { Trans } from '@lingui/react/macro';
import { AssumptionsPanel } from '../../features/assumptions/AssumptionsPanel';
import { Page } from '../../components/Page';

export function AssumptionsPage() {
  return (
    <Page title={<Trans>Założenia i źródła</Trans>}>
      <AssumptionsPanel />
    </Page>
  );
}
