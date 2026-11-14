import type { RouteObject } from 'react-router';
import { Layout } from './Layout';
import {
  AssumptionsPage,
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
      { path: 'zalozenia', element: <AssumptionsPage /> },
      { path: 'ustawienia', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
