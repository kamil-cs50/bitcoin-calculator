/** xoshiro128** (Blackman i Vigna 2021) z inicjalizacją przez SplitMix32. */
function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k)); // int32 (bez >>> 0: unika konwersji do liczb zmiennoprzecinkowych)
}

export class Xoshiro128ss {
  // stan w Int32Array: pola o wartościach ≥ 2^30 byłyby pudełkowanymi liczbami (alokacje, wolniejsza pętla)
  private readonly s = new Int32Array(4);

  static fromState(a: number, b: number, c: number, d: number): Xoshiro128ss {
    const g = new Xoshiro128ss();
    g.s[0] = a;
    g.s[1] = b;
    g.s[2] = c;
    g.s[3] = d;
    return g;
  }

  static fromSeed(seed: number): Xoshiro128ss {
    const g = new Xoshiro128ss();
    g.reseed(seed);
    return g;
  }

  /** Cztery słowa stanu ze SplitMix32; bez alokacji. */
  reseed(seed: number): void {
    // SplitMix32 rozwinięty inline (bez domknięcia, więc bez alokacji w gorącej ścieżce)
    let x = (seed >>> 0) + 0x9e3779b9;
    let z = x >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s[0] = z ^ (z >>> 16);
    x = (x + 0x9e3779b9) >>> 0;
    z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s[1] = z ^ (z >>> 16);
    x = (x + 0x9e3779b9) >>> 0;
    z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s[2] = z ^ (z >>> 16);
    x = (x + 0x9e3779b9) >>> 0;
    z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s[3] = z ^ (z >>> 16);
  }

  nextU32(): number {
    const s = this.s;
    const s0 = s[0]!;
    const s1 = s[1]!;
    const s2 = s[2]! ^ s0;
    const s3 = s[3]! ^ s1;
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    s[1] = s1 ^ s2;
    s[0] = s0 ^ s3;
    s[2] = s2 ^ (s1 << 9);
    s[3] = rotl(s3, 11);
    return result;
  }

  /** Jednostajna w (0, 1): (x + 0,5) / 2^32. */
  nextUniform(): number {
    return (this.nextU32() + 0.5) / 4294967296;
  }
}
