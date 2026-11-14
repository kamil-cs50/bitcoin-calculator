import type { RouteObject } from 'react-router';
import { Layout } from './Layout';
import {
  HomePage,
  NotFoundPage,
  PlanPage,
  PortfolioPage,
} from './pages';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'portfel', element: <PortfolioPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'wynik', lazy: async () => ({ Component: (await import('./lazy/ResultPage')).ResultPage }) },
      { path: 'porownanie', lazy: async () => ({ Component: (await import('./lazy/ComparePage')).ComparePage }) },
      { path: 'zalozenia', lazy: async () => ({ Component: (await import('./lazy/AssumptionsPage')).AssumptionsPage }) },
      { path: 'ustawienia', lazy: async () => ({ Component: (await import('./lazy/SettingsPage')).SettingsPage }) },
      {
        // Strona z długim tekstem i KaTeX: osobny chunk, ładowany dopiero po wejściu na trasę.
        path: 'metodologia',
        lazy: async () => ({ Component: (await import('../features/methodology/Methodology')).Methodology }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
