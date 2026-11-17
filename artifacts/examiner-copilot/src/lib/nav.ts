export type NavItem = { href: string; label: string };
export const FLOW: { key: "upload" | "assess" | "review" | "notices"; number: number; href: string; label: string }[] = [
  { key: "upload", number: 1, href: "/upload", label: "Upload documents" },
  { key: "assess", number: 2, href: "/assess", label: "Assess" },
  { key: "review", number: 3, href: "/review", label: "Review and decide" },
  { key: "notices", number: 4, href: "/notices", label: "Notices" },
];
export const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Market", items: [{ href: "/market", label: "Market view" }, { href: "/market/what-if", label: "What-if sandbox" }] },
  { title: "Library", items: [{ href: "/library/rulebook", label: "Rulebook" }, { href: "/library/banks", label: "Banks and products" }] },
  {
    title: "Assurance",
    items: [
      { href: "/assurance/evaluation", label: "Agent evaluation" },
      { href: "/assurance/audit", label: "Audit log" },
      { href: "/assurance/limitations", label: "Limitations" },
    ],
  },
];
