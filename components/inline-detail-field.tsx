"use client";

import * as React from "react";
import { DateInputField, normalizeDateValue } from "./date-input-field";

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
  rows?: number;
  enableFormatting?: boolean;
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
  const boldAndLinkPattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldAndLinkPattern.exec(value)) !== null) {
    const token = match[0];
    const tokenIndex = match.index;
    if (tokenIndex > lastIndex) {
      nodes.push(value.slice(lastIndex, tokenIndex));
    }

    if (match[1]) {
      nodes.push(<strong key={`bold-${tokenIndex}-${match[1]}`}>{match[1]}</strong>);
      lastIndex = tokenIndex + token.length;
      continue;
    }

    const label = match[2];
    const href = match[3];
    if (label && href) {
      nodes.push(
        <a
          key={`${href}-${tokenIndex}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </a>
      );
      lastIndex = tokenIndex + token.length;
    }
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

type MarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] };

function markdownBlocks(value: string) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const isUnordered = /^[-*]\s+/.test(line);
    const isOrdered = /^\d+\.\s+/.test(line);

    if (isUnordered) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    if (isOrdered) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    blocks.push({ kind: "paragraph", text: line });
    index += 1;
  }

  return blocks;
}

function renderFormattedMultilineValue(value: string) {
  const blocks = markdownBlocks(value);
  if (blocks.length === 0) return null;

  return (
    <div className="inline-note-body">
      {blocks.map((block, blockIndex) => {
        if (block.kind === "paragraph") {
          return <p key={`paragraph-${blockIndex}`}>{renderMarkdownLikeText(block.text)}</p>;
        }
        if (block.kind === "unordered-list") {
          return (
            <ul key={`unordered-list-${blockIndex}`} className="inline-note-list">
              {block.items.map((item, itemIndex) => (
                <li key={`unordered-list-${blockIndex}-${itemIndex}`}>{renderMarkdownLikeText(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <ol key={`ordered-list-${blockIndex}`} className="inline-note-list inline-note-list--ordered">
            {block.items.map((item, itemIndex) => (
              <li key={`ordered-list-${blockIndex}-${itemIndex}`}>{renderMarkdownLikeText(item)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

function applyMarkdownFormatToDraft(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  action: "bold" | "unordered-list" | "ordered-list" | "link"
) {
  if (action === "bold") {
    const selected = source.slice(selectionStart, selectionEnd);
    const replacement = selected ? `**${selected}**` : "**bold text**";
    const nextValue = `${source.slice(0, selectionStart)}${replacement}${source.slice(selectionEnd)}`;
    const nextSelectionStart = selectionStart + 2;
    const nextSelectionEnd = selected ? selectionEnd + 2 : selectionStart + 11;
    return { nextValue, selectionStart: nextSelectionStart, selectionEnd: nextSelectionEnd };
  }

  if (action === "link") {
    const selected = source.slice(selectionStart, selectionEnd);
    const replacement = selected ? `[${selected}](https://)` : "[link text](https://)";
    const nextValue = `${source.slice(0, selectionStart)}${replacement}${source.slice(selectionEnd)}`;
    const urlStart = selectionStart + replacement.indexOf("https://");
    const urlEnd = urlStart + "https://".length;
    return { nextValue, selectionStart: urlStart, selectionEnd: urlEnd };
  }

  const lineStart = source.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndBoundary = source.indexOf("\n", selectionEnd);
  const lineEnd = lineEndBoundary === -1 ? source.length : lineEndBoundary;
  const selectedLines = source.slice(lineStart, lineEnd);
  const lines = selectedLines.split("\n");
  const normalized = lines.map((line) => line.replace(/^(\s*)(?:[-*]|\d+\.)\s+/, "$1"));
  const transformed =
    action === "unordered-list"
      ? normalized.map((line) => `- ${line.trim()}`).join("\n")
      : normalized.map((line, index) => `${index + 1}. ${line.trim()}`).join("\n");
  const nextValue = `${source.slice(0, lineStart)}${transformed}${source.slice(lineEnd)}`;
  return {
    nextValue,
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length
  };
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

  React.useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  const commit = (nextValue: string) => {
    setEditing(false);
    if (nextValue !== value) {
      onSave(nextValue);
    }
  };

  if (editing) {
    if (inputType === "date") {
      return (
        <div className="inline-edit-field">
          <label>{label}</label>
          <div
            className="inline-date-edit"
            onBlurCapture={(event) => {
              const nextFocus = event.relatedTarget as Node | null;
              if (nextFocus && event.currentTarget.contains(nextFocus)) return;
              const source = event.target as HTMLInputElement | null;
              const rawValue = source && typeof source.value === "string" ? source.value : draft;
              commit(normalizeDateValue(rawValue));
            }}
          >
            <DateInputField
              value={draft}
              onChange={setDraft}
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
        </div>
      );
    }

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
  insight,
  rows,
  enableFormatting = false
}: Omit<TextAreaFieldProps, "kind">) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  const commit = (nextValue: string) => {
    setEditing(false);
    if (nextValue !== value) {
      onSave(nextValue);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const applyFormat = (action: "bold" | "unordered-list" | "ordered-list" | "link") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const formatted = applyMarkdownFormatToDraft(draft, selectionStart, selectionEnd, action);
    setDraft(formatted.nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(formatted.selectionStart, formatted.selectionEnd);
    });
  };

  if (editing) {
    return (
      <div className="inline-edit-field">
        <label>{label}</label>
        <div className="inline-textarea-editor">
          {enableFormatting ? (
            <div className="inline-formatting-toolbar" aria-label={`${label} formatting tools`}>
              <button
                type="button"
                className="ghost small"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("bold")}
              >
                Bold
              </button>
              <button
                type="button"
                className="ghost small"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("unordered-list")}
              >
                Bullets
              </button>
              <button
                type="button"
                className="ghost small"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("ordered-list")}
              >
                Numbered
              </button>
              <button
                type="button"
                className="ghost small"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("link")}
              >
                Link
              </button>
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            className={enableFormatting ? "inline-formatting-textarea" : undefined}
            value={draft}
            rows={rows}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                (event.currentTarget as HTMLTextAreaElement).blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            autoFocus
          />
        </div>
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
        <ReadValue isEmpty={!value}>
          {value ? (
            <span className="inline-rich-text">
              {enableFormatting ? renderFormattedMultilineValue(value) : renderMultilineValue(value, insight, true)}
            </span>
          ) : (
            <span>{emptyText}</span>
          )}
        </ReadValue>
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
            setDraft(event.target.value);
          }}
          onBlur={(event) => {
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.currentTarget as HTMLSelectElement).blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              commit(value);
            }
          }}
          autoFocus
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
        <select
          value={draft ? "true" : "false"}
          onChange={(event) => {
            setDraft(event.target.value === "true");
          }}
          onBlur={(event) => {
            const nextValue = event.target.value === "true";
            setEditing(false);
            if (nextValue !== value) {
              onSave(nextValue);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.currentTarget as HTMLSelectElement).blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(value);
              setEditing(false);
            }
          }}
          autoFocus
        >
          <option value="true">{trueLabel}</option>
          <option value="false">{falseLabel}</option>
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
