import { GlassPanel } from "../../components/ui/glass-panel";
export default function GlassPanelDemo() {
  return <div className="ds-page-stack"><GlassPanel className="ds-specimen"><h2>Evidence panel</h2><p>A translucent surface, a subtle edge and one consistent 16px radius.</p><GlassPanel className="ds-specimen"><b>Nested surface</b><p>Blur never substitutes for readable contrast.</p></GlassPanel></GlassPanel></div>;
}
