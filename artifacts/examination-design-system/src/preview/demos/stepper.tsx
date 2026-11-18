import { useState } from "react";
import { Stepper } from "../../components/ui/stepper";
import { STAGES } from "../pilot";
export default function StepperDemo() {
  const [stage,setStage] = useState("investigate");
  return <div className="ds-page-stack"><Stepper steps={STAGES.map(s => ({...s,disabled:s.id === "report"}))} current={stage} completed={["upload","review"]} onStepChange={setStage}/><p role="status">Selected: {stage}. Report is disabled to demonstrate application-controlled gating.</p></div>;
}
