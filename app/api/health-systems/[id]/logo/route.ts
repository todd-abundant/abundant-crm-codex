import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const logoPayloadSchema = z.object({
  logoUrl: z.string().min(1).nullable()
});

const MAX_LOGO_DATA_URL_BYTES = 2_500_000;

function isImageDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

function isValidLogoValue(value: string | null) {
  if (!value) return true;
  if (!value.trim()) return false;
  if (isImageDataUrl(value)) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function trimOrNull(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validateLogoUrl(value: string | null) {
  if (!value) return null;
  if (!isValidLogoValue(value)) {
    throw new Error("Logo URL must be a valid http(s) URL or image data URL.");
  }
  if (value.length > MAX_LOGO_DATA_URL_BYTES) {
    throw new Error("Uploaded logo is too large.");
  }
  return value;
}

function parseId(context: { params: Promise<{ id: string }> }) {
  return context.params.then((resolved) => resolved.id);
}

async function ensureHealthSystemExists(id: string) {
  const record = await prisma.healthSystem.findUnique({
    where: { id },
    select: { id: true }
  });
  return !!record;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(context);
    const body = await request.json();
    const input = logoPayloadSchema.parse(body);
    const logoUrl = validateLogoUrl(trimOrNull(input.logoUrl));

    const exists = await ensureHealthSystemExists(id);
    if (!exists) {
      return NextResponse.json({ error: "Health system not found" }, { status: 404 });
    }

    if (logoUrl && isImageDataUrl(logoUrl) && logoUrl.length > MAX_LOGO_DATA_URL_BYTES) {
      throw new Error("Uploaded logo is too large.");
    }

    await prisma.$executeRaw`UPDATE "HealthSystem" SET "logoUrl" = ${logoUrl} WHERE "id" = ${id}`;
    const updated = await prisma.healthSystem.findUnique({
      where: { id },
      select: { id: true, logoUrl: true }
    });

    return NextResponse.json({ healthSystem: updated });
  } catch (error) {
    console.error("update_health_system_logo_error", error);
    const message = error instanceof Error ? error.message : "Failed to update health system logo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(context);
    const exists = await ensureHealthSystemExists(id);
    if (!exists) {
      return NextResponse.json({ error: "Health system not found" }, { status: 404 });
    }

    await prisma.$executeRaw`UPDATE "HealthSystem" SET "logoUrl" = NULL WHERE "id" = ${id}`;
    return NextResponse.json({ healthSystem: { id, logoUrl: null } });
  } catch (error) {
    console.error("delete_health_system_logo_error", error);
    return NextResponse.json({ error: "Failed to delete health system logo" }, { status: 400 });
  }
}
