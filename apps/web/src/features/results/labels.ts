const ANNUAL = ' (roczna)';

/**
 * Czytelna etykieta identyfikatora z kontroli modelu: „A”, „A~B” (korelacja pary) oraz „A~B (roczna)”.
 * Człony rozpoznajemy po liście znanych identyfikatorów, bo nazwa własna aktywa może zawierać „~”.
 * Nieznany identyfikator wraca bez zmian.
 */
export function labelCheckId(id: string, known: readonly string[], nameOf: (id: string) => string, annualWord: string): string {
  const annual = id.endsWith(ANNUAL);
  const core = annual ? id.slice(0, -ANNUAL.length) : id;
  const tokens = new Set([...known, 'cpi']);
  const isToken = (x: string): boolean => tokens.has(x) || /^fx:[A-Z]{3}$/.test(x);
  const suffix = annual ? ` ${annualWord}` : '';
  if (isToken(core)) return nameOf(core) + suffix;
  for (let i = core.indexOf('~'); i !== -1; i = core.indexOf('~', i + 1)) {
    const a = core.slice(0, i);
    const b = core.slice(i + 1);
    if (isToken(a) && isToken(b)) return `${nameOf(a)} ~ ${nameOf(b)}${suffix}`;
  }
  return id;
}
