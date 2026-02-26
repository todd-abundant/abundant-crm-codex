"use client";

import * as React from "react";

type RichTextAreaProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  onBlurCapture?: React.FocusEventHandler<HTMLDivElement>;
};

const markdownPattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

const allowedTags = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "SUB",
  "SUP",
  "UL",
  "OL",
  "LI",
  "P",
  "BR",
  "DIV",
  "SPAN",
  "A",
  "FONT"
]);

function isLikelyHtml(value: string) {
  return /<([a-z][\w-]*)(\s|>|\/)/i.test(value);
}

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeAttr(value: string) {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return "";
}

function safeFontFamily(value: string) {
  if (!value) return "";
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!/^[a-zA-Z0-9 ,'"_-]+$/.test(trimmed)) return "";
  return trimmed;
}

function safeColor(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(trimmed)) return trimmed;
  if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(trimmed)) return trimmed;
  if (/^[a-z]+$/.test(trimmed)) return trimmed;
  return "";
}

function safeLineHeight(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  return "";
}

function safeLength(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (/^-?\d+(\.\d+)?(px|em|rem|%)?$/.test(trimmed)) return trimmed;
  return "";
}

function sanitizeStyle(raw: string | null) {
  if (!raw) return "";

  const declarations = raw
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => declaration.split(":").map((piece) => piece.trim()))
    .filter((parts) => parts.length === 2)
    .map(([name, value]) => [name.toLowerCase(), value]);

  const allowed: string[] = [];

  for (const [name, value] of declarations) {
    if (name === "color") {
      const safe = safeColor(value);
      if (safe) allowed.push(`color:${safe}`);
      continue;
    }

    if (name === "font-family") {
      const safe = safeFontFamily(value);
      if (safe) allowed.push(`font-family:${safe}`);
      continue;
    }

    if (name === "line-height") {
      const safe = safeLineHeight(value);
      if (safe) allowed.push(`line-height:${safe}`);
      continue;
    }

    if (name === "margin-left" || name === "text-indent") {
      const safe = safeLength(value);
      if (safe) allowed.push(`${name}:${safe}`);
      continue;
    }
  }

  return allowed.join(";");
}

function sanitizeNode(node: ChildNode, includeEmptyText = true): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return includeEmptyText ? escapeText(node.textContent || "") : "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const tag = element.tagName.toUpperCase();
  if (!allowedTags.has(tag)) {
    return Array.from(element.childNodes)
      .map((child) => sanitizeNode(child, includeEmptyText))
      .join("");
  }

  const childContent = Array.from(element.childNodes)
    .map((child) => sanitizeNode(child, includeEmptyText))
    .join("");

  const style = sanitizeStyle(element.getAttribute("style"));
  const tagName = tag.toLowerCase();

  if (tag === "A") {
    const href = safeUrl(element.getAttribute("href") || "");
    if (href) {
      return `<a href="${safeAttr(href)}" target="_blank" rel="noreferrer">${childContent}</a>`;
    }
    return childContent;
  }

  if (tag === "FONT") {
    const color = safeColor(element.getAttribute("color") || "");
    const styleAttr = color ? ` style="color:${color}"` : "";
    return `<span${styleAttr}>${childContent}</span>`;
  }

  const styleAttribute = style ? ` style="${safeAttr(style)}"` : "";
  return `<${tagName}${styleAttribute}>${childContent}</${tagName}>`;
}

function sanitizeRichHtml(raw: string) {
  if (typeof DOMParser === "undefined") {
    return escapeText(raw);
  }

  if (!raw.trim()) return "";

  const parsed = new DOMParser().parseFromString(raw, "text/html");
  return Array.from(parsed.body.childNodes)
    .map((node) => sanitizeNode(node, true))
    .join("");
}

function stripHtml(raw: string) {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n/g, "")
    .trim();
}

type MarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] };

