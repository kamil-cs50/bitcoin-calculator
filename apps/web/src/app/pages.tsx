import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Link } from 'react-router';
import { useScenarioStore } from '../state/scenarioStore';
import { Page } from '../components/Page';
import { Onboarding, readOnboarded, writeOnboarded } from '../features/onboarding/Onboarding';
import { PlanEditor } from '../features/plan/PlanEditor';
import { PortfolioEditor } from '../features/portfolio/PortfolioEditor';
import { APP_NAME } from './appConfig';

/**
 * Ekran startowy w stylu v3: duży napis, krótki opis i przewodnik w trzech krokach. Po ukończeniu
 * (albo pominięciu) przewodnika, gdy portfel nie jest pusty, pokazujemy „witaj ponownie” z przejściem do wyniku.
 */
export function HomePage() {
  const { t } = useLingui();
  const hasPositions = useScenarioStore((s) => s.scenario.positions.length > 0);
  const [guide, setGuide] = useState(() => !(readOnboarded() && hasPositions));
  return (
    <div className="flex flex-col gap-[clamp(28px,4vw,48px)]">
      <section className="flex flex-col gap-[clamp(16px,2vw,24px)] pt-[clamp(8px,3vw,40px)]">
        <p className="eyebrow m-0">{t`Symulator portfela · 10 000 przyszłości`}</p>
        <h1 className="m-0 text-[clamp(48px,8.6vw,132px)] leading-[0.95] font-light tracking-[-0.055em]">
          {APP_NAME}
        </h1>
        <p className="m-0 max-w-[640px] text-[clamp(17px,1.6vw,21px)] leading-[1.5] font-light text-pretty text-fg/80">
          <Trans>
            Sprawdź, jak mogą potoczyć się losy Twojego portfela w{' '}
            <span className="text-accent-text">10 000 możliwych przyszłości</span>: realnie, po podatku, z inflacją i
            ryzykiem.
          </Trans>
        </p>
        <ul className="eyebrow m-0 flex list-none flex-wrap gap-x-7 gap-y-2 p-0">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-[7px] rounded-full bg-[#7fa8ff] shadow-[0_0_12px_#4d7dff]" />
            {t`Dane zostają na tym urządzeniu`}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-[7px] rounded-full bg-[#7fa8ff] shadow-[0_0_12px_#4d7dff]" />
            {t`Działa bez sieci`}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-[7px] rounded-full bg-[#7fa8ff] shadow-[0_0_12px_#4d7dff]" />
            {t`Edukacyjnie, bez rekomendacji`}
          </li>
        </ul>
      </section>
      {guide ? (
        <Onboarding />
      ) : (
        <section aria-labelledby="home-back" className="glass flex flex-col gap-5 rounded-card p-[clamp(20px,2.6vw,36px)]">
          <h2 id="home-back" className="m-0 text-[clamp(22px,2.2vw,30px)] leading-tight font-light tracking-[-0.02em]">
            {t`Witaj ponownie`}
          </h2>
          <p className="m-0 text-[15px] font-light text-fg/75">{t`Twój portfel i plan są zapisane na tym urządzeniu.`}</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/wynik" className="btn-primary inline-flex min-h-12 items-center gap-3 rounded-full px-[22px] text-[15px] no-underline">
              {t`Zobacz wynik`}
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/portfel" className="inline-flex min-h-12 items-center rounded-full border border-border bg-field px-[22px] text-[15px] text-fg no-underline hover:bg-soft">
              {t`Portfel`}
            </Link>
            <button
              type="button"
              onClick={() => {
                writeOnboarded(false);
                setGuide(true);
              }}
              className="inline-flex min-h-12 cursor-pointer items-center rounded-full border border-transparent bg-transparent px-[22px] text-[15px] text-fg/75 hover:text-fg"
            >
              {t`Pokaż przewodnik od nowa`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
export function PortfolioPage() {
  return (
    <Page title={<Trans>Portfel</Trans>} hideTitle>
      <PortfolioEditor />
    </Page>
  );
}
export function PlanPage() {
  return <Page title={<Trans>Plan</Trans>}>
      <PlanEditor />
    </Page>;
}
export function NotFoundPage() {
  return (
    <Page title={<Trans>Nie ma takiej strony</Trans>}>
      <p>
        <Trans>Wybierz coś z menu na górze.</Trans>
      </p>
    </Page>
  );
}
