"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PIPELINE_COMPANY_TYPE_OPTIONS } from "@/lib/pipeline-opportunities";

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
  const navRef = React.useRef<HTMLElement | null>(null);
  const isIsolatedSurvey = pathname.startsWith("/survey/live/");

  const closeOpenDropdowns = React.useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    nav.querySelectorAll("details[open]").forEach((dropdown) => {
      dropdown.removeAttribute("open");
    });
  }, []);

  React.useEffect(() => {
    closeOpenDropdowns();
  }, [pathname, closeOpenDropdowns]);

  if (isIsolatedSurvey) return null;

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="brand">Abundant CRM</div>
        <nav ref={navRef} aria-label="Primary navigation" className="top-nav-links">
          <Link href="/" className="top-nav-link">
            Home
          </Link>
          {showWorkbenchTabs ? (
            <>
              <details className="top-nav-dropdown">
                <summary className="top-nav-link">Pipeline</summary>
                <div className="top-nav-dropdown-menu">
                  {PIPELINE_COMPANY_TYPE_OPTIONS.map((option) => {
                    const href = option.value === "STARTUP" ? "/pipeline" : `/pipeline?companyType=${option.value}`;
                    return (
                      <Link
                        key={option.value}
                        href={href}
                        className="top-nav-dropdown-link"
                        onClick={closeOpenDropdowns}
                      >
                        {option.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
              <Link href="/health-systems" className="top-nav-link">
                Health Systems
              </Link>
              <Link href="/co-investors" className="top-nav-link">
                Co-Investors
              </Link>
              <Link href="/companies" className="top-nav-link">
                Companies
              </Link>
              <details className="top-nav-dropdown">
                <summary className="top-nav-link">Tests</summary>
                <div className="top-nav-dropdown-menu">
                  <Link href="/tests" className="top-nav-dropdown-link" onClick={closeOpenDropdowns}>
                    All Tests
                  </Link>
                  <Link href="/tests/snov-contact-lookup" className="top-nav-dropdown-link" onClick={closeOpenDropdowns}>
                    Snov Contact Lookup
                  </Link>
              <Link href="/tests/zoom-webinar-import" className="top-nav-dropdown-link" onClick={closeOpenDropdowns}>
                Zoom Webinar Import
              </Link>
              <Link
                href="/tests/transcript-member-insights"
                className="top-nav-dropdown-link"
                onClick={closeOpenDropdowns}
              >
                Transcript Member Insights
              </Link>
              <Link
                href="/tests/bookyourdata-contact-lookup"
                className="top-nav-dropdown-link"
                onClick={closeOpenDropdowns}
              >
                    BookYourData Contact Lookup
                  </Link>
                  <Link href="/workbench" className="top-nav-dropdown-link" onClick={closeOpenDropdowns}>
                    Workbench (beta)
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
