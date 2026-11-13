import { describe, expect, it } from 'vitest';
import { ParamSchema, SourceSchema, DatasetSchema } from './schema';
import { loadDataset } from './load';

const source = {
  title: 'LTCMA 2027',
  publisher: 'J.P. Morgan',
  year: 2026,
  url: 'https://am.jpmorgan.com/',
  accessed: '2026-11-13',
};

describe('SourceSchema', () => {
  it('przyjmuje poprawne źródło', () => {
    expect(SourceSchema.parse(source)).toEqual(source);
  });
  it('odrzuca datę dostępu w formacie DD.MM.RRRR', () => {
    expect(() => SourceSchema.parse({ ...source, accessed: '13.11.2026' })).toThrow();
  });
  it('odrzuca nieistniejącą datę', () => {
    expect(() => SourceSchema.parse({ ...source, accessed: '2026-13-45' })).toThrow();
  });
});

describe('ParamSchema', () => {
  const base = { value: 1, kind: 'data', verified: 'yes', sources: [], note: '' } as const;

  it('odrzuca pustą listę źródeł dla kind != assumption', () => {
    expect(() => ParamSchema.parse(base)).toThrow();
    expect(() => ParamSchema.parse({ ...base, kind: 'forecast' })).toThrow();
  });
  it('przyjmuje pustą listę źródeł dla assumption', () => {
    expect(ParamSchema.parse({ ...base, kind: 'assumption', verified: 'no' }).value).toBe(1);
  });
  it('przyjmuje dane ze źródłem', () => {
    expect(ParamSchema.parse({ ...base, sources: [source] }).sources).toHaveLength(1);
  });
  it('odrzuca nieskończone i NaN', () => {
    expect(() => ParamSchema.parse({ ...base, kind: 'assumption', value: NaN })).toThrow();
  });
  it('wymaga range zawierającego value i uporządkowanego', () => {
    const a = { ...base, kind: 'assumption' } as const;
    expect(ParamSchema.parse({ ...a, range: [0, 2] }).range).toEqual([0, 2]);
    expect(() => ParamSchema.parse({ ...a, range: [2, 0] })).toThrow();
    expect(() => ParamSchema.parse({ ...a, range: [2, 3] })).toThrow();
  });
  it('odrzuca nieznane kind i verified', () => {
    expect(() => ParamSchema.parse({ ...base, kind: 'x', sources: [source] })).toThrow();
    expect(() => ParamSchema.parse({ ...base, verified: 'maybe', sources: [source] })).toThrow();
  });
});

describe('loadDataset', () => {
  it('odrzuca nieznaną wersję', () => {
    // @ts-expect-error wersja spoza unii
    expect(() => loadDataset('1999.01')).toThrow();
  });

  it('ładuje i waliduje zbiór 2026.11, a każdy Param ma metadane', () => {
    const ds = loadDataset('2026.11');
    expect(ds.version).toBe('2026.11');
    expect(DatasetSchema.safeParse(ds).success).toBe(true);
  });
});
