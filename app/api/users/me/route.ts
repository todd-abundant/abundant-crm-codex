import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";

const updateMyUserSchema = z.object({
  name: z.string().trim().max(80).optional()
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = updateMyUserSchema.parse(body);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name === undefined ? user.name : input.name || null
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("update_my_user_error", error);
    return NextResponse.json({ error: "Failed to update user settings." }, { status: 400 });
  }
}
