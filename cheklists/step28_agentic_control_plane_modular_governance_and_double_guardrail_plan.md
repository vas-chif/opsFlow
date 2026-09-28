# Step 28 — Universal Agentic Control Plane, Modular Rule Governance & Zero-Hallucination Double Control Gate Plan

> **Branch:** `dev`  
> **Status:** PLANNED  
> **Owner:** Vasile Chifeac  
> **Created:** 2026-09-28  
> **Updated:** 2026-09-28 (Integrazione Benchmark Enterprise & 5 Rifiniture Critiche di Runtime)  
> **Target Standard:** Universal Agentic Control Plane, GDPR Art. 5/14/30/32, Full-Stack Alignment, DBS Framework (§0, §1, §3, §4, §5, §14 AGENTS.md)  
> **Applicabilità:** Multi-Modello & Multi-IDE (Gemini 1.5/3.6 Flash Runtime, Claude Code, Antigravity, Cursor, Copilot)

---

## 🎯 1. Visione Strategica & Obiettivi Principali

OpsFlow evolve da applicazione con prompt monolitici ad un **Sistema Operativo Agentico Enterprise**, implementando l'**Agentic Control Plane Pattern** (standard aperto di settore ispirato all'architettura Claude Code / Antigravity, ma reso completamente agnostico dal fornitore di intelligenza artificiale).

L'analisi integrata dei leader globali di ingegneria dei dati e governance agentica (**Clay.com**, **Dust.tt**, **LangGraph**, **Lindy.ai**) e la risoluzione dei 5 gap di runtime (TTL nativa, Throttling 429, Quota Cap workspace, Push-Back su Google Sheets e Times Management) arricchiscono il piano garantendo zero sprechi, zero memory leak e affidabilità assoluta.

### 1.1 Universalità della Costituzione Radice (`AGENTS.md`)

- Il file radice rimane fermamente nominato **`AGENTS.md`** per dichiarare inequivocabilmente che le direttive vincolano **qualsiasi agente artificiale** che interagisce con il progetto:
  - Agenti IDE di sviluppo (Google Antigravity, Claude Code, Cursor, GitHub Copilot).
  - Agenti runtime backend (Genkit + Google Gemini 1.5/3.6 Flash nelle Cloud Functions).
  - Script autonomi di manutenzione e workflow CI/CD.
- Nessun vendor lock-in: strumenti come Claude Code possono referenziare `AGENTS.md` tramite un file snello `CLAUDE.md` (<150 righe) che punta direttamente alla SSoT universale.

### 1.2 Modularizzazione del Piano delle Regole (Eliminazione del Cognitive Bleed)

- Attualmente `AGENTS.md` supera le 400 righe e viene ricaricato integralmente ad ogni sessione, rischiando amnesia di contesto e spreco di token.
- Creazione della directory modulare `.agents/rules/` con caricamento contestuale:
  - `00-governance.md`: Flusso decisionale, Explain-Before-Doing (§0), gestione branch `dev` (§1).
  - `01-security-gdpr.md`: Crittografia client-side AES-256-GCM, PII sanitizer, audit log (§3).
  - `02-multitenancy.md`: Segregazione dati tenant-scoped, JWT Custom Claims a costo zero.
  - `03-frontend-quasar.md`: Convenzioni Vue 3 `<script setup>`, GlassCard, Pinia HMR (§4).
  - `04-anti-hallucination.md`: Regole vincolanti Gate 1 & Gate 2, GAP logging, link grounding.
  - `05-cost-optimization.md`: Limite spesa <€1.00/1000 utenti, cache 30gg, scale-to-zero (§5).
  - `06-fullstack-alignment.md`: Direttiva fondamentale: ogni backend function DEVE avere UI Quasar.
- **Impatto Token:** Riduzione del 60–65% dei token di sistema per chiamata (da ~4.200 a <1.500 token), azzerando le allucinazioni da sovraccarico di contesto.

### 1.3 Sistema Anti-Allucinazione a Doppio Controllo & I 4 Pattern Enterprise Leader

