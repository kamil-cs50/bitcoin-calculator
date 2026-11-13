/** Finalizator MurmurHash3 (fmix32). */
export function fmix32(h: number): number {
  h >>>= 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** FNV-1a 32-bit po jednostkach kodu UTF-16 (stabilny identyfikator czynnika). */
export function factorKey(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Spec 4.2: fmix32(fmix32(seed ^ 0x9E3779B9·(p+1)) ^ 0x85EBCA6B·(k+1)), mnożenia mod 2^32. */
export function streamSeed(seed: number, path: number, key: number): number {
  const a = Math.imul(0x9e3779b9, path + 1);
  const b = Math.imul(0x85ebca6b, key + 1);
  return fmix32(fmix32((seed ^ a) >>> 0) ^ b);
}
