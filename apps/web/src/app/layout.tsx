import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDataSourceMode } from "../lib/data-source";

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
          <div className="app-header">
            <div>
              <h1>Construction Feasibility Control Plane</h1>
              <p className="muted">
                Selected sites, scenario options, feasibility bands, linked construction schedules,
                and Archicad model data in one planning workflow.
              </p>
            </div>
            <div className={`data-source-badge data-source-badge--${dataSourceMode}`} title="Current app data source">
              <span>Data Source</span>
              <strong>{dataSourceLabel}</strong>
            </div>
          </div>
          <nav>
            <Link href="/">Overview</Link>
            <Link href="/sites">Sites</Link>
            <Link href="/scenarios">Scenarios</Link>
            <Link href="/feasibility">Feasibility</Link>
            <Link href="/base-costs">Base Costs</Link>
            <Link href="/project-network">Project Network</Link>
            <Link href="/linear-schedule">Linear Schedule</Link>
            <Link href="/objects">Objects</Link>
            <Link href="/change-sets">Change Sets</Link>
            <Link href="/integrations/archicad">Integrations</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
