import type { ColumnType, SelectOption } from "../types/database";

const CHECKBOX_FALSE_VALUES = new Set(["", "0", "false", "no", "off"]);

export function parseDatabaseMultiSelectValue(raw: string): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [raw];
    }
    return parsed
      .map((entry) => String(entry))
      .filter((entry) => entry.length > 0);
  } catch {
    return [raw];
  }
}

export function resolveStoredSelectOption(
  raw: string,
  options?: readonly SelectOption[],
): SelectOption | null {
  if (!raw || !options || options.length === 0) {
    return null;
  }

  return (
    options.find((option) => option.id === raw) ??
    options.find((option) => option.value === raw) ??
    options.find((option) => option.label === raw) ??
    null
  );
}

export function normalizeStoredSelectValue(
  raw: string,
  options?: readonly SelectOption[],
): string {
  if (!raw) {
    return "";
  }

  return resolveStoredSelectOption(raw, options)?.id ?? raw;
}

export function normalizeStoredMultiSelectValue(
  raw: string,
  options?: readonly SelectOption[],
): string[] {
  return parseDatabaseMultiSelectValue(raw).map((value) =>
    normalizeStoredSelectValue(value, options),
  );
}

export function formatStoredSelectValue(
  raw: string,
  options?: readonly SelectOption[],
): string {
  if (!raw) {
    return "";
  }

  return resolveStoredSelectOption(raw, options)?.value ?? raw;
}

export function formatStoredMultiSelectValue(
  raw: string,
  options?: readonly SelectOption[],
): string {
  return parseDatabaseMultiSelectValue(raw)
    .map((value) => formatStoredSelectValue(value, options))
    .join(", ");
}

export function coerceDatabaseValue(
  raw: string,
  fromType: ColumnType | string,
  toType: ColumnType | string,
  options?: readonly SelectOption[],
): string {
  if (raw === "" || fromType === toType) {
    return raw;
  }

  switch (`${fromType}->${toType}`) {
    case "text->number":
      return Number.isNaN(Number(raw)) ? "" : raw;
    case "text->checkbox":
      return raw.toLowerCase() === "true" ? "true" : "false";
    case "text->date":
      return Number.isNaN(new Date(raw).getTime()) ? "" : raw;
    case "text->select": {
      const option = resolveStoredSelectOption(raw, options);
      return option?.id ?? "";
    }
    case "number->checkbox":
      return Number(raw) !== 0 ? "true" : "false";
    case "checkbox->number":
      return raw === "true" ? "1" : "0";
    case "select->multiSelect": {
      const normalized = normalizeStoredSelectValue(raw, options);
      return normalized ? JSON.stringify([normalized]) : "";
    }
    case "multiSelect->select":
    case "multiSelect->relation":
      return normalizeStoredMultiSelectValue(raw, options)[0] ?? "";
    default:
      if (toType === "checkbox") {
        return CHECKBOX_FALSE_VALUES.has(raw.trim().toLowerCase())
          ? "false"
          : "true";
      }
      return raw;
  }
}

export function normalizeDatabaseValueForType(
  raw: string,
  type: ColumnType | string,
  options?: readonly SelectOption[],
): string | null {
  if (raw === "") {
    return "";
  }

  switch (type) {
    case "number":
      return Number.isFinite(Number(raw)) ? raw : null;
    case "checkbox":
      return CHECKBOX_FALSE_VALUES.has(raw.trim().toLowerCase())
        ? "false"
        : "true";
    case "select":
      return normalizeStoredSelectValue(raw, options);
    case "multiSelect": {
      const normalized = normalizeStoredMultiSelectValue(raw, options).filter(
        (value) => value.length > 0,
      );
      return normalized.length > 0 ? JSON.stringify(normalized) : "";
    }
    case "date":
      return Number.isNaN(new Date(raw).getTime()) ? null : raw;
    case "url": {
      try {
        new URL(raw);
        return raw;
      } catch {
        return null;
      }
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
    default:
      return raw;
  }
}
