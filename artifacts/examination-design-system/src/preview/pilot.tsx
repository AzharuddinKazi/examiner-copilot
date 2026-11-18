import { useState } from "react";
import { ArrowRight, Download, FileCheck2, Layers3, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { GlassPanel } from "../components/ui/glass-panel";
import { TierTag, type Tier } from "../components/ui/tier-tag";
import { Stepper } from "../components/ui/stepper";
import { FindingCard } from "../components/ui/finding-card";

export const STAGES = [
  { id: "upload", label: "Upload" }, { id: "review", label: "AI review" },
  { id: "investigate", label: "Investigate" }, { id: "scores", label: "Scores & complaints" },
  { id: "report", label: "Report" },
];
export function Pilot() {
  const [stage, setStage] = useState("investigate");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  return <div className="ds-pilot">
    <div className="ds-section-title"><span>01 — COMPONENTS IN CONTEXT</span><span>Interactive specimen · synthetic examples</span></div>
    <GlassPanel className="ds-workbench">
      <div className="ds-workbench-header"><span className="ds-specimen-icon"><ShieldCheck size={18}/></span><div><strong>Examination workspace</strong><small>One consistent setup in light and dark</small></div><span className="ds-example-label">DESIGN PREVIEW</span></div>
      <div className="ds-stepper-wrap"><Stepper steps={STAGES} current={stage} completed={["upload","review"]} onStepChange={setStage}/></div>
      <div className="ds-workbench-body">
        <div className="ds-workbench-caption"><div><h2>Investigate findings</h2><p>Evidence first. Examiner decides.</p></div><Button variant="gold" size="small" onClick={() => setSelected("F1")}>Next to decide <ArrowRight size={13}/></Button></div>
        <div className="ds-finding-stack">
          <FindingCard findingId="F1" tier="critical" question="Is the annual fee the same in every document?" found="AED 299 ≠ 399" expected="Equal across docs" onClick={() => setSelected("F1")}/>
          <FindingCard findingId="F7" tier="medium" question="Are customers warned before interest rates change?" onClick={() => setSelected("F7")}/>
          <FindingCard findingId="F3" tier="low" question="Are reward limits shown next to the offer?" onClick={() => setSelected("F3")}/>
          <FindingCard findingId="G1" tier="info" question="Is there a cooling-off period?" onClick={() => setSelected("G1")}/>
          <FindingCard findingId="F4" tier="cleared" question="Does the summary explain minimum repayments?" stamp="Approved" onClick={() => setSelected("F4")}/>
        </div>
        {selected && <div className="ds-selection" role="status"><FileCheck2 size={16}/><span><b>{selected} selected.</b> In the app, this opens the evidence and decision sheet. This is a component preview.</span><button onClick={() => setSelected(null)} aria-label="Dismiss selection">×</button></div>}
      </div>
      <div className="ds-workbench-footer"><span><ShieldCheck size={13}/> AI proposes. Examiners approve.</span><Button size="small" onClick={() => setMessage("Export styling preview only. No report was created or downloaded.")}><Download size={12}/> Export draft</Button></div>
    </GlassPanel>
    <div className="ds-specimen-grid">
      <GlassPanel className="ds-specimen"><div className="ds-specimen-heading"><span>02 / ACTIONS</span><Layers3 size={15}/></div><h3>Gold means take action.</h3><p>One accent family, with a gradient that stays gold on hover.</p><div className="ds-button-row"><Button variant="gold" onClick={() => setMessage("Primary action activated in the specimen.")}>Continue <ArrowRight size={13}/></Button><Button onClick={() => setMessage("Secondary action activated in the specimen.")}>Review evidence</Button><Button disabled>Waiting</Button></div></GlassPanel>
      <GlassPanel className="ds-specimen"><div className="ds-specimen-heading"><span>03 / SEMANTICS</span><ShieldCheck size={15}/></div><h3>Colour carries meaning.</h3><p>Labels and dots keep severity clear without relying on colour alone.</p><div className="ds-button-row">{(["critical","medium","low","info","cleared"] as Tier[]).map(t => <TierTag key={t} tier={t}/>)}</div></GlassPanel>
    </div>
    {message && <p className="ds-selection" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></p>}
  </div>;
}
