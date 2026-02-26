import { redirect } from "next/navigation";
import { AdminControlCenter } from "@/components/admin-control-center";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/server";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  if (!canAccessAdmin(user.roles)) {
    redirect("/");
  }

  return <AdminControlCenter currentUserId={user.id} />;
}
