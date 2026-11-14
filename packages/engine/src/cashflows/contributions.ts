import type { Contribution, OneOff } from '../types';

/** Wpłata nominalna w miesiącu t (przy t > endMonth zero). cpiLog = ln(indeks CPI względem startu). */
export function contributionAt(c: Contribution, t: number, cpiLog: number): number {
  if (t > c.endMonth) return 0;
  switch (c.indexation) {
    case 'none':
      return c.monthly;
    case 'cpi':
      return c.monthly * Math.exp(cpiLog);
    case 'cpiPlus':
      return c.monthly * Math.exp(cpiLog) * Math.pow(1 + c.realGrowth, Math.floor(t / 12));
  }
}

/** Zdarzenie jednorazowe w kwocie nominalnej (realne przeliczane CPI ścieżki). */
export function eventAmount(e: OneOff, cpiLog: number): number {
  return e.real ? e.amount * Math.exp(cpiLog) : e.amount;
}
