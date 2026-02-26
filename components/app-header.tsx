"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type HeaderUser = {
  name: string | null;
  email: string;
};

export function AppHeader({
  currentUser,
  showWorkbenchTabs,
  showAdminTab
}: {
  currentUser: HeaderUser | null;
  showWorkbenchTabs: boolean;
  showAdminTab: boolean;
}) {
  const pathname = usePathname();
  const isIsolatedSurvey = pathname.startsWith("/survey/live/");
  if (isIsolatedSurvey) return null;

  return (
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
              <details className="top-nav-dropdown">
                <summary className="top-nav-link">Tests</summary>
                <div className="top-nav-dropdown-menu">
                  <Link href="/tests" className="top-nav-dropdown-link">
                    All Tests
                  </Link>
                  <Link href="/tests/snov-contact-lookup" className="top-nav-dropdown-link">
                    Snov Contact Lookup
                  </Link>
                  <Link href="/tests/zoom-webinar-import" className="top-nav-dropdown-link">
                    Zoom Webinar Import
                  </Link>
                  <Link href="/tests/bookyourdata-contact-lookup" className="top-nav-dropdown-link">
                    BookYourData Contact Lookup
                  </Link>
                </div>
              </details>
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
  );
}
