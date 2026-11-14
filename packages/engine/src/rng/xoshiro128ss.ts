/** xoshiro128** (Blackman i Vigna 2021) z inicjalizacją przez SplitMix32. */
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Xoshiro128ss {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  static fromState(a: number, b: number, c: number, d: number): Xoshiro128ss {
    const g = new Xoshiro128ss();
    g.s0 = a >>> 0;
    g.s1 = b >>> 0;
    g.s2 = c >>> 0;
    g.s3 = d >>> 0;
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
    this.s0 = (z ^ (z >>> 16)) >>> 0;
    x = (x + 0x9e3779b9) >>> 0;
    z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s1 = (z ^ (z >>> 16)) >>> 0;
    x = (x + 0x9e3779b9) >>> 0;
    z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s2 = (z ^ (z >>> 16)) >>> 0;
    x = (x + 0x9e3779b9) >>> 0;
    z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    this.s3 = (z ^ (z >>> 16)) >>> 0;
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Jednostajna w (0, 1): (x + 0,5) / 2^32. */
  nextUniform(): number {
    return (this.nextU32() + 0.5) / 4294967296;
  }
}
