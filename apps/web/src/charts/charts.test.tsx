import { I18nProvider } from '@lingui/react';
import { fanChart, histogram, runBatch } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { formatMoney } from '../lib/format';
import { DataTable } from './DataTable';
import { FanChart } from './FanChart';
import { Histogram } from './Histogram';

const scenario = makeScenario({ horizonMonths: 120 });
const result = runBatch(scenario, { seed: 3, paths: 1000 });
const fmt = (v: number) => formatMoney(v, 'PLN', { sigDigits: 2 });
const wrap = (ui: React.ReactNode) => render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
const nb = (s: string | null) => (s ?? '').replace(/[\s\u00a0\u202f]/g, ' ');

describe('DataTable', () => {
  it('renderuje tabelę z podpisem, nagłówkami kolumn i wierszy', () => {
    wrap(<DataTable caption="Dane" columns={['A', 'B']} rows={[{ label: 'x', cells: ['1', '2'] }]} />);
    const table = screen.getByRole('table', { name: 'Dane' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getByRole('rowheader', { name: 'x' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '2' })).toBeInTheDocument();
  });
});

describe('FanChart', () => {
  const fan = fanChart(result, { real: true, afterTax: true });
  const G = fan.months.length;
  const j = Array.from(fan.months).indexOf(60);

  it('rysuje 7 pasm (percentyle 5/10/25/50/75/90/95) i jest opisany dla czytnika ekranu', () => {
    wrap(<FanChart fan={fan} month={60} formatValue={fmt} label="Wachlarz wartości portfela" />);
    const svg = screen.getByRole('img', { name: /Wachlarz wartości portfela/ });
    expect(svg.querySelectorAll('[data-level]')).toHaveLength(7);
    expect(svg.querySelectorAll('[data-area]').length).toBeGreaterThanOrEqual(3);
  });

  it('podpowiedź w częstościach naturalnych dla wybranego roku', () => {
    wrap(<FanChart fan={fan} month={60} formatValue={fmt} label="Wachlarz" />);
    const tip = screen.getByTestId('fan-readout');
    expect(nb(tip.textContent)).toContain(`w 9 na 10 przyszłości więcej niż ${nb(fmt(fan.values[1 * G + j]!))}`);
    expect(nb(tip.textContent)).toContain(`w 5 na 10 przyszłości więcej niż ${nb(fmt(fan.values[3 * G + j]!))}`);
    expect(nb(tip.textContent)).toContain(`w 1 na 10 przyszłości więcej niż ${nb(fmt(fan.values[5 * G + j]!))}`);
  });

  it('DataTable daje te same liczby co wykres (alternatywa dla czytników ekranu)', () => {
    wrap(<FanChart fan={fan} month={60} formatValue={fmt} label="Wachlarz" />);
    const table = screen.getByRole('table', { name: /Wachlarz/ });
    const row = within(table).getByRole('row', { name: /^Rok 5\b/ });
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(Array.from({ length: 7 }, (_, l) => fmt(fan.values[l * G + j]!)));
    expect(within(table).getAllByRole('row')).toHaveLength(G + 1);
  });
});

describe('Histogram', () => {
  const values = Array.from(result.wealth.subarray(0, 1000));
  it('rysuje słupki, a tabela ma te same liczności', () => {
    wrap(<Histogram values={values} bins={20} formatValue={fmt} label="Rozkład wartości końcowej" />);
    const svg = screen.getByRole('img', { name: /Rozkład wartości końcowej/ });
    expect(svg.querySelectorAll('[data-bar]')).toHaveLength(20);
    const table = screen.getByRole('table', { name: /Rozkład wartości końcowej/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(20);
    const total = rows.reduce((s, r) => s + Number(within(r).getAllByRole('cell').at(-1)!.textContent), 0);
    expect(total).toBe(histogram(values, 20).counts.reduce((a, b) => a + b, 0));
  });
});
