# 🛡️ OpsFlow Rule 04 — Zero-Hallucination Governance & Double Control Gate

> **Scope:** Ground-Truth Prompting, Double Control Gate, Link Grounding, GAP Logging, Evidence Anchoring  
> **Source:** Derived from AGENTS.md §14, Flow 03, Flow 07, Step 28  
> **Applicability:** All Agent System Prompts, Genkit Flows, Cloud Functions, and Extraction Handlers

---

## 🏛️ 1. Definition-Boundaries-Schema (DBS) Framework

Every prompt and AI pipeline must respect the three-level DBS standard:

1. **Definition (Role):** Crisp, unambiguous role identity and operational objective.
2. **Boundaries (Strict DO / DON'T):** Unforgiving negative constraints (e.g. "Do not generate fictitious hourly rates or mock phone numbers").
3. **Schema (Enforced Output):** Pure Zod schema validation. Every response must match structured types (`RefinedTaskDraftSchema`).

---

## 🛡️ 2. Double Control Gate Architecture

```
[User Input] ──► [Clay.com Regex Pre-Filter] ──► [GATE 1: Cognitive/Zod] ──► [LLM] ──► [GATE 2: Deterministic Node.js] ──► [ApprovalCard UI]
```

### Pre-Filter Deterministico a Monte (Pattern Clay.com)

- Before invoking Gemini Flash, pure Node.js regex extractors parse raw snippets for verified landline/mobile prefixes (`0584`/`0585`), RFC 5322 emails, and normalized LinkedIn URLs.
- The LLM receives only a pre-structured semantic extract, saving **40% of input tokens** and avoiding extraction hallucination.

### Gate 1: Cognitivo & Strutturale (Pre-Execution)

- Strict Zod schema parsing with `.strict()`.
- Untrusted web content isolated in `<untrusted_web_content>` XML tags to block prompt injection.
- **Mandatory GAP Logging:** When compensation, direct contact, or availability is not ascertainable from public sources, the Agent MUST output:
  `[GAP TO VERIFY: <reason>]`.

### Gate 2: Deterministico in Node.js (Post-Execution Middleware)

- **Link Grounding:** Bi-directional verification of every cited URL against the raw HTTP result buffer from Brave/Google Search. Phantom URLs are stripped or set to `null`.
- **Synthetic Pattern Blocker:** Regex rejection of mock emails (`@example.com`) and synthetic numbers (`02 1234567`, `555-`).
- **GDPR Art. 14 Enforcer:** Automatic deterministic calculation of `firstContactDeadline = now() + 30 days`.

---

## 🎯 3. Evidence Anchoring & Checkpointing

- **Dust.tt Evidence Citation Chips:** Every extracted profile rendered in `ApprovalCard.vue` and `TaskChatWindow.vue` displays interactive chips: `[🟢 VERIFIED: Engine Link]` (clickable) and `[🟡 GAP: Da confermare al contatto]`.
- **LangGraph Checkpointing:** Tasks persist `harvestingState: { lastProcessedIndex, processedUrls }` to Firestore. Tranches resume from `lastProcessedIndex + 1`, eliminating duplicate work.
- **Lindy.ai Quick Actions:** GAPs feature one-click contextual action buttons: `[Richiedi in InMail]`, `[Chiama e Chiedi]`, `[Ignora e Procedi]`.
