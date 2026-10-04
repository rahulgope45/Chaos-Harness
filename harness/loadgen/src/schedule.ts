export interface ScheduledPayment {
  index: number;
  offsetMs: number;
  idempotencyKey: string;
  amountMinor: number;
  currency: "USD";
  replay: boolean;
}

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSchedule(seed: number, durationMs: number, ratePerSecond: number) {
  const random = seededRandom(seed);
  const schedule: ScheduledPayment[] = [];
  let offsetMs = 0;
  while (true) {
    offsetMs += (-Math.log(1 - random()) / ratePerSecond) * 1000;
    if (offsetMs >= durationMs) break;
    const index = schedule.length;
    const replay = index >= 10 && random() < 0.05;
    const source = replay ? schedule[index - 10] : undefined;
    schedule.push({
      index,
      offsetMs,
      idempotencyKey: source?.idempotencyKey ?? `load-${seed}-${index}`,
      amountMinor: source?.amountMinor ?? 100 + Math.floor(random() * 9900),
      currency: "USD",
      replay
    });
  }
  return schedule;
}
