import { Trans } from '@lingui/react/macro';
import { Compare } from '../../features/compare/Compare';
import { Page } from '../../components/Page';

export function ComparePage() {
  return (
    <Page title={<Trans>Porównanie</Trans>}>
      <Compare />
    </Page>
  );
}
