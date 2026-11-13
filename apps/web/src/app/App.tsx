import { I18nProvider } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { i18n } from '../i18n';
import { APP_NAME } from './appConfig';

export function App() {
  return (
    <I18nProvider i18n={i18n}>
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          <Trans>Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej</Trans>
        </p>
      </main>
    </I18nProvider>
  );
}
