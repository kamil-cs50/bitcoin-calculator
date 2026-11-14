import { useLingui } from '@lingui/react/macro';
import type { RunResult, Scenario } from '@sim/engine';
import { summarize, wilson } from '@sim/engine';
import { useId, type ReactNode } from 'react';
import { Card } from '../../components/ui/Card';
import { formatMoney, naturalFrequency } from '../../lib/format';
import { currencyWord, useBasis } from './basis';
import { capitalize, yearsText } from './periods';
import { numberLocale } from '../../i18n';

export type KpiSummary = ReturnType<typeof summarize>;

/** Wskaźniki liczone raz na wynik symulacji i współdzielone przez część „wynik” i kafelki. */
export interface KpiStats {
  summary: KpiSummary;
  /** Udział przyszłości ze spadkiem o ponad 30% od szczytu (cały okres) z przedziałem Wilsona. */
  deep: { p: number; ci: [number, number] };
}

export interface KpiProps {
  stats: KpiStats;
  scenario: Scenario;
  month: number;
  real: boolean;
  afterTax: boolean;
  expert: boolean;
}

export function computeKpiStats(result: RunResult, scenario: Scenario, month: number, real: boolean, afterTax: boolean): KpiStats {
  const summary = summarize(result, scenario, { month, real, afterTax });
  // ryzyko dużego spadku dotyczy całego okresu (maksymalne obsunięcie), niezależnie od wybranego roku
  let k = 0;
  for (let p = 0; p < result.paths; p++) if (result.maxDrawdown[p]! > 0.3) k++;
  return { summary, deep: { p: result.paths > 0 ? k / result.paths : 0, ci: wilson(k, result.paths) } };
}

const halfPp = (ci: [number, number]): string =>
  new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 }).format(((ci[1] - ci[0]) / 2) * 100);

