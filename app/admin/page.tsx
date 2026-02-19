import { redirect } from "next/navigation";
import { AdminUserManagement } from "@/components/admin-user-management";
import { getCurrentUser } from "@/lib/auth/server";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  if (user.role !== "ADMINISTRATOR") {
    redirect("/");
  }

  return <AdminUserManagement currentUserId={user.id} />;
}