OpsFlow adotta una pipeline a doppio gate con pre-filtraggio deterministico a monte:

1. **Pre-Filtering a Regex Prima dell'LLM (Pattern Clay.com - Waterfall Enrichment):**
   - Node.js deterministico estrae telefoni territoriali, email palesi e link normalizzati dai titoli/snippet grezzi PRIMA di passare il payload a Gemini Flash.
   - All'LLM viene passato solo il testo ripulito per attribuire Match Score e GAP analysis, riducendo di un ulteriore 40% i token di input.
2. **Evidence Citation Chips nella UI Quasar (Pattern Dust.tt - Evidence Anchoring):**
   - Nel componente `ApprovalCard.vue` e nella tabella della chat, associa a ogni riga/profilo estratto un badge visuale reattivo con il link reale alla fonte e l'indicatore di stato:
     - `[🟢 VERIFIED: Engine Link]`
     - `[🟡 GAP: Da confermare al contatto]`
   - Rende visibile e tangibile l'efficacia del guardrail direttamente all'utente business prima dell'approvazione verso Google Sheets.
3. **Checkpointing e Ripresa Tranche su Firestore (Pattern LangGraph - StateGraph Checkpointing):**
   - Inserimento nel task model (`src/types/models.ts`) del campo `harvestingState: { lastProcessedIndex: number, processedUrls: string[] }`.
   - Quando viene lanciata una nuova tranche, l'Agente riprende esattamente dall'indice `lastProcessedIndex + 1` senza dover rianalizzare i candidati precedenti o rileggere tutta la cronologia, azzerando duplicati e spesa API.
4. **Cache delle Ricerche con Hash SHA-256 a 72h su Firestore & Quick Actions sui GAP (Pattern Lindy.ai):**
   - Collezione `tenants/{tenantId}/webSearchCache` con chiave hash SHA-256 della query normalizzata e TTL a 72 ore. Se la query è già stata eseguita, restituisce il payload memorizzato a costo zero.
   - Bottoni rapidi contestuali sui GAP: quando un campo è etichettato `[GAP TO VERIFY: ...]`, la UI offre azioni con un click (es. `[Richiedi in InMail]`, `[Chiama e Chiedi]`, `[Ignora e Procedi]`).

---

## 🔬 2. Benchmark di Mercato: OpsFlow contro i Leader del Settore

| Piattaforma            | Architettura & Workflow                             | Human-in-the-Loop (HITL)                                                                        | Anti-Allucinazione & Ground-Truth                                                                   | Modello di Costo per Esecuzione                                           | Limite Strutturale Risolto da OpsFlow                                                              |
| :--------------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------- |
| **Lindy.ai**           | Agenti No-Code autonomi per task operativi          | Approval Gate basato su confidenza percentuale                                                  | Empirico (RLHF su cronologia conversazionale)                                                       | Elevato ($20–$50/mese per utente, modelli chiusi)                         | Sistema a scatola chiusa; zero crittografia client-side; allucinazioni frequenti su dati specifici |
| **Relevance AI**       | Squadre di agenti B2B assemblabili in catena        | Escalation manuale su Slack/interfaccia web                                                     | Prompt vincolato + parser di scraping                                                               | Medio-alto (consumo a crediti per singolo step)                           | I dati risiedono in chiaro sui loro server; interfaccia rigida non orientata al single-task        |
| **Clay.com**           | Arricchimento dati a cascata (Waterfall Enrichment) | Tabelle interattive con validazione cella per cella                                             | Deterministico al 100%: l'AI interviene solo dove falliscono le regex                               | Scalabile ma costoso sui volumi (pay-per-row)                             | Piattaforma di puro arricchimento dati, priva di orchestrazione task conversazionale               |
| **Dust.tt**            | Assistenti agentici aziendali multi-modello         | Ispezione manuale dei documenti di supporto                                                     | Evidence Anchoring: ogni affermazione ha un badge cliccabile della fonte                            | Medio ($29/utente/mese)                                                   | Non gestisce azioni operative attive (scritture Google Sheets, bozze email protette)               |
| **LangGraph / CrewAI** | Grafi di stato ad agenti sequenziali/ciclici        | Checkpoint a codice su database (human_feedback)                                                | Schemi rigidi Pydantic/Zod e vincoli di stato                                                       | Basso (self-hosted), ma richiede sviluppatori dedicati                    | Sono librerie di codice Python, non un prodotto SaaS con UI reattiva Quasar e RBAC multi-tenant    |
| **OpsFlow (Step 28)**  | **Control Plane a 4 Strati con Triple-Pane View**   | **ApprovalCard nativa con HITL + Evidence Citation Chips (Dust.tt) + Quick Actions (Lindy.ai)** | **Doppio Gate (Zod + Guardrail Node.js) + Regex Pre-Filter (Clay.com) + Checkpointing (LangGraph)** | **Minimo (< €1,00/mese per 1.000 utenti attivi) con Cache SHA-256 a 72h** | **Architettura Open-Standard, GDPR compliant (AES-256-GCM client-side), Full-Stack Quasar nativo** |

