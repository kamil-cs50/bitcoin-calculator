import { useLingui } from '@lingui/react/macro';
import type { ModelCheckRow } from '@sim/engine';
import { DataTable } from '../../charts/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { formatPercent } from '../../lib/format';

export interface ModelCheckPanelProps {
  rows: ModelCheckRow[];
  /** Czytelna nazwa identyfikatora wiersza (np. „btcBase~cpi”); domyślnie surowy identyfikator. */
  labelOf?: (id: string) => string;
}

/** „Kontrola modelu”: wejście kontra symulacja; plakietka „skalibrowany” tylko, gdy wszystkie wiersze zgodne. */
export function ModelCheckPanel({ rows, labelOf = (id) => id }: ModelCheckPanelProps) {
  const { t } = useLingui();
  const metric: Record<ModelCheckRow['metric'], string> = {
    meanLog: t`Średni zwrot roczny (log)`,
    vol: t`Zmienność roczna`,
    corr: t`Korelacja`,
    inflationSd: t`Zmienność inflacji r/r`,
    crisisShare: t`Udział miesięcy kryzysowych`,
  };
  const num = (r: ModelCheckRow, v: number) =>
    r.metric === 'corr' ? new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : formatPercent(v, 1);
  const bad = rows.filter((r) => !r.ok).length;
  return (
    <Card
      title={t`Kontrola modelu`}
      aside={bad === 0 ? <Badge tone="ok">{t`model skalibrowany ✓`}</Badge> : <Badge tone="warning">{t`${bad} z ${rows.length} pozycji odbiega od wejścia`}</Badge>}
    >
      <p className="mb-3 mt-0 text-sm text-muted">
        {t`Osobny przebieg samego rynku sprawdza, czy symulacja odtwarza założone zwroty, zmienności i korelacje.`}
      </p>
      <DataTable
        caption={t`Kontrola modelu: wejście a symulacja`}
        cornerLabel={t`Co sprawdzamy`}
        columns={[t`Miara`, t`Wejście`, t`Symulacja`, t`Zgodność`]}
        rows={rows.map((r) => ({
          label: labelOf(r.id),
          cells: [metric[r.metric], num(r, r.input), num(r, r.simulated), r.ok ? t`zgodne ✓` : t`odbiega ✗`],
        }))}
      />
    </Card>
  );
}
