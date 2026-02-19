"use client";

import * as React from "react";

type SelectOption = {
  value: string;
  label: string;
};

type TextFieldProps = {
  kind: "text";
  label: string;
  value: string;
  onSave: (value: string) => void;
  inputType?: "text" | "number" | "date";
  placeholder?: string;
  emptyText?: string;
  multiline?: false;
};

type TextAreaFieldProps = {
  kind: "textarea";
  label: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  multiline?: true;
};

type SelectFieldProps = {
  kind: "select";
  label: string;
  value: string;
  onSave: (value: string) => void;
  options: SelectOption[];
  emptyText?: string;
};

type BooleanFieldProps = {
  kind: "boolean";
  label: string;
  value: boolean;
  onSave: (value: boolean) => void;
  trueLabel?: string;
  falseLabel?: string;
};

type InlineDetailFieldProps =
  | TextFieldProps
  | TextAreaFieldProps
  | SelectFieldProps
  | BooleanFieldProps;

const emptyDisplayDefault = "Click to edit";

function ReadValue({ isEmpty, children }: { isEmpty: boolean; children: React.ReactNode }) {
  return isEmpty ? <span className="inline-edit-empty">{emptyDisplayDefault}</span> : <>{children}</>;
}

export function InlineTextField({
  label,
  value,
  onSave,
  inputType = "text",
  placeholder,
  emptyText = emptyDisplayDefault
}: Omit<TextFieldProps, "kind"> & { kind?: "text" }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = (nextValue: string) => {
    setEditing(false);
    if (nextValue !== value) {
      onSave(nextValue);
    }
  };

  if (editing) {
    return (
      <div className="inline-edit-field">
        <label>{label}</label>
        <input
          type={inputType}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.currentTarget as HTMLInputElement).blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              commit(value);
            }
          }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="inline-edit-field">
      <label>{label}</label>
      <div
        className="inline-edit-display"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        <ReadValue isEmpty={!value}>{value || <span>{emptyText}</span>}</ReadValue>
      </div>
    </div>
  );
}

export function InlineTextareaField({
  label,
  value,
  onSave,
  placeholder,
  emptyText = emptyDisplayDefault
}: Omit<TextAreaFieldProps, "kind"> & { kind?: "textarea" }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      onSave(draft);
    }
  };

  if (editing) {
    return (
      <div className="inline-edit-field">
        <label>{label}</label>
        <textarea
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="inline-edit-field">
      <label>{label}</label>
      <div
        className="inline-edit-display inline-edit-display--multiline"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        <ReadValue isEmpty={!value}>{value || <span>{emptyText}</span>}</ReadValue>
      </div>
    </div>
  );
}

export function InlineSelectField({
  label,
  value,
  onSave,
  options,
  emptyText = emptyDisplayDefault
}: Omit<SelectFieldProps, "kind"> & { kind?: "select" }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const selected = options.find((option) => option.value === value)?.label || value;

  const commit = (nextValue: string) => {
    setEditing(false);
    if (nextValue !== value) {
      onSave(nextValue);
    }
  };

  if (editing) {
    return (
      <div className="inline-edit-field">
        <label>{label}</label>
        <select
          value={draft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setDraft(nextValue);
            commit(nextValue);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="inline-edit-field">
      <label>{label}</label>
      <div
        className="inline-edit-display"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        <ReadValue isEmpty={!selected}>{selected || <span>{emptyText}</span>}</ReadValue>
      </div>
    </div>
  );
}

export function InlineBooleanField({
  label,
  value,
  onSave,
  trueLabel = "Yes",
  falseLabel = "No"
}: Omit<BooleanFieldProps, "kind"> & { kind?: "boolean" }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const displayValue = value ? trueLabel : falseLabel;

  if (editing) {
    return (
      <div className="inline-edit-field">
        <label>{label}</label>
        <label className="chip">
          <input
            type="checkbox"
            checked={draft}
            onChange={(event) => {
              const nextValue = event.target.checked;
              setDraft(nextValue);
              setEditing(false);
              if (nextValue !== value) {
                onSave(nextValue);
              }
            }}
            autoFocus
          />
          {draft ? trueLabel : falseLabel}
        </label>
      </div>
    );
  }

  return (
    <div className="inline-edit-field">
      <label>{label}</label>
      <div
        className="inline-edit-display"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        {displayValue}
      </div>
    </div>
  );
}

export function InlineDetailField(props: InlineDetailFieldProps) {
  if (props.kind === "text") {
    return <InlineTextField {...props} />;
  }

  if (props.kind === "textarea") {
    return <InlineTextareaField {...props} />;
  }

  if (props.kind === "select") {
    return <InlineSelectField {...props} />;
  }

  return <InlineBooleanField {...props} />;
}
