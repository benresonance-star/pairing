/** Flattened primary nav destinations (keep in sync with root layout sections). */
export const appNavRouteOptions: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/sites", label: "Sites" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/feasibility", label: "Feasibility" },
  { href: "/project-network", label: "Project Network" },
  { href: "/base-costs", label: "Assumptions" },
  { href: "/integrations/archicad", label: "Archicad Sync" },
  { href: "/objects", label: "Inventory" },
  { href: "/change-sets", label: "Model Change Approvals" }
];

export type NavSection = { label: string; links: { href: string; label: string }[] };

export const appNavSections: NavSection[] = [
  {
    label: "Dashboard",
    links: [{ href: "/", label: "Overview" }]
  },
  {
    label: "Opportunities",
    links: [
      { href: "/sites", label: "Sites" },
      { href: "/scenarios", label: "Scenarios" },
      { href: "/feasibility", label: "Feasibility" }
    ]
  },
  {
    label: "Review Network",
    links: [{ href: "/project-network", label: "Project Network" }]
  },
  {
    label: "Assumptions",
    links: [{ href: "/base-costs", label: "Assumptions" }]
  },
  {
    label: "Archicad Connect",
    links: [
      { href: "/integrations/archicad", label: "Archicad Sync" },
      { href: "/objects", label: "Inventory" },
      { href: "/change-sets", label: "Model Change Approvals" }
    ]
  }
];
