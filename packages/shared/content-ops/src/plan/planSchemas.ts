export type PlanRecord = Record<string, unknown>;

export function normalizePlanRecord(value: unknown): PlanRecord {
  if (!isPlanRecord(value)) {
    return {};
  }

  return { ...value };
}

export function normalizePlanSteps<T extends { op: string }>(
  value: unknown,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlanStep<T>);
}

export function normalizePlanProps(
  value: unknown,
): Record<string, unknown> {
  return normalizePlanRecord(value);
}

function isPlanRecord(value: unknown): value is PlanRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanStep<T extends { op: string }>(value: unknown): value is T {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    typeof value.op === "string"
  );
}
