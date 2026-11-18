import { Suspense, useEffect, useState } from "react";
import { Moon, Sun, ArrowUpRight, PanelLeft } from "lucide-react";
import { ALL_ENTRIES, DESIGN_SYSTEM, NAV_GROUPS, OVERVIEW_ENTRY } from "./registry";
import { Button } from "../components/ui/button";
import "../examination.css";
import "./preview.css";

function initialTheme(): "light" | "dark" {
  const query = new URLSearchParams(location.search).get("theme");
  if (query === "light" || query === "dark") return query;
  try { return localStorage.getItem("examination-theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
}
export function DesignSystemBrowser() {
  const [theme, setTheme] = useState(initialTheme);
  const [page, setPage] = useState(() => new URLSearchParams(location.hash.slice(1)).get("page") ?? "overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem("examination-theme", theme); } catch { /* storage may be disabled */ }
  }, [theme]);
  useEffect(() => {
    const onHash = () => setPage(new URLSearchParams(location.hash.slice(1)).get("page") ?? "overview");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const active = ALL_ENTRIES.find(x => x.id === page) ?? OVERVIEW_ENTRY;
  const Page = active.Page;
  function select(id: string) {
    location.hash = `page=${id}`;
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }
  return <div className="ds-browser">
    <aside className={`ds-sidebar ${mobileOpen ? "is-open" : ""}`}>
      <div className="ds-identity"><span className="ds-text-mark">CBUAE</span><span>MARKET CONDUCT<br/><b>Design language</b></span></div>
      <div className="ds-nav-caption">EXAMINATION FINDINGS</div>
      <nav aria-label="Design system">
        <button className="ds-nav-link" aria-current={active.id === "overview" ? "page" : undefined} onClick={() => select("overview")}>Overview <span>↗</span></button>
        {NAV_GROUPS.map(group => <section key={group.name}>
          <h2>{group.name}</h2>
          {group.entries.map(e => <button key={e.id} className="ds-nav-link" aria-current={active.id === e.id ? "page" : undefined} onClick={() => select(e.id)}>{e.name}</button>)}
        </section>)}
      </nav>
      <div className="ds-sidebar-footer"><span className="ds-status-dot"/> Source-backed pilot<br/><small>Dark matched · light derived<br/>Synthetic demo · not an official system</small></div>
    </aside>
    <div className="ds-main">
      <header className="ds-topbar">
        <button className="ds-mobile-toggle" aria-label="Toggle sections" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><PanelLeft size={18}/></button>
        <span>Design system <span className="ds-breadcrumb">/ {active.name}</span></span>
        <div className="ds-theme-controls" role="group" aria-label="Theme">
          <button aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14}/> Light</button>
          <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14}/> Dark</button>
        </div>
      </header>
      <main className="ds-content">
        <div className="ds-page-heading">
          <p className="ds-eyebrow">MARKET CONDUCT · SUPTECH</p>
          <h1>{active.id === "overview" ? <>Built for examination.<br/><em>Designed for clarity.</em></> : active.name}</h1>
          <p>{active.id === "overview" ? DESIGN_SYSTEM.description : active.description}</p>
          {active.id === "overview" && <div className="ds-pilot-line"><span className="ds-status-dot"/> COMPONENT PILOT <span>05 families</span><span>02 themes</span><a href="#page=principles">Source guidelines <ArrowUpRight size={12}/></a></div>}
        </div>
        <Suspense fallback={<p role="status">Loading component…</p>}><Page /></Suspense>
        <footer className="ds-footer"><span>{DESIGN_SYSTEM.title}</span><span>Reference-aligned · accessible states · shared tokens</span></footer>
      </main>
    </div>
  </div>;
}
