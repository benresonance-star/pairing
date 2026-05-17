import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDataSourceMode } from "../lib/data-source";
import { appNavSections } from "../lib/app-nav-routes";

export const metadata = {
  title: "Construction Feasibility Control Plane",
  description: "Site, scenario, cost, schedule, and Archicad feasibility workflow."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const dataSourceMode = getDataSourceMode();
  const dataSourceLabel = dataSourceMode === "supabase" ? "Supabase" : "Demo JSON";

  return (
    <html lang="en">
      <body>
        <main>
          <h1 className="sr-only">Construction Feasibility Control Plane</h1>
          <div className="app-header">
            <div className={`data-source-badge data-source-badge--${dataSourceMode}`} title="Current app data source">
              <span>Data Source</span>
              <strong>{dataSourceLabel}</strong>
            </div>
          </div>
          <nav aria-label="Primary workflow">
            {appNavSections.map((section) => (
              <div className="nav-section" key={section.label}>
                <span className="nav-section-title">{section.label}</span>
                <div className="nav-section-links">
                  {section.links.map((link) => (
                    <Link href={link.href} key={link.href}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
