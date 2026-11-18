import { lazy, type ComponentType } from "react";
import { OverviewPage, ColorsPage, FontsPage, LayoutPage, PrinciplesPage } from "./foundations";

export const DESIGN_SYSTEM = {
  title: "Examination Findings Design System",
  description: "One shared system. Two considered themes. Human decisions at every stage.",
};
export interface PreviewEntry { id: string; name: string; description: string; Page: ComponentType }
export interface NavGroup { name: string; entries: PreviewEntry[] }
export const OVERVIEW_ENTRY: PreviewEntry = {
  id: "overview", name: "Overview", description: "Five-component pilot in light and dark", Page: OverviewPage,
};
export const NAV_GROUPS: NavGroup[] = [
  { name: "Brand", entries: [{ id: "principles", name: "Principles & safeguards", description: "Source guidelines", Page: PrinciplesPage }] },
  { name: "Colors", entries: [{ id: "colors", name: "Palette & semantics", description: "Primary, secondary, accent", Page: ColorsPage }] },
  { name: "Fonts", entries: [{ id: "fonts", name: "Typography", description: "Inter, JetBrains Mono, Georgia", Page: FontsPage }] },
  { name: "Layout", entries: [{ id: "layout", name: "Surfaces & spacing", description: "Glass, radius, responsive layout", Page: LayoutPage }] },
  { name: "Components · pilot", entries: [
    { id: "buttons", name: "Buttons", description: "Gold, secondary, ghost, disabled", Page: lazy(() => import("./demos/button")) },
    { id: "panels", name: "Glass panels", description: "Layered translucent surfaces", Page: lazy(() => import("./demos/glass-panel")) },
    { id: "tags", name: "Severity tags", description: "Critical, medium, low, info, cleared", Page: lazy(() => import("./demos/tier-tag")) },
    { id: "stepper", name: "Stage stepper", description: "Completed, active, waiting", Page: lazy(() => import("./demos/stepper")) },
    { id: "findings", name: "Finding cards", description: "Evidence values and decision stamps", Page: lazy(() => import("./demos/finding-card")) },
  ] },
];
export const ALL_ENTRIES = [OVERVIEW_ENTRY, ...NAV_GROUPS.flatMap(g => g.entries)];
if (new Set(ALL_ENTRIES.map(x => x.id)).size !== ALL_ENTRIES.length) throw new Error("Duplicate preview page id.");
