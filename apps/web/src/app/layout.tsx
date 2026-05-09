import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Construction Feasibility Control Plane",
  description: "Site, scenario, cost, schedule, and Archicad feasibility workflow."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Construction Feasibility Control Plane</h1>
          <p className="muted">
            Selected sites, scenario options, feasibility bands, linked construction schedules,
            and Archicad model data in one planning workflow.
          </p>
          <nav>
            <Link href="/">Overview</Link>
            <Link href="/sites">Sites</Link>
            <Link href="/scenarios">Scenarios</Link>
            <Link href="/feasibility">Feasibility</Link>
            <Link href="/base-costs">Base Costs</Link>
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
