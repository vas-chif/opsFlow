# Feature Workflow — Procedura Completa

Usa questa procedura per ogni nuova feature, pagina, store, composable o componente.

## Step 1 — Allineamento Architetturale

Prima di scrivere codice:

- La feature è allineata con la roadmap del progetto?
- Introduce dipendenze nuove? → Valuta supply chain risk (no axios/fetch non approvati)
- Ha impatto su Firestore reads/writes? → Calcola costo (→ Step 2)
- Introduce dati PII o sanitari? → Pianifica crittografia AES-256-GCM (→ Step 3)

## Step 2 — Stima Costi Firebase

Calcola prima di implementare:

| Operazione      | Costo Unitario | Formula                                |
| --------------- | -------------- | -------------------------------------- |
| Firestore Read  | €0,00006       | reads/mese/user × €0,00006 × n_utenti  |
| Firestore Write | €0,00018       | writes/mese/user × €0,00018 × n_utenti |
| Cloud Function  | €0,0000004     | calls/mese × €0,0000004                |

**Target**: <€1,00/mese con 1.000 utenti attivi.

Documenta stima in `BUDGET-MONITORING.md`:

```markdown
## Feature: [NomeFeature] — YYYY-MM-DD

**Reads stimati**: X reads/user/mese × 1000 utenti = €Y/mese
**Strategia**: [cache 30gg / JWT / on-demand sync]
**Risparmio vs auto-sync**: X%
```

## Step 3 — Analisi GDPR & Sicurezza

Per ogni feature che tocca dati utente:

- [ ] Tratta dati PII (nome, email, health data)? → AES-256-GCM client-side
- [ ] Richiede audit log? (GDPR Art. 30) → Log ogni accesso/modifica
- [ ] Usa device condiviso (web/electron)? → Auto-logout 15min
- [ ] Mostra dati via v-html? → sanitize() OBBLIGATORIO
- [ ] Salva dati in Firestore? → Verifica Security Rules (principio least-privilege)

## Step 4 — Design Tipi TypeScript

Prima del codice, progetta i tipi in `src/types/`:

```typescript
// src/types/models.ts  (o file specifico per il dominio)

/**
 * Represents a [entity] document stored in Firestore.
 * Collection: [collectionName]
 */
export interface IMyEntity {
  id: string;
  // campi...
  createdAt: Date;
  updatedAt: Date;
} // Firestore data model

// ── UI-only (NON in src/types/) ──────────────────────────────────────────────
interface IMenuEntry {
  label: string;
  icon: string;
} // UI-only — not Firestore data
```

Regola: se il tipo è usato da 2+ file o è un documento Firestore → `src/types/`.

## Step 5 — Implementazione

Ordine obbligatorio per file `.vue`:

1. `<script setup lang="ts">` — imports, state, functions
2. `<template>` — markup
3. `<style scoped lang="scss">` — stili

Struttura imports (con separatori):

```typescript
// ── Vue & Framework ───────────────────────────────────────────────────────
import { ref, computed, onMounted } from "vue";
import { useQuasar } from "quasar";

// ── Firebase ──────────────────────────────────────────────────────────────
import { doc, getDoc, setDoc } from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────
import type { IMyEntity } from "src/types/models";

// ── Stores ────────────────────────────────────────────────────────────────
import { useMyStore } from "src/stores/myStore";

// ── Composables ───────────────────────────────────────────────────────────
// ── Components ───────────────────────────────────────────────────────────
```

Aggiungi JSDoc header al file (vedi template in SKILL.md principale).

## Step 6 — Pre-Commit Checklist

Prima di ogni `git commit`:

```bash
# Adatta al package manager del progetto
pnpm typecheck && pnpm lint   # oppure yarn type-check && yarn lint
```

Checklist manuale:

- [ ] Zero errori TypeScript
- [ ] Zero errori/warning linter
- [ ] Nessun `console.log` con dati sensibili rimasto
- [ ] Nessun file `.env` o credenziali incluse
- [ ] Struttura `.vue` corretta (script → template → style)
- [ ] JSDoc header nei file nuovi
- [ ] Marcatori `/*end fn*/` sulle funzioni
- [ ] Commit message: `feat: ...` / `fix: ...` / `security: ...` / `chore: ...`
- [ ] Su branch dedicato (NON main)

## Step 7 — Security Three-Layer Check

Per ogni restrizione visiva (`v-if`, `disabled`), verifica i layer:

| Layer                    | Implementazione                  | Verifica                 |
| ------------------------ | -------------------------------- | ------------------------ |
| 1 — Frontend             | `v-if` / `disabled`              | UX only, non è sicurezza |
| 2 — Firestore Rules      | `allow read, write: if ...`      | Blocca al livello DB     |
| 3 — Cloud Function / JWT | Custom Claims, server validation | Logica business          |

Se Layer 2 o 3 mancano → implementarli prima di merge.
