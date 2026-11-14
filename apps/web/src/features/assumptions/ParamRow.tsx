import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { Param } from '@sim/data';
import { useState } from 'react';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DecimalInput } from '../../components/ui/numberInput';
import { i18n, numberLocale } from '../../i18n';
import { DATASET_NOTES } from './datasetNotes';
import { currencyWord } from '../results/basis';

export type ParamUnit = 'percent' | 'number' | 'years' | 'pln';

/** Opis jednego wiersza panelu: parametr zbioru danych + bieżąca wartość w scenariuszu. */
export interface RowSpec {
  key: string;
  label: string;
  param: Param;
  /** Bieżąca wartość w scenariuszu (jednostki modelu, np. ułamek dla procentów). */
  value: number;
  unit: ParamUnit;
  min?: number;
  max?: number;
  /** Zapis nowej, poprawnej wartości do scenariusza. */
  set: (v: number) => void;
}

const suffixOf = (unit: ParamUnit): string | undefined =>
  ({ percent: '%', number: undefined, years: t`lat`, pln: currencyWord('PLN') })[unit];
/** Notatka parametru ze zbioru danych (po polsku) w bieżącym języku; nieznana notatka zostaje w oryginale. */
export const noteText = (note: string): string => {
  const d = DATASET_NOTES[note];
  return d ? i18n._(d) : note;
};
const EPS = 1e-9;

export const isChanged = (value: number, param: Param): boolean => Math.abs(value - param.value) > EPS;

const fmt = (v: number, unit: ParamUnit): string =>
  new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 4 }).format(unit === 'percent' ? v * 100 : v) +
  (unit === 'percent' ? '%' : '');

/** Etykiety rodzaju i statusu weryfikacji parametru (✅/◐/❌ tekstem, nie tylko kolorem). */
function useParamLabels(): { kind: Record<Param['kind'], string>; verified: Record<Param['verified'], { text: string; tone: BadgeTone }> } {
  const { t } = useLingui();
  return {
    kind: { data: t`dane`, forecast: t`prognoza instytucji`, assumption: t`założenie` },
    verified: {
      yes: { text: t`✅ zweryfikowane`, tone: 'ok' },
      secondary: { text: t`◐ źródło wtórne`, tone: 'warning' },
      no: { text: t`❌ niezweryfikowane`, tone: 'danger' },
    },
  };
}

/** Źródła parametru (linki z datą dostępu) albo informacja o ich braku. */
function Sources({ param }: { param: Param }) {
  const { t } = useLingui();
  return param.sources.length > 0 ? (
    <ul aria-label={t`Źródła`} className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
      {param.sources.map((s) => (
        <li key={s.url + s.title}>
          {/^https?:\/\//.test(s.url) ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
              {s.title}
            </a>
          ) : (
            <span>{s.title}</span>
          )}{' '}
          <span className="text-muted">
            {s.publisher}, {s.year} · {t`dostęp: ${s.accessed}`}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="m-0 text-sm text-muted">{t`brak źródła: wartość jest założeniem lub oczekuje na kalibrację`}</p>
  );
}

/** Wiersz tylko do odczytu (np. przepisy podatkowe i limity zaszyte w silniku): wartość, status, źródła. */
export function ReadOnlyParamRow({ label, valueText, param }: { label: string; valueText: string; param: Param }) {
  const labels = useParamLabels();
  const v = labels.verified[param.verified];
  return (
    <li className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="m-0 font-medium">
        {label}: <span className="tabular-nums">{valueText}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{labels.kind[param.kind]}</Badge>
        <Badge tone={v.tone}>{v.text}</Badge>
      </div>
      {param.note && <p className="m-0 text-sm text-muted">{noteText(param.note)}</p>}
      <Sources param={param} />
    </li>
  );
}

/** Wiersz parametru: wartość do edycji, rodzaj, status weryfikacji (tekstem), źródła, „przywróć domyślne”. */
export function ParamRow({ spec }: { spec: RowSpec }) {
  const { t } = useLingui();
  const { param, value, unit, min, max } = spec;
  const [draft, setDraft] = useState<number | null>(value);
  const [seen, setSeen] = useState(value);
  // Zewnętrzna zmiana (przywrócenie, podmiana zestawu BTC) nadpisuje szkic; własny wpis nie.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  const changed = isChanged(value, param);
  const outOfRange = draft !== null && ((min !== undefined && draft < min) || (max !== undefined && draft > max));
  const rangeText =
    min !== undefined && max !== undefined
      ? t`Dozwolony zakres: od ${fmt(min, unit)} do ${fmt(max, unit)}.`
      : min !== undefined
        ? t`Wartość nie może być mniejsza niż ${fmt(min, unit)}.`
        : max !== undefined
          ? t`Wartość nie może być większa niż ${fmt(max, unit)}.`
          : null;
  const error = outOfRange ? rangeText : null;

  const labels = useParamLabels();
  const kind = labels.kind;
  const v = labels.verified[param.verified];

  const onChange = (next: number | null): void => {
    setDraft(next);
    if (next === null) return;
    if ((min !== undefined && next < min) || (max !== undefined && next > max)) return;
    spec.set(next);
  };
  const reset = (): void => {
    setDraft(param.value);
    spec.set(param.value);
  };

  return (
    <li className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <DecimalInput
        label={spec.label}
        value={draft}
        onChange={onChange}
        scale={unit === 'percent' ? 100 : 1}
        suffix={suffixOf(unit)}
        error={error}
        allowNegative={min === undefined || min < 0}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{kind[param.kind]}</Badge>
        <Badge tone={v.tone}>{v.text}</Badge>
        {changed && <Badge tone="accent">{t`zmienione przez Ciebie`}</Badge>}
        {(changed || draft !== value) && (
          <Button variant="ghost" onClick={reset} aria-label={t`Przywróć domyślne: ${spec.label}`}>
            {t`Przywróć domyślne`} ({fmt(param.value, unit)})
          </Button>
        )}
      </div>
      {param.range && (
        <p className="m-0 text-sm text-muted">
          {t`Zakres w źródłach: ${fmt(param.range[0], unit)} – ${fmt(param.range[1], unit)}`}
        </p>
      )}
      {param.note && <p className="m-0 text-sm text-muted">{noteText(param.note)}</p>}
      <Sources param={param} />
    </li>
  );
}
