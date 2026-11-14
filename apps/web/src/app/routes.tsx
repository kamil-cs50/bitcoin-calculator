import type { RouteObject } from 'react-router';
import { Layout } from './Layout';
import {
  AssumptionsPage,
  ComparePage,
  HomePage,
  NotFoundPage,
  PlanPage,
  PortfolioPage,
  ResultPage,
  SettingsPage,
} from './pages';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'portfel', element: <PortfolioPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'wynik', element: <ResultPage /> },
      { path: 'porownanie', element: <ComparePage /> },
      { path: 'zalozenia', element: <AssumptionsPage /> },
      { path: 'ustawienia', element: <SettingsPage /> },
      {
        // Strona z długim tekstem i KaTeX: osobny chunk, ładowany dopiero po wejściu na trasę.
        path: 'metodologia',
        lazy: async () => ({ Component: (await import('../features/methodology/Methodology')).Methodology }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
