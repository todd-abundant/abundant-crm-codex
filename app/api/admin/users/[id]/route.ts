import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/server";

const updateUserRoleSchema = z.object({
  roles: z.array(z.enum(["EXECUTIVE", "USER", "ADMINISTRATOR"])).min(1)
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
    const uniqueRoles = Array.from(new Set(input.roles));

    if (id === auth.user.id && !uniqueRoles.includes("ADMINISTRATOR")) {
      return NextResponse.json(
        { error: "You cannot remove your own administrator role." },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        roles: {
          deleteMany: {},
          createMany: {
            data: uniqueRoles.map((role) => ({ role }))
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        roles: {
          select: { role: true },
          orderBy: { role: "asc" }
        }
      }
    });

    return NextResponse.json({
      user: {
        ...user,
        roles: user.roles.map((item) => item.role)
      }
    });
  } catch (error) {
    console.error("update_user_role_error", error);
    return NextResponse.json({ error: "Failed to update user role." }, { status: 400 });
  }
}
