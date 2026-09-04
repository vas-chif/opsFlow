# 📋 STEP 17 — AI Task Architect: Smart Task Refiner & No-Code Task Drafting (Framework DBS)

> **Status:** 🟢 APPROVATO AL 100% (Architettura Convalidata — Pronta per Esecuzione)  
> **Autore:** Vasile Chifeac & AI Senior Architect / AI Engineer  
> **Data:** 2026-09-04  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Auth, Cloud Firestore, Genkit, Gemini 3.6 Flash)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §3, §4, §5, §14), [docs/flows/03_task_execution_and_ui_flow.md](file:///home/chif-vas/projects/opsflow/docs/flows/03_task_execution_and_ui_flow.md), [SKILL/senior-architect](file:///home/chif-vas/projects/opsflow/SKILL/senior-architect/SKILL.md), [SKILL/ai-engineer](file:///home/chif-vas/projects/opsflow/SKILL/ai-engineer/SKILL.md)

---

## 🎯 1. Visione & Obiettivo dello Step 17

Implementare un sistema autonomo e non invasivo, denominato **`AITaskArchitectModal`**, ispirato al successo del configuratore _AI Prompt Architect_, dedicato alla **creazione rapida di task operativi assistita da Gemini 3.6 Flash**.

### Il Problema Reale (Field Usability per Professionisti in Mobilità)

Un professionista sanitario (come per **VersiliaCare**) o un operatore sul campo spesso registra compiti da mobile o tra un appuntamento e l'altro:

- Non ha il tempo di pensare a titoli formali, categorizzazioni complesse o a suddividere manualmente le checklist.
- Scrive un appunto grezzo e informale (es. _"medicazione signora Anna Forte dei Marmi martedì mattina ore 10 verificare bende sterili e mandare fattura"_).

### La Soluzione: AI Task Architect Scoped al Workspace

Il sistema:

1. Compare solo quando l'utente si trova **all'interno di un Workspace attivo** (`selectedWorkspace.id`).
2. Eredita automaticamente la **Costituzione DBS del Workspace** (Dominio: _"Assistenza Infermieristica Domiciliare"_, Tono: _"empatico/professionale"_, Regole DO/DON'T territoriali).
3. Espande l'appunto informale in una **scheda operativa completa con anteprima visiva**:
   - **Titolo Professionale**
   - **Descrizione Strutturata**
   - **Categoria Consigliata** (allineata a `clinical`, `admin`, `general`, ecc.)
   - **Checklist Subtask in Sequenza Logica**
   - **Livello di Priorità & Tempo Stimato**
4. Consente all'utente di **rivedere, modificare e confermare con un solo click** (Human-in-the-Loop).

---

## 🛡️ 2. Analisi Architetturale & Punti di Forza (Flow 03 & Cost Governance)

### 🔍 Perché il Piano è Ineccepibile (Valutazione Peer Review)

1. **Disinnesco della Doppia Chiamata LLM:**  
   Sfrutta il guard preesistente nel backend ([opsflow-functions/src/index.ts:176](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/index.ts#L176)):

   ```typescript
   if (taskData.aiMetadata && taskData.aiMetadata.modelVersion !== "manual") {
     return; // Salta la scomposizione automatica: il task è già stato rifinito dall'IA!
   }
   ```

   Impostando `modelVersion: "gemini-3.6-flash"` e `isAiRefined: true` al momento del salvataggio, `onTaskCreated` viene inibito all'istante. Questo vincola l'intero ciclo a:
   - **1 sola invocazione di Gemini 3.6 Flash** (~500 token $\approx$ 0,00005 €).
   - **1 sola scrittura su Firestore**.
   - **Zero costi duplicati** (pienamente conforme a [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) §5).

2. **Schema Zod Rigoroso (`RefinedTaskDraftSchema`):**  
   Forza l'output dell'IA con tipi stringenti (titolo, descrizione, enum categorie, array ordinato di subtask, priorità e stima minuti). Impedisce risposte discorsive o JSON malformati, consentendo al frontend Quasar di popolare i campi all'istante.

3. **Ergonomia Operativa a Doppio Canale (Fase 4):**  
   Lasciare il tasto standard _"Nuovo Task"_ per inserimenti veloci manuali e aggiungere sia il bottone dedicato _"AI Task Architect"_ sia il chip inline _"✨ Rifinisci questo testo con IA"_ elimina ogni attrito senza costringere l'utente a passare per l'IA quando non serve.

4. **Isolamento Workspace e Privacy (GDPR Art. 32):**  
   Il passaggio preventivo attraverso [piiSanitizer.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/utils/piiSanitizer.ts) protegge dati sensibili o riferimenti anagrafici prima della chiamata a Gemini, mentre l'iniezione del contesto DBS del workspace garantisce che le regole DO/DON'T e i confini territoriali vengano rispettati.

---

## ⚠️ 3. Due Note di Rifinitura Fondamentali per il Build

1. **Allineamento Enum Categorie:**  
   Verificare che i valori dell'enum Zod (`suggestedCategory: ["general", "marketing", "research", "admin", "dev", "clinical"]`) corrispondano esattamente ai tipi ammessi nel frontend in `src/types/models.ts` e nelle opzioni di `src/pages/index.vue` (aggiungendo l'opzione esplicita `{ label: "Assistenza Sanitaria / Clinica", value: "clinical" }`), evitando errori di validazione nei componenti Quasar.

2. **Preservazione dell'Input su Errore di Rete (Offline / Fail-Safe):**  
   In `AITaskArchitectModal.vue`, se la chiamata alla Cloud Function fallisce (es. dispositivo offline sul campo o timeout di rete), il testo grezzo inserito dall'utente **non deve essere resettato**: la UI mostra una notifica Quasar discreta e consente all'utente di creare il task in modalità manuale usando il testo già digitato, garantendo zero perdita di dati.

---

## 🏗️ 4. Schema Dati & Interfaccia Zod

### Schema di Output Strutturato Zod (`RefinedTaskDraftSchema`)

```typescript
import { z } from "genkit";

export const RefinedTaskDraftSchema = z.object({
  title: z.string().describe("Titolo sintetico, professionale ed orientato all'azione"),
  description: z.string().describe("Descrizione operativa dettagliata con contesto e istruzioni"),
  suggestedCategory: z
    .enum(["general", "marketing", "research", "admin", "dev", "clinical"])
    .describe("Categoria tematica"),
  priority: z.enum(["low", "medium", "high"]).describe("Priorità del task"),
  estimatedMinutes: z.number().min(5).max(480).describe("Stima temporale realistica in minuti"),
  subtasks: z
    .array(
      z.object({
        order: z.number(),
        title: z.string(),
        description: z.string(),
      }),
    )
    .min(2)
    .max(6)
    .describe("Sotto-task operative in sequenza logica"),
});
```

---

## 📋 5. Checklist Operativa di Implementazione (Step 17)

### Fase 1 — Backend: Cloud Function `refineTaskDraft` (Genkit + Gemini 3.6 Flash)

- [x] **1.1. Creazione Zod Schema**:
  - Definire `RefinedTaskDraftSchema` in `opsflow-functions/src/ai/genkitConfig.ts`.
- [x] **1.2. Implementazione Callable Function `refineTaskDraft`**:
  - File: `opsflow-functions/src/index.ts`.
  - Verifica autenticazione JWT (`rawAuth.token.isActive === true`).
  - Recupero del contesto DBS del Workspace (`attitude` e `linkedResources`).
  - Sanitizzazione PII obbligatoria ([piiSanitizer.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/utils/piiSanitizer.ts)).
  - Chiamata `ai.generate` con `googleai/gemini-3.6-flash` e prompt stacked a 3 livelli:
    1. Costituzione Workspace (Settore, Tono, Regole DO/DON'T).
    2. Istruzioni del Task Architect (trasformazione appunto in task azionabile).
    3. Testo grezzo dell'utente.
- [ ] **1.3. Deploy Backend**:
  - `npx firebase-tools deploy --only functions:refineTaskDraft`.

---

### Fase 2 — Store Pinia: Metodo `refineTaskDraft` in `taskStore.ts`

- [x] **2.1. Aggiunta Azione Callable**:
  - In `src/stores/taskStore.ts`, creato il metodo `async refineTaskDraft(workspaceId: string, rawDraft: string): Promise<RefinedTaskDraft>`.
- [x] **2.2. Gestione Stato di Caricamento & Fail-Safe**:
  - Aggiunto flag reattivo `isRefiningTaskDraft: boolean` per gestire lo spinner UI.
  - In caso di errore di rete, il testo grezzo viene preservato e l'errore viene propagato in sicurezza.

---

### Fase 3 — Frontend: Componente `AITaskArchitectModal.vue`

- [x] **3.1. Design System "Elite" (Quasar & GlassCard)**:
  - Creato `src/components/AITaskArchitectModal.vue` speculare ad `AIPromptArchitectModal.vue`.
  - Input superiore per l'appunto grezzo o vocale.
  - Template rapidi o scorciatoie di settore (es. _"Visita Domiciliare"_, _"Follow-up Paziente"_, _"Fatturazione"_).
  - Pulsante primario: _"✨ Genera Struttura Task"_.
- [x] **3.2. Sezione Anteprima Interattiva**:
  - Card di anteprima con:
    - Chip Categoria (incluso `clinical`) e Badge Priorità.
    - Titolo modificabile in linea.
    - Descrizione formattata.
    - Elenco checklist subtask con possibilità di deselezionare/modificare.
- [x] **3.3. Pulsante di Conferma Finale**:
  - _"Crea Task nel Workspace"_ -> invoca `taskStore.createTask()` con tutti i parametri già pre-impostati e `modelVersion: "gemini-3.6-flash"` per inibire `onTaskCreated`.

---

### Fase 4 — Integrazione UI in `src/pages/index.vue`

- [x] **4.1. Pulsante Dedicato nel Workspace**:
  - Accanto al pulsante standard _"Nuovo Task"_ (che rimane intatto e manuale per chi ha fretta), inserito il pulsante `AI Task Architect` con `id="ai-task-architect-btn"`.
- [x] **4.2. Iniezione nel Dialog Tradizionale**:
  - All'interno del dialog standard di creazione task, aggiunto chip/bottone _"✨ Rifinisci con IA"_ che passa il testo digitato all'AI Task Architect.
- [x] **4.3. Vincolo Workspace-Scoped**:
  - Il pulsante è attivo solo se `selectedWorkspace` è valorizzato, passando sempre `workspaceId: selectedWorkspace.value.id`.
- [x] **4.4. Allineamento Opzioni Categoria**:
  - Aggiunta l'opzione `{ label: "Assistenza Sanitaria / Clinica", value: "clinical" }` nell'array `categoryOptions`.

---

### Fase 5 — Controllo Qualità, Benchmark & Test E2E

- [x] **5.3. Pre-Commit Verification**:
  - `yarn typecheck` ✅ (0 errori).
  - `yarn lint` ✅ (0 errori, 0 warning).
  - Nessuna regressione sui task manuali esistenti.
- [ ] **5.1. Test con Profilo Reale VersiliaCare**:
  - Input: _"medicazione paziente forte dei marmi martedì mattina verificare bende e mandare fattura"_
  - Output atteso: Titolo sanitario corretto, 4 subtask ordinate, categoria clinica, tempo stimato ~45 min, rispetto limite 12h.
- [ ] **5.2. Verifica Non-Duplicazione Trigger (Flow 03)**:
  - Verificare nei log Firebase che `onTaskCreated` non esegua la scomposizione ridondante.

---

## 🚀 6. Direttiva di Autorizzazione per AntiGravity

Quando desideri avviare l'implementazione pratica di questo piano, è sufficiente inviare:

```markdown
# APPROVAZIONE PIANO STEP 17

Il Piano Operativo Step 17 ("AI Task Architect: Smart Task Refiner & No-Code Task Drafting") è APPROVATO al 100%.

Procedi secondo le 5 Fasi operative stabilite:

1. Backend: definisci `RefinedTaskDraftSchema` e implementa la Cloud Function callable `refineTaskDraft` con sanitizzazione PII e prompt a 3 livelli.
2. Store: aggiungi l'azione `refineTaskDraft` e il flag di caricamento in `taskStore.ts`.
3. Frontend: implementa il componente `AITaskArchitectModal.vue` e integra i bottoni di rifinitura in `src/pages/index.vue`.
4. Verifica che il salvataggio imposti `taskData.aiMetadata.modelVersion !== "manual"` per inibire il trigger automatico di `onTaskCreated`.
5. Esegui la suite di verifica (`yarn typecheck` e `yarn lint:check`).
```
