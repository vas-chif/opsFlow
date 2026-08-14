# 🤖 STEP 4 MASTER PLAN: Integrazione IA (Orchestrazione Agentica & Gemini RAG)

> **Obiettivo**: Portare il progetto **OpsFlow** al **100% di completamento** della `masterChecklist.md` attraverso l'integrazione di **Firebase Genkit**, **Gemini LLM**, il **Middleware di Anonimizzazione PII**, ed il file di orchestrazione integrato in **`AGENTS.md`**.

---

## 🎯 Status di Progetto (Step 4)

- [x] **Status Globale Step 4**: COMPLETATO (100%) 🚀
- **Dipendenze**: Node.js ≥ 22, Firebase Cloud Functions (v2), Genkit SDK, Gemini API.

---

## 📋 Checklist Dettagliata delle Fasi

### 🔹 FASE 4.1 — Setup Ambiente Genkit & Gemini SDK

- [x] **4.1.1** Installa `@google-genkit/ai` e `@google-genkit/googleai` all'interno della cartella `opsflow-functions/`.
- [x] **4.1.2** Configura la chiave API Gemini (`GEMINI_API_KEY`) tramite Secret Manager / file di configurazione `opsflow-functions/.env`.
- [x] **4.1.3** Crea il modulo di inizializzazione `opsflow-functions/src/ai/genkitConfig.ts` che esporta il client configurato per Gemini 1.5 Flash/Pro.

---

### 🛡️ FASE 4.2 — Middleware Anonimizzazione PII (GDPR Art. 32 & OWASP)

- [x] **4.2.1** Crea il modulo `opsflow-functions/src/ai/piiSanitizer.ts`:
  - Implementa algoritmi di pattern-matching (Regex/NLP) per rilevare e mascherare PII sensibili:
    - Nomi e Cognomi (sostituiti con `[PERSON_1]`, `[PERSON_2]`)
    - Indirizzi Email (sostituiti con `[EMAIL_1]`)
    - Numeri di Telefono (sostituiti con `[PHONE_1]`)
    - Codici Fiscali / P.IVA (sostituiti con `[TAX_ID_1]`)
    - IBAN / Dati Carta (sostituiti con `[FINANCIAL_1]`)
- [x] **4.2.2** Fornisci la funzione `sanitizeText(rawText: string)` che restituisce `{ sanitizedText: string, restorationMap: Map<string, string> }`.
- [x] **4.2.3** Scrivi ed esegui i test unitari per garantire che nessun dato sanitario o anagrafico lasci l'infrastruttura locale prima della chiamata ad LLM.

---

### 🧠 FASE 4.3 — Generazione del File di Orchestrazione `AGENTS.md` (§14)

- [x] **4.3.1** Integra le specifiche degli agenti nella Sezione §14 di **`AGENTS.md`** alla radice del progetto OpsFlow seguendo il formato rigoroso:
  - **SYSTEM PROMPT GLOBAL**: Requisiti Security-First, Isolamento Tenant, No Exposed PII, Stack TypeScript/Pinia/Quasar.
  - **DEFINIZIONE AGENTI OPERATIVI**:
    1. **AgentePlanner**: Scomposizione task in sotto-task + assegnazione `complexityScore` (1-10).
    2. **AgenteIspettore**: Revisione qualità, consistenza e compliance prima della chiusura task.
    3. **AgenteArchivista**: Indicizzazione note, preferenze e pattern nella collezione `knowledgeBase`.
    4. **AgenteRicerca**: Monitoraggio e filtraggio lead/trainer (orientato al ROI, skill match).
    5. **AgenteAmministrativo**: Compilazione report/Excel, sintesi comunicazioni.
    6. **AgenteSupervisore**: Audit di conformità delle azioni utente rispetto alle regole aziendali.
  - **PROTOCOLLO DI COMUNICAZIONE EVENT-DRIVEN**:
    - Scrittura Firestore (`tenants/{tenantId}/tasks/{taskId}`) ➔ Cloud Function Trigger ➔ Middleware PII ➔ Pipeline Genkit/Gemini ➔ Scrittura Risultato nel Tenant.

---

### ⚙️ FASE 4.4 — Implementazione Cloud Functions per gli Agenti Operativi

- [x] **4.4.1** **AgentePlanner (`onTaskCreated` in `opsflow-functions/src/index.ts`)**:
  - Intercetta l'evento `onDocumentCreated` su `tenants/{tenantId}/tasks/{taskId}`.
  - Se il task ha stato `pending`, passa il titolo e la descrizione al middleware PII.
  - Invia il testo anonimizzato alla pipeline Genkit chiedendo output JSON strutturato: `{ subtasks: Array<{title, description, order}>, complexityScore: number, suggestedCategory: string }`.
  - Aggiorna il documento task con `aiMetadata` e crea le sotto-task nella collezione tenant.
- [x] **4.4.2** **AgenteIspettore (`onTaskUpdated` in `opsflow-functions/src/index.ts`)**:
  - Intercetta `onDocumentUpdated` su `tenants/{tenantId}/tasks/{taskId}`.
  - Quando lo stato passa ad `in-progress` o `completed`, esegue l'audit di conformità e scrive l'esito del controllo nei metadati del task.
- [x] **4.4.3** **AgenteArchivista (`onTaskCompleted` / Trigger KB)**:
  - Intercetta i task completati e sintetizza le regole o le preferenze apprese nella collezione `tenants/{tenantId}/knowledgeBase/{kbId}`.

---

### 🎨 FASE 4.5 — Integrazione UI Client (Quasar & Pinia)

- [x] **4.5.1** Aggiorna `MainLayout.vue` per collegare il Right Drawer (`OpsFlow AI Assistant`) con la timeline in tempo reale delle azioni degli Agenti.
- [x] **4.5.2** Visualizza le sotto-task generate dall'**AgentePlanner** direttamente nelle card delle task del Canvas centrale.
- [x] **4.5.3** Aggiungi notifiche Quasar (`q.notify`) per avvisare l'utente dell'avvenuta scomposizione IA del task.

---

### 🧪 FASE 4.6 — Validazione, Linting & Deploy Finale

- [x] **4.6.1** Esegui `yarn typecheck` e `yarn lint` nel progetto principale (`opsflow`).
- [x] **4.6.2** Esegui `npm run lint` e `npm run build` all'interno di `opsflow-functions/`.
- [x] **4.6.3** Esegui il deploy delle Cloud Functions su Firebase Cloud (`opsflow-88of`):
  ```bash
  export PATH="/home/chif-vas/.nvm/versions/node/v22.22.0/bin:$PATH"
  npx -y firebase-tools@latest deploy --only functions --project opsflow-88of
  ```
- [x] **4.6.4** Esegui l'audit di sicurezza finale e aggiorna `masterChecklist.md` portando lo **STEP 4 al 100%**.
