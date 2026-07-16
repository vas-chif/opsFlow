#OpsFlow — Unified Agent Instructions

OpsFlow is an AI-first SaaS platform built with Quasar 2 (Vue 3), TypeScript, Firebase, and Pinia.
This file is the **Single Source of Truth** for the AI Agent. The Agent must follow these instructions strictly.

---

## 🛡️ §0 — REGOLA ASSOLUTA: Explain-Before-Doing

Prima di ogni modifica a codice o file, l'Agent deve dichiarare:

```
> **Cosa:** [file + funzione/componente + righe interessate]
> **Come:** [approccio tecnico specifico]
> **Perché:** [regola rispettata + problema risolto]
> **Impatto:** [rischio mitigato o valore aggiunto]
```

Non procedere mai ad applicare modifiche senza aver prima scritto questo blocco per il consenso dell'utente.

---

## 📌 §1 — Git & Branch Management (Regola §1.9)

- **Branch Check**: All'inizio di ogni sessione, verificare il branch corrente (`git branch`).
- **Workflow**: Sviluppo SEMPRE su branch dedicati (`feature/`, `fix/`, `chore/`).
- **Branch Protetti**: MAI committare o pushare direttamente su `main` o `master` (richiesta PR per merge). MAI `git push --force` su branch condivisi.
- **Commit Messages**: Usare la convenzione **Conventional Commits** (`feat: ...`, `fix: ...`, `chore: ...`, `security: ...`, `style: ...`).

---

## 📋 §2 — Comandi del Progetto

Usa esclusivamente **yarn** come package manager principale. Usa **npm** SOLO dove strettamente necessario (es. ambienti o script specifici Firebase). MAI usare `pnpm`.

| Task                     | Command           |
| ------------------------ | ----------------- |
| Dev server (HMR)         | `yarn dev`        |
| Production build         | `yarn build`      |
| Lint + format (auto-fix) | `yarn lint`       |
| Lint check only          | `yarn lint:check` |
| Type check               | `yarn typecheck`  |

---

## 🛡️ §3 — Sicurezza, Privacy & GDPR (Healthcare Data Protection)

Ogni dato sanitario e anagrafica paziente è altamente sensibile (PII).

### GDPR Compliance (Art. 30 e 32)

- **Crittografia Client-Side**: Tutti i dati personali e sanitari (PII) dei pazienti DEVONO essere cifrati client-side con **AES-256-GCM** prima di essere scritti su Firestore.
- **Pseudonimizzazione**: Usare hash (SHA-256) per l'ID paziente. MAI salvare nome e cognome in chiaro nel DB. Le chiavi di decrittografia non devono mai lasciare il dispositivo dell'utente.
- **Audit Logs**: Generare log di tracciamento (GDPR Art. 30) per ogni creazione/modifica/accesso a dati clinici.
- **Auto-Logout**: Implementare logout automatico per inattività a 15 minuti su dispositivi condivisi.

### Anti-XSS (Sanitizzazione Input)

- **Sanitize**: Sanitizzare esplicitamente ogni input utente prima del rendering.
- **v-html**: MAI usare `v-html` senza una utility `sanitize()` esplicita. Prediligere `{{ mustache }}` per il testo semplice.

### HTTP Stack & Supply Chain Security

- **Firebase SDK**: Usare solo il client SDK ufficiale di Firebase per operazioni cloud.
- **Email**: Usare solo `@emailjs/browser` per l'invio di email client-side.
- **Divieti**: È vietato aggiungere o usare `axios`, `got`, `node-fetch`, `superagent` o librerie simili per ridurre la superficie di attacco della supply chain.

### Logging & Console

- **Custom Logger**: Usare sempre un logger custom isolato per i log applicativi, assicurando che non vengano mai loggati dati PII in chiaro.
- **console.log**: MAI usare `console.log` in codice di produzione (GDPR Art. 32).
- **Eccezioni**: Sono permesse eccezioni solo all'interno di build scripts, service workers e fase di inizializzazione di Firebase.

### Sicurezza a 3 Layer

Ogni restrizione UI deve avere copertura lato DB e Server:

