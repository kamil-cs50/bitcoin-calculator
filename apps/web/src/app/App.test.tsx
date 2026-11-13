import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { APP_NAME } from './appConfig';

describe('App', () => {
  it('pokazuje nazwę aplikacji i zastrzeżenie edukacyjne', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: APP_NAME })).toBeInTheDocument();
    expect(
      screen.getByText('Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej'),
    ).toBeInTheDocument();
  });
});