function markdownToBlocks(value: string): MarkdownBlock[] {
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

function markdownToInlineHtml(value: string) {
  const withEscapes = escapeText(value);
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownPattern.exec(withEscapes)) !== null) {
    result += withEscapes.slice(lastIndex, match.index);
    if (match[1]) {
      result += `<strong>${escapeText(match[1])}</strong>`;
    } else if (match[2] && match[3]) {
      const url = safeUrl(match[3]);
      if (url) {
        result += `<a href="${safeAttr(url)}" target="_blank" rel="noreferrer">${escapeText(match[2])}</a>`;
      } else {
        result += escapeText(match[0]);
      }
    }
    lastIndex = match.index + match[0].length;
  }

  result += withEscapes.slice(lastIndex);
  return result;
}

function markdownToHtml(value: string) {
  const blocks = markdownToBlocks(value);
  if (blocks.length === 0) return "";

  return blocks
    .map((block) => {
      if (block.kind === "paragraph") {
        return `<p>${markdownToInlineHtml(block.text)}</p>`;
      }

      if (block.kind === "unordered-list") {
        return `<ul>${block.items.map((item) => `<li>${markdownToInlineHtml(item)}</li>`).join("")}</ul>`;
      }

      return `<ol>${block.items.map((item) => `<li>${markdownToInlineHtml(item)}</li>`).join("")}</ol>`;
    })
    .join("");
}

export function normalizeRichText(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  if (isLikelyHtml(normalized)) {
    return sanitizeRichHtml(normalized);
  }

  return markdownToHtml(normalized);
}

function insertHtml(commandHtml: string) {
  document.execCommand("insertHTML", false, commandHtml);
}

const fontOptions = [
  "Arial, sans-serif",
  "Verdana, sans-serif",
  "Georgia, serif",
  "Times New Roman, serif",
  "Courier New, monospace",
  "Trebuchet MS, sans-serif"
];