1. **Layer 1 (Frontend)**: Visualizzazione condizionale (es. `v-if`, `disabled`).
2. **Layer 2 (Database)**: Firestore Security Rules (restrizioni su letture/scritture).
3. **Layer 3 (Backend)**: Cloud Functions e token JWT Custom Claims.

---

## 🏗️ §4 — Vincoli Architetturali & Convenzioni Vue 3

### Project Structure

```
src/
  boot/        # App initialization (boot files run before mount)
  components/  # Reusable Vue components
  css/         # Global SCSS styles; Quasar variables in quasar.variables.scss
  i18n/        # Translations (en-US default); all user-facing strings go here
  pages/       # File-based routing (see Routing below)
  router/      # Router config; typed-router.d.ts is AUTO-GENERATED — never edit it
  stores/      # Pinia stores
```

### Routing

- **Filename-based routing** — i file in `src/pages/` diventano rotte automaticamente. Do NOT add routes to router config manually.
- Router mode: **hash** (`/#/path`).
- Route types are auto-generated in `src/router/typed-router.d.ts` — never edit this file.
- Catch-all 404: `src/pages/[...path].vue`.
- Layouts annidati: `src/pages/index.vue` è il layout; `src/pages/index/(index).vue` è la pagina index su `/`.

### Vue Component Conventions

- **Sempre `<script setup>`** — no Options API, no `defineComponent`.
- Use `defineProps<T>()` con interfaccia TypeScript per le props tipizzate.
- Importa i composable di Quasar (es. `useQuasar`) direttamente da `'quasar'`.
- Importa gli helper di app-level da `'#q-app'` (es. `defineBoot`, `defineRouter`).
- Struttura dei file `.vue`:
  1. `<script setup lang="ts">`
  2. `<template>`
  3. `<style scoped lang="scss">`
     (MAI posizionare il template o lo stile prima dello script).

### State Management (Pinia)

- Crea gli store usando `defineStore('store-id', { state, getters, actions })` in `src/stores/`.
- Importa Pinia da `src/stores/index.ts` (collegato al boot di Quasar).
- Gli store supportano HMR — usa il pattern `import.meta.hot` presente in `src/stores/example-store.ts`.

### Styling

- File principale: `src/css/app.scss`.
- Quasar variable overrides: `src/css/quasar.variables.scss`.
- Non usare stili inline; preferisci le classi utility di Quasar e file SCSS.

### Linting & Formatting

- **oxlint** (non ESLint) e **oxfmt** (non Prettier) — basati su Rust, estremamente veloci.
- Configurazione: `oxlint.config.ts` e `oxfmt.config.ts`.
- Esegui `yarn lint` per l'auto-fix prima di effettuare commit.
- Il file `src/router/typed-router.d.ts` è escluso dal linting.

### Tipi TypeScript Centralizzati

- Tutti i tipi e le interfacce per modelli dati Firestore DEVONO risiedere in `src/types/` (es. `src/types/models.ts`).
- Non definire mai interfacce dati inline all'interno di componenti Vue o store.
- I tipi ad uso esclusivo dell'interfaccia utente (UI-only) sono ammessi localmente se accompagnati dal commento `// UI-only — not Firestore data`.
- È vietato disabilitare le regole con commenti come `// eslint-disable` o `// oxlint-disable`. Risolvere sempre i problemi alla radice.

### Ordine dei Gruppi di Import

In ogni file `.ts` o `.vue`, raggruppare gli import usando separatori commentati in quest'ordine preciso:

```typescript
// ── Vue & Framework ──────────────────────────────────────────────────────────
// ── Firebase ─────────────────────────────────────────────────────────────────
// ── Types ────────────────────────────────────────────────────────────────────
// ── Stores ───────────────────────────────────────────────────────────────────
// ── Composables ──────────────────────────────────────────────────────────────
// ── Utils ────────────────────────────────────────────────────────────────────
// ── Components ───────────────────────────────────────────────────────────────
```

### § Code Style Obbligatorio (JSDoc & Marcatori)

**1. JSDoc Header (ogni file .ts / .vue significativo)**
Ogni nuovo file o componente complesso DEVE iniziare con l'header standard JSDoc:

