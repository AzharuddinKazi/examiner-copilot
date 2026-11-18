# Source-backed component inventory

Source: user-supplied Examination Findings Assistant HTML and handover, 18 November 2026.
The source is authored as native HTML controls, CSS classes and application-level JavaScript, not a React component package. React ports preserve native button behavior and expose application-owned state via callbacks. No private runtime or external UI behavior dependency is required for the pilot. Uploaded source is user-provided material; no third-party component code was copied.

Dark is source-mapped. Light is derived. All source paths below are workspace-relative.
Ordering uses the handover's documented component prominence, shared dependencies, and first-screen usage. Only chunk 1 is implemented until visual approval.

| Family | Build reference | Dependencies | Chunk | State |
|---|---|---|---|---|
| Button | [button](components/button.md) | Native button | 1 | implemented |
| GlassPanel | [glass-panel](components/glass-panel.md) | Shared tokens | 1 | implemented |
| TierTag | [tier-tag](components/tier-tag.md) | Shared tokens | 1 | implemented |
| Stepper | [stepper](components/stepper.md) | Native button | 1 | implemented |
| FindingCard | [finding-card](components/finding-card.md) | TierTag | 1 | implemented |
| FlowNode | [flow-node](components/flow-node.md) | GlassPanel | 2 | pending |
| Connector | [connector](components/connector.md) | Shared tokens | 2 | pending |
| UploadCard | [upload-card](components/upload-card.md) | GlassPanel, Button | 2 | pending |
| LfiPicker | [lfi-picker](components/lfi-picker.md) | Native select | 2 | pending |
| PeriodPicker | [period-picker](components/period-picker.md) | Native select/date | 2 | pending |
| ScorePill | [score-pill](components/score-pill.md) | Shared tokens; scoring provided by app | 3 | pending |
| DocumentNode | [document-node](components/document-node.md) | ScorePill | 3 | pending |
| ComparisonViz | [comparison-viz](components/comparison-viz.md) | Native button | 3 | pending |
| EvidenceQuote | [evidence-quote](components/evidence-quote.md) | Native button | 3 | pending |
| RuleBox | [rule-box](components/rule-box.md) | TierTag | 3 | pending |
| DecisionPanel | [decision-panel](components/decision-panel.md) | RuleBox, Button | 4 | pending |
| Stamp | [stamp](components/stamp.md) | Button | 4 | pending |
| AiChat | [ai-chat](components/ai-chat.md) | Button | 4 | pending |
| Dialog | [dialog](components/dialog.md) | Button, focus management | 4 | pending |
| Toast | [toast](components/toast.md) | Live region | 4 | pending |
| KpiTile | [kpi-tile](components/kpi-tile.md) | GlassPanel | 5 | pending |
| RelationRow | [relation-row](components/relation-row.md) | TierTag | 5 | pending |
| ReportItem | [report-item](components/report-item.md) | TierTag, native checkbox | 5 | pending |
| Letter | [letter](components/letter.md) | Typography | 5 | pending |

Found/Expected chips and mini stamps are FindingCard subcomponents, not extra families. Full decision stamps remain chunk 4. Application screens, data models, scoring engines and seeded demos are not design-system primitives.
