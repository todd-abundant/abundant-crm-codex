import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/server";

const updateUserRoleSchema = z.object({
  role: z.enum(["EXECUTIVE", "USER", "ADMINISTRATOR"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = updateUserRoleSchema.parse(body);

    if (id === auth.user.id && input.role !== "ADMINISTRATOR") {
      return NextResponse.json(
        { error: "You cannot remove your own administrator role." },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: input.role
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true
      }
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("update_user_role_error", error);
    return NextResponse.json({ error: "Failed to update user role." }, { status: 400 });
  }
}