```typescript
/**
 * @file NomeFile.ts
 * @description [max 2 frasi — cosa fa, non come]
 * @author Vasile Chifeac
 * @created YYYY-MM-DD
 * @modified YYYY-MM-DD
 *
 * @notes
 * - Pattern architetturale usato
 * - Considerazioni sicurezza
 *
 * @dependencies
 * - Lista dipendenze critiche
 *
 * @performance
 * - Metriche performance (es: <10ms, <5 reads Firestore/month)
 */
```

**2. Marcatori fine funzione**
Chiudere SEMPRE le funzioni con il marcatore di chiusura commentato:

```typescript
const myFn = (): string => {
  return value;
}; /*end myFn*/
```

**3. Lingua**

- **Codice, variabili, JSDoc, commenti .ts/.vue**: INGLESE professionale.
- **Chat, documentazione .md, roadmap**: ITALIANO, analogie semplici.

---

## 💰 §5 — Ottimizzazione Costi Cloud (Firebase)

**Target**: Costo totale inferiore a €1.00/mese per 1000 utenti attivi.

- **JWT-Only Navigation**: Usare i Custom Claims del token JWT per validare i ruoli e i permessi dell'utente. MAI effettuare interrogazioni (`getDoc`) a Firestore solo per autorizzare la navigazione.
- **Sync On-Demand**: Sincronizzare i dati solo in fase di avvio (se cache scaduta), post-scrittura, o su refresh manuale dell'utente. Evitare sync continui in background o `onSnapshot` su risorse non critiche.
- **Cache Locale**: Salvare i dati in cache locale (Pinia / IndexedDB / localStorage) con validità 30 giorni per resistere all'uso offline, usando il namespace `opsflow_user_{userId}_{dbName}`.
- **Write Strategy**: Scrivere sempre prima su Firestore e poi aggiornare la cache locale (Firestore-First Write) per evitare disallineamenti o perdite dati.
- **Logout Sicuro**: Nel logout, NON usare `localStorage.clear()` (cancella i dati offline dell'utente), ma resettare gli store Pinia e rimuovere solo i token di sessione.

---

## ✨ §6 — Design System "Elite" & Lighthouse

- **Palette Colori**: Royal Navy (`#0a2342`), Gold (`#c5a065`), Off-White (`#f9f7f2`).
- **Tipografia**: _Playfair Display_ per titoli eleganti, _Mulish_ (o _Outfit_) per testi leggibili.
- **Componenti**: Utilizzo di stili basati su `GlassCard.vue` con sfocatura di sfondo, angoli arrotondati, e spaziature ariose (`q-pa-xl`, `q-mb-xl`).
- **Qualità**: Evitare design commerciali predefiniti da "startup generica".
- **Lighthouse**: Ciascuna pagina deve puntare ad un punteggio di **100/100** su Performance, Accessibility, Best Practices e SEO.

---

## 📋 §7 — Pre-Commit Checklist & Key Notes

Prima di effettuare qualsiasi commit Git, eseguire e superare con zero errori/warning:

- [ ] `yarn typecheck` superato con successo.
- [ ] `yarn lint` eseguito con successo (zero errori/warning attivi).
- [ ] TypeScript strict mode attivo (tutti i tipi devono essere espliciti).
- [ ] Node.js ≥ 22.12 richiesto per lo sviluppo.
- [ ] Nessun file `.env` o credenziale/chiave inserita nel commit.
- [ ] Messaggio di commit conforme a Conventional Commits.
- [ ] Struttura dei file `.vue` ordinata (script -> template -> style).
- [ ] JSDoc header presente in tutti i nuovi file di logica o componenti complessi.
- [ ] `sinkFolder/` è una cartella di trasferimento/scratch e non fa parte del build finale.

---

## 🔍 §8 — Grep di Controllo Post-Modifica (Cybersecurity)

Dopo ogni modifica a file critici, esegui controlli rapidi via terminale per verificare i layer di sicurezza:

```bash
# Esempio: se modificato firestore.rules, controlla le restrizioni di sicurezza
grep -n "request.auth" firestore.rules

# Esempio: se modificato il router, controlla le rotte protette
grep -n "requiresAuth" src/router/index.ts
```

---

## 🧠 §9 — Workflow Avanzati & Skills

Per audit complessi, analisi di sicurezza o architetturali strutturate su 5 livelli (Architect, Analyst, Hacker, Giurista, Businessman), consultare le procedure contenute nella cartella **[SKILL/](file:///home/chif-vas/projects/opsflow/SKILL)** e in particolare i file **[SKILL/senior-architect/SKILL.md](file:///home/chif-vas/projects/opsflow/SKILL/senior-architect/SKILL.md)** o **[SKILL/senior-qa-engineer/SKILL.md](file:///home/chif-vas/projects/opsflow/SKILL/senior-qa-engineer/SKILL.md)** prima di procedere.

---

## 🛡️ §10 — Approccio Diagnosi Cybersecurity

Quando ricevi codice da rivedere, controlla sistematicamente:

1. **OWASP Top 10**: Injection, XSS, IDOR, Misconfiguration, Cryptographic Failures, Insecure Design, Vulnerable Components, Auth Failures, Integrity Failures, SSRF.
2. **GDPR Art. 32**: PII in chiaro? Logging sicuro? Auto-logout? Audit trail? Crittografia client-side attiva?
3. **Firebase Rules**: Principio del minimo privilegio? L'utente accede solo ai propri dati?
4. **JWT Claims**: `isActive`, `role` verificati da JWT (non Firestore)?
5. **Supply Chain**: Nuove dipendenze aggiunte? No axios/fetch non approvati?
   _Segnala SEMPRE i problemi di sicurezza rilevati anche se non espressamente richiesti dal task._

---

## 🚫 §11 — Anti-Patterns (MAI FARE)

```typescript
// ❌ Package manager sbagliato rispetto al progetto (usa solo yarn, npm solo per Firebase)
// ❌ Firestore query per permission checks (usa JWT claims)
// ❌ Tipi TypeScript Firestore definiti inline nel componente
// ❌ console.log con dati sensibili (PII, email, token) in production
// ❌ localStorage.clear() nel logout (cancella dati offline persistenti)
// ❌ import axios from 'axios'
// ❌ <div v-html="content"> senza sanitize()
// ❌ <template> prima di <script> in .vue
// ❌ Dati PII/sanitari in chiaro in Firestore (richiede AES-256-GCM client-side)
// ❌ // eslint-disable o // oxlint-disable (risolvi alla radice)
// ❌ onSnapshot continuo per dati non real-time critici
// ❌ git push --force su branch condivisi
// ❌ Commit su main per feature (usa PR da branch dedicato)
// ❌ Modificare file generati automaticamente (es. typed-router.d.ts)
// ❌ Design con colori/font fuori dal Design System "Elite"
// ❌ Aggiungere route manualmente se il progetto usa filename-based routing
```

---

## 💬 §12 — Mentoring Style & Comunicazione

1. **Spiega PRIMA** con il blocco Explain-Before-Doing.
2. **Usa analogie semplici** — _"Pinia è come un cassetto del comodino, Firestore è il caveau in banca"_.
3. **Chiedi conferma** prima di operazioni invasive (delete, deploy, refactoring massicci).
4. **Mostra costi** — ogni query Firestore ha un costo, documenta sempre l'impatto.
5. **Celebra i miglioramenti** — _"Risparmio: 99.7%! "_.
6. **Lingua**: Chat, documentazione e roadmap in **ITALIANO**. Codice, commenti tecnici e variabili in **INGLESE**.

---

## 💡 §13 — Proposte di Miglioramento Regole

Puoi proporre modifiche o miglioramenti a questo file di regole solo dopo aver completato il task principale, usando questo formato preciso:

```
## 💡 Proposta Miglioramento Regole (SOLO SU CONSENSO)

**Sezione interessata:** [nome sezione]
**Problema attuale:** [descrizione del gap o ambiguità]
**Proposta:** [testo preciso della modifica]
**Motivazione:** [perché migliora sicurezza/efficienza/chiarezza]

Vuoi che applichi questa modifica? ✅ Sì / ❌ No / 🔄 Modifica proposta
```

Proponi al massimo 2 miglioramenti per sessione.