/** Dziesięć kropek: część wypełniona odpowiada częstości (ozdoba, prawdziwa liczba jest w tekście). */
function Dots({ p }: { p: number }) {
  const on = Math.round(Math.min(1, Math.max(0, p)) * 10);
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < on ? 'bg-accent fv-shimmer shadow-[0_0_10px_var(--chart-band)]' : 'bg-surface-2'}`}
        />
      ))}
    </div>
  );
}

/** Wiersz panelu wyniku: tytuł, wartość, opcjonalny ozdobnik i dopisek. Nazwany region (jak Card). */
function Row({ title, value, bar, note, children }: { title: string; value?: string; bar?: ReactNode; note: string; children?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={id} className="m-0 text-sm font-medium text-muted">
          {title}
        </h3>
        {value && <span className="text-2xl font-light tabular-nums">{value}</span>}
      </div>
      {bar}
      {children}
      <p className="m-0 text-sm text-muted">{note}</p>
    </section>
  );
}

/** Wynik główny: mediana w dużym zegarze oraz szklany panel z zakresem, szansą na cel i ryzykiem spadku. */
export function KpiHero({ stats, scenario, month, real, afterTax }: KpiProps) {
  const { t } = useLingui();
  const { summary: s, deep } = stats;
  const cur = scenario.baseCurrency;
  const money = (v: number) => formatMoney(v, cur, { sigDigits: 2 });
  const years = yearsText(month);
  const b = useBasis(cur, real, afterTax);
  const unit = currencyWord(cur);
  // skala paska zakresu: od zera do nieco ponad 90. percentyla, mediana jako znacznik
  const top = Math.max(s.p90, s.median, 1) * 1.08;
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const width = `${Math.max(0, ((s.p90 - Math.max(0, s.p10)) / top) * 100)}%`;

  return (
    <section className="grid gap-4 lg:grid-cols-[7fr_5fr] lg:items-stretch">
      <div className="flex flex-col justify-between gap-8 p-1 sm:p-4">
        <p className="m-0 font-mono text-xs uppercase tracking-[0.06em] text-muted">{t`Typowy wynik za ${years} (${b.full})`}</p>
        <div className="flex flex-col gap-4">
          <p data-testid="kpi-median" className="m-0 text-[clamp(3rem,8vw,6.5rem)] leading-none font-light tabular-nums">
            {money(s.median)}
          </p>
          <p className="m-0 max-w-md text-base text-muted">{t`Mediana: połowa przyszłości kończy się wyżej, połowa niżej`}</p>
        </div>
      </div>
      <div className="glass flex flex-col rounded-card px-5 py-2 sm:px-7">
        <Row
          title={t`Zakres wyników (${b.full})`}
          note={t`Przedział od 10. do 90. percentyla`}
          bar={
            <div aria-hidden="true" className="relative h-1.5 rounded-full bg-surface-2">
              <span
                className="fv-shimmer absolute inset-y-0 rounded-full bg-linear-to-r from-accent to-chart-band shadow-[0_0_14px_var(--accent)]"
                style={{ left: pos(Math.max(0, s.p10)), width }}
              />
              <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-fg" style={{ left: pos(s.median) }} />
            </div>
          }
        >
          <p data-testid="kpi-range" className="m-0 text-base font-medium tabular-nums">
            {t`W 8 na 10 przyszłości między ${money(s.p10)} a ${money(s.p90)}`}
          </p>
        </Row>
        {s.probGoal && scenario.goal && (
          <Row
            title={t`Szansa na cel`}
            value={capitalize(naturalFrequency(s.probGoal.p))}
            bar={<Dots p={s.probGoal.p} />}
            note={t`Cel: ${money(scenario.goal.amountReal)} w dzisiejszych ${unit} za ${yearsText(scenario.goal.month)}, ${b.tax} (±${halfPp(s.probGoal.ci)} pp)`}
          />
        )}
        <Row
          title={t`Ryzyko spadku o ponad 30%`}
          value={capitalize(naturalFrequency(deep.p))}
          bar={<Dots p={deep.p} />}
          note={t`portfel traci ponad 30% od swojego szczytu (cały okres, ±${halfPp(deep.ci)} pp)`}
        />
      </div>
    </section>
  );
}

/** Pozostałe wskaźniki w równych kafelkach (typowy wynik jest już w panelu wyniku). */
export function KpiTiles({ stats, scenario, real, afterTax, expert }: KpiProps) {
  const { t } = useLingui();
  const { summary: s } = stats;
  const cur = scenario.baseCurrency;
  const money = (v: number) => formatMoney(v, cur, { sigDigits: 2 });
  const b = useBasis(cur, real, afterTax);
  const basis = b.full;
  const lossPp = halfPp(s.probRealLoss.ci);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card title={t`Najgorsze 5% przyszłości: średnio (${basis})`} className="h-full">
        <p className="m-0 text-3xl font-light tabular-nums">{money(s.cvar5)}</p>
        <p className="m-0 mt-2 text-sm text-muted">{t`Średnia wartość w najgorszych 5 na 100 przyszłości`}</p>
      </Card>
      <Card title={t`Szansa straty realnej (${b.tax})`} className="h-full">
        <p className="m-0 text-3xl font-light tabular-nums">{capitalize(naturalFrequency(s.probRealLoss.p))}</p>
        <p className="m-0 mt-2 text-sm text-muted">{t`wartość portfela niższa niż dziś po uwzględnieniu inflacji (±${lossPp} pp)`}</p>
      </Card>
      {scenario.withdrawal && s.probRuin.p > 0 && (
        <Card title={t`Szansa wyczerpania portfela`} className="h-full">
          <p className="m-0 text-3xl font-light tabular-nums">{capitalize(naturalFrequency(s.probRuin.p))}</p>
          <p className="m-0 mt-2 text-sm text-muted">{t`pieniądze kończą się przed wybranym rokiem`}</p>
        </Card>
      )}
      {expert && (
        <Card title={t`Średnia (tryb eksperta)`} className="h-full">
          <p className="m-0 text-3xl font-light tabular-nums">{money(s.mean)}</p>
          <p className="m-0 mt-2 text-sm text-muted">
            {t`Średnia jest zawyżana przez rzadkie, skrajnie dobre scenariusze, dlatego jako typowy wynik pokazujemy medianę.`}
          </p>
        </Card>
      )}
    </div>
  );
}
