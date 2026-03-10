const GOOGLE_DOC_HOSTNAMES = new Set(["docs.google.com", "drive.google.com"]);
const GOOGLE_DOC_FILE_ID_PATTERNS = [
  /\/(?:document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]{10,})/,
  /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
  /[?&]id=([a-zA-Z0-9_-]{10,})/
];

export const MAX_COMPANY_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

function toPaddedDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateInputString(value: Date = new Date()) {
  const localValue = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  return `${localValue.getFullYear()}-${toPaddedDatePart(localValue.getMonth() + 1)}-${toPaddedDatePart(
    localValue.getDate()
  )}`;
}

export function normalizeCompanyDocumentUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeGoogleDocsUrl(value: string) {
  const normalized = normalizeCompanyDocumentUrl(value);
  if (!normalized || normalized.startsWith("data:")) return null;

  try {
    const parsed = new URL(normalized);
    if (!GOOGLE_DOC_HOSTNAMES.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function extractGoogleDriveFileId(value: string) {
  const normalized = normalizeGoogleDocsUrl(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname;
    for (const pattern of GOOGLE_DOC_FILE_ID_PATTERNS) {
      const match = pattern.exec(path);
      if (match?.[1]) return match[1];
    }

    const queryId = parsed.searchParams.get("id");
    if (queryId) return queryId;
    return null;
  } catch {
    return null;
  }
}

export function inferGoogleDocumentTitle(url: string) {
  const normalized = normalizeGoogleDocsUrl(url);
  if (!normalized) return "Google Doc";

  const parsed = new URL(normalized);
  const path = parsed.pathname.toLowerCase();

  if (path.includes("/spreadsheets/")) return "Google Sheet";
  if (path.includes("/presentation/")) return "Google Slides";
  if (path.includes("/forms/")) return "Google Form";
  if (path.includes("/document/")) return "Google Doc";
  if (parsed.hostname.toLowerCase() === "drive.google.com") return "Google Drive File";
  return "Google Doc";
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to process uploaded document."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read uploaded document."));
    reader.readAsDataURL(file);
  });
}
