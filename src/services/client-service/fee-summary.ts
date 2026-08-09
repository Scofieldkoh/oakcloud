import { Prisma } from '@/generated/prisma';

export function summarizeClientServiceFees(fees: Array<{ amount: Prisma.Decimal | string; currency: string }>) {
  const totals = new Map<string, Prisma.Decimal>();
  for (const fee of fees) {
    totals.set(fee.currency, (totals.get(fee.currency) ?? new Prisma.Decimal(0)).add(fee.amount.toString()));
  }
  return {
    count: fees.length,
    totals: Object.fromEntries([...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currency, total]) => [currency, total.toFixed(2)])),
  };
}
