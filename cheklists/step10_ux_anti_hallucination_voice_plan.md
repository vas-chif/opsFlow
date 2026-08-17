# 📋 Step 10 — Piano Chirurgico DEFINITIVO (v2.1): AI Prompt Architect, Skill Matrix Universale, Anti-Allucinazione & Voice Experience

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Pair Architect  
> **Data:** 17 Agosto 2026  
> **Stato:** Completed / Implementato  
> **Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §3 (GDPR & Security), §5 (Cloud Cost Optimization €0 Nativo), §14 (Agent Architecture)

---

## 🔴 ANALISI CRITICA DELLA PROPOSTA — Problemi Architetturali Identificati

> [!CAUTION]
> Questi non sono dettagli cosmeti. Sono rischi strutturali che, se ignorati, richiederebbero un refactoring massiccio in futuro. L'Agent ha il dovere di segnalarli secondo §0.

### ❌ Problema 1: Conflitto di Schema Dati — `WorkspaceAttitude` vs `WorkspaceLinkedResources`

**Il difetto più grave del piano precedente.** Attualmente in [`src/types/models.ts`](file:///home/chif-vas/projects/opsflow/src/types/models.ts#L221-L233) i campi `doList`, `dontList`, `toneOfVoice` e `assignedAgents` sono già presenti ma **annidati dentro `WorkspaceLinkedResources`**, che è un oggetto concettualmente dedicato alle risorse Google OAuth (Gmail, Sheets, Drive). Mescolare le regole operative dell'IA con le credenziali OAuth è una violazione del principio di Separazione delle Responsabilità (Single Responsibility Principle).

La proposta di aggiungere `WorkspaceAttitude` come nuovo campo separato è corretta, ma bisogna **rimuovere i campi duplicati da `WorkspaceLinkedResources`** e migrare i dati Firestore esistenti. Se non si fa, si avranno due sorgenti di verità in conflitto.

### ❌ Problema 2: `systemPrompt: string` è un Anti-Pattern da Eliminare

Attualmente `Workspace` ha `systemPrompt?: string` come campo stringa grezza salvata su Firestore. Se si introduce `WorkspaceAttitude` con `doList`, `dontList`, `skills` ed `industryScope`, il campo `systemPrompt` diventa **ridondante e pericoloso**: a runtime `promptBuilder.ts` dovrà scegliere quale dei due usare. Questa ambiguità è una fonte certa di bug e regressioni.

La soluzione corretta è eliminare `systemPrompt` come campo primitivo e costruire la stringa di sistema dinamicamente **solo a runtime** nel `promptBuilder.ts` a partire dai campi strutturati di `WorkspaceAttitude`.

### ❌ Problema 3: `gemini-3.5-flash-lite` NON Esiste come Stringa di Modello in Genkit

Verificando il codice attuale in [`genkitConfig.ts`](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/ai/genkitConfig.ts#L39), il modello configurato è `"googleai/gemini-3.5-flash"`. Il modello `"googleai/gemini-3.5-flash-lite"` **non è ancora disponibile nel plugin `@genkit-ai/google-genai`**. Usare una stringa non registrata causerebbe un errore runtime silenzioso in produzione. La scelta corretta è usare `"googleai/gemini-1.5-flash-8b"` (equivalente Lite già disponibile su Genkit) oppure restare su `"googleai/gemini-3.5-flash"` che è già ultra-economico.

### ❌ Problema 4: `toneOfVoice` è un Enum Chiuso — Incompatibile con la Visione Multi-Settore

Il campo `toneOfVoice` in `WorkspaceLinkedResources` è tipizzato come `"formal" | "informal" | "operational" | "roi_synthetic"`. Questo è esattamente il tipo di enum chiuso e cablato nel codice che **impedisce l'universalità multi-settore**. Un parrucchiere potrebbe aver bisogno di "creativo", un avvocato di "accademico", un medico di "clinico". Il campo `tone` deve essere una **stringa libera `string`** generata dal DBS Engine, non un enum predefinito.

### ⚠️ Problema 5: Groq Whisper come Fallback STT — Dipendenza da API Key Esterna

Il piano prevedeva il Groq Whisper Free Tier come fallback STT. Questo introduce una dipendenza da una credenziale API esterna (`GROQ_API_KEY`) da gestire in Cloud Functions Secrets Manager. Per la strategia **Zero-Dependency**, il fallback ottimale è degradare silenziosamente a un input testuale con un messaggio UI chiaro: _"Il tuo browser non supporta la dettatura vocale. Scrivi il tuo messaggio."_. Il Groq può essere una funzione opzionale attivabile solo se l'utente configura esplicitamente la sua chiave.

---

## 🌟 1. Architettura DBS Universale Corretta

### 📌 Principio Fondamentale: Parameterizzazione, Non Branching

Il motore DBS NON deve avere logiche `if/else` per settore. Ogni professione diventa un semplice input che il modello LLM interpreta autonomamente.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🌍 INPUT UTENTE QUALSIASI (DBS Engine — Linguaggio Naturale Libero)         │
│ • Parrucchiere: "Gestione appuntamenti, formule colori, richiami clienti"   │
│ • Ingegnere: "Calcolo computi metrici, capitolati, normative edilizie"      │
│ • Estetista: "Schede trattamenti corpo/viso, listino prezzi, promozioni"    │
│ • Avvocato: "Sintesi memorie difensive, scadenze termini, bozze diffide"    │
├─────────────────────────────────────────────────────────────────────────────┤
│ ⚙️ GEMINI GENERA DINAMICAMENTE L'ATTEGGIAMENTO (JSON Strutturato)           │
│ • industryScope → Settore rilevato (non hard-coded)                        │
│ • tone         → Tono consigliato per la professione (stringa libera)      │
│ • skills[]     → Competenze estratte automaticamente dalla descrizione     │
│ • rules.doList[]   → Vincoli DO specifici del settore                      │
│ • rules.dontList[] → Divieti assoluti specifici del settore                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🗂️ SCRITTO SU FIRESTORE (workspaces/{wsId}) come campo `attitude`           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 📌 I 4 Preset Universali (Validi per QUALSIASI Mestiere)

| Icona | Preset                       | ID             | Esempi Trasversali                                                                       |
| :---: | :--------------------------- | :------------- | :--------------------------------------------------------------------------------------- |
|  📊   | **Dati & Tabelle**           | `sheet_sync`   | Preventivi, listini trattamenti, computi metrici, inventari magazzino, registri presenze |
|  ✉️   | **Comunicazione & Outreach** | `gmail_draft`  | Conferme appuntamenti, lettere presentazione, risposte clienti, preventivi via Gmail     |
|  🔍   | **Ricerca & Scouting**       | `web_search`   | Fornitori, normative legali/sanitarie/edilizie, concorrenza locale via Jina Reader       |
|  📄   | **Analisi Documentale**      | `pdf_analysis` | Capitolati, contratti, referti, schede tecniche, normative                               |

---

## 💰 2. Matrice dei Costi & Ottimizzazione Zero-Waste (Revisione Critica)

| Componente          | Scelta Tecnologica                     |  Costo Stimato / mese  | Note Critiche                                                                               |
| :------------------ | :------------------------------------- | :--------------------: | :------------------------------------------------------------------------------------------ |
| **Copilota DBS**    | `gemini-3.5-flash` (non `flash-lite`!) | ~ € 0,005 / 1.000 gen. | ⚠️ `flash-lite` non registrato in Genkit. Usare `gemini-3.5-flash` o `gemini-1.5-flash-8b`. |
| **STT (Dettatura)** | Native `webkitSpeechRecognition`       |       **€ 0,00**       | Fallback: messaggio testuale se browser non supportato (NO Groq per Zero-Dependency).       |
| **TTS (Lettura)**   | Native `window.speechSynthesis`        |       **€ 0,00**       | 20 righe di TypeScript puro. Già usato da Gemini Web.                                       |
| **Web Scraping**    | Jina AI Reader (`r.jina.ai`)           |       **€ 0,00**       | Già attivo in `webSearch.ts`.                                                               |
| **Motore Chat**     | `gemini-3.5-flash`                     |  ~ € 0,075 / 1M token  | Con 10 € prepagati → centinaia di migliaia di chat.                                         |
| **TOTALE MENSILE**  |                                        |  **< € 0,10 / mese**   | Ampiamente sotto il target di € 1,00/mese per 1.000 utenti.                                 |

---

## 🛠️ 3. Checklist Chirurgica DEFINITIVA (5 Fasi — Piano v2.1)

### 📌 Fase 1: Modello Dati TypeScript (`src/types/models.ts`) — REFACTORING FONDAMENTALE

> [!IMPORTANT]
> Questa fase è un prerequisito bloccante per tutte le altre. Non procedere alle Fasi 2-5 senza aver completato questa.

- [x] **1.1** Creare la nuova interfaccia **`WorkspaceRules`** separata:
  ```typescript
  export interface WorkspaceRules {
    doList: string[]; // Regole vincolanti (es. "Cita articoli di legge", "Usa prezzi IVA inclusa")
    dontList: string[]; // Divieti assoluti (es. "Non inventare dati", "Non confermare ordini senza ok")
    outputFormat: "markdown" | "table" | "json" | "bullet_points";
  }
  ```
- [x] **1.2** Creare la nuova interfaccia **`WorkspaceAttitude`** separata:
  ```typescript
  export interface WorkspaceAttitude {
    industryScope: string; // Settore rilevato (stringa libera — NON enum fisso)
    tone: string; // Tono consigliato (stringa libera — NON enum fisso)
    skills: string[]; // Tag competenze (es. ["Colorimetria", "Computi Metrici"])
    rules: WorkspaceRules;
  }
  ```
- [x] **1.3** Aggiungere il campo `attitude?: WorkspaceAttitude` all'interfaccia `Workspace`.
- [x] **1.4** Aggiungere `TaskPresetCategory` come tipo union: `'web_search' | 'sheet_sync' | 'gmail_draft' | 'pdf_analysis'`.
- [x] **1.5** ⚠️ Rimuovere da `WorkspaceLinkedResources` i campi duplicati (`doList`, `dontList`, `toneOfVoice`, `assignedAgents`) perché migrati in `WorkspaceAttitude` — con migrazione dati Firestore.
- [x] **1.6** ⚠️ Valutare il deprecamento di `systemPrompt?: string` in `Workspace`, da sostituire con la costruzione dinamica a runtime in `promptBuilder.ts`.
- [x] **1.7** 🔴 **Aggiornare `taskStore.ts` (Pinia) — CRITICO:** Adeguare lo store Pinia ai nuovi tipi TypeScript senza rompere la cache localStorage esistente:
  - Aggiungere `isGeneratingAttitude: boolean` allo `state` come flag reattivo condiviso tra modale DBS e header (previene double-submit).
  - Aggiungere action sincrona `setAttitude(workspaceId: string, attitude: WorkspaceAttitude)` che aggiorna `this.workspaces` in-memory e chiama `saveCachedWorkspaces()`.
  - Aggiungere funzione di **idratazione/migrazione** in `loadCachedWorkspaces()`: se un workspace in cache ha i vecchi campi `linkedResources.doList`/`dontList`/`toneOfVoice` ma `attitude` è assente, rimapparli provvisoriamente in `attitude`. Questo è il safety-net per la migrazione live senza downtime e senza corrompere il rendering.
  - Aggiungere `updateWorkspaceAttitude(workspaceId: string, attitude: WorkspaceAttitude)` come action asincrona che scrive su Firestore il campo `attitude` e aggiorna la cache locale via `setAttitude`.
  - Esporre il computed getter `activeWorkspaceAttitude` che legge da `activeWorkspace?.attitude`.
  - Deprecare l'action `updateWorkspacePrompt` (già presente in `taskStore.ts` riga 383) → sostituire con `updateWorkspaceAttitude`.

### 📌 Fase 2: Cloud Function DBS (`generateDbsAttitude`)

- [x] **2.1** Creare la Cloud Function Genkit `generateDbsAttitude` con modello **`gemini-3.5-flash`** (non `flash-lite`).
- [x] **2.2** Definire il `DBS_SYSTEM_PROMPT` rigorosamente agnostico: nessun settore cablato, risposta esclusivamente in JSON strutturato conforme a `WorkspaceAttitude`.
- [x] **2.3** Validare l'output con schema Zod corrispondente a `WorkspaceAttitude` prima di scrivere su Firestore.
- [x] **2.4** Verificare il JWT Custom Claim (`isActive: true`) prima di eseguire la generazione.
- [x] **2.5** 🔴 **Vertical Slice Step A — Action Pinia FE-BE:** Creare l'action asincrona `generateDbsAttitude(workspaceId: string, userPrompt: string)` dentro `taskStore.ts`:
  - Imposta `isGeneratingAttitude = true` per bloccare double-submit.
  - Chiama la Cloud Function `generateDbsAttitude` tramite **Firebase Functions SDK** (`getFunctions` + `httpsCallable`) — non `fetch` diretto (anti-pattern per AGENTS.md §3 HTTP Stack).
  - In caso di **successo**: chiama `setAttitude()` per aggiornare lo store localmente → poi `updateWorkspaceAttitude()` per persistere su Firestore (pattern Write-Firestore-First di §5).
  - In caso di **errore**: imposta `this.error` con messaggio user-friendly e reimposta `isGeneratingAttitude = false`.

### 📌 Fase 3: UI Header & Modale `AIPromptArchitectModal.vue`

- [x] **3.1** Inserire il pulsante `[✨ AI Prompt Architect]` nell'header del Workspace in `src/pages/index.vue`.
- [x] **3.2** Creare `src/components/AIPromptArchitectModal.vue` con: campo input testo libero + spinner durante la generazione DBS + sezione preview del `WorkspaceAttitude` generato + pulsante `[🚀 Applica all'Atteggiamento IA]`.
- [x] **3.3** Aggiornare `WorkspaceAttitudeModal.vue`:
  - Sostituire l'enum `toneOfVoice` con campo `q-input` stringa libera.
  - Aggiungere **Skill Matrix Tag Input** via `q-select` con `use-chips`, `multiple`, `new-value-mode="add-unique"`.
- [x] **3.4** Aggiornare `CreateTaskModal.vue` con la tendina Preset universale (`📊 Dati & Tabelle`, `✉️ Comunicazione`, `🔍 Ricerca`, `📄 Analisi PDF`).

### 📌 Fase 3.5 — 🧪 E2E Smoke Test: Vertical Slice (Gate Obbligatorio Prima di Fase 4)

> [!IMPORTANT]
> Questa fase è un **gate di qualità bloccante**. Non procedere a Fase 4 e Fase 5 senza aver superato tutti e 3 gli Step. Sviluppare Fase 4 su uno store non ancora sincronizzato con il backend genera bug silenti difficili da tracciare.

- [x] **3.5.A** ✅ **Round-trip DBS (Vertical Slice Step A):** Inserire testo libero nella modale `AIPromptArchitectModal.vue` e verificare:
  - Lo spinner è visibile durante la chiamata CF e `isGeneratingAttitude === true`.
  - La risposta JSON contiene `industryScope`, `tone`, `skills[]`, `rules.doList[]`, `rules.dontList[]` conformi al tipo `WorkspaceAttitude`.
  - Il flag `isGeneratingAttitude` torna `false` dopo il completamento (successo o errore).
- [x] **3.5.B** ✅ **Salvataggio & Reattività Pinia (Vertical Slice Step B):** Premere `[🚀 Applica]` e verificare:
  - Il documento Firestore `tenants/{tenantId}/workspaces/{workspaceId}` contiene il campo `attitude` popolato (verificabile da Firebase Console).
  - Il tab "Atteggiamento" in `WorkspaceAttitudeModal.vue` mostra i dati aggiornati **senza reload di pagina** (reattività Pinia confermata).
  - La cache `localStorage` con chiave `opsflow_workspaces_cache` contiene il campo `attitude` aggiornato (ispezione da DevTools → Application → Local Storage).
- [x] **3.5.C** ✅ **Runtime Prompting End-to-End (Vertical Slice Step C):** Inviare un messaggio nella chat del task e verificare:
  - Nei log Firebase Functions (`chatWithAgent`) è presente la sezione `=== WORKSPACE CONSTITUTION ===` con `industryScope`, `tone` e `skills` iniettati.
  - La risposta dell'agente riflette il tono e i vincoli `doList`/`dontList` configurati nel workspace.

### 📌 Fase 4: Motore Stacking Prompt Anti-Allucinazione (`promptBuilder.ts`)

- [x] **4.1** Aggiornare `PromptStackOptions` per accettare il nuovo oggetto `WorkspaceAttitude` strutturato (non solo la stringa `workspacePrompt`).
- [x] **4.2** Iniettare nel Level 2 la sezione `=== WORKSPACE CONSTITUTION ===` con:
  - `SETTORE: {industryScope}` — vincola il dominio di competenza.
  - `TONO: {tone}` — definisce lo stile di risposta.
  - `RUOLI ATTIVI: [{skills.join(', ')}]` — inietta la Skill Matrix.
  - `DEVI (DO): {doList}` — regole vincolanti formattate come lista numerata.
  - `NON DEVI MAI (DON'T): {dontList}` — divieti tassativi formattati.
- [x] **4.3** Aggiungere alla fine del prompt il marcatore di ancoraggio: `=== FINE COSTITUZIONE WORKSPACE — RISPETTA RIGOROSAMENTE ===`.

### 📌 Fase 5: Voice Experience (TTS/STT Nativo) & Upload PDF in `TaskChatWindow.vue`

- [x] **5.1** Creare `src/composables/useWebSpeech.ts` con:
  - **TTS:** `window.speechSynthesis` con selezione voce in italiano (`lang = 'it-IT'`).
  - **STT:** `webkitSpeechRecognition` con gestione errori (no Groq — fallback a input testuale).
- [x] **5.2** Aggiungere il pulsante microfono 🎙️ nel footer di `TaskChatWindow.vue` con feedback visivo (animazione pulse).
- [x] **5.3** Aggiungere l'icona altoparlante 🔊 su ogni fumetto risposta Agente AI.
- [x] **5.4** Aggiungere il pulsante allegato 📎 per l'upload PDF con invio del buffer base64 al backend Gemini Multimodal.
- [x] **5.5** Verificare compatibilità browser: `SpeechRecognition` supportata su Chrome/Edge/Safari ma NON su Firefox Desktop (mostrare avviso `q-banner` in caso di browser non supportato).

---

## 🔄 Strategia di Sviluppo: Vertical Slice (FE ↔ BE in Parallelo)

Sviluppare prima tutto il backend e poi il frontend in compartimenti stagni è il modo più lento per trovare bug di integrazione. OpsFlow adopera la strategia **Vertical Slice**: ogni micro-funzionalità viene portata da Firestore fino al rendering UI in un unico ciclo di sviluppo collaudabile immediatamente.

```
Step A — Round-trip DBS:
  CF generateDbsAttitude  →  Action Pinia  →  Preview Modale Vue
       ↑                                           ↓
  Test: JSON valido ricevuto?          Test: spinner + dati visibili?

Step B — Salvataggio & Reattività Pinia:
  [Applica]  →  Firestore write  →  setAttitude()  →  WorkspaceAttitudeModal aggiornato
       ↑                                                         ↓
  Test: campo 'attitude' su Firestore?           Test: UI reattiva senza reload?

Step C — Runtime Prompting End-to-End:
  Chat input  →  promptBuilder legge store  →  CF chatWithAgent  →  risposta coerente
       ↑                                                                    ↓
  Test: WORKSPACE CONSTITUTION nel log CF?         Test: tone + skills rispettati?
```

Ogni Step è un **checkpoint autonomo e collaudabile**. Se fallisce uno Step, ci si ferma e si corregge prima di avanzare. Il vantaggio: bug di integrazione vengono scoperti subito, non dopo aver scritto altre 5 Fasi di codice sopra.

---

## 💡 Verdetto Definitivo (v2.2)

L'architettura DBS universale è il cuore di OpsFlow. Il corretto ordine di esecuzione — **mai parallelo, sempre sequenziale per slice** — è:

| Ordine | Fase                                               | Dipendenza                                          |
| :----: | :------------------------------------------------- | :-------------------------------------------------- |
|   1    | **Fase 1 + 1.7** — Modello dati TypeScript + Pinia | Prerequisito bloccante per tutto                    |
|   2    | **Fase 2 + 2.5** — CF Backend + Action Pinia       | FE e BE sviluppati come slice integrato             |
|   3    | **Fase 3** — UI Modale + Header button             | Costruita sopra store già funzionante               |
|   4    | **Fase 3.5** — E2E Smoke Test gate                 | ⛔ Gate obbligatorio. Non saltare.                  |
|   5    | **Fase 4** — Prompt Stacking Anti-Allucinazione    | Potenziato da dati `WorkspaceAttitude` già validati |
|   6    | **Fase 5** — Voice & PDF Upload                    | Funzionalità additive su base stabile               |