---

## 📋 3. Checklist Operativa di Implementazione

### Fase 1: Allineamento Architetturale & Documentazione dei Flussi (`.logicFlow/`)

- [x] Creare il documento formale di flusso architetturale:
  - [x] [07_agentic_control_plane_and_governance_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/07_agentic_control_plane_and_governance_flow.md):
    - [x] Definizione del Control Plane a 4 strati.
    - [x] Spiegazione dell'universalità di `AGENTS.md` per tutti i modelli/IDE.
    - [x] Schema del Sistema Anti-Allucinazione a Doppio Controllo (Gate 1 + Gate 2).
    - [x] Integrazione dei 4 pattern leader: Clay (Regex Pre-Filter), Dust (Evidence Chips), LangGraph (Checkpointing), Lindy (Quick GAP Actions).
    - [x] Matrice di prevenzione di failure modes operativi.
- [x] Aggiornare i flussi esistenti con riferimenti incrociati a Flow 07:
  - [x] [03_task_execution_and_ui_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md) (Sezione 10.5).
  - [x] [04_backend_web_search_engine_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/04_backend_web_search_engine_flow.md) (Sezione 5 - Buffer Grounding, TTL nativa, Throttling e Quota Cap).
  - [x] [05_scheduled_sourcing_and_smart_diffing_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/05_scheduled_sourcing_and_smart_diffing_flow.md) (Sezione 4.5 - State Checkpointing).
  - [x] [06_macro_task_and_micro_subtasks_polymorphic_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/06_macro_task_and_micro_subtasks_polymorphic_flow.md) (Push-Back esiti e Times Management).

---

### Fase 2: Strutturazione Modulare del Piano di Governance (`.agents/`)

- [ ] **Configurazione Radice & Compatibilità Multi-Tool:**
  - [ ] Consolidare `AGENTS.md` mantenendolo come Costituzione Primaria SSoT (<180 righe con soli principi non negoziabili).
  - [ ] Predisporre `CLAUDE.md` nella radice come adapter snello che punta ad `AGENTS.md` e importa le cartelle di configurazione.
  - [ ] Aggiungere `.mcp.json` per la definizione formale dei server MCP aziendali (Firebase, GitHub, Google Sheets).
- [ ] **Creazione Sotto-Regole Modulari in `.agents/rules/`:**
  - [ ] `00-governance.md`: Workflow unificato su branch `dev`, blocco Explain-Before-Doing (§0), convenzione Conventional Commits.
  - [ ] `01-security-gdpr.md`: Crittografia client-side AES-256-GCM, pseudonimizzazione SHA-256, auto-logout a 15 minuti, divieto assoluto di console.log in produzione.
  - [ ] `02-multitenancy.md`: Isolamento multi-tenant basato esclusivamente su Custom Claims JWT, divieto di letture Firestore non autorizzate.
  - [ ] `03-frontend-quasar.md`: Single File Component `<script setup lang="ts">`, GlassCard Design System Elite, Pinia HMR, layout Triple-Pane.
  - [ ] `04-anti-hallucination.md`: DBS Framework, Zero-Hallucination rules, GAP logging, formattazione obbligatoria per dati mancanti.
  - [ ] `05-cost-optimization.md`: Limite budget <€1.00 per 1000 utenti/mese, cache locale 30 giorni (`opsflow_user_{userId}_{dbName}`), scale-to-zero GCP.
  - [ ] `06-fullstack-alignment.md`: Direttiva vincolante di parità visiva (nessun backend/tool orfano senza componente Quasar).
