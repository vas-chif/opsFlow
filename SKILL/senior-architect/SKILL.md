---
name: senior-architect
description: "Use when: reviewing a feature before implementation; security/OWASP/GDPR audit; Firebase cost analysis; pre-commit checklist; code review; architecture decision; TypeScript type design; Firestore rules review; supply chain security check; planning a new page, store, or composable; any structured analysis in Vue 3, Quasar, Pinia, Firebase TypeScript projects"
argument-hint: "Descrivi la feature, il task da analizzare, o il tipo di review (security | cost | feature | architecture)"
---

# Senior Architect — Workflow Skill

Workflow di analisi strutturata per progetti Vue 3 / Quasar / Pinia / Firebase / TypeScript.
Applica una revisione a 5 livelli prima di ogni implementazione o decisione tecnica.

## I 5 Livelli di Analisi

### 1. Architect (Scalabilità 10 anni)

Valuta impatto su: performance, manutenibilità, vendor lock-in, costi Firebase.
Applica: types centralizzati in `src/types/`, Pinia cache-first, JWT-only navigation.

### 2. Analyst (ROI & Costi SaaS)

Stima costo Firestore (reads/writes/mese × €0,00006/read, €0,00018/write).
Target: <€1,00/mese per 1.000 utenti. Documenta ottimizzazioni in `BUDGET-MONITORING.md`.

### 3. White Hacker (OWASP + GDPR)

Proteggi da OWASP Top 10. GDPR Art. 30/32: crittografia AES-256-GCM per PII.
Anti-XSS obbligatorio. Nessun `console.log` in production. Supply-chain check.

### 4. Giurista (Compliance)

Verifica GDPR Art. 28/30/32. Auto-logout 15min su device condivisi.
Audit log per ogni operazione su dati sanitari.

### 5. Businessman (Valore economico)

Ogni riga di codice deve aggiungere valore misurabile o ridurre rischio legale/operativo.

---

## Regola Assoluta — Explain-Before-Doing

Prima di ogni modifica a codice o file, dichiara:

```
> **Cosa:** [file + funzione/componente + righe]
> **Come:** [approccio tecnico specifico]
> **Perché:** [regola rispettata + problema risolto]
> **Impatto:** [valore aggiunto o rischio mitigato]
```

---

## Procedure per Tipo di Richiesta

Scegli la procedura più adatta e seguila passo-passo:

| Richiesta                                                  | Procedura                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Nuova feature, pagina, store, composable                   | [Feature Workflow](./references/feature-workflow.md)                      |
| Review sicurezza, audit OWASP/GDPR, Firestore Rules        | [Security Review](./references/security-review.md)                        |
| Ottimizzazione costi Firebase, analisi reads/writes        | [Cost Analysis](./references/cost-analysis.md)                            |
| Test unitari, integrazione, pen-test, Lighthouse, UX audit | Skill separata → **[Senior QA Engineer](../senior-qa-engineer/SKILL.md)** |

---

## Package Manager — Auto-Rilevamento

Controlla il lock file nella root del progetto:

| Lock file presente  | Package manager da usare                |
| ------------------- | --------------------------------------- |
| `pnpm-lock.yaml`    | `pnpm`                                  |
| `yarn.lock`         | `yarn`                                  |
| `package-lock.json` | `npm` (solo se non ci sono alternative) |

MAI mescolare package manager nello stesso progetto.

---

## Code Style — Riferimento Rapido

- **Struttura `.vue`**: `<script setup lang="ts">` → `<template>` → `<style scoped lang="scss">`
- **Tipi Firestore**: SEMPRE in `src/types/` — mai inline nei componenti
- **Tipi UI-only**: locali OK, con commento `// UI-only — not Firestore data`
- **Import**: raggruppati con separatori `// ── Vue & Framework ──...`
- **Funzioni**: marcatore `}; /*end myFn*/`
- **Lingua codice**: INGLESE — lingua chat/docs: ITALIANO

---

## JSDoc Header (ogni file nuovo)

```typescript
/**
 * @file NomeFile.ts
 * @description [max 2 frasi]
 * @author Vasile Chifeac
 * @created YYYY-MM-DD
 * @modified YYYY-MM-DD
 * @notes
 * - Pattern architetturale
 * - Considerazioni sicurezza
 * @dependencies
 * - Lista dipendenze critiche
 * @performance
 * - <10ms from cache, <200ms from Firestore (only on cache miss)
 */
```

---

## Anti-Patterns da Bloccare Subito

```typescript
// ❌ import axios / got / node-fetch (supply chain risk)
// ❌ localStorage.clear() al logout (distrugge dati offline)
// ❌ console.log() in produzione (GDPR Art. 32)
// ❌ v-html senza sanitize() (XSS)
// ❌ Firestore read per permission check (usa JWT claims)
// ❌ onSnapshot continuo su dati non real-time critici (costo!)
// ❌ git push --force su branch condivisi
// ❌ Tipi TypeScript Firestore definiti inline nel componente
// ❌ Modifica manuale di typed-router.d.ts (auto-generato)
```
