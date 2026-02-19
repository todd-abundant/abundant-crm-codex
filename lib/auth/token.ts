type AuthRole = "EXECUTIVE" | "USER" | "ADMINISTRATOR";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  roles: AuthRole[];
  exp: number;
  iat: number;
  name?: string | null;
  image?: string | null;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeJson(value: unknown) {
  return base64UrlEncodeBytes(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T | null {
  try {
    const bytes = base64UrlDecodeBytes(value);
    const text = decoder.decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify"
  ]);
}

async function sign(input: string, secret: string) {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function verify(input: string, signature: string, secret: string) {
  const key = await importSigningKey(secret);
  return crypto.subtle.verify("HMAC", key, base64UrlDecodeBytes(signature), encoder.encode(input));
}

function isValidRole(role: unknown): role is AuthRole {
  return role === "EXECUTIVE" || role === "USER" || role === "ADMINISTRATOR";
}

function isValidPayload(payload: unknown): payload is AuthTokenPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AuthTokenPayload>;

  return (
    typeof candidate.sub === "string" &&
    candidate.sub.length > 0 &&
    typeof candidate.email === "string" &&
    candidate.email.length > 0 &&
    Array.isArray(candidate.roles) &&
    candidate.roles.length > 0 &&
    candidate.roles.every((role) => isValidRole(role)) &&
    typeof candidate.exp === "number" &&
    Number.isFinite(candidate.exp) &&
    typeof candidate.iat === "number" &&
    Number.isFinite(candidate.iat)
  );
}

export async function createAuthToken(payload: AuthTokenPayload, secret: string) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const unsignedToken = `${header}.${body}`;
  const signature = await sign(unsignedToken, secret);
  return `${unsignedToken}.${signature}`;
}

export async function verifyAuthToken(token: string, secret: string) {
  if (!token || !secret) return null;

  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const [header, body, signature] = segments;
  if (!header || !body || !signature) return null;

  let validSignature = false;
  try {
    validSignature = await verify(`${header}.${body}`, signature, secret);
  } catch {
    return null;
  }
  if (!validSignature) return null;

  const payload = decodeJson<AuthTokenPayload>(body);
  if (!isValidPayload(payload)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return payload;
}
