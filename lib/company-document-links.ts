const GOOGLE_DOC_HOSTNAMES = new Set(["docs.google.com", "drive.google.com"]);

export const MAX_COMPANY_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

export function toDateInputString(value: Date = new Date()) {
  return value.toISOString().slice(0, 10);
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
