import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      interactionType?: "MEETING" | "EMAIL" | "CALL" | "EVENT" | "INTRO" | "NOTE";
      subject?: string | null;
      summary?: string | null;
      occurredAt?: string | null;
    };

    const subject = (body.subject || "").trim();
    const summary = (body.summary || "").trim();
    if (!subject && !summary) {
      return NextResponse.json({ error: "Add a subject or summary for the interaction." }, { status: 400 });
    }

    const interaction = await prisma.coInvestorInteraction.create({
      data: {
        coInvestorId: id,
        interactionType: body.interactionType || "NOTE",
        subject: subject || null,
        summary: summary || null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date()
      }
    });

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (error) {
    console.error("create_co_investor_interaction_error", error);
    return NextResponse.json({ error: "Failed to add interaction" }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      interactionId?: string;
      subject?: string | null;
      summary?: string | null;
    };

    const interactionId = (body.interactionId || "").trim();
    if (!interactionId) {
      return NextResponse.json({ error: "Interaction id is required." }, { status: 400 });
    }

    const subject = (body.subject || "").trim();
    const summary = (body.summary || "").trim();
    if (!subject && !summary) {
      return NextResponse.json({ error: "Add a subject or summary for the interaction." }, { status: 400 });
    }

    const existing = await prisma.coInvestorInteraction.findFirst({
      where: { id: interactionId, coInvestorId: id },
      select: { id: true }
    });
    if (!existing) {
      return NextResponse.json({ error: "Interaction not found." }, { status: 404 });
    }

    const interaction = await prisma.coInvestorInteraction.update({
      where: { id: interactionId },
      data: {
        subject: subject || null,
        summary: summary || null
      }
    });

    return NextResponse.json({ interaction });
  } catch (error) {
    console.error("update_co_investor_interaction_error", error);
    return NextResponse.json({ error: "Failed to update interaction" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { interactionId?: string };
    const interactionId = (body.interactionId || "").trim();

    if (!interactionId) {
      return NextResponse.json({ error: "Interaction id is required." }, { status: 400 });
    }

    const deleted = await prisma.coInvestorInteraction.deleteMany({
      where: { id: interactionId, coInvestorId: id }
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Interaction not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: interactionId });
  } catch (error) {
    console.error("delete_co_investor_interaction_error", error);
    return NextResponse.json({ error: "Failed to delete interaction" }, { status: 400 });
  }
}