- [ ] **Specializzazione Agenti in `.agents/agents/` (Identità e Prompt Isolati):**
  - [ ] `planner.md`: AgentePlanner (scomposizione subtasks, score complessità 1-10).
  - [ ] `inspector.md`: AgenteIspettore (audit qualità, consistenza e conformità requisiti).
  - [ ] `archivist.md`: AgenteArchivista (estrazione regole ricorrenti, indicizzazione RAG).
  - [ ] `researcher.md`: AgenteRicerca (screening profili, skill matching ROI-oriented).
  - [ ] `administrator.md`: AgenteAmministrativo (report sintetici, formattazione documenti).
  - [ ] `supervisor.md`: AgenteSupervisore (compliance normativa e audit regole AGENTS.md).
  - [ ] `ai-engineer-agent.md`: AgenteAiEngineer (lock-in modelli Flash, gestione token budget).
  - [ ] `prompt-engineer-agent.md`: AgentePromptEngineer (prompt a 3 livelli, Zod output enforcement).

---

### Fase 3: Pipeline Anti-Allucinazione, 4 Pattern Leader & 5 Rifiniture di Runtime

- [ ] **Pre-Filtering a Regex Deterministico in Node.js (Pattern Clay.com):**
  - [ ] In `antiHallucinationGuardrail.ts` / `webSearchEngine.ts`: implementare funzione pura di scansione regex sui raw snippets (telefoni territoriali, email palesi, link LinkedIn/sito web normalizzati) PRIMA di invocare Gemini Flash.
  - [ ] Trasmissione al modello linguistico del solo testo filtrato e sintetico (risparmio token input: ~40%).
- [ ] **Gate 1 (Cognitivo / Pre-Execution) nel Backend:**
  - [ ] Verificare che in `opsflow-functions/src/index.ts` e `promptBuilder.ts`:
    - [ ] Lo schema Zod `RefinedTaskDraftSchema` imponga campi rigorosi con `z.string().min(1)` e vieti chiavi addizionali non tipizzate (`.strict()`).
    - [ ] L'input proveniente dal Web Search venga racchiuso nei delimitatori protetti `<untrusted_web_content>...</untrusted_web_content>`.
    - [ ] Il system prompt imponga categoricamente il placeholder standard `[GAP TO VERIFY: ...]` in caso di dati non verificabili.
- [ ] **Gate 2 (Deterministico / Post-Execution Middleware) in Node.js:**
  - [ ] Ispezione e validazione del middleware `antiHallucinationGuardrail.ts`:
    - [ ] **Link Grounding:** Confronto biunivoco di ogni URL generata con la lista delle URL fornite dal provider di ricerca reale (Google Search / Brave Search). Se l'URL non è presente nel set, viene rimossa o valorizzata a `null`.
    - [ ] **Pattern Blocker:** Regex di blocco per email fittizie (es. `/@example\.(com|org|net)/i`, `/\buser@test\b/i`) e numeri di telefono mockup (es. `/\+39\s*02\s*1234567/`, `/\b555-\d{4}\b/`).
    - [ ] **GDPR Art. 14 Enforcer:** Calcolo automatico `firstContactDeadline = new Date(Date.now() + 30 * 86400000).toISOString()`.
