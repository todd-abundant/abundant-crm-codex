import type { Metadata } from "next";
import { canAccessAdmin, canAccessWorkbenches } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/server";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Abundant CRM",
  description: "Enterprise CRM + workflow for digital health investing"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();
  const roles = currentUser?.roles || [];
  const showWorkbenchTabs = canAccessWorkbenches(roles);
  const showAdminTab = canAccessAdmin(roles);

  return (
    <html lang="en">
      <body>
        <AppHeader
          currentUser={currentUser ? { name: currentUser.name, email: currentUser.email } : null}
          showWorkbenchTabs={showWorkbenchTabs}
          showAdminTab={showAdminTab}
        />
        {children}
      </body>
    </html>
  );
}
