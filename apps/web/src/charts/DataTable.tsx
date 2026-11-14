export interface DataTableRow {
  label: string;
  cells: string[];
}

export interface DataTableProps {
  caption: string;
  columns: string[];
  rows: DataTableRow[];
  /** Nagłówek kolumny z etykietami wierszy. */
  cornerLabel?: string;
}

/** Tabela z tymi samymi liczbami co wykres: alternatywa dla czytników ekranu (WCAG 2.2 AA). */
export function DataTable({ caption, columns, rows, cornerLabel = '' }: DataTableProps) {
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              {cornerLabel}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-right font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <th scope="row" className="px-3 py-1.5 text-left font-normal">
                {r.label}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-1.5 text-right">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
