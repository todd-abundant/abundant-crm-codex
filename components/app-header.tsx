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
  const closeTimerRef = React.useRef<number | null>(null);
  const [openDropdownId, setOpenDropdownId] = React.useState<"entities" | "pipeline" | "beta" | null>(null);
  const isIsolatedSurvey = pathname.startsWith("/survey/live/");

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeOpenDropdowns = React.useCallback(() => {
    clearCloseTimer();
    setOpenDropdownId(null);
  }, [clearCloseTimer]);

  const openDropdown = React.useCallback(
    (dropdownId: "entities" | "pipeline" | "beta") => {
      clearCloseTimer();
      setOpenDropdownId(dropdownId);
    },
    [clearCloseTimer]
  );

  const scheduleCloseDropdown = React.useCallback(
    (dropdownId: "entities" | "pipeline" | "beta", delayMs = 140) => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setOpenDropdownId((currentId) => (currentId === dropdownId ? null : currentId));
        closeTimerRef.current = null;
      }, delayMs);
    },
    [clearCloseTimer]
  );

  const toggleDropdown = React.useCallback(
    (dropdownId: "entities" | "pipeline" | "beta") => {
      clearCloseTimer();
      setOpenDropdownId((currentId) => (currentId === dropdownId ? null : dropdownId));
    },
    [clearCloseTimer]
  );

  const handleDropdownBlur = React.useCallback(
    (event: React.FocusEvent<HTMLElement>, dropdownId: "entities" | "pipeline" | "beta") => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
      scheduleCloseDropdown(dropdownId, 0);
    },
    [scheduleCloseDropdown]
  );

  const handleDropdownEscape = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>, dropdownId: "entities" | "pipeline" | "beta") => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      scheduleCloseDropdown(dropdownId, 0);
      const trigger = event.currentTarget.querySelector<HTMLButtonElement>(".top-nav-dropdown-toggle");
      trigger?.focus();
    },
    [scheduleCloseDropdown]
  );

  React.useEffect(() => {
    closeOpenDropdowns();
  }, [pathname, closeOpenDropdowns]);

  React.useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  if (isIsolatedSurvey) return null;

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <Link href="/" className="brand" aria-label="Go to home">
          Abundant CRM
        </Link>
        <nav aria-label="Primary navigation" className="top-nav-links">
          <Link href="/" className="top-nav-link">
            Home
          </Link>
          {showWorkbenchTabs ? (
            <>
              <div
                className={`top-nav-dropdown ${openDropdownId === "entities" ? "open" : ""}`}
                onMouseEnter={() => openDropdown("entities")}
                onMouseLeave={() => scheduleCloseDropdown("entities")}
                onFocusCapture={() => openDropdown("entities")}
                onBlurCapture={(event) => handleDropdownBlur(event, "entities")}
                onKeyDown={(event) => handleDropdownEscape(event, "entities")}
              >
                <button
                  type="button"
                  className="top-nav-link top-nav-dropdown-toggle"
                  aria-expanded={openDropdownId === "entities"}
                  aria-haspopup="true"
                  onClick={() => toggleDropdown("entities")}
                >
                  <span>Entities</span>
                  <span className="top-nav-dropdown-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>
                <div className="top-nav-dropdown-menu" role="menu" aria-label="Entities">
                  <Link href="/health-systems" className="top-nav-dropdown-link" role="menuitem" onClick={closeOpenDropdowns}>
                    Health Systems
                  </Link>
                  <Link href="/co-investors" className="top-nav-dropdown-link" role="menuitem" onClick={closeOpenDropdowns}>
                    Co-Investors
                  </Link>
                  <Link href="/contacts" className="top-nav-dropdown-link" role="menuitem" onClick={closeOpenDropdowns}>
                    Contacts
                  </Link>
                  <Link href="/companies" className="top-nav-dropdown-link" role="menuitem" onClick={closeOpenDropdowns}>
                    Companies
                  </Link>
                </div>
              </div>
              <div
                className={`top-nav-dropdown ${openDropdownId === "pipeline" ? "open" : ""}`}
                onMouseEnter={() => openDropdown("pipeline")}
                onMouseLeave={() => scheduleCloseDropdown("pipeline")}
                onFocusCapture={() => openDropdown("pipeline")}
                onBlurCapture={(event) => handleDropdownBlur(event, "pipeline")}
                onKeyDown={(event) => handleDropdownEscape(event, "pipeline")}
              >
                <Link
                  href="/pipeline"
                  className="top-nav-link top-nav-dropdown-toggle"
                  aria-expanded={openDropdownId === "pipeline"}
                  aria-haspopup="true"
                  onClick={closeOpenDropdowns}
                >
                  <span>Venture Studio Pipeline</span>
                  <span className="top-nav-dropdown-caret" aria-hidden="true">
                    ▾
                  </span>
                </Link>
                <div className="top-nav-dropdown-menu" role="menu" aria-label="Venture Studio Pipeline">
                  {PIPELINE_COMPANY_TYPE_OPTIONS.map((option) => {
                    const href = option.value === "STARTUP" ? "/pipeline" : `/pipeline?companyType=${option.value}`;
                    return (
                      <Link
                        key={option.value}
                        href={href}
                        className="top-nav-dropdown-link"
                        role="menuitem"
                        onClick={closeOpenDropdowns}
                      >
                        {option.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <Link href="/reports" className="top-nav-link">
                Reports
              </Link>
              <div
                className={`top-nav-dropdown ${openDropdownId === "beta" ? "open" : ""}`}
                onMouseEnter={() => openDropdown("beta")}
                onMouseLeave={() => scheduleCloseDropdown("beta")}
                onFocusCapture={() => openDropdown("beta")}
                onBlurCapture={(event) => handleDropdownBlur(event, "beta")}
                onKeyDown={(event) => handleDropdownEscape(event, "beta")}
              >
                <button
                  type="button"
                  className="top-nav-link top-nav-dropdown-toggle"
                  aria-expanded={openDropdownId === "beta"}
                  aria-haspopup="true"
                  onClick={() => toggleDropdown("beta")}
                >
                  <span>Beta</span>
                  <span className="top-nav-dropdown-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>
                <div className="top-nav-dropdown-menu" role="menu" aria-label="Beta">
                  <Link
                    href="/tests/transcript-member-insights"
                    className="top-nav-dropdown-link"
                    role="menuitem"
                    onClick={closeOpenDropdowns}
                  >
                    Transcript Member Insights
                  </Link>
                  <Link
                    href="/tests/co-investor-signals-digest"
                    className="top-nav-dropdown-link"
                    role="menuitem"
                    onClick={closeOpenDropdowns}
                  >
                    Stakeholder Signals Digest
                  </Link>
                  <Link href="/skin-lab" className="top-nav-dropdown-link" role="menuitem" onClick={closeOpenDropdowns}>
                    Skin Lab
                  </Link>
                  <Link href="/workbench" className="top-nav-dropdown-link" role="menuitem" onClick={closeOpenDropdowns}>
                    Workbench
                  </Link>
                </div>
              </div>
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
