/**
 * Stacjonarny bootstrap blokowy (Politis i Romano 1994, JASA 89(428)).
 * Bloki zaczynają się w losowym miejscu szeregu i biegną cyklicznie; po każdym elemencie blok kończy się
 * z prawdopodobieństwem p = 1/meanBlock, więc długości bloków mają rozkład geometryczny o średniej meanBlock,
 * a wynikowy szereg jest stacjonarny. Biblioteka nie zawiera danych: UI może jej używać wyłącznie na
 * szeregach wgranych przez użytkownika (spec 6.5, bez dołączania szeregów stron trzecich).
 */
export interface BootstrapDraw {
  /** Indeksy w szeregu źródłowym, długość `length`. */
  indices: Int32Array;
  /** 1 na pozycjach, w których zaczyna się nowy blok (pozycja 0 zawsze). */
  blockStart: Uint8Array;
}

/**
 * @param n          długość szeregu źródłowego (>= 1)
 * @param length     długość wynikowa (>= 0)
 * @param meanBlock  średnia długość bloku (>= 1; 1 = klasyczny bootstrap i.i.d.)
 * @param uniform    generator U[0,1)
 */
export function stationaryBootstrap(n: number, length: number, meanBlock: number, uniform: () => number): BootstrapDraw {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('stationaryBootstrap: n musi być liczbą całkowitą >= 1');
  if (!Number.isInteger(length) || length < 0) throw new RangeError('stationaryBootstrap: length musi być liczbą całkowitą >= 0');
  if (!(meanBlock >= 1) || !Number.isFinite(meanBlock)) throw new RangeError('stationaryBootstrap: meanBlock musi być >= 1');
  const p = 1 / meanBlock;
  const indices = new Int32Array(length);
  const blockStart = new Uint8Array(length);
  let cur = 0;
  for (let i = 0; i < length; i++) {
    if (i === 0 || uniform() < p) {
      cur = Math.floor(uniform() * n);
      blockStart[i] = 1;
    } else {
      cur = cur + 1 === n ? 0 : cur + 1;
    }
    indices[i] = cur;
  }
  return { indices, blockStart };
}

/** Wartości szeregu pod wylosowanymi indeksami. */
export function resample(series: ArrayLike<number>, indices: ArrayLike<number>): Float64Array {
  const out = new Float64Array(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = series[indices[i]!]!;
  return out;
}

/** Wiersze (np. miesiąc × aktywo) pod wylosowanymi indeksami; wiersz zostaje nienaruszony, więc korelacje między aktywami się zachowują. */
export function resampleRows<T>(rows: readonly T[], indices: ArrayLike<number>): T[] {
  const out = new Array<T>(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = rows[indices[i]!]!;
  return out;
}