- [ ] **Evidence Citation Chips & Quick Actions UI (Pattern Dust.tt & Lindy.ai):**
  - [ ] In `ApprovalCard.vue` e `TaskChatWindow.vue`:
    - [ ] Badge interattivo cliccabile `[🟢 VERIFIED: Engine Link]` con apertura link in tab esterna.
    - [ ] Badge ambra `[🟡 GAP: Da confermare al contatto]` con bottoni di azione rapida (`[Richiedi in InMail]`, `[Chiama e Chiedi]`, `[Ignora e Procedi]`).
    - [ ] Sospensione di esportazioni esterne (Google Sheets / Email) fino al click esplicito di approvazione umana.
- [ ] **Checkpointing delle Tranche su Firestore (Pattern LangGraph):**
  - [ ] Estensione interfaccia `Task` in `src/types/models.ts` con il campo:
    ```typescript
    harvestingState?: {
      lastProcessedIndex: number;
      processedUrls: string[];
      totalTarget: number;
      completedTranches: number;
    };
    ```
  - [ ] Aggiornamento `refineTaskDraft` / `processScheduledSourcingDispatcher` per riprendere da `lastProcessedIndex + 1` senza rielaborare i candidati preesistenti né ricaricare l'intera cronologia chat.
- [ ] **Rifinitura 1: Policy TTL Nativa per Firestore Cache (Flow 04 / 07):**
  - [ ] Configurazione esplicita del campo `expiresAt: Timestamp` (calcolato a `now + 72h`) in `tenants/{tenantId}/webSearchCache/{queryHash}`.
  - [ ] Istruzione Cloud CLI per abilitare la TTL Policy automatica a costo zero:  
        `gcloud firestore fields ttls update expiresAt --collection-group=webSearchCache`.
- [ ] **Rifinitura 2: Throttling Preventivo Brave Search (Flow 04):**
  - [ ] Inserimento di delay deterministico di 1.1s (`sleep(1100)`) tra query X-Ray sequenziali in `webSearch.ts` per non superare il rate limit di 1 QPS di Brave e prevenire falsi errori HTTP 429 che farebbero scivolare prematuramente il sistema su Tavily (Tier 2).
- [ ] **Rifinitura 3: Quota Cap Per-Workspace / Anti-Abuso (Cost Governance):**
  - [ ] Verifica preliminare del contatore `workspace.searchUsageCount` / `tenant.searchQuotaMonthly` (es. max 50 ricerche/mese per account freemium) prima di invocare `webSearchTool`.
- [ ] **Rifinitura 4: Sincronizzazione di Rientro Push-Back su Google Sheets (Flow 06):**
  - [ ] Implementazione dell'azione on-demand `[Aggiorna Esiti su Foglio]` nella Action Bar dei Sub-Task: genera una `ApprovalCard.vue` per aggiornare deterministicamente in batch le colonne Note/Esiti (Won/Lost) sul Google Sheet originario.
- [ ] **Rifinitura 5: Slot Calendario & Times Management in EntitySubTask (Flow 06):**
  - [ ] Estensione in `src/types/models.ts` dell'attributo opzionale:
    ```typescript
    scheduleSlots?: Array<{
      date?: string; // YYYY-MM-DD
      start: string; // HH:mm
      end: string;   // HH:mm
      notes?: string;
      location?: string;
    }>;
    ```
    per supportare nativamente la gestione di lezioni in aula (NobleProg) e orari di visita/ricevimento ambulatoriale (Medici Versilia).

---

### Fase 4: Script di Verifica Deterministica (Hooks di Sicurezza & Qualità)

