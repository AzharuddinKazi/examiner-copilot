# Development replica: environment and integration boundary

This is an isolated synthetic development app, not a replacement for Examiner Co-Pilot or an official regulatory system. The accepted build proposal authorizes the reference workflow replica; live integration remains separate work.

## Product and flow

An examiner selects a masked institution and prepares three input groups.
A seeded review illustrates how disclosure rules produce evidence-linked findings.
The investigation graph maps each finding to all of its source documents.
The examiner reviews evidence and records decisions; the assistant cannot sign.
Scores and complaint analysis provide context for a selected findings letter.
The examiner generates a versioned draft and explicitly confirms close/reset.

Flow: Upload → seeded AI review → Investigate → Scores & complaints → Report → confirmed close/reset.

## Environment discovery

| Area | Status | Finding or assumption |
|---|---|---|
| Stack | FOUND | Current product uses Next.js 15, Express 5, PostgreSQL/Drizzle and pnpm (`replit.md`, package manifests). The separate browser-only replica uses the registered React/Vite scaffold; the current Next.js app is unchanged. |
| Design system | FOUND | `artifacts/examination-design-system/docs/AGENTS.md` mandates shared package tokens and the five existing component families. Inter and JetBrains Mono are source fonts. Light is derived; dark follows the supplied reference. |
| Hosting | FOUND / ASSUMED | Artifact routing gives this app its own `/examination-replica/` prefix. Current web stays at `/`; API stays at `/api`. Development browser preview is the delivery target, not an approved institutional hosting environment. External font access follows the existing design-system CSS; offline fonts are not guaranteed. |
| Identity | FOUND / ASSUMED | The current app has Clerk and server-owned Examiner/Senior examiner/Viewer roles (`replit.md`). Replica decisions use a visibly synthetic examiner, not authenticated sign-off. No authorization parity is claimed. |
| Fusion DB | FOUND / ASSUMED | Current project stores metadata and existing uploads in PostgreSQL. Replica is deliberately browser-only and must disclose actual session storage; “Fusion DB” is a reference architecture label, not a connected database. |
| Documents | FOUND | Current app performs PDF page extraction without OCR (`replit.md`). Replica evidence is synthetic source text; selecting a local file does not parse or assess it. Arabic evidence text is not an Arabic interface or OCR capability. |
| Rulebook | FOUND | Current app accepts mapped XLSX/CSV and versions/activates rulebooks. Replica uses the reference paraphrased 100-rule pack; it is not an official rulebook. |
| Complaints | FOUND / NEED FROM USER | Existing API exposes bank/category counts, not the reference's individual 30-field extract (`lib/api-spec/openapi.yaml`). Replica uses synthetic records and client-side periods. A real row-level schema and approved source are needed before integration. |
| AI | FOUND / ASSUMED | Current app has an existing server model adapter. Replica uses deterministic, labelled answers only; no model calls, credentials or data-residency approval are involved. |
| Audit | FOUND / NEED FROM USER | Current app has server append-only hash-chained events. Replica exports demo events, which are not tamper-proof official records. Institutional retention and closure policy need confirmation before live integration. |
| Exports | FOUND | Reference requests Word-compatible HTML `.doc`, browser print and audit JSON. These must be labelled honestly, not called native DOCX/PDF generation. Current app has separate native report export paths. |
| Language | ASSUMED | English interface with synthetic Arabic evidence where provided; full RTL localization is not in this replica scope. |
| Security | FOUND / NEED FROM USER | Accepted scope permits synthetic data only. Do not connect live data or accept real PII as demo content. Real-data classification, residency and authorization require separate approval. |
| Delivery | FOUND / NEED FROM USER | Separate registered web artifact; typecheck/build and one browser acceptance journey. Institutional release owners, deployment target and CI approval policy are not established by this demo. |
| Demo | FOUND / ASSUMED | Handover specifies 1440×900 and 1280×720 desktop, 390px mobile. No offline/projector guarantee beyond these viewport checks. |

## Mapping for later integration

| Reference concept | Replica | Future current-product connection |
|---|---|---|
| LFI/product | Masked fictional fixture | Banks and products API; preserve stable server IDs, authorized display names |
| Documents | Synthetic pages/line IDs; local-file metadata only | Confirmed document IDs, extraction pages and verified evidence spans; no guessed page coordinates |
| Rule pack | Paraphrased reference rules | Active rulebook version and exact rule IDs |
| AI review | Deterministic seeded adapter | Existing assessment service, progress and failure states; never fallback to fixtures after live failure |
| Finding graph | Relationships from finding document references | All verified evidence documents per finding, including one-to-many links |
| Finding status | Pass, Fail, Warning, Insufficient, NA | Explicit mapping to Compliant, Breach, Warning, Needs review, Not applicable; severity remains separate |
| Decisions | Demo Approve/Adjust/Reject/Request info | Server Accept/Modify/Reject and information-request policy; identity from signed-in session |
| Reopen | Demo decision removed/replaced with audit event | Append a new decision/event; never delete historical server decisions |
| Approval | Demo examiner stamp | Preserve maker-checker rules: different senior examiner required where applicable |
| Scores | Reference 4 Good → 1 Critical | Current product 1 Strong → 4 Weak: do not invert silently. Obtain explicit policy approval before any translation |
| Complaints | Individual seeded rows and six computed metrics | Existing aggregate counts cannot supply acknowledgement/resolution/redress KPIs; add an approved schema first |
| Chat | Scoped deterministic responses with citations | Server adapter with evidence validation and role limits; never permit AI sign-off |
| Report | Signed demo selections and stale version guard | Current notices eligibility, submit/approve/return, sync and latest-assessment freshness rules |
| Deadlines | Reference letter's 30-day demo text | Current product's 14 business days from examiner reference date; preserve unless explicitly changed |
| Close/reset | Explicit demo confirmation and new case | Define durable case lifecycle and server locking; retain audit and authorized access |
| Storage/audit | Browser-only demo state and downloads | Existing authenticated APIs and append-only audit; no fixture writes into live dataset |

## Guardrails for the next implementation

- Keep provider interfaces separate from rendering and make mode explicit.
- A live adapter must fail explicitly; it must not silently show synthetic findings.
- Preserve server-owned identity, approval eligibility and append-only history.
- Browser metadata selection is not upload, parsing, OCR or persisted server storage.
- Do not introduce fixture rows into the existing live database.
- Do not change the current project's route, stack, scoring or deadlines as part of a visual migration.
- Full shared-library expansion remains subject to the design pilot review; this app consumes the existing package and owns product-specific compositions.

## Verification milestones

1. Shared theme resolves and its Button renders before broader UI build.
2. Home and run match source; unsupported LFIs cannot run.
3. Graph relationships, filters, evidence and decision guardrails work.
4. Period-based metrics, interpretation and scores agree with fixture calculations.
5. Signed-only report selections, version staleness, downloads and confirmed close/reset work.
6. Desktop/mobile, light/dark, reduced-motion, escaping and keyboard checks are recorded in `ACCEPTANCE.md`.
