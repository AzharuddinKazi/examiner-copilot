import { useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, X } from 'lucide-react';

export const base = '/__mockup/preview/examiner-redesign/';
const utilities: Record<string, string[]> = {
  'Upload documents': ['Add public or synthetic KFS, terms, rewards or fee schedules.', 'Supported formats: PDF, DOCX · English and Arabic', 'Documents remain in this local demonstration.'],
  'Market view': ['ADCB · 2 products under review', 'ADIB · 1 product under review', 'CBD · 1 product under review', 'Mashreq · 2 products under review'],
  'What-if sandbox': ['Test a proposed disclosure against Rulebook v3.', 'No decisions or draft notices are changed in the sandbox.'],
  'Rulebook': ['Rulebook v3 · In force 1 Oct 2026', 'CPR-KFS-04 · Annual and monthly APR', 'CPR-FEE-11 · Late payment fee disclosure', 'CPR-KFS-09 · Minimum-payment warning', 'CPR-LANG-02 · Arabic / English equivalence', 'CPR-RWD-03 · Points expiry'],
  'Banks & products': ['ADCB · TouchPoints Platinum / Lulu Titanium', 'ADIB · Cashback Visa', 'CBD · Super Saver', 'Mashreq · Cashback / Noon'],
  'Agent evaluation': ['Evaluation set · 84 synthetic disclosures', 'Latest run · 11 Nov 2026, 18:42 GST', 'Human judgement is required for every proposed finding.'],
  'Audit log': ['12 Nov 2026 · 08:42 · Briefing prepared', '11 Nov 2026 · 16:38 · CBD notice drafted', '11 Nov 2026 · 15:14 · Rulebook v3 assessment completed'],
  'Limitations': ['Demonstration only. Not an official CBUAE system.', 'All displayed excerpts and decisions are synthetic.', 'Agent suggestions are not regulatory determinations.', 'Notices are drafted only. Nothing is sent to banks.'],
  'Settings': ['Azharuddin K. · Senior examiner', 'Working timezone · Asia/Dubai (GST)', 'Keyboard shortcuts · J / K / C / D / E', 'Rulebook · v3 (in force 1 Oct 2026)'],
};

export function BankLogo({ bank }: {bank:string}) {
  return <span className="bank-logo"><img src={`/__mockup/images/banks/${bank.toLowerCase()}.${bank === 'Mashreq' ? 'png' : 'svg'}`} alt={bank} /></span>;
}

export function Chrome({ page, children, queueCount=7, noticeCount=1, auditEntries=[] }: {page:'briefing'|'triage';children:ReactNode;queueCount?:number;noticeCount?:number;auditEntries?:string[]}) {
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [file, setFile] = useState('');
  return <div className="examiner-app">
    <header className="masthead">
      <a className="brand" href={`${base}Briefing`}><span className="brand-mark">E/</span><span>Examiner Co-Pilot<small>SUPERVISORY WORKBENCH</small></span></a>
      <div className="masthead-right"><span className="synthetic">Public / synthetic documents</span><button className="user" onClick={()=>setPanel('Settings')}><span className="avatar">AK</span><span><strong>Azharuddin K.</strong><small>Senior examiner</small></span><ChevronDown size={12}/></button></div>
    </header>
    <nav className="navigation" aria-label="Main navigation">
      <a href={`${base}Briefing`} className={page==='briefing'?'active':''}>Briefing</a>
      <a href={`${base}TriageInbox`} className={page==='triage'?'active':''}>Review & decide <span className="nav-count">{queueCount}</span></a>
      <a href={`${base}TriageInbox?type=Document`}>Assess</a>
      <a href={`${base}TriageInbox?type=Notice`}>Notices <span className="nav-count">{noticeCount}</span></a>
      <button onClick={()=>setMenu(!menu)} aria-expanded={menu}>Workspace <ChevronDown size={12}/></button>
      <span className="nav-end mono muted" style={{display:'flex',alignItems:'center'}}>Rulebook v3 <span style={{margin:'0 9px',opacity:.5}}>/</span> in force 1 Oct 2026</span>
      {menu&&<div className="desk-menu"><div className="eyebrow" style={{marginBottom:8}}>Your workspace</div>{Object.keys(utilities).map(name=><button key={name} onClick={()=>{setPanel(name);setMenu(false);}}>{name}<ArrowRight size={12}/></button>)}</div>}
    </nav>
    {children}
    <footer className="page-footer"><span>Examiner judgement remains final. Notices are drafted, never sent.</span><span>Demonstration workspace · Not an official CBUAE system</span></footer>
    {panel&&<div className="overlay" onClick={()=>setPanel(null)}><section role="dialog" aria-modal="true" aria-label={panel} className="utility-panel" onClick={e=>e.stopPropagation()}><button className="text-link" onClick={()=>setPanel(null)}><X size={15}/> Close workspace panel</button><h2>{panel}</h2>{[...(panel==='Audit log'?auditEntries:[]),...utilities[panel]].map((text,i)=><div className="utility-row" key={i}>{text}</div>)}{panel==='Upload documents'&&<div style={{marginTop:25}}><label className="btn" style={{cursor:'pointer'}}>Choose document<input type="file" accept=".pdf,.docx" hidden onChange={e=>setFile(e.target.files?.[0]?.name||'')}/></label>{file&&<p style={{marginTop:15}}>{file} selected. This mockup does not upload files.</p>}</div>}{panel==='What-if sandbox'&&<textarea aria-label="Test disclosure" placeholder="Paste a disclosure to explore…" style={{width:'100%',height:150,padding:15,border:'1px solid var(--line)',background:'var(--sheet)'}}/>}<p style={{marginTop:25,fontSize:10}}>Local preview · No live supervisory data</p></section></div>}
  </div>;
}
