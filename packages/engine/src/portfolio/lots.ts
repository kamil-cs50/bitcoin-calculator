/**
 * Kolejka partii zakupu FIFO na buforze pierścieniowym (trzy prealokowane Float64Array).
 * Brak alokacji w buy/sell (gorąca ścieżka symulacji).
 */
const EPS = 1e-9;

export class LotQueue {
  private readonly lotUnits: Float64Array;
  private readonly lotCost: Float64Array; // pozostały koszt partii
  private readonly lotMonth: Float64Array;
  private readonly capacity: number;
  private head = 0;
  private count = 0;
  units = 0;
  basis = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.lotUnits = new Float64Array(capacity);
    this.lotCost = new Float64Array(capacity);
    this.lotMonth = new Float64Array(capacity);
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.units = 0;
    this.basis = 0;
  }

  /** `cost` = koszt łączny partii. */
  buy(units: number, cost: number, month: number): void {
    if (this.count >= this.capacity) {
      throw new Error('LotQueue: przepełnienie bufora partii');
    }
    const i = (this.head + this.count) % this.capacity;
    this.lotUnits[i] = units;
    this.lotCost[i] = cost;
    this.lotMonth[i] = month;
    this.count++;
    this.units += units;
    this.basis += cost;
  }

  /** Zwraca koszt FIFO sprzedanych jednostek. */
  sell(units: number): number {
    if (units > this.units * (1 + EPS) + EPS) {
      throw new Error('LotQueue: sprzedaż większa niż posiadane jednostki');
    }
    let need = units;
    let cost = 0;
    while (need > 0 && this.count > 0) {
      const h = this.head;
      const lu = this.lotUnits[h]!;
      if (need >= lu) {
        cost += this.lotCost[h]!;
        need -= lu;
        this.head = (h + 1) % this.capacity;
        this.count--;
      } else {
        const part = this.lotCost[h]! * (need / lu);
        cost += part;
        this.lotCost[h] = this.lotCost[h]! - part;
        this.lotUnits[h] = lu - need;
        need = 0;
      }
    }
    if (this.count === 0) {
      this.head = 0;
      this.units = 0;
      this.basis = 0;
    } else {
      this.units -= units;
      this.basis -= cost;
    }
    return cost;
  }

  /** Miesiąc najstarszej partii; −1 gdy pusto. */
  oldestMonth(): number {
    return this.count === 0 ? -1 : this.lotMonth[this.head]!;
  }
}
