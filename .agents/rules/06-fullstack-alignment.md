# ⚠️ OpsFlow Rule 06 — Full-Stack Alignment & Visual Parity

> **Scope:** Full-Stack Alignment, Visual Parity, UI Verification, Human-in-the-Loop Gateway  
> **Source:** Derived from AGENTS.md §0 Fundamental Directive, Flow 03, Flow 06  
> **Applicability:** All Cloud Functions, Genkit Tools, Pinia Stores and Quasar Components

---

## 🚫 1. The Core Prohibition: No Orphan Backend Logic

It is strictly forbidden to build backend Cloud Functions, Genkit tools, or Firestore listeners without their immediate reactive counterpart in the Quasar 2 Frontend.
Every single state, tool execution, or AI decision MUST be visible, interactive, reviewable, and testable on screen:

- **New Cloud Function:** Must be wired to a corresponding Pinia action, loading state, error toast, and visual trigger button or modal.
- **New Tool Call:** Must emit visual event updates rendered in `TaskChatWindow.vue` or `EntityTimelineCard.vue`.
- **New Data Attribute:** Must be represented in `SubTaskEntityModal.vue` or `TaskKeyPointsCard.vue`.

---

## 🛡️ 2. The Human-in-the-Loop Gateway (`ApprovalCard.vue`)

No agent or background function may autonomously perform mutations against external systems (e.g. Google Sheets writeback, sending automated emails, inviting third parties) without human approval:

- The agent issues a structured execution proposal in status `pending-approval`.
- The frontend renders an `ApprovalCard.vue` showing a clear diff of the proposed operation, along with Dust.tt Evidence Citation Chips (`[🟢 VERIFIED]`).
- The mutation executes ONLY when the human operator explicitly clicks `"Approve & Execute"`.

---

## 🔄 3. Circular Reconciliation (Batch Push-Back)

- While continuous bi-directional cell syncing is prohibited to avoid API quota exhaustion, the UI must provide an on-demand batch action: `[Esporta Esiti su Foglio]`.
- This action generates an `ApprovalCard.vue` differential modal and performs a single deterministic `sheets.values.batchUpdate` call to reconcile outcomes (`Won`/`Lost`) and screening notes back to the client's original sheet.
