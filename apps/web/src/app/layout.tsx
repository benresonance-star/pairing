import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Archicad CCP MVP",
  description: "First-slice control plane for Archicad package assignment workflow."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Archicad Construction Control Plane MVP</h1>
          <p className="muted">
            First vertical slice: inbound sync for zones and selected elements, package assignment
            change sets, approvals, and recorded Archicad write-back payloads.
          </p>
          <nav>
            <Link href="/">Overview</Link>
            <Link href="/scenarios">Scenarios</Link>
            <Link href="/objects">Objects</Link>
            <Link href="/change-sets">Change Sets</Link>
            <Link href="/linear-schedule">Linear Schedule</Link>
            <Link href="/integrations/archicad">Integrations</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
