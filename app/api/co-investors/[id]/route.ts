import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { coInvestorUpdateSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = coInvestorUpdateSchema.parse(body);

    const updated = await prisma.coInvestor.update({
      where: { id },
      data: {
        name: input.name,
        legalName: input.legalName || null,
        website: input.website || null,
        headquartersCity: input.headquartersCity || null,
        headquartersState: input.headquartersState || null,
        headquartersCountry: input.headquartersCountry || null,
        isSeedInvestor: input.isSeedInvestor,
        isSeriesAInvestor: input.isSeriesAInvestor,
        investmentNotes: input.investmentNotes || null,
        researchNotes: input.researchNotes || null,
        researchUpdatedAt: new Date()
      },
      include: {
        partners: true,
        contactLinks: {
          include: { contact: true }
        },
        investments: true,
        researchJobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    return NextResponse.json({ coInvestor: updated });
  } catch (error) {
    console.error("update_co_investor_error", error);
    return NextResponse.json({ error: "Failed to update co-investor" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await prisma.coInvestor.delete({
      where: { id }
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("delete_co_investor_error", error);
    return NextResponse.json({ error: "Failed to delete co-investor" }, { status: 400 });
  }
}
