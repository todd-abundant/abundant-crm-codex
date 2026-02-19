import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
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
    users: users.map((user) => ({
      ...user,
      roles: user.roles.map((item) => item.role)
    })),
    currentUserId: auth.user.id
  });
}
