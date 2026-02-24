import type { Metadata } from "next";
import Link from "next/link";
import { canAccessAdmin, canAccessWorkbenches } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/server";
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
        <header className="top-nav">
          <div className="top-nav-inner">
            <div className="brand">Abundant CRM</div>
            <nav aria-label="Primary navigation" className="top-nav-links">
              <Link href="/" className="top-nav-link">
                Home
              </Link>
              {showWorkbenchTabs ? (
                <>
                  <Link href="/health-systems" className="top-nav-link">
                    Health Systems
                  </Link>
                  <Link href="/co-investors" className="top-nav-link">
                    Co-Investors
                  </Link>
                  <Link href="/companies" className="top-nav-link">
                    Companies
                  </Link>
                  <Link href="/pipeline" className="top-nav-link">
                    Pipeline
                  </Link>
                  <Link href="/workbench" className="top-nav-link">
                    Workbench (beta)
                  </Link>
                </>
              ) : null}
              {showAdminTab ? (
                <Link href="/admin" className="top-nav-link">
                  Administration
                </Link>
              ) : null}
            </nav>
            <div className="top-nav-session">
              {currentUser ? (
                <>
                  <Link href="/settings" className="top-nav-user top-nav-link-quiet">
                    {currentUser.name || currentUser.email}
                  </Link>
                  <a className="top-nav-link top-nav-link-quiet" href="/api/auth/logout">
                    Sign out
                  </a>
                </>
              ) : (
                <a className="top-nav-link top-nav-link-quiet" href="/sign-in">
                  Sign in
                </a>
              )}
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
