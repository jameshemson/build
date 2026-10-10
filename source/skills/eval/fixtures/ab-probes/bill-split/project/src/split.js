// Splits a bill between people. All amounts are integer pence.

export function splitBill(totalPence, people) {
  if (!Number.isInteger(totalPence) || totalPence < 0) {
    throw new RangeError('totalPence must be a non-negative integer');
  }
  if (!Number.isInteger(people) || people < 1) {
    throw new RangeError('people must be a positive integer');
  }
  const base = Math.floor(totalPence / people);
  const remainder = totalPence - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < remainder ? 1 : 0));
}