- [ ] **Creazione cartella `.agents/hooks/` con script eseguibili:**
  - [ ] `pre-commit-validate.sh`:
    - [ ] Esegue `yarn typecheck` sul frontend (deve uscire con codice 0).
    - [ ] Esegue `yarn lint:check` con oxlint (deve uscire con codice 0).
    - [ ] Esegue `npm run build` su `opsflow-functions` (deve uscire con codice 0).
    - [ ] Blocca il commit in caso di qualsiasi fallimento (Exit Code 2).
  - [ ] `pre-tool-security.sh`:
    - [ ] Esegue scansione preventiva con grep per rilevare violazioni di sicurezza critiche:
      - [ ] Rilevamento `console.log` in file `src/` (vietato da §3 AGENTS.md).
      - [ ] Rilevamento import di `axios` o librerie HTTP esterne non autorizzate (§3).
      - [ ] Rilevamento `v-html` senza esplicito wrapper `sanitize()` (§3).
      - [ ] Verifica che il branch corrente sia `dev` (§1).
  - [ ] `post-write-audit.sh`:
    - [ ] Verifica la presenza dell'header JSDoc standard sui nuovi file TypeScript.
    - [ ] Verifica il marcatore di chiusura funzione commentato (`/*end functionName*/`).
    - [ ] Verifica l'ordine corretto dei blocchi nei componenti Vue (`<script>` prima di `<template>`).

---

### Fase 5: Verifica, Benchmarking dei Token & Rollback Plan

- [ ] **Verifica Non-Regressione Codebase:**
  - [ ] Esecuzione `yarn lint:check` (0 errori, 0 warning).
  - [ ] Esecuzione `yarn typecheck` (0 errori).
  - [ ] Esecuzione `npm run build` in `opsflow-functions` (0 errori).
- [ ] **Benchmarking dei Costi & Risparmio Token:**
  - [ ] Riduzione del payload di contesto via modularizzazione regole: ~65% di token in meno per chiamata.
  - [ ] Riduzione token di input via Regex Pre-Filter (Clay.com): ~40% di token in meno per ricerca.
  - [ ] Risparmio chiamate API esterne via Cache SHA-256 a 72h con TTL automatica: fino al 40% di query evitate a costo storage zero.
  - [ ] Rispetto verificato del limite di spesa totale: <€1.00/mese per 1000 utenti attivi.
- [ ] **Piano di Rollback Immediato:**
  - [ ] Ripristino istantaneo garantito tramite checkout del branch `dev` allo snapshot precedente.

---

## 🔍 4. Matrice Dettagliata di Prevenzione Rischi & Failure Modes

