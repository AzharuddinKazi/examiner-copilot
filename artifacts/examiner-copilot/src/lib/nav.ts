import { BarChart3, BookOpen, Building2, FlaskConical, Gauge, ScrollText, ShieldQuestion, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export const FLOW: { key: "upload" | "assess" | "review" | "notices"; number: number; href: string; label: string }[] = [
  { key: "upload", number: 1, href: "/upload", label: "Upload documents" },
  { key: "assess", number: 2, href: "/assess", label: "Assess" },
  { key: "review", number: 3, href: "/review", label: "Review and decide" },
  { key: "notices", number: 4, href: "/notices", label: "Notices" },
];
export const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Market", items: [{ href: "/market", label: "Market view", icon: BarChart3 }, { href: "/market/what-if", label: "What-if sandbox", icon: FlaskConical }] },
  { title: "Library", items: [{ href: "/library/rulebook", label: "Rulebook", icon: BookOpen }, { href: "/library/banks", label: "Banks and products", icon: Building2 }] },
  {
    title: "Assurance",
    items: [
      { href: "/assurance/evaluation", label: "Agent evaluation", icon: Gauge },
      { href: "/assurance/audit", label: "Audit log", icon: ScrollText },
      { href: "/assurance/limitations", label: "Limitations", icon: ShieldQuestion },
    ],
  },
];
