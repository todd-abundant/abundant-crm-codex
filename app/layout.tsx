import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Abundant CRM",
  description: "Enterprise CRM + workflow for digital health investing"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top-nav">
          <div className="top-nav-inner">
            <div className="brand">Abundant CRM</div>
            <nav aria-label="Primary navigation">
              <Link href="/" className="top-nav-link">
                Health Systems
              </Link>
              <Link href="/co-investors" className="top-nav-link">
                Co-Investors
              </Link>
              <Link href="/companies" className="top-nav-link">
                Companies
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
