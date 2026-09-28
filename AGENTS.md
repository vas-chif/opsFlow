# OpsFlow — Universal Agentic Constitution (SSoT)

> **OpsFlow** is an enterprise AI-first SaaS platform built with Quasar 2 (Vue 3), TypeScript, Firebase, and Pinia.  
> This file is the **Single Source of Truth (SSoT) and Universal Root Constitution** for **ALL** AI agents and coding tools (Google Gemini Flash, Anthropic Claude Code, Google Antigravity, Cursor, GitHub Copilot).  
> All agents MUST follow these instructions strictly without exception.

---

## 🛡️ §0 — REGOLA ASSOLUTA: Explain-Before-Doing

Prima di ogni modifica a codice o file, l'Agent deve dichiarare:

```markdown
> **Cosa:** [file + funzione/componente + righe interessate]
> **Come:** [approccio tecnico specifico]
> **Perché:** [regola rispettata + problema risolto]
> **Impatto:** [rischio mitigato o valore aggiunto]
```

Non procedere mai ad applicare modifiche senza aver prima scritto questo blocco per il consenso dell'utente.

---

### ⚠️ DIRETTIVA FONDAMENTALE (Full-Stack Alignment)

È fatto divieto assoluto di creare logiche di backend isolate senza la loro controparte visiva e reattiva nel Frontend. Ogni Cloud Function, Tool o listener deve essere **immediatamente collegato e testabile nella UI di Quasar** (Pannelli, Chat, Approval Card, Pinia Store). L'utente deve poter vedere, interagire, approvare e verificare ogni singolo dato a schermo.

### 🌐 DIRETTIVA FONDAMENTALE (Allineamento con `.logicFlow/`)

Prima di ogni modifica, l'Agent deve:

1. **Analisi Olistica:** Valutare l'impatto trasversale sull'intero sistema (Quasar, Pinia, Cloud Functions, Firestore Rules, TypeScript).
2. **Rispetto dei Flussi:** Rispettare i flussi operativi stabiliti nei documenti `.logicFlow/`.
3. **Aggiornamento Sincrono:** Aggiornare contestualmente `.logicFlow/` quando le modifiche alterano o estendono i comportamenti.

---

## 📌 §1 — Git & Branch Management (Workflow su dev)

- **Branch Check:** Verificare sempre il branch corrente (`git branch`). Assicurarsi di essere SEMPRE su **`dev`**.
- **Workflow Unificato su `dev`:** Tutte le modifiche, implementazioni e collaudi devono risiedere sul branch `dev`. Vietato lasciare branch orfani.
- **Rilascio Protetto su `main`:** Il branch `main` è riservato alla produzione. Il merge da `dev` a `main` è consentito SOLO dopo che l'intero sistema è stato validato con successo (`yarn typecheck` = 0 errori, `yarn lint:check` = 0 errori/warning, collaudo a schermo). MAI committare direttamente su `main`. MAI `git push --force`.
- **Commit Messages:** Convenzione **Conventional Commits** (`feat: ...`, `fix: ...`, `chore: ...`, `security: ...`, `style: ...`) max 100 caratteri.

---

## 📋 §2 — Comandi del Progetto

Usa esclusivamente **yarn** come package manager principale. Usa **npm** SOLO dove strettamente necessario (cartella `opsflow-functions`). MAI usare `pnpm`.

| Task                     | Command           |
| :----------------------- | :---------------- |
| Dev server (HMR)         | `yarn dev`        |
| Production build         | `yarn build`      |
| Lint + format (auto-fix) | `yarn lint`       |
| Lint check only          | `yarn lint:check` |
| Type check               | `yarn typecheck`  |

---

## 🛡️ §3 — Sicurezza, Privacy & GDPR (Healthcare Data Protection)

- **Crittografia Client-Side (AES-256-GCM):** Dati sanitari e anagrafica pazienti (PII) DEVONO essere cifrati client-side prima di Firestore.
- **Pseudonimizzazione:** Hash SHA-256 per ID paziente. MAI nomi in chiaro su DB. Chiavi mai trasmesse al cloud.
- **Anti-XSS:** Sanitizzare ogni input utente. MAI `v-html` senza utility `sanitize()`. Prediligere `{{ mustache }}`.
- **Supply Chain:** Solo Firebase Client SDK ufficiale e `@emailjs/browser`. VIETATO importare `axios`, `got`, `node-fetch`.
- **Logging Sicuro:** MAI usare `console.log` in codice di produzione (GDPR Art. 32). Usare logger custom isolato.
- **Sicurezza a 3 Layer:** Layer 1 (UI `v-if`) + Layer 2 (Firestore Rules) + Layer 3 (Cloud Functions JWT Custom Claims).