export function RichTextArea({
  value,
  onChange,
  placeholder,
  rows,
  className,
  disabled = false,
  onBlurCapture
}: RichTextAreaProps) {
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const [isEmpty, setIsEmpty] = React.useState(() => !stripHtml(value).trim());
  const [draft, setDraft] = React.useState(() => normalizeRichText(value));

  const minHeight = rows ? Math.max(rows, 3) * 20 + 76 : 170;

  React.useEffect(() => {
    const nextValue = normalizeRichText(value);
    if (nextValue === draft) return;

    const editor = editorRef.current;
    setDraft(nextValue);
    setIsEmpty(!stripHtml(nextValue).trim());

    if (!editor) return;
    const active = editor === document.activeElement || editor.contains(document.activeElement);
    if (!active) {
      editor.innerHTML = nextValue;
    }
  }, [value, draft]);

  React.useEffect(() => {
    document.execCommand("styleWithCSS", false, true);
  }, []);

  const syncFromEditor = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const sanitized = sanitizeRichHtml(editor.innerHTML);
    const nextIsEmpty = !stripHtml(sanitized).trim();

    setDraft(sanitized);
    setIsEmpty(nextIsEmpty);
    onChange(sanitized);
  }, [onChange]);

  const applyCommand = React.useCallback(
    (command: string, commandValue?: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const commandResult = commandValue
        ? document.execCommand(command, false, commandValue)
        : document.execCommand(command);
      if (!commandResult) return;

      syncFromEditor();
    },
    [syncFromEditor]
  );

  const applyLineSpacing = React.useCallback(
    (nextSpacing: string) => {
      const editor = editorRef.current;
      const safeSpacing = safeLineHeight(nextSpacing);
      if (!editor || !safeSpacing) return;

      const selection = window.getSelection();
      let blockElement: HTMLElement | null = null;
      if (selection && selection.rangeCount > 0) {
        let candidate: Node | null = selection.anchorNode;
        while (candidate && candidate !== editor) {
          if (candidate.nodeType === Node.ELEMENT_NODE) {
            const current = candidate as HTMLElement;
            if (/^(P|LI|DIV)$/.test(current.tagName)) {
              blockElement = current;
              break;
            }
          }
          candidate = candidate.parentNode;
        }
      }
      const target = blockElement || editor;
      target.style.lineHeight = safeSpacing;
      syncFromEditor();
    },
    [syncFromEditor]
  );

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const clipboardHtml = event.clipboardData?.getData("text/html") || "";
      const clipboardText = event.clipboardData?.getData("text/plain") || "";
      if (!clipboardHtml && !clipboardText) return;
      event.preventDefault();
      const payload = clipboardHtml ? sanitizeRichHtml(clipboardHtml) : escapeText(clipboardText);
      if (!payload) return;
      insertHtml(payload);
      syncFromEditor();
    },
    [syncFromEditor]
  );

  const handleInput = React.useCallback(() => {
    syncFromEditor();
  }, [syncFromEditor]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          applyCommand("bold");
          return;
        }
        if (key === "i") {
          event.preventDefault();
          applyCommand("italic");
          return;
        }
        if (key === "u") {
          event.preventDefault();
          applyCommand("underline");
          return;
        }
        if (key === "s") {
          event.preventDefault();
          applyCommand("strikeThrough");
          return;
        }
      }
    },
    [applyCommand, disabled]
  );

  return (
    <div className={`rich-text-editor ${className || ""}`}>
      <div className="rich-text-toolbar" role="toolbar" aria-label="Rich text formatting tools">
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("bold")}
          title="Bold"
          aria-label="Bold"
          disabled={disabled}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("italic")}
          title="Italic"
          aria-label="Italic"
          disabled={disabled}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("underline")}
          title="Underline"
          aria-label="Underline"
          disabled={disabled}
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("strikeThrough")}
          title="Strikethrough"
          aria-label="Strikethrough"
          disabled={disabled}
        >
          <span style={{ textDecoration: "line-through" }}>S</span>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("subscript")}
          title="Subscript"
          aria-label="Subscript"
          disabled={disabled}
        >
          x₂
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("superscript")}
          title="Superscript"
          aria-label="Superscript"
          disabled={disabled}
        >
          x²
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("insertUnorderedList")}
          title="Bulleted list"
          aria-label="Bulleted list"
          disabled={disabled}
        >
          •
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("insertOrderedList")}
          title="Numbered list"
          aria-label="Numbered list"
          disabled={disabled}
        >
          1.
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("indent")}
          title="Indent"
          aria-label="Indent"
          disabled={disabled}
        >
          ⟶
        </button>
        <button
          type="button"
          className="rich-text-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("outdent")}
          title="Outdent"
          aria-label="Outdent"
          disabled={disabled}
        >
          ⟵
        </button>
        <label className="rich-text-toolbar-select" aria-label="Font family">
          <span>Font</span>
          <select
            onChange={(event) => applyCommand("fontName", event.target.value)}
            disabled={disabled}
          >
            {fontOptions.map((fontFamily) => (
              <option key={fontFamily} value={fontFamily}>
                {fontFamily.split(",")[0]}
              </option>
            ))}
          </select>
        </label>
        <label className="rich-text-toolbar-select" aria-label="Line spacing">
          <span>Spacing</span>
          <select
            onChange={(event) => applyLineSpacing(event.target.value)}
            defaultValue=""
            disabled={disabled}
          >
            <option value="">1x</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
          </select>
        </label>
        <label className="rich-text-toolbar-color" aria-label="Font color">
          <span>Color</span>
          <input
            type="color"
            defaultValue="#000000"
            onChange={(event) => applyCommand("foreColor", event.target.value)}
            onMouseDown={(event) => event.preventDefault()}
            title="Font color"
            aria-label="Font color"
            disabled={disabled}
          />
        </label>
      </div>

      <div
        ref={editorRef}
        className={`rich-text-editor-input ${isEmpty ? "rich-text-editor-input--empty" : ""}`}
        style={{ minHeight }}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-label={placeholder || "Rich text editor"}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: draft }}
        onInput={handleInput}
        onPaste={handlePaste}
        onBlurCapture={onBlurCapture}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
