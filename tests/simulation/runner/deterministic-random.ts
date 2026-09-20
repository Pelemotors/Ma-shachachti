export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new Error("maxExclusive must be > 0");
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error("Cannot pick from an empty list.");
    return items[this.nextInt(items.length)] as T;
  }
}
