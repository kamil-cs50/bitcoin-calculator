import { useLingui } from '@lingui/react/macro';
import type { RunResult, Scenario } from '@sim/engine';
import { summarize, wilson } from '@sim/engine';
import { useId, type ReactNode } from 'react';
import { Flap, splitAmount } from '../../components/ui/Flap';
import { Roll } from '../../components/ui/Roll';
import { formatMoneyShort, naturalFrequency, shortFrequency } from '../../lib/format';
import { currencyWord, useBasis } from './basis';
import { capitalize, yearsText } from './periods';
import { calendarYear } from './values';
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
  /** Dzisiejsza wartość portfela (suma pozycji): podstawa „×1,9 tego, co masz dziś” i „−80% względem dziś”. */
  today?: number;
  /** Oprawa obok opisu mediany (np. plakietka kalibracji modelu). */
  heroAside?: ReactNode;
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
function Dots({ p, thick = false }: { p: number; thick?: boolean }) {
  const on = Math.round(Math.min(1, Math.max(0, p)) * 10);
  return (
    <div aria-hidden="true" className={`flex ${thick ? 'gap-1.5' : 'gap-[5px]'}`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full transition-[background] duration-[400ms] ${thick ? 'h-1.5' : 'h-[5px]'} ${
            i < on ? 'bg-accent-text shadow-[0_0_10px_rgba(61,107,255,0.8)]' : 'bg-soft'
          }`}
        />
      ))}
    </div>
  );
}

/** Wiersz panelu wyniku: tytuł, wartość, opcjonalny ozdobnik i dopisek. Nazwany region (jak Card). */
function Row({
  title,
  value,
  spoken,
  bar,
  note,
  children,
}: {
  title: string;
  value?: string;
  /** Pełna treść wartości dla czytników ekranu (np. „W 3 na 10 przyszłości”), gdy widoczna jest krótka. */
  spoken?: string;
  bar?: ReactNode;
  note: string;
  children?: ReactNode;
}) {
  // pełna nazwa (z podstawą wartości) zostaje nazwą regionu; widoczny nagłówek jest krótki, jak w projekcie
  const short = title.replace(/ \([^)]*\)$/, '');
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-t border-hairline py-5 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="eyebrow-sm m-0 font-normal">{short}</h3>
        {value && (
          <span className="text-[clamp(22px,2vw,28px)] leading-none font-light tracking-[-0.03em] tabular-nums">
            {spoken && <span className="sr-only">{spoken}</span>}
            <span aria-hidden={spoken ? true : undefined}>
              <Roll text={value} />
            </span>
          </span>
        )}
      </div>
      {bar}
      {children}
      <p className="m-0 text-[12.5px] leading-[1.45] font-light text-balance text-muted">{note}</p>
    </section>
  );
}

/** Wynik główny: mediana w dużym zegarze oraz szklany panel z zakresem, szansą na cel i ryzykiem spadku. */
export function KpiHero({ stats, scenario, month, real, afterTax, today, heroAside }: KpiProps) {
  const { t } = useLingui();
  const { summary: s, deep } = stats;
  const cur = scenario.baseCurrency;
  const money = (v: number) => formatMoneyShort(v, cur);
  const years = yearsText(month);
  const year = calendarYear(scenario.startYear, scenario.startMonth, month);
  // mnożnik wyłącznie do wyświetlenia: mediana ÷ dzisiejsza wartość portfela
  const mult =
    today && today > 0 && Number.isFinite(s.median)
      ? new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 }).format(s.median / today)
      : null;
  const freq = (p: number) => ({ value: capitalize(shortFrequency(p)), spoken: capitalize(naturalFrequency(p)) });
  const b = useBasis(cur, real, afterTax);
  const unit = currencyWord(cur);
  // skala paska zakresu: od zera do nieco ponad 90. percentyla, mediana jako znacznik
  const top = Math.max(s.p90, s.median, 1) * 1.08;
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const width = `${Math.max(0, ((s.p90 - Math.max(0, s.p10)) / top) * 100)}%`;
  const median = money(s.median);
  const parts = splitAmount(median);

  return (
    <section className="flex flex-wrap items-stretch gap-[clamp(20px,2.4vw,28px)]">
      <div className="flex min-w-0 grow-[7] basis-[520px] flex-col justify-between gap-[clamp(24px,3vw,40px)] py-[clamp(12px,2vw,28px)]">
        <p className="eyebrow m-0">
          <span className="sr-only">{t`Typowy wynik za ${years} (${b.full})`}</span>
          <span aria-hidden="true">{t`Typowy wynik za ${years} · ${year}`}</span>
        </p>
        <div className="flex flex-wrap items-end gap-[clamp(12px,1.4vw,20px)]">
          {/* pełna wartość dla czytników ekranu i testów; zegar obok jest tylko oprawą */}
          <p className="m-0 flex flex-wrap items-end gap-[clamp(12px,1.4vw,20px)] leading-none">
            <span data-testid="kpi-median" className="sr-only">
              {median}
            </span>
            {parts ? (
              <>
                <span aria-hidden="true" className="flex text-[clamp(60px,8.6vw,138px)] leading-none font-light tracking-normal">
                  <Flap text={parts[0]} />
                </span>
                <span aria-hidden="true" className="text-[clamp(30px,3.6vw,54px)] leading-none font-light tracking-[-0.02em] text-accent-text">
                  {parts[1]}
                </span>
              </>
            ) : (
              <span aria-hidden="true" className="text-[clamp(60px,8.6vw,138px)] leading-none font-light">
                {median}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <p className="m-0 max-w-[440px] text-base leading-[1.55] font-light text-pretty text-fg/80">
            {mult ? t`Mediana: połowa przyszłości kończy się wyżej, połowa niżej. To ×${mult} tego, co masz dziś.` : t`Mediana: połowa przyszłości kończy się wyżej, połowa niżej`}
          </p>
          {heroAside}
        </div>
      </div>
      <div className="glass flex min-w-0 grow-[5] basis-[340px] flex-col justify-center rounded-card px-[clamp(20px,2.2vw,28px)] py-2">
        <Row
          title={t`Zakres wyników (${b.full})`}
          value={`${money(s.p10)} – ${money(s.p90)}`}
          note={t`W 8 na 10 przyszłości. Przedział od 10. do 90. percentyla.`}
          bar={
            <div aria-hidden="true" className="relative h-[5px] rounded-full bg-soft">
              <span
                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#2a55ff] to-[#9db9ff] shadow-[0_0_14px_#2a55ff] transition-[left,width] duration-300"
                style={{ left: pos(Math.max(0, s.p10)), width }}
              />
              <span className="absolute -top-1 h-[13px] w-0.5 rounded-sm bg-fg transition-[left] duration-300" style={{ left: pos(s.median) }} />
            </div>
          }
        >
          <p data-testid="kpi-range" className="sr-only">
            {t`W 8 na 10 przyszłości między ${money(s.p10)} a ${money(s.p90)}`}
          </p>
        </Row>
        {s.probGoal && scenario.goal && (
          <Row
            title={t`Szansa na cel`}
            {...freq(s.probGoal.p)}
            bar={<Dots p={s.probGoal.p} />}
            note={t`Cel: ${money(scenario.goal.amountReal)} w dzisiejszych ${unit} za ${yearsText(scenario.goal.month)}, ${b.tax} (±${halfPp(s.probGoal.ci)} pp)`}
          />
        )}
        <Row
          title={t`Ryzyko spadku o ponad 30%`}
          {...freq(deep.p)}
          bar={<Dots p={deep.p} />}
          note={capitalize(t`portfel traci ponad 30% od swojego szczytu (cały okres, ±${halfPp(deep.ci)} pp)`)}
        />
      </div>
    </section>
  );
}

/** Kafel wskaźnika: tytuł, duża wartość przy dole, opcjonalny ozdobnik i dopisek. Nazwany region. */
function Tile({ title, value, spoken, bar, note }: { title: string; value: string; spoken?: string; bar?: ReactNode; note: string }) {
  const id = useId();
  // pełna nazwa (z podstawą wartości) jest nazwą regionu; widoczny nagłówek krótki, jak w projekcie
  const short = title.replace(/ \([^)]*\)$/, '');
  // długie opisy częstości („W mniej niż 1 na 100 przyszłości”) dostają mniejszy krój, krótkie wartości duży
  const size = value.length > 14 ? 'small' : 'big';
  return (
    <section
      aria-label={title}
      className="glass flex min-h-[190px] flex-col gap-3.5 rounded-tile px-[22px] pb-6 pt-[22px]"
    >
      <h3 id={id} className="eyebrow-sm m-0 max-w-[80%] font-normal text-pretty">
        {short}
      </h3>
      <p
        className={`m-0 mt-auto max-w-full overflow-hidden leading-none font-light tracking-[-0.045em] tabular-nums ${
          size === 'big' ? 'text-[clamp(38px,3.8vw,52px)]' : 'text-[clamp(22px,2.3vw,32px)]'
        }`}
      >
        {spoken && <span className="sr-only">{spoken}</span>}
        <span aria-hidden={spoken ? true : undefined}>
          <Roll text={value} />
        </span>
      </p>
      {bar}
      <p className="m-0 text-[13.5px] leading-[1.45] font-light text-pretty text-fg/70">{note}</p>
    </section>
  );
}

/** Pozostałe wskaźniki w równych kafelkach (typowy wynik jest już w panelu wyniku). */
export function KpiTiles({ stats, scenario, real, afterTax, expert, today }: KpiProps) {
  const { t } = useLingui();
  const { summary: s } = stats;
  const cur = scenario.baseCurrency;
  const money = (v: number) => formatMoneyShort(v, cur);
  const freq = (p: number) => ({ value: capitalize(shortFrequency(p)), spoken: capitalize(naturalFrequency(p)) });
  // „−80% względem dziś”: tylko opis, liczony z wartości już policzonych przez silnik
  const vsToday = (v: number): string | null => {
    if (!today || !(today > 0) || !Number.isFinite(v)) return null;
    const d = Math.round((v / today - 1) * 100);
    const sign = d >= 0 ? '+' : '−';
    const abs = Math.abs(d);
    return t`${sign}${abs}% względem dziś`;
  };
  const withVs = (note: string, v: number): string => {
    const vs = vsToday(v);
    return vs ? `${note} · ${vs}` : note;
  };
  const b = useBasis(cur, real, afterTax);
  const basis = b.full;
  const lossPp = halfPp(s.probRealLoss.ci);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[clamp(20px,2.4vw,28px)]">
      <Tile title={t`Najgorsze 5% przyszłości: średnio (${basis})`} value={money(s.cvar5)} note={withVs(t`Średnia w najgorszych 5 na 100 przyszłości`, s.cvar5)} />
      <Tile
        title={t`Szansa straty realnej (${b.tax})`}
        {...freq(s.probRealLoss.p)}
        bar={<Dots p={s.probRealLoss.p} thick />}
        note={capitalize(t`wartość portfela niższa niż dziś po uwzględnieniu inflacji (±${lossPp} pp)`)}
      />
      {scenario.withdrawal && s.probRuin.p > 0 && (
        <Tile
          title={t`Szansa wyczerpania portfela`}
          {...freq(s.probRuin.p)}
          bar={<Dots p={s.probRuin.p} thick />}
          note={t`pieniądze kończą się przed wybranym rokiem`}
        />
      )}
      {expert && (
        <Tile
          title={t`Średnia (tryb eksperta)`}
          value={money(s.mean)}
          note={t`Średnia jest zawyżana przez rzadkie, skrajnie dobre scenariusze, dlatego jako typowy wynik pokazujemy medianę.`}
        />
      )}
    </div>
  );
}
