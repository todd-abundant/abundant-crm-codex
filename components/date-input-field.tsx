"use client";

import * as React from "react";

type DateInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number) {
  if (year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

export function normalizeDateValue(raw: string) {
  const value = raw.trim();
  if (!value) return "";

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])) || value;
  }

  const slashMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const year = slashMatch[3].length === 2 ? 2000 + rawYear : rawYear;
    return toIsoDate(year, month, day) || value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return toIsoDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate()) || value;
}

export function DateInputField({
  value,
  onChange,
  onKeyDown,
  autoFocus = false,
  disabled = false,
  min,
  max
}: DateInputFieldProps) {
  const [draft, setDraft] = React.useState(normalizeDateValue(value));

  React.useEffect(() => {
    setDraft(normalizeDateValue(value));
  }, [value]);

  return (
    <input
      type="date"
      value={draft}
      onChange={(event) => {
        const next = normalizeDateValue(event.target.value);
        setDraft(next);
        onChange(next);
      }}
      onBlur={(event) => {
        const next = normalizeDateValue(event.target.value);
        if (next !== draft) {
          setDraft(next);
        }
        onChange(next);
      }}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      disabled={disabled}
      min={min}
      max={max}
      aria-label="Date"
    />
  );
}
