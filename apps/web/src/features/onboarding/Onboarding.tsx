import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Flap, splitAmount } from '../../components/ui/Flap';
import { formatMoney, formatMoneyShort } from '../../lib/format';
import { useScenarioStore } from '../../state/scenarioStore';
import { AssetPicker } from '../portfolio/PortfolioEditor';
import { useAssetNames } from '../portfolio/tiles';
import { currencyWord } from '../results/basis';

const MONTHS_PER_YEAR = 12;
const DONE_KEY = 'ui:onboarded';

/** Czy przewodnik startowy był już ukończony albo pominięty (zapamiętane na tym urządzeniu). */
export function readOnboarded(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}
export function writeOnboarded(v: boolean): void {
  try {
    if (v) localStorage.setItem(DONE_KEY, '1');
    else localStorage.removeItem(DONE_KEY);
  } catch {
    // bez localStorage przewodnik pokaże się znowu przy następnym wejściu
  }
}

/** Pasek kroków w stylu v3: trzy świecące odcinki z mono podpisami. */
function Stepper({ step, labels }: { step: 1 | 2 | 3; labels: [string, string, string] }) {
  return (
    <ol aria-hidden="true" className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
      {labels.map((l, i) => {
        const n = i + 1;
        const on = n <= step;
        return (
          <li key={l} className="flex flex-col gap-2.5">
            <span
              className={`h-[5px] rounded-full transition-[background,box-shadow] duration-500 ${
                on ? 'bg-accent-text shadow-[0_0_12px_rgba(61,107,255,0.85)]' : 'bg-soft'
              }`}
            />
            <span className={`eyebrow-sm ${n === step ? '!text-fg' : ''}`}>
              {String(n).padStart(2, '0')} · {l}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Duża kwota w klapkach z jednostką w kolorze akcentu (jak zegar na wyniku). */
function BigAmount({ text }: { text: string }) {
  const parts = splitAmount(text);
  if (!parts) return <span className="text-[clamp(48px,7vw,96px)] leading-none font-light">{text}</span>;
  return (
    <span aria-hidden="true" className="flex flex-wrap items-end gap-[clamp(10px,1.2vw,16px)]">
      <span className="flex text-[clamp(48px,7vw,96px)] leading-none font-light">
        <Flap text={parts[0]} />
      </span>
      <span className="text-[clamp(24px,3vw,40px)] leading-none font-light tracking-[-0.02em] text-accent-text">{parts[1]}</span>
    </span>
  );
}

/** Start w trzech krokach: (1) co masz, (2) plan, (3) wynik. Działa w całości bez sieci. */
export function Onboarding() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const names = useAssetNames();
  const scenario = useScenarioStore((s) => s.scenario);
  const setScenario = useScenarioStore((s) => s.setScenario);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formOpen, setFormOpen] = useState(false);
  const [years, setYears] = useState<number | null>(scenario.horizonMonths / MONTHS_PER_YEAR);
  // Pola startują od tego, co już jest w planie (np. z edytora planu), żeby powrót tu niczego nie kasował.
  const [monthly, setMonthly] = useState<number | null>(scenario.contribution?.monthly ?? null);
  const fixed = scenario.withdrawal?.kind === 'fixedReal' ? scenario.withdrawal : undefined;
  const [withdraw, setWithdraw] = useState<number | null>(fixed?.monthly ?? null);
  const [startYears, setStartYears] = useState<number | null>(fixed ? fixed.startMonth / MONTHS_PER_YEAR : null);
  const [goal, setGoal] = useState<number | null>(scenario.goal?.amountReal ?? null);

  const total = scenario.positions.reduce((a, p) => a + p.value, 0);
  const yearsOk = years !== null && Number.isInteger(years) && years >= 1 && years <= 60;

  const horizonNow = yearsOk && years !== null ? years * MONTHS_PER_YEAR : scenario.horizonMonths;
  const startMonth = Math.round((startYears ?? 0) * MONTHS_PER_YEAR);
  const withdrawOn = withdraw !== null && withdraw > 0;
  const startBad = withdrawOn && (startYears !== null && startYears < 0 ? true : startMonth >= horizonNow);
  /** Miesiąc „do końca horyzontu” podąża za nowym horyzontem; wcześniejszy zostaje (ucięty do horyzontu). */
  const follow = (month: number, oldHorizon: number, horizon: number): number =>
    month >= oldHorizon ? horizon : Math.min(month, horizon);

  function savePlan() {
    if (!yearsOk || years === null || startBad) return;
    const horizonMonths = years * MONTHS_PER_YEAR;
    const old = scenario.horizonMonths;
    const next = { ...scenario, horizonMonths };
    const c = scenario.contribution;
    if (monthly && monthly > 0) {
      next.contribution = {
        indexation: 'none',
        realGrowth: 0,
        ...c,
        monthly,
        endMonth: c ? follow(c.endMonth, old, horizonMonths) : horizonMonths,
      };
    } else delete next.contribution;
    if (withdrawOn) {
      next.withdrawal = { kind: 'fixedReal', startMonth, monthly: withdraw };
    } else if (scenario.withdrawal && scenario.withdrawal.kind !== 'fixedReal') {
      // procent / amortyzacja z edytora planu zostają; ich start nie może wypaść poza nowy horyzont
      const w = scenario.withdrawal;
      next.withdrawal = w.startMonth >= horizonMonths ? { ...w, startMonth: Math.max(0, horizonMonths - MONTHS_PER_YEAR) } : w;
    } else delete next.withdrawal;
    const g = scenario.goal;
    if (goal && goal > 0) next.goal = { amountReal: goal, month: g ? follow(g.month, old, horizonMonths) : horizonMonths };
    else delete next.goal;
    setScenario(next);
    setStep(3);
  }

  const finish = () => {
    writeOnboarded(true);
    void navigate('/wynik');
  };
  const skip = () => {
    writeOnboarded(true);
    void navigate('/portfel');
  };
  const panel = 'glass flex flex-col gap-5 rounded-card p-[clamp(20px,2.6vw,36px)]';
  const h2 = 'm-0 text-[clamp(22px,2.2vw,30px)] leading-tight font-light tracking-[-0.02em]';

  return (
    <div className="flex flex-col gap-[clamp(20px,2.4vw,28px)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow m-0" aria-live="polite">
          <Trans>Krok {step} z 3</Trans>
        </p>
        <button
          type="button"
          onClick={skip}
          className="eyebrow inline-flex min-h-11 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 hover:!text-fg"
        >
          <Trans>Pomiń przewodnik</Trans>
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <Stepper step={step} labels={[t`Co masz`, t`Plan`, t`Wynik`]} />

      {step === 1 && (
        <>
          <section aria-labelledby="ob-1" className={panel}>
            <h2 id="ob-1" className={h2}>
              {t`Co masz?`}
            </h2>
            <p className="m-0 max-w-[620px] text-[15px] leading-[1.55] font-light text-fg/75">
              <Trans>
                Wybierz aktywa i wpisz kwotę w złotych. Dane zostają na tym urządzeniu. Aplikacja nie pobiera
                żadnych cen, dopóki sam o to nie poprosisz.
              </Trans>
            </p>
            <AssetPicker onOpenChange={setFormOpen} />
          </section>
          {scenario.positions.length > 0 && (
            <section aria-labelledby="ob-pf" className={panel}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2 id="ob-pf" className="eyebrow m-0 font-normal">
                  {t`Twój portfel`}
                </h2>
                <BigAmount text={formatMoneyShort(total, scenario.baseCurrency)} />
              </div>
              <ul className="m-0 flex list-none flex-col p-0">
                {scenario.positions.map((p, i) => (
                  <li key={`${p.assetId}-${i}`} className="flex justify-between gap-2 border-t border-hairline py-3 text-[15px] font-light first:border-t-0">
                    <span>{names.asset(p.assetId)}</span>
                    <span className="num text-fg/80">{formatMoney(p.value, scenario.baseCurrency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Button disabled={scenario.positions.length === 0 || formOpen} onClick={() => setStep(2)}>
              <Trans>Dalej</Trans>
            </Button>
            {formOpen && (
              <p className="m-0 text-sm text-muted">
                <Trans>Dodaj otwartą pozycję albo kliknij „Anuluj”, żeby przejść dalej.</Trans>
              </p>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <section aria-labelledby="ob-2" className={panel}>
          <h2 id="ob-2" className={h2}>
            {t`Plan`}
          </h2>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <MoneyInput
              label={t`Horyzont (lata)`}
              suffix={t`lat`}
              value={years}
              onChange={setYears}
              error={years !== null && !yearsOk ? t`Podaj pełną liczbę lat od 1 do 60.` : null}
            />
            <MoneyInput
              label={t`Wpłata miesięczna`}
              suffix={currencyWord('PLN')}
              value={monthly}
              onChange={setMonthly}
              hint={t`Możesz zostawić puste, jeśli nie dopłacasz.`}
            />
            <MoneyInput
              label={t`Wypłata miesięczna (w dzisiejszych zł)`}
              suffix={currencyWord('PLN')}
              value={withdraw}
              onChange={setWithdraw}
              hint={t`Opcjonalnie. Domyślnie zaczyna się od razu; rok startu podasz poniżej.`}
            />
            {withdrawOn && (
              <MoneyInput
                label={t`Wypłacaj od roku`}
                suffix={t`lat`}
                value={startYears}
                onChange={setStartYears}
                hint={t`Za ile lat zaczynasz wypłaty. Puste albo 0 oznacza: od razu.`}
                error={startBad ? t`Wypłaty muszą zacząć się przed końcem horyzontu.` : null}
              />
            )}
            <MoneyInput
              label={t`Cel (w dzisiejszych zł)`}
              suffix={currencyWord('PLN')}
              value={goal}
              onChange={setGoal}
              hint={t`Opcjonalnie: kwota, którą chcesz mieć na końcu horyzontu.`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <Trans>Wstecz</Trans>
            </Button>
            <Button disabled={!yearsOk || startBad} onClick={savePlan}>
              <Trans>Dalej</Trans>
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="ob-3" className={panel}>
          <h2 id="ob-3" className={h2}>
            {t`Gotowe`}
          </h2>
          <p className="sr-only">
            <Trans>
              Portfel: {scenario.positions.length} poz., razem {formatMoney(total, scenario.baseCurrency)}.
              Horyzont: {scenario.horizonMonths / MONTHS_PER_YEAR} lat.
            </Trans>
          </p>
          <div aria-hidden="true" className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <span className="eyebrow">{t`Portfel · razem`}</span>
              <BigAmount text={formatMoneyShort(total, scenario.baseCurrency)} />
            </div>
            <div className="flex flex-col gap-3">
              <span className="eyebrow">{t`Horyzont`}</span>
              <BigAmount text={`${scenario.horizonMonths / MONTHS_PER_YEAR} ${t`lat`}`} />
            </div>
          </div>
          <p className="m-0 max-w-[620px] text-[15px] leading-[1.55] font-light text-fg/75">
            {t`Policzymy 10 000 możliwych przyszłości Twojego portfela: od najgorszych do najlepszych, realnie i po podatku.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              <Trans>Wstecz</Trans>
            </Button>
            <Button onClick={finish}>
              <Trans>Pokaż wynik</Trans>
              <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
