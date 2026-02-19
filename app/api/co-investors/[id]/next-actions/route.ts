import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeDueAt(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      title?: string;
      details?: string | null;
      ownerName?: string | null;
      dueAt?: string | null;
      status?: "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    };

    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Next action title is required." }, { status: 400 });
    }

    const status = body.status || "OPEN";
    const completedAt = status === "DONE" ? new Date() : null;

    const nextAction = await prisma.nextAction.create({
      data: {
        coInvestorId: id,
        title,
        details: (body.details || "").trim() || null,
        ownerName: (body.ownerName || "").trim() || null,
        dueAt: normalizeDueAt(body.dueAt),
        status,
        priority: body.priority || "MEDIUM",
        completedAt
      }
    });

    return NextResponse.json({ nextAction }, { status: 201 });
  } catch (error) {
    console.error("create_next_action_error", error);
    return NextResponse.json({ error: "Failed to add next action" }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      nextActionId?: string;
      title?: string;
      details?: string | null;
      ownerName?: string | null;
      dueAt?: string | null;
      status?: "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    };

    const nextActionId = (body.nextActionId || "").trim();
    if (!nextActionId) {
      return NextResponse.json({ error: "Next action id is required." }, { status: 400 });
    }

    const existing = await prisma.nextAction.findFirst({
      where: { id: nextActionId, coInvestorId: id },
      select: { id: true }
    });
    if (!existing) {
      return NextResponse.json({ error: "Next action not found." }, { status: 404 });
    }

    const updates: {
      title?: string;
      details?: string | null;
      ownerName?: string | null;
      dueAt?: Date | null;
      status?: "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      completedAt?: Date | null;
    } = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Next action title is required." }, { status: 400 });
      }
      updates.title = title;
    }

    if (typeof body.details === "string" || body.details === null) {
      updates.details = body.details ? body.details.trim() || null : null;
    }

    if (typeof body.ownerName === "string" || body.ownerName === null) {
      updates.ownerName = body.ownerName ? body.ownerName.trim() || null : null;
    }

    if (body.dueAt !== undefined) {
      updates.dueAt = normalizeDueAt(body.dueAt);
    }

    if (body.status) {
      updates.status = body.status;
      updates.completedAt = body.status === "DONE" ? new Date() : null;
    }

    if (body.priority) {
      updates.priority = body.priority;
    }

    const nextAction = await prisma.nextAction.update({
      where: { id: nextActionId },
      data: updates
    });

    return NextResponse.json({ nextAction });
  } catch (error) {
    console.error("update_next_action_error", error);
    return NextResponse.json({ error: "Failed to update next action" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { nextActionId?: string };
    const nextActionId = (body.nextActionId || "").trim();

    if (!nextActionId) {
      return NextResponse.json({ error: "Next action id is required." }, { status: 400 });
    }

    const deleted = await prisma.nextAction.deleteMany({
      where: { id: nextActionId, coInvestorId: id }
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Next action not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: nextActionId });
  } catch (error) {
    console.error("delete_next_action_error", error);
    return NextResponse.json({ error: "Failed to delete next action" }, { status: 400 });
  }
}