---

## 🏗️ §4 — Vincoli Architetturali & Convenzioni Vue 3

- **Sempre `<script setup lang="ts">`:** No Options API, no `defineComponent`.
- **Struttura File `.vue`:** 1. `<script setup>`, 2. `<template>`, 3. `<style scoped lang="scss">`.
- **Tipi Centralizzati:** Modelli dati Firestore risiedono tassativamente in `src/types/models.ts`. Vietati tipi inline nel componente.
- **Elite Design System:** Palette Royal Navy (`#0a2342`), Gold (`#c5a065`), Off-White (`#f9f7f2`). GlassCard e layout Triple-Pane.
- **Lighthouse:** Obiettivo 100/100 su Performance, Accessibility, Best Practices e SEO.

---

## 💰 §5 — Ottimizzazione Costi Cloud (Firebase/GCP)

**Target:** Costo totale < €1.00/mese per 1000 utenti attivi.

- **JWT-Only Navigation:** Ruoli e permessi verificati via JWT Custom Claims. MAI query Firestore per autorizzare la navigazione.
- **Lock-in su Gemini Flash:** Esecuzione agentica rigorosamente su **Gemini 1.5/3.6 Flash** via Firebase Genkit.
- **Multi-Level Cache:** Cache locale Pinia a 30 giorni e cache ricerche web a 72h con indice TTL nativo Google Cloud.
- **Scale-to-Zero:** Tutte le funzioni Cloud Run configurate con `minInstances: 0`.

---

## 🗂️ §6 — L'Agentic Control Plane Modulare (`.agents/`)

OpsFlow scompone le regole operative in moduli contestuali per eliminare il "Cognitive Bleed" (-65% token):

```
.agents/
├── rules/                           ← Regole modulari per argomento
│   ├── 00-governance.md             ← Git, explain-before-doing, yarn
│   ├── 01-security-gdpr.md          ← AES-256-GCM, PII, anti-XSS
│   ├── 02-multitenancy.md           ← Isolamento tenant, JWT claims
│   ├── 03-frontend-quasar.md        ← Vue 3, Quasar, Elite Design
│   ├── 04-anti-hallucination.md     ← Doppio Gate, DBS, GAP logging
│   ├── 05-cost-optimization.md      ← Budget, cache 72h, throttling
│   └── 06-fullstack-alignment.md    ← Visual parity, ApprovalCard
│
├── agents/                          ← Profili e prompt degli 8 agenti
│   ├── planner.md                   ← AgentePlanner (scomposizione subtask)
│   ├── inspector.md                 ← AgenteIspettore (audit qualità)
│   ├── archivist.md                 ← AgenteArchivista (RAG indexer)
│   ├── researcher.md                ← AgenteRicerca (skill matcher)
│   ├── administrator.md             ← AgenteAmministrativo (report)
│   ├── supervisor.md                ← AgenteSupervisore (compliance)
│   ├── ai-engineer-agent.md         ← AgenteAiEngineer (modelli & budget)
│   └── prompt-engineer-agent.md     ← AgentePromptEngineer (DBS prompt)
│
└── hooks/                           ← Script di verifica deterministica
    ├── pre-commit-validate.sh       ← typecheck, lint, build functions
    ├── pre-tool-security.sh         ← blocco console.log, axios, v-html
    └── post-write-audit.sh          ← JSDoc header e marcatori /*end fn*/
```

---

## 💬 §7 — Stile di Comunicazione & Mentoring

1. **Spiega PRIMA** con il blocco Explain-Before-Doing (§0).
2. **Usa analogie semplici:** _"Pinia è come un cassetto del comodino, Firestore è il caveau in banca"_.
3. **Chiedi conferma** prima di operazioni invasive o distruttive.
4. **Lingua:** Chat, documentazione e roadmap in **ITALIANO**. Codice, commenti tecnici e variabili in **INGLESE**.
