import { citeLabel, referenceById } from './bibliography';

/** Cytowanie w tekście: „(Higham 2002)” z linkiem do pozycji w literaturze. */
export function Cite({ id }: { id: string }) {
  const ref = referenceById(id);
  if (!ref) throw new Error(`Nieznana pozycja literatury: ${id}`);
  return (
    <>
      (
      <a href={`#lit-${id}`} data-cite={id} className="underline">
        {citeLabel(ref)}
      </a>
      )
    </>
  );
}
