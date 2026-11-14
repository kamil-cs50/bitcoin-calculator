import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Entry {
  id: string;
  str: string;
}

/** Minimalny parser PO (msgid/msgstr z kontynuacjami wierszy), wystarczający dla katalogów Lingui. */
function parsePo(file: string): Entry[] {
  const text = readFileSync(resolve(__dirname, 'locales', file), 'utf8');
  const unq = (s: string): string => JSON.parse(s) as string;
  const out: Entry[] = [];
  let id: string | null = null;
  let str: string | null = null;
  let cur: 'id' | 'str' | null = null;
  const flush = (): void => {
    if (id !== null && str !== null && id !== '') out.push({ id, str });
    id = null;
    str = null;
    cur = null;
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('msgid ')) {
      flush();
      id = unq(line.slice(6));
      cur = 'id';
    } else if (line.startsWith('msgstr ')) {
      str = unq(line.slice(7));
      cur = 'str';
    } else if (line.startsWith('"')) {
      if (cur === 'id') id += unq(line);
      else if (cur === 'str') str += unq(line);
    } else if (line.trim() === '') flush();
  }
  flush();
  return out;
}

/** Zmienne `{x}` i tagi `<0>` muszą się zgadzać między źródłem a tłumaczeniem. */
const tokens = (s: string): string[] => (s.match(/\{[^}\s,#]+|<\/?\d+>|<\d+\/>/g) ?? []).sort();

describe('katalog en.po (polski jest źródłem)', () => {
  const pl = parsePo('pl.po');
  const en = parsePo('en.po');

  it('ma wszystkie komunikaty ze źródła', () => {
    expect(en.map((e) => e.id).sort()).toEqual(pl.map((e) => e.id).sort());
  });

  it('nie ma pustych tłumaczeń (odpowiednik „lingui extract nie zgłasza braków”)', () => {
    const missing = en.filter((e) => e.str.trim() === '').map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('zachowuje zmienne i tagi', () => {
    const bad = en.filter((e) => e.str && tokens(e.str).join('|') !== tokens(e.id).join('|')).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('nie zostawia nieprzetłumaczonych polskich liter w tłumaczeniach', () => {
    // wyjątki: terminy podatkowe PL zostają w oryginale z glosą (np. „IKE (Individual Retirement Account)”)
    const kept = /danina solidarnościowa|Monitor Polski|ryczałt/g;
    const polish = en.filter((e) => /[ąćęłńóśźż]/i.test(e.str.replace(kept, ''))).map((e) => e.id);
    expect(polish).toEqual([]);
  });
});
