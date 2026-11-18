import { useState } from "react";
import { FindingCard } from "../../components/ui/finding-card";
export default function FindingCardDemo() {
  const [picked,setPicked] = useState("");
  return <div className="ds-page-stack"><FindingCard findingId="F1" question="Is the annual fee the same in every document?" tier="critical" found="AED 299 ≠ 399" expected="Equal" onClick={() => setPicked("F1")}/>{(["Approved","Adjusted","Rejected","Info requested"] as const).map((stamp,i) => <FindingCard key={stamp} findingId={`F${i+2}`} question={`Finding with ${stamp.toLowerCase()} decision`} tier={stamp === "Info requested" ? "info" : "cleared"} stamp={stamp} onClick={() => setPicked(stamp)}/>)}<FindingCard findingId="G1" tier="info" question="Dimmed because it does not match the active filter" dimmed onClick={() => setPicked("G1")}/><FindingCard findingId="G2" tier="info" question="Disabled finding" disabled/><p role="status">{picked ? `Selected ${picked}` : "Select a specimen."}</p></div>;
}
