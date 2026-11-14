import { describe, expect, it } from 'vitest';
import { labelCheckId } from './labels';

const known = ['btcBase', 'custom:a~b', 'custom:x'];
const nameOf = (id: string) => (id === 'custom:a~b' ? 'a~b' : id === 'btcBase' ? 'Bitcoin' : id === 'cpi' ? 'Inflacja' : id);
const f = (id: string) => labelCheckId(id, known, nameOf, '(roczna)');

describe('labelCheckId', () => {
  it('pojedyncze aktywo i para z czynnikiem', () => {
    expect(f('btcBase')).toBe('Bitcoin');
    expect(f('btcBase~cpi')).toBe('Bitcoin ~ Inflacja');
  });
  it('nazwa własna z tyldą nie rozpada się na dwie części', () => {
    expect(f('custom:a~b')).toBe('a~b');
    expect(f('custom:a~b~cpi')).toBe('a~b ~ Inflacja');
    expect(f('btcBase~custom:a~b')).toBe('Bitcoin ~ a~b');
  });
  it('końcówka „ (roczna)” jest zachowana i tłumaczona', () => {
    expect(f('btcBase~cpi (roczna)')).toBe('Bitcoin ~ Inflacja (roczna)');
  });
  it('nieznany identyfikator wraca jako całość', () => {
    expect(f('coś~innego')).toBe('coś~innego');
  });
});
