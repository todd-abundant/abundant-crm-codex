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

type NoteInsightPayload = {
  thesisFit?: string;
  roundActivity?: string;
  contactConfidence?: string;
  snapshot?: string;
  keyContacts?: string[];
};

type TextAreaFieldProps = {
  kind: "textarea";
  label: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  insight?: NoteInsightPayload;
  multiline: true;
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

function linkMatches(value: string) {
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const matches: Array<{ label: string; href: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    matches.push({ label: match[1], href: match[2], index: match.index });
  }
  return matches;
}

function renderMarkdownLikeText(value: string) {
  const nodes: React.ReactNode[] = [];
  const matches = linkMatches(value);
  let lastIndex = 0;

  for (const match of matches) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }

    nodes.push(
      <a key={`${match.href}-${match.index}`} href={match.href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        {match.label}
      </a>
    );

    const raw = `[${match.label}](${match.href})`;
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : value;
}

function toDisplaySections(value: string) {
  const clean = value.trim();
  if (!clean) return [] as string[];

  const lines = clean
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 1) {
    const semicolonChunks = lines[0]
      .split(/;\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (semicolonChunks.length >= 3) return semicolonChunks;

    const sentenceChunks = lines[0]
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (sentenceChunks.length >= 2) return sentenceChunks;
  }

  return lines;
}

function extractContactTokens(value: string) {
  const emails = Array.from(new Set(value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
  const phones = Array.from(
    new Set(
      (value.match(/(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || []).map((item) => item.trim())
    )
  );
  return [...emails, ...phones].slice(0, 4);
}

function normalizeSectionText(section: string) {
  return section.replace(/\(\s*(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))\s*\)/g, "$1").trim();
}

function expandDenseSections(sections: string[]) {
  if (sections.length !== 1) return sections.map(normalizeSectionText);

  const section = normalizeSectionText(sections[0]);
  if (section.length < 260) return [section];

  const chunks = section
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.length >= 2 ? chunks : [section];
}

function renderMultilineValue(value: string, insight?: NoteInsightPayload, expanded = false) {
  const sections = toDisplaySections(value);
  const links = linkMatches(value)
    .map((match) => ({ label: match.label, href: match.href }))
    .filter((item, idx, arr) => arr.findIndex((other) => other.href === item.href) === idx);
  const contacts = extractContactTokens(value);
  const summary = insight?.snapshot || "";
  const insights = insight
    ? [
        { label: "Thesis Fit", value: insight.thesisFit || "Unknown" },
        { label: "Round Activity", value: insight.roundActivity || "Unknown" },
        { label: "Contact Confidence", value: insight.contactConfidence || "Unknown" }
      ]
    : [];
  const keyContacts = (insight?.keyContacts && insight.keyContacts.length > 0 ? insight.keyContacts : contacts).slice(0, 6);
  const showHighlights = Boolean(insight);

  const previewSections = expanded ? expandDenseSections(sections) : sections.slice(0, 3).map(normalizeSectionText);
  const asList = previewSections.length > 1;

  return (
    <div className="inline-note-body">
      {showHighlights && (summary || keyContacts.length > 0 || insights.length > 0) && (
        <div className="inline-highlight-row">
          {insights.map((insight) => (
            <div key={insight.label} className="inline-highlight-card">
              <span className="inline-highlight-label">{insight.label}</span>
              <p>{insight.value}</p>
            </div>
          ))}
          {summary && (
            <div className="inline-highlight-card inline-highlight-card--wide inline-highlight-card--snapshot">
              <span className="inline-highlight-label">Snapshot</span>
              <p>{summary}</p>
            </div>
          )}
          {keyContacts.length > 0 && (
            <div className="inline-highlight-card inline-highlight-card--wide">
              <span className="inline-highlight-label">Key Contacts</span>
              <div className="inline-contact-row">
                {keyContacts.map((item) => (
                  <span key={item} className="inline-contact-chip">{item}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {expanded ? (
        <>
          {asList ? (
            <ul className="inline-note-list">
              {previewSections.map((section, index) => (
                <li key={`${section.slice(0, 24)}-${index}`}>{renderMarkdownLikeText(section)}</li>
              ))}
            </ul>
          ) : (
            previewSections.map((section, index) => (
              <p key={`${section.slice(0, 24)}-${index}`}>{renderMarkdownLikeText(section)}</p>
            ))
          )}

          {links.length > 0 && (
            <div className="inline-source-row">
              {links.map((link) => (
                <a
                  key={link.href}
                  className="inline-source-chip"
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="inline-truncation-hint">Full note text hidden in preview. Use "Show full notes" to expand.</p>
      )}
    </div>
  );
}


export function InlineTextField({
  label,
  value,
  onSave,
  inputType = "text",
  placeholder,
  emptyText = emptyDisplayDefault
}: Omit<TextFieldProps, "kind">) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!editing) {
      setDraft(value);
      setExpanded(false);
    }
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
  emptyText = emptyDisplayDefault,
  insight
}: Omit<TextAreaFieldProps, "kind">) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!editing) {
      setDraft(value);
      setExpanded(false);
    }
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      onSave(draft);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="inline-edit-field">
        <label>{label}</label>
        <textarea
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          autoFocus
        />
        <div className="inline-note-actions">
          <button type="button" className="inline-expand-toggle" onClick={commit}>Save</button>
          <button type="button" className="inline-expand-toggle inline-expand-toggle--secondary" onClick={cancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-edit-field">
      <label>{label}</label>
      <div className="inline-edit-display inline-edit-display--multiline">
        <ReadValue isEmpty={!value}>
          {value ? (
            <span className="inline-rich-text">
              {renderMultilineValue(value, insight, expanded)}
            </span>
          ) : (
            <span>{emptyText}</span>
          )}
        </ReadValue>
        <div className="inline-note-actions">
          <button
            type="button"
            className="inline-expand-toggle"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Show less" : "Show full notes"}
          </button>
          <button type="button" className="inline-expand-toggle inline-expand-toggle--secondary" onClick={() => setEditing(true)}>
            Edit notes
          </button>
        </div>
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
}: Omit<SelectFieldProps, "kind">) {
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
}: Omit<BooleanFieldProps, "kind">) {
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
