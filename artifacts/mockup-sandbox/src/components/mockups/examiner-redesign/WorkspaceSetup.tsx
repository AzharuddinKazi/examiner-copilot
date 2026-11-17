import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, LayoutGrid, Settings, ShieldCheck, Building2, BookOpen, FileText, ScanLine, Scale } from "lucide-react";
import "./WorkspaceSetup.css";

const groups = [
  {name:"Review flow",items:[["Upload documents · 5","/upload"],["Assess","/assess"],["Review and decide","/review"],["Notices","/notices"]]},
  {name:"Market",items:[["Market view","/market"],["What-if sandbox","/market/what-if"]]},
  {name:"Library",items:[["Rulebook","/library/rulebook"],["Banks and products","/library/banks"]]},
  {name:"Assurance",items:[["Agent evaluation","/assurance/evaluation"],["Audit log","/assurance/audit"],["Limitations","/assurance/limitations"]]},
];
const steps = [
  {title:"Add the banks and their card products",detail:"Done · 4 banks, 1 card product",body:"Your banks and card products are ready. You can add or update them in the library.",action:"View banks and products",path:"/library/banks",icon:Building2},
  {title:"Import your rulebook (.xlsx) and make it active",detail:"0 active rules",body:"Bring your examination rules into the workspace. Import a rulebook, review it, then make it active.",action:"Import a rulebook",path:"/library/rulebook",icon:BookOpen},
  {title:"Upload the card disclosures (PDF) and confirm each one",detail:"0 confirmed documents",body:"Upload the disclosures for your card products and confirm each document before assessment.",action:"Upload documents",path:"/upload",icon:FileText},
  {title:"Run an assessment for a card product",detail:"0 assessments",body:"Check a card product against your active rules. Results appear here after the first assessment.",action:"Run an assessment",path:"/assess",icon:ScanLine},
];

export function WorkspaceSetup() {
  const [expanded,setExpanded]=useState(1);
  const [menu,setMenu]=useState<string|null>(null);
  return <div className="ec-workspace">
    <header className="ec-top">
      <a href="/" target="_blank" rel="noreferrer" className="ec-brand"><span className="ec-logo">EC</span>Examiner Co-Pilot</a>
      <nav className="ec-nav" aria-label="Main navigation">
        <button className="ec-active" onClick={()=>{setMenu(null);setExpanded(1)}}><LayoutGrid/>Dashboard</button>
        {groups.map(group=><div className="ec-navitem" key={group.name}>
          <button onClick={()=>setMenu(menu===group.name?null:group.name)} aria-expanded={menu===group.name}>{group.name}<ChevronDown/></button>
          {menu===group.name&&<div className="ec-dropdown">{group.items.map(([label,path])=><a key={path} href={path} target="_blank" rel="noreferrer">{label}<ArrowRight/></a>)}</div>}
        </div>)}
      </nav>
      <div className="ec-navitem">
        <button className="ec-profile" onClick={()=>setMenu(menu==="profile"?null:"profile")} aria-label="User menu" aria-expanded={menu==="profile"}>
          <span className="ec-avatar">AK</span><span className="ec-profile-text">azharuddin k…<small>Senior examiner</small></span><ChevronDown/>
        </button>
        {menu==="profile"&&<div className="ec-dropdown" style={{left:"auto",right:0}}><a href="/settings" target="_blank" rel="noreferrer">Settings<Settings/></a></div>}
      </div>
    </header>
    <main className="ec-main" onClick={()=>menu&&setMenu(null)}>
      <div className="ec-breadcrumb"><LayoutGrid/><span>Workspace</span><ChevronRight/><span>Dashboard</span></div>
      <div className="ec-titlebar"><span className="ec-overline">Your examination workspace</span><span className="ec-status"><i/>Workspace setup in progress</span></div>
      <div className="ec-layout">
        <section className="ec-intro">
          <h1>What needs<br/>your attention?</h1>
          <p>Nothing has been assessed yet. Set up the workspace in four steps; results appear here after the first assessment.</p>
          <div className="ec-progress">
            <div className="ec-progress-head"><span>Workspace readiness</span><strong>01 / 04</strong></div>
            <div className="ec-bars" aria-label="1 of 4 setup steps complete"><span/><span/><span/><span/></div>
            <p>One step complete. Next up, your rulebook.</p>
            <div className="ec-library">
              <div><b>4</b><span>banks in library</span></div><div><b>1</b><span>card product</span></div>
            </div>
          </div>
        </section>
        <section aria-label="Get started">
          <div className="ec-checklist">
            <div className="ec-listhead"><h2>Set up your workspace</h2><span>4 STEPS</span></div>
            {steps.map((step,index)=><article className={`ec-step ${expanded===index?"expanded":""}`} key={step.title}>
              <button className="ec-stepbutton" onClick={()=>setExpanded(expanded===index?-1:index)} aria-expanded={expanded===index}>
                <span className={`ec-stepnumber ${index===0?"done":index===1?"current":""}`}>{index===0?<Check/>:`0${index+1}`}</span>
                <span className="ec-stepcopy"><h3>{step.title}</h3><p>{step.detail}</p></span>
                {expanded===index?<ChevronDown/>:<ChevronRight/>}
              </button>
              {expanded===index&&<div className="ec-expanded"><p>{step.body}</p><a className="ec-cta" href={step.path} target="_blank" rel="noreferrer">{step.action}<ArrowRight/></a>{index===1&&<small>Excel workbook · .xlsx</small>}</div>}
            </article>)}
          </div>
          <div className="ec-after"><ShieldCheck/><span>You make the decisions. Agent proposals are never final until you confirm them.</span></div>
        </section>
      </div>
      <footer className="ec-footer"><div className="ec-bottom-note"><Scale/><span>EXAMINER CO-PILOT / WORKSPACE</span></div><a href="/settings" target="_blank" rel="noreferrer"><Settings/>Workspace settings<ArrowRight/></a></footer>
    </main>
  </div>;
}

export default WorkspaceSetup;
