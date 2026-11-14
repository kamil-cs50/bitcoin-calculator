import { Trans } from '@lingui/react/macro';
import { Settings } from '../../features/settings/Settings';
import { Page } from '../../components/Page';

export function SettingsPage() {
  return (
    <Page title={<Trans>Ustawienia</Trans>}>
      <Settings />
    </Page>
  );
}
