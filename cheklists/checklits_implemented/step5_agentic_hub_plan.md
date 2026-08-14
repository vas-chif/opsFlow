# 🚀 STEP 5 PLAN: OpsFlow Agentic Workspace & Automation Hub

> **Visione Strategica**: Trasformare OpsFlow da una dashboard di gestione task ad una centrale operativa di **Automazione & Ricerca Agentica**, fornendo agli Agenti IA (Genkit/Gemini) strumenti per interagire con l'interfaccia (SubTask Inspector & Chat Live), con Google Workspace (Gmail Drafts & Sheets) e con il Web (Lead Generation & Market Discovery) in modalità **Human-in-the-Loop**.

---

## 📋 Moduli del Piano di Implementazione Step 5

---

### 🎨 Modulo 1: UI Bridge & Reattività dell'Orchestrazione Agentica

- [x] **1.1 Modale `+ New Task` con Prompt Operativo Guidato**:
  - Sostituire la creazione di task generici vuoti con una finestra di dialogo Elite.
  - Inclusione dei campi: `Titolo Task`, `Obiettivo / Prompt per l'IA` (descrizione dettagliata dell'attività desiderata) e `Categoria` (Marketing, Lead Gen, Admin, Dev).
- [x] **1.2 Visualizzatore Sotto-Task & AI SubTask Inspector Component**:
  - Integrazione della finestra di dettaglio task al click sulle Card del Canvas.
  - Visualizzazione in tempo reale del **Complexity Score** (1-10) calcolato da **AgentePlanner**.
  - Rendering della lista dinamica delle sotto-task (`SubTasks`) generate dall'IA con checkbox interattivi di completamento.
  - Sezione esito Audit dell'**AgenteIspettore** per i task completati.
- [x] **1.3 Chat Live Genkit Streaming nel Right Drawer**:
  - Creazione del flusso Genkit Callable (`chatFlow.ts`) in `opsflow-functions/src/ai/chatFlow.ts`.
  - Sostituzione della notifica temporanea nel cassetto destro con una chat live in streaming connessa agli Agenti IA.
  - Visualizzazione visiva dell'Agente attivo e dei Tool in esecuzione (es. _"🔧 AgenteRicerca sta cercando sul web..."_).

---

### 🛠️ Modulo 2: Google Workspace Integration Suite (Gmail & Sheets)

- [x] **2.1 Configurazione OAuth 2.0 On-Demand per Google APIs**:
  - Creazione del helper `opsflow-functions/src/tools/googleAuth.ts`.
  - Configurazione degli scope: `gmail.compose` (solo bozze), `spreadsheets` e `drive.file`.
  - Richiesta di consenso Google OAuth 2.0 trasparente ed on-demand al primo utilizzo dell'integrazione.
- [x] **2.2 Genkit Tool `createGmailDraftTool` (AgenteAmministrativo)**:
  - Implementazione in `opsflow-functions/src/tools/googleWorkspace.ts`.
  - Generazione e scrittura esclusiva della **Bozza (Draft)** tramite `users.drafts.create` di Gmail API.
  - **VINCOLO ASSOLUTO DI SICUREZZA**: L'IA non esegue mai l'invio diretto automatico. L'email rimane in bozza affinché l'utente possa rivederla ed inviarla con 1 click.
  - Ritorno del link alla bozza nell'interfaccia UI.
- [x] **2.3 Genkit Tool `manageGoogleSheetTool` (AgenteAmministrativo / AgenteRicerca)**:
  - Lettura (`values.get`) e aggiunta righe (`values.append`) su fogli Google Sheets.
  - Esportazione automatica di tabelle spese, liste clienti trovati o report di audit su Google Drive.

---

### 🔍 Modulo 3: Web Search, Lead Generation & Market Discovery Tools

- [x] **3.1 Genkit Tool `searchWebAndPlatformsTool` (AgenteRicerca)**:
  - Implementazione in `opsflow-functions/src/tools/webSearch.ts` usando API di ricerca strutturata (es. Tavily / Google Custom Search).
  - Ricerca sul web in tempo reale per identificare piattaforme (LinkedIn, Indeed, portali IT), analizzare aziende o cercare trainer/clienti.
  - Restituzione di sintesi comparative corredate da link e fonti verificate.
- [x] **3.2 Genkit Tool `leadSynthesisTool` (AgenteRicerca)**:
  - Estrazione e tipizzazione dei dati lead (Nome Azienda, Link, Servizio Richiesto, Score di Match 0-100%).
  - Salvataggio automatico dei dati profilati come nuove Card nel Workspace o su Google Sheets.

---

### 📢 Modulo 4: Social & Content Marketing Automation Engine

- [x] **4.1 Genkit Tool `contentMarketingTool` (AgenteAmministrativo / Social Assistant)**:
  - Generazione automatica di piani editoriali, post per LinkedIn, script per newsletter ed email di Cold Outreach tarati sui servizi offerti dall'utente.
  - Salvataggio dell'output come note strutturate nel Canvas del Workspace.

---

### 🛡️ Modulo 5: Aggiornamento Architetturale & Compliance Check

- [x] **5.1 Aggiornamento di `AGENTS.md` §14**:
  - Inserimento delle specifiche formali dei nuovi Tool agentici, delle regole di autorizzazione OAuth e del divieto di invio email diretto.
- [x] **5.2 Pipeline di Validazione Zero-Error**:
  - Esecuzione `npm run lint` e `npm run build` su `opsflow-functions`.
  - Esecuzione `yarn typecheck` e `yarn lint` sulla Web App principale con zero errori e zero warning.

---

### 📌 Tracciamento Esecuzione

_Tutte le fasi verranno contrassegnate con `[X]` a completamento avvenuto._
