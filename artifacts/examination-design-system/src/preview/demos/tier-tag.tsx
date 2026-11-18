import { TierTag, TIER_LABELS, type Tier } from "../../components/ui/tier-tag";
export default function TierTagDemo() {
  return <div className="ds-page-stack"><div className="ds-button-row">{(Object.keys(TIER_LABELS) as Tier[]).map(t => <TierTag key={t} tier={t}/>)}</div><p>Each tag includes a dot and a text label. Info needed remains neutral and is never graded.</p></div>;
}
