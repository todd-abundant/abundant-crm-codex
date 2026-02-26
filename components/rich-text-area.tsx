"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic<any>(() => import("react-quill-new"), {
  ssr: false,
  loading: () => null
});

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
    const rawText = node.textContent || "";
    if (!includeEmptyText) return "";

    const normalizedText = rawText
      .replace(/\r\n?/g, "\n")
      .replace(/\n+/g, " ")
      .replace(/\t/g, " ");

    if (!normalizedText) return "";
    if (/^\s+$/.test(normalizedText)) return " ";

    return escapeText(normalizedText);
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

const quillModules = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ script: "sub" }, { script: "super" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["link"],
    [{ color: [] }, { background: [] }],
    [{ font: [] }],
    [{ size: [] }],
    [{ align: [] }]
  ]
};

const quillFormats = [
  "bold",
  "italic",
  "underline",
  "strike",
  "list",
  "bullet",
  "script",
  "indent",
  "link",
  "color",
  "background",
  "font",
  "size",
  "align"
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
  const [editorValue, setEditorValue] = React.useState(() => normalizeRichText(value));
  const minHeight = rows ? Math.max(rows, 3) * 20 + 76 : 170;

  React.useEffect(() => {
    if (value === editorValue) return;

    const nextValue = normalizeRichText(value);
    if (nextValue === editorValue) return;
    setEditorValue(nextValue);
  }, [editorValue, value]);

  const isEmpty = React.useMemo(() => !stripHtml(editorValue).trim(), [editorValue]);
  const editorStyle = React.useMemo(
    () =>
      ({
        "--rich-text-editor-min-height": `${minHeight}px`
      }) as React.CSSProperties,
    [minHeight]
  );

  const handleChange = React.useCallback(
    (nextValue: string) => {
      setEditorValue(nextValue);
      onChange(nextValue);
    },
    [onChange]
  );

  return (
    <div className={`rich-text-editor ${className || ""}`} onBlurCapture={onBlurCapture}>
      <ReactQuill
        theme="snow"
        value={editorValue}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={disabled}
        modules={quillModules}
        formats={quillFormats}
        className={`rich-text-editor-input ${isEmpty ? "rich-text-editor-input--empty" : ""}`}
        style={editorStyle}
      />
    </div>
  );
}