| Failure Mode Identificato                   | Causa Scatenante                                                                 | Impatto sul Sistema                           | Soluzione Architetturale Preventiva                                                 |
| :------------------------------------------ | :------------------------------------------------------------------------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------- |
| **Saturazione Finestra di Contesto**        | Ricarica continua di regole su stile Quasar e GDPR durante task di puro backend  | Amnesia di regole critiche, allucinazioni     | Modularizzazione in `.agents/rules/` con lazy-loading selettivo.                    |
| **Invenzione di Link & Fonti (Ghost URLs)** | L'AI prova a formattare link plausibili ma non verificati                        | Informazioni ingannevoli fornite all'utente   | Gate 2 Link Grounding: drop automatico dei link non presenti nel buffer HTTP reale. |
| **Spreco Token su Dati Grezzi Web**         | Passaggio dell'intero dump HTML/snippet a Gemini Flash                           | Costi elevati e rischio allucinazione numeri  | **Pre-Filtering a Regex (Clay.com)**: estrazione deterministica a monte.            |
| **Perdita Stato Tranche su Timeout**        | Interruzione connessione durante l'estrazione di 50 candidati                    | Ripartenza da zero, duplicati, spreco crediti | **Checkpointing (LangGraph)**: `harvestingState` persistito su Firestore.           |
| **Accumulo Storage Senza TTL**              | Cache delle ricerche senza cancellazione automatica dei record scaduti           | Gonfiamento costi storage Firestore           | **Policy TTL Nativa Google Cloud**: `expiresAt` con cancellazione a costo zero.     |
| **Falso Fallback su HTTP 429 da Burst**     | Query X-Ray sequenziali sparate in <1s superano il rate limit di Brave (1 QPS)   | Consumo prematuro dei crediti Tavily (Tier 2) | **Throttling Deterministico (1.1s)**: `sleep(1100)` tra chiamate sequenziali.       |
| **Consumo Quota di Sistema da Freemium**    | Un singolo tenant/workspace lancia ricerche massive prosciugando la quota        | Blocco del servizio per gli altri tenant      | **Quota Cap Per-Workspace**: hard-stop a 50 ricerche/mese per account freemium.     |
| **Disallineamento Fogli Google di Ritorno** | Candidati chiusi su OpsFlow (Won/Lost) non aggiornati sul Google Sheet originale | Doppio lavoro manuale per il team             | **Batch Push-Back Esiti**: azione on-demand protetta da `ApprovalCard.vue`.         |
| **Conflitti Orari nei Corsi / Visite**      | Date generiche senza fasce orarie strutturate per lezioni d'aula e visite        | Sovrapposizione di appuntamenti               | **Times Management (`scheduleSlots`)**: array di orari e date in `EntitySubTask`.   |
| **Incertezza Utente sulle Fonti**           | L'utente non sa se un dato arriva da un sito reale o dalla memoria dell'AI       | Mancanza di fiducia, revisione manuale lenta  | **Evidence Citation Chips (Dust.tt)**: badge cliccabili `[🟢 VERIFIED]`.            |
| **Stallo Operativo sui Dati Mancanti**      | I campi con `[GAP TO VERIFY]` rimangono bloccati senza azione successiva         | Rallentamento del workflow commerciale/HR     | **Quick Actions sui GAP (Lindy.ai)**: pulsanti `[Richiedi in InMail]`, `[Chiama]`.  |
| **Indirect Prompt Injection**               | Pagine web indicizzate contengono testo occulto con comandi per l'AI             | L'agente esegue istruzioni arbitrarie         | Tag protetti `<untrusted_web_content>` e system prompt di isolamento cognitivo.     |
| **Violazione GDPR Art. 14**                 | Mancata notifica ai candidati reperiti da fonti pubbliche entro 30 giorni        | Rischio sanzioni legali per il tenant         | Iniezione automatica e deterministica della scadenza a 30 giorni nell'entità.       |
| **Scritture Concorrenti su Task**           | Utente e agente aggiornano il medesimo task simultaneamente                      | Race condition o perdita di subtasks          | Transazioni atomiche Firestore (`runTransaction`) con lock su `updatedAt`.          |
| **Costi Fuori Controllo su Genkit**         | Richieste a cascata senza caching locale                                         | Esplosione del budget Cloud                   | Cache Pinia a 30 giorni + lock-in rigoroso sul modello **Gemini Flash**.            |
| **Disallineamento Full-Stack**              | Una Cloud Function viene aggiunta senza interfaccia grafica                      | Funzionalità nascosta, test impossibile       | Direttiva Vincolante: blocco PR se la funzione non ha scheda/pulsante in Quasar.    |

---

## 📌 5. Criteri di Accettazione e Definizione di Fatto (Definition of Done)

Un'attività di questo piano si considera completata solo ed esclusivamente quando:

1. `AGENTS.md` funge da SSoT universale per tutti gli agenti (IDE e runtime).
2. La directory `.agents/rules/` ospita le 7 sotto-regole specializzate senza ridondanze.
3. Il pre-filtraggio regex (Clay.com) e il doppio gate anti-allucinazione sono documentati, tipizzati e testati.
4. I badge visuali di citazione fonte (Dust.tt) e le azioni rapide sui GAP (Lindy.ai) sono integrati nelle schede Quasar.
5. Il checkpointing delle tranche (LangGraph) è integrato nel modello `Task` e nella logica di esecuzione.
6. La cache a 72h con digest SHA-256 e policy TTL nativa `expiresAt` è formalizzata.
7. Il throttling a 1.1s e il Quota Cap per-workspace sono documentati e integrati nel tool di ricerca.
8. La sincronizzazione di rientro su Google Sheets e il supporto `scheduleSlots` sono formalizzati nel modello subtask.
9. `yarn lint:check` restituisce 0 errori e 0 warning.
10. `yarn typecheck` restituisce 0 errori di compilazione TypeScript.
11. `npm run build` su `opsflow-functions` compila con successo.
12. Nessuna modifica a codice sorgente di produzione è stata introdotta durante la fase di definizione del piano.
