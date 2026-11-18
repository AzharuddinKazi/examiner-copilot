import { GlassPanel } from "../components/ui/glass-panel";
import { Guidelines } from "./parts";
import { Pilot } from "./pilot";

const CORE = [["Primary","primary"],["Secondary","secondary"],["Accent","accent"]];
export function OverviewPage() {
  return <div className="ds-page-stack">
    <div className="ds-core-strip">{CORE.map(([name,key]) => <div key={key}><span style={{background:`hsl(var(--${key}))`}}/><div><small>{name}</small><b>{key === "primary" ? "Golden brown" : key === "secondary" ? "Layered neutral" : "Selected gold"}</b></div></div>)}</div>
    <Pilot/>
    <div className="ds-principles-grid">
      <section><span>01</span><h3>Same setup. Both themes.</h3><p>Identical components, density and interactions. Dark follows the supplied reference; light is a derived counterpart.</p></section>
      <section><span>02</span><h3>Decisions stay human.</h3><p>Source evidence, approval states and audit history stay explicit. A visual style never changes a rating.</p></section>
      <section><span>03</span><h3>Readable, not decorative.</h3><p>Inter for the interface. Monospaced IDs and values. Restrained glass surfaces, with severity reserved for meaning.</p></section>
    </div>
    <div className="ds-scope-note"><b>Pilot scope</b> Buttons · glass panels · severity tags · stage stepper · finding cards. Uploads, decision sheets, chat, scores and report components follow after this visual review. The existing application has not been migrated.</div>
  </div>;
}
export function ColorsPage() {
  return <div className="ds-page-stack"><h2>Core palette</h2><div className="ds-swatches">{[...CORE,["Background","background"],["Text","foreground"],["Border","border"],["Critical","chart-2"],["Medium","chart-3"],["Low","chart-4"],["Cleared","chart-5"]].map(([name,key]) => <div key={key}><span style={{background:`hsl(var(--${key}))`}}/><b>{name}</b><small>{key}</small></div>)}</div>
    <Guidelines items={[{kind:"do",text:"Use one golden-brown accent family. Reserve severity colours for meaning."},{kind:"do",text:"Keep text contrast at least 4.5:1 and visible gold keyboard focus."},{kind:"dont",text:"Use complaints as an automatic change to a disclosure rating."}]}/>
    <p className="ds-scope-note">Dark colours are mapped from the supplied HTML. Light values are derived for contrast, not copied from a source light theme.</p></div>;
}
export function FontsPage() {
  return <div className="ds-page-stack"><GlassPanel className="ds-specimen"><p className="ds-eyebrow">INTER · UI / 400–800</p><h1 className="ds-type-display">Evidence, made clear.</h1><p>Examination findings should be readable at a glance.</p><small>Body reference: 13.5px / 1.45 · stage heading: 16px · sheet heading: 18px.</small></GlassPanel><GlassPanel className="ds-specimen"><p className="ds-eyebrow">JETBRAINS MONO · VALUES / 500–700</p><p className="ds-mono-sample">F1 · AED 299 ≠ 399</p><p>IDs, counts and found-versus-expected values.</p></GlassPanel><GlassPanel className="ds-specimen"><p className="ds-eyebrow">GEORGIA · LETTER BODY</p><p className="ds-serif-sample">Examination findings — credit-card disclosures.</p><p>Reserved for report text and the source's rule clauses.</p></GlassPanel></div>;
}
export function LayoutPage() {
  return <div className="ds-page-stack"><GlassPanel className="ds-specimen"><h2>Glass without losing legibility.</h2><p>18px blur · 140% saturation · restrained inset highlight. Cards 12–16px; buttons 10px; sheet top 20px.</p><div className="ds-spacing">{[4,8,12,16,24,32].map(n => <div key={n}><span style={{width:n,height:n}}/><small>{n}px</small></div>)}</div></GlassPanel>
    <Guidelines items={[{kind:"do",text:"At desktop sizes, use a 58px application header and internally scrolling panels."},{kind:"do",text:"At 900px and below, stack panels and allow page scrolling without horizontal overflow."},{kind:"do",text:"Disable motion when reduced motion is requested."},{kind:"dont",text:"Let animation obscure evidence or act as examiner approval."}]}/></div>;
}
export function PrinciplesPage() {
  return <div className="ds-page-stack"><h2>Source & interpretation</h2><p>The uploaded HTML, handover Part 4 and three app screenshots define this system. The dark mode is source-mapped; the light mode is derived. No official logo file was supplied, so the reference's text fallback is shown. This is not an official CBUAE system.</p>
    <Guidelines items={[{kind:"do",text:"Keep the navy-and-gold direction, compact hierarchy and human-review workflow."},{kind:"do",text:"Show citations and label seeded examples as synthetic."},{kind:"dont",text:"Allow AI to approve, send a letter or close an examination."},{kind:"dont",text:"Grade missing evidence as a problem."}]}/>
    <div className="ds-scope-note"><b>Scoring is outside the theme.</b> The supplied demo and existing app have opposite score directions. These components do not implement either scoring formula. Application migration must preserve or explicitly reconcile the chosen policy.</div>
  </div>;
}
