"use client";

import * as React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { debugDateLog } from "@/lib/date-debug";

type DateInputDebugContext = string | Record<string, unknown>;

type DateInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  debugContext?: DateInputDebugContext;
};

function normalizeDebugContext(context?: DateInputDebugContext) {
  if (!context) return {};
  if (typeof context === "string") {
    return { debugContext: context };
  }
  return context;
}

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

function parseIsoDate(value: string) {
  const normalized = normalizeDateValue(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const iso = toIsoDate(year, month, day);
  if (!iso) return null;

  return new Date(year, month - 1, day);
}

function formatIsoDateLocal(value: Date) {
  return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate()) || "";
}

export function normalizeDateValue(raw: unknown) {
  if (typeof raw !== "string") return "";
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

  return toIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()) || value;
}

export function DateInputField({
  value,
  onChange,
  placeholder,
  onKeyDown,
  autoFocus = false,
  disabled = false,
  min,
  max,
  className,
  debugContext
}: DateInputFieldProps) {
  const debugFields = React.useMemo(() => normalizeDebugContext(debugContext), [debugContext]);
  const selected = React.useMemo(() => parseIsoDate(value), [value]);
  const minDate = React.useMemo(() => (min ? parseIsoDate(min) || undefined : undefined), [min]);
  const maxDate = React.useMemo(() => (max ? parseIsoDate(max) || undefined : undefined), [max]);

  const commitRawValue = React.useCallback((raw: unknown) => {
      const normalized = normalizeDateValue(raw);
      debugDateLog("date-input-field.commit-raw", {
        raw,
        normalized,
        ...debugFields
      });
      if (typeof raw !== "string" || !raw.trim()) {
        onChange("");
        return;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        onChange(normalized);
      }
    },
    [debugFields, onChange]
  );

  return (
    <DatePicker
      selected={selected}
      onChange={(nextDate: Date | null) => {
        if (!nextDate) {
          debugDateLog("date-input-field.select", {
            value,
            next: null,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            selectedMode: "clear",
            ...debugFields
          });
          onChange("");
          return;
        }
        const iso = formatIsoDateLocal(nextDate);
        debugDateLog("date-input-field.select", {
          value,
          selected: nextDate.toISOString(),
          selectedLocal: nextDate.toLocaleString(),
          next: iso,
          timezoneOffsetMinutes: nextDate.getTimezoneOffset(),
          ...debugFields
        });
        if (iso) {
          onChange(iso);
        }
      }}
      onChangeRaw={(event) => {
        if (!event || !event.target) return;
        const target = event.target as HTMLInputElement;
        commitRawValue(target.value);
      }}
      onBlur={(event) => {
        const target = event.target as HTMLInputElement;
        commitRawValue(target.value);
      }}
      dateFormat="yyyy-MM-dd"
      placeholderText={placeholder}
      onKeyDown={(event) => {
        if (!onKeyDown) return;
        onKeyDown(event as unknown as React.KeyboardEvent<HTMLInputElement>);
      }}
      autoFocus={autoFocus}
      disabled={disabled}
      minDate={minDate}
      maxDate={maxDate}
      className={className}
      calendarClassName="app-date-picker-calendar"
      popperClassName="app-date-picker-popper"
      showPopperArrow={false}
      aria-label="Date"
    />
  );
}
