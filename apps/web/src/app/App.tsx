import { I18nProvider } from '@lingui/react';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { i18n } from '../i18n';
import { routes } from './routes';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>
  );
}
