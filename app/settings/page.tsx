import { redirect } from "next/navigation";
import { UserSettingsForm } from "@/components/user-settings-form";
import { getCurrentUser } from "@/lib/auth/server";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in?next=/settings");
  }

  return (
    <main>
      <section className="panel settings-panel">
        <h2>Your settings</h2>
        <p className="muted">Update your profile details. We can add more settings here over time.</p>
        <UserSettingsForm initialName={user.name || ""} email={user.email} />
      </section>
    </main>
  );
}
