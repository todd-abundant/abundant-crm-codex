export function parseDateInput(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[^0-9])/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return parsed;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPaddedDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateInputValue(value: string | Date | null | undefined) {
  const parsed = value instanceof Date ? value : parseDateInput(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${toPaddedDatePart(parsed.getMonth() + 1)}-${toPaddedDatePart(
    parsed.getDate()
  )}`;
}
