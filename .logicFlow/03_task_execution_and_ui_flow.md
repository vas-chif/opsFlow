# 🏛️ OpsFlow — Architectural Flow 03: Task Execution, Working Memory & Human-in-the-Loop UI

> **Componente:** Task Management, Interactive Agent Chat Window, Working Memory & Execution Gateways  
> **Tecnologie:** Quasar 2 (`TaskChatWindow.vue`, `TaskKeyPointsCard.vue`, `ApprovalCard.vue`), Pinia (`taskChatStore.ts`), Genkit  
> **Standard:** Direttiva Fondamentale Full-Stack Alignment, Dynamic Working Memory, Human-in-the-Loop (§0, §14 AGENTS.md)  
> **Stato Documento:** Definitivo — Principal Architecture Approved

---

## 📌 1. Panoramica del Flusso Operativo Task

Il ciclo di vita di un Task in OpsFlow collega l'interfaccia utente Quasar con la pipeline agentica Genkit/Gemini. Ogni task risiede in `tenants/{tenantId}/workspaces/{wsId}/tasks/{taskId}` e combina la **Memoria di Lavoro Dinamica** (Sliding Window + Rolling Summary) con schede UI dedicate per l'approvazione ed il controllo dell'utente.

```mermaid
graph TD
    A[TaskChatWindow.vue] -->|1. Invio Messaggio Utente| B[taskChatStore.ts]
    B -->|2. HTTP POST Request| C[Cloud Function: chatWithAgent]
    C -->|3. PII Sanitization| D[piiSanitizer.ts]
    D -->|4. Prompt DNA + DBS Context| E[Genkit Flow / Gemini Flash]
    E -->|5. Tool Call Optional| F[webSearchTool / googleWorkspaceTool]
    E -->|6. Generating Output| G[parseKeyPointsFromReply]
    G -->|7. UI Rendering| H[TaskKeyPointsCard.vue]
    E -->|8. Action Needing Approval| I[ApprovalCard.vue]
    I -->|9. Human Gatekeeper| J[Cloud Function: resolveApproval]
```

---

## 📋 2. Creazione Task & Integrazione AI Task Architect

### Distinzione di Dominio: Prompt Architect vs Task Architect

OpsFlow separa nettamente gli ambiti agentici:

- **AI Prompt Architect (`AIPromptArchitectModal.vue`):** Agisce a **livello Workspace** per definire Costituzione, Atteggiamento, regole DO/DON'T e Skill Matrix.
- **AI Task Architect (`AITaskArchitectModal.vue`):** Agisce a **livello Task-Scoped**. È integrato direttamente all'interno del dialogo _"Nuovo Task Operativo per IA"_ (`showCreateTaskModal`) e nel dialogo _"Modifica Task"_ (`showEditTaskModal`).

```mermaid
graph TD
    A[Dialog: Nuovo Task Operativo per IA] -->|Compilazione Manuale| B[Crea & Attiva Agente IA]
    A -->|Click: ✨ AI Task Architect| C[AITaskArchitectModal.vue]
    C -->|Bozza Grezza / Preset Templates| D[Cloud Function: refineTaskDraft]
    D -->|Gemini 3.6 Flash + DBS Context| E[Scheda Task Strutturata]
    E -->|Revisione Human-in-the-Loop| F[Salvataggio Firestore con SubTask già approvate]
    B -->|Flow 03 Trigger Standard| G[Firestore Trigger: onTaskCreated]
    G -->|AgentePlanner Scomposizione Asincrona| H[Firestore Update Subtasks]
```

### Sequence Diagram: Flusso Integrato Task Creation

```mermaid
sequenceDiagram
    autonumber
    actor Utente
    participant UI as Dialog Nuovo Task (showCreateTaskModal)
    participant Arch as AI Task Architect (AITaskArchitectModal)
    participant CF as Cloud Function (refineTaskDraft)
    participant FS as Firestore DB

    alt Modalità Scomposizione Guidata AI
        Utente->>UI: Clicca "AI Task Architect" (passa bozza digitata)
        UI->>Arch: Apertura Modale con initialDraft precompilato
        Utente->>Arch: Clicca "Genera Struttura Task con IA"
        Arch->>CF: Invocazione refineTaskDraft(wsId, rawDraft)
        CF-->>Arch: Titolo, Categoria, Priorità e Sotto-task strutturate
        Utente->>Arch: Revisione & Conferma
        Arch->>FS: Write task (modelVersion: 'gemini-3.6-flash')
    else Modalità Diretta
        Utente->>UI: Inserisce Titolo & Prompt
        Utente->>UI: Clicca "Crea & Attiva Agente IA"
        UI->>FS: Write task (status: 'pending', modelVersion: 'manual')
        FS-->>FS: onTaskCreated -> AgentePlanner genera sotto-task in background
    end
```

### 2.1 Generatore Task da Email / Input Grezzo ("New Task from Text/Email")

Quando l'operatore riceve un'email o una richiesta non strutturata da un cliente o fornitore (es. bando di ricerca specialisti, richiesta di consulenza, commessa formativa):

1. L'utente incolla il testo integrale grezzo nella textarea di `AITaskArchitectModal.vue`.
2. `refineTaskDraft` elabora il testo incrociandolo con la Costituzione DBS del Workspace (`Level 2`) e produce:
   - **Titolo Sintetico:** Focalizzato sull'azione e sui parametri chiave (es. _"Docente Camunda 8 BPMN | Milano/Remoto"_).
   - **Descrizione Operativa:** Dettaglia contesto, requisiti reali, date e modalità logistica (remoto/presenza).
   - **Sotto-Task Atomiche Progressive:** Scomposizione in 3-5 step operativi sequenziali (es. sourcing profili certificati, verifica requisiti chiave, registrazione foglio con tracciamento fonti, contatto di qualifica).

### 2.2 Gestione Deterministica dei GAP Operativi (Nessuna Allucinazione sui Dati Mancanti)

- Se l'email o l'appunto grezzo non specifica elementi essenziali (es. tariffa oraria/giornaliera, budget, contatti diretti o date esatte), il generatore **NON deve inventare questi dati**.
- I dati mancanti vengono catalogati esplicitamente come **GAP Operativi da verificare** (es. _"Punto da verificare: concordare tariffa in prima chiamata con il cliente/candidato"_).

### 2.3 Integrazione con i Guardrail Backend dello Step 21

Il Task così strutturato fluisce poi nel runtime agentico protetto da:

- `buildStackedPrompt` in `promptBuilder.ts` (Level 1 Base Rules + Level 2 Workspace Attitude + Level 3 Task Instruction).
- `antiHallucinationGuardrail.ts` a valle su ogni operazione tabellare (normalizzazione URL, blocco email fittizie `@example.*`, data GDPR Art. 14 forzata a +30gg).

---

## 💬 3. Ciclo Conversazionale, Memoria di Lavoro & Scheda Punti Chiave

### Il Modello di Memoria Conversazionale a 3 Livelli

Per garantire la massima reattività e costi inferiori a **€1.00/mese per 1.000 utenti** (§5 AGENTS.md), la conversazione si struttura su 3 livelli:

1. **Sliding Window:** Invio al LLM degli ultimi 5 messaggi della conversazione per mantenere il contesto immediato.
2. **Rolling Summary (Punti Chiave):** Sintesi automatica est estratta dai messaggi dell'Agente via Regex parser `parseKeyPointsFromReply()`.
3. **UI Reattiva Isolata:** La scheda `TaskKeyPointsCard.vue` visualizza in tempo reale le informazioni strutturate (Lead, Requisiti, Azioni, Warning, GDPR) senza esporre JSON grezzo all'utente.

```mermaid
stateDiagram-v2
    [*] --> MessageSent: Input Utente in TaskChatWindow.vue
    MessageSent --> SanitizingPII: Passaggio per piiSanitizer.ts
    SanitizingPII --> ExecutingGenkitFlow: Prompt Cifrato inviato a Gemini 1.5 Flash
    ExecutingGenkitFlow --> ParsingReply: Ricezione Risposta Stream/JSON
    ParsingReply --> UpdatingPiniaStore: parseKeyPointsFromReply() -> taskChatStore.ts
    UpdatingPiniaStore --> RenderingUI: TaskKeyPointsCard.vue aggiornato reattivamente
    RenderingUI --> [*]: Pronto per la prossima interazione
```

### Struttura Dati Punti Chiave (`TaskKeyPointsCard.vue`)

```typescript
export type KeyPointCategory = "leads" | "requirements" | "actions" | "warnings" | "gdpr";

export interface TaskKeyPoint {
  id: string;
  category: KeyPointCategory;
  text: string;
  timestamp: string;
}
```

---

## 🛡️ 4. Human-in-the-Loop & Execution Gate (`ApprovalCard.vue`)

### Direttiva Fondamentale (§0 AGENTS.md)

Nessuna azione di backend ad alto impatto (invio email Gmail, scrittura fogli Google Sheets, modifiche permanenti DB) viene eseguita dall'Agente in modo autonomo. L'Agente produce una **Bozza di Approvazione (Pending Approval Card)**.

```mermaid
sequenceDiagram
    autonumber
    actor Utente
    participant Agent as Agente IA (chatWithAgent)
    participant UI as ApprovalCard.vue (Quasar)
    participant Gate as Cloud Function (resolveApproval)
    participant Tool as Target Tool (Gmail/Sheets)

    Agent->>UI: Emette Bozza Azione (status: 'pending_approval')
    UI->>Utente: Visualizza Scheda con Dettagli, Pulsanti "Approva" / "Rifiuta"
    alt Utente Clicca "Approva"
        Utente->>Gate: resolveApproval({ approvalId, action: 'approve' })
        Gate->>Tool: Esegue Azione Reale (es. sendEmail)
        Gate-->>UI: Stato 'approved' + Notifica Successo
    else Utente Clicca "Rifiuta"
        Utente->>Gate: resolveApproval({ approvalId, action: 'reject', reason })
        Gate-->>UI: Stato 'rejected' -> Messaggio Annullato
    end
```

---

## 📊 5. Matrice di Stato dei Task

| Stato Task          | Trigger UI                      | Azione Backend / Agente                              | Visibilità Utente                    |
| :------------------ | :------------------------------ | :--------------------------------------------------- | :----------------------------------- |
| `pending`           | Creazione Task                  | Cloud Function `onTaskCreated` genera sotto-task     | Scheda Task neutra con badge grigio  |
| `in_progress`       | Invio Primo Messaggio Chat      | `chatWithAgent` esegue prompt e tool chaining        | Badges reattivi + Rolling Key Points |
| `approval_required` | Agente emette proposta azione   | Generazione record in `tenants/{tenantId}/approvals` | `ApprovalCard.vue` in primo piano    |
| `completed`         | Chiusura Manuale / Ispezione OK | `onTaskUpdated` aziona `AgenteArchivista` per RAG KB | Badge verde + Storico note bloccato  |

---

## ⚙️ 6. Task Settings, Multi-Selezione Google Sheets & Approval Card Avanzata

### 6.1 Configurazione Operativa del Task (`TaskSettingsModal.vue`)

Accessibile mediante il pulsante `[ ⚙️ ]` integrato nell'header di `TaskChatWindow.vue`:

- **Multi-Selezione Fogli Google (`selectedSheetIds`, `selectedSheets`):** L'operatore può selezionare uno o più fogli Google contemporaneamente dalla libreria del Workspace, con supporto ad azioni massive (_"Seleziona tutti"_, _"Deseleziona tutti"_).
- **Designazione Foglio Primario (🎯 Target di Scrittura Predefinito):** Tra i fogli selezionati, un click su `[ Rendi Primario ]` imposta il foglio di destinazione predefinito per le azioni di append automatiche dell'Agente IA.
- **Specifica del Foglio/Tab Interno (`selectedSheetTab`):** L'operatore può specificare una scheda interna personalizzata (es. _"Lead Qualificati"_, _"Report Clinico"_).
- **Creazione Dinamica Automatica del Tab (`addSheet` batchUpdate):** Se la scheda specificata non esiste ancora all'interno del Google Spreadsheet, la Cloud Function `resolveApproval` esegue automaticamente la chiamata `spreadsheets.batchUpdate` con richiesta `addSheet` su Google Sheets API prima dell'inserimento dei dati, eliminando alla radice gli errori 400/404.
- **Firma Email Specifica per Task:** L'operatore può personalizzare la firma usata nelle bozze Gmail generate per il task, oppure cliccare `[ Carica Firma Workspace ]` per ereditare la firma predefinita del team.
- **Collegamento Risorse al Volo:** Incollando un link o ID di foglio Google nel form di aggiunta rapida, il foglio viene sia associato al task sia salvato nel catalogo risorse del Workspace (`linkedSheets`), rendendolo immediatamente riutilizzabile in altri task.

### 6.2 Approval Card Avanzata (`ApprovalCard.vue`) & Selezione Foglio di Destinazione

- **Cambio Foglio al Volo in Approvazione:** Quando l'Agente propone un inserimento o aggiornamento dati su Google Sheets, l'operatore può aprire la modalità modifica e selezionare qualsiasi foglio assegnato al task o al workspace tramite un comodo menu a tendina `q-select`, garantendo pieno controllo su dove andranno a finire i dati.
- **Zero Hardcoded PII (GDPR & Universal Multi-Tenant):** Tutte le stringhe statiche personali sono state completamente rimosse da codice e prompt. I template, le firme e i metadati sono generati dinamicamente dal contesto del tenant.
- **Modalità Espansa a Schermo Intero:** Pulsante `[ ↗ Espandi ]` per visualizzare le bozze Gmail e le tabelle di preview Google Sheets in un dialog Quasar ad alta leggibilità, ottimizzato per audit complessi.
- **Modifica Preventiva dei Dati (Righe & Colonne Dinamiche):** L'operatore può modificare oggetto, destinatari e corpo per le email Gmail. Per i fogli Google Sheets, sia nella card inline che nel dialog a schermo intero _"Ispezione Dati Completa"_, l'operatore può aggiungere ed eliminare non solo righe (`addRow`, `removeRow`), ma anche nuove colonne personalizzate (`addColumn`, `removeColumn`), con allineamento geometrico continuo e propagazione immediata ad `editedPayload.rows` verso `resolveApproval`.
- **Idempotenza & Risoluzione Conflitti:** La Cloud Function `resolveApproval` verifica lo stato del record: se l'azione è già stata approvata o rifiutata da un altro click, restituisce `{ success: true, alreadyResolved: true }` prevenendo errori 409 (Conflict) o crash della UI.

---

## 🔄 7. Dual-Mode AI Task Architect & In-Context Subtask Regeneration

### 7.1 Architettura a Componente Unico Condiviso (`AITaskArchitectModal.vue`)

Per rispettare il principio DRY (Don't Repeat Yourself) e le direttive [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md), il componente `AITaskArchitectModal.vue` supporta due distinte modalità operative tramite prop opzionale `existingTask`:

1. **Modalità "Creazione Nuovo Task" (`existingTask == null`):**
   - Invocato dalla Dashboard del Workspace (`src/pages/index.vue`).
   - Trasforma un appunto grezzo o un'email in una nuova scheda task (`taskStore.createTask`).
   - Titolo: _"✨ AI Task Architect | Intelligent Decomposition & Operational Sheet"_.
   - Azione finale: crea un nuovo record su Firestore con `modelVersion: "gemini-3.6-flash"`.

2. **Modalità "Rigenerazione Sotto-Task per Task Aperto" (`existingTask != null`):**
   - Invocato da `TaskSettingsModal.vue` (click su _"✨ Rigenera"_) o dal pannello laterale di `TaskChatWindow.vue`.
   - Pre-popola il prompt e le sotto-task attuali, permettendo all'operatore di raffinare l'obiettivo operativo.
   - Titolo: _"✨ AI Task Architect — Rigenera Sotto-Task | Task: [Titolo]"_.
   - Azione finale: invoca `taskStore.updateTask(workspaceId, existingTask.id, { aiMetadata: { ...subtasks } })` aggiornando **in-place** il task attivo senza creare record duplicati o causare perdite di contesto.
   - Reattività immediata: `TaskChatWindow.vue` intercetta l'evento `taskUpdated` aggiornando istantaneamente l'interfaccia utente (sotto-task operative, indicatori di completamento e timeline).

---

## 📦 8. Gestione Ciclo di Vita Task nel Workspace: Archivio, Drag & Drop e Persistenza Reload

### 8.1 Persistenza Sessione Workspace su Refresh (Reload Bug Fix)

- **Problema Risolto:** Al refresh del browser (`F5`), l'applicazione perdeva il puntamento al workspace corrente e ripristinava arbitrariamente il primo workspace in lista (`workspaces[0]`).
- **Architettura di Caching:** `taskStore` sincronizza l'identificativo del workspace selezionato nella chiave `opsflow_active_workspace_id` di `localStorage`. All'inizializzazione (`onMounted`), se la chiave esiste e appartiene al tenant corrente, l'app ripristina esattamente il workspace attivo senza deviazioni di contesto.

### 8.2 Ordinamento Reattivo Drag & Drop e Fissaggio Task (Pin 📌)

- **Fissaggio Prioritario (Pin):** L'operatore può fissare uno o più task in primo piano tramite l'opzione _"Fissa in alto"_ nel menu della card. I task fissati sono contraddistinti da un badge dorato 📌 e compaiono sempre prima di tutti gli altri task.
- **Drag & Drop Reattivo:** L'operatore può trascinare le card all'interno della griglia per riordinare liberamente i flussi operativi. Al rilascio (`drop`), il nuovo ordinamento viene applicato in-memory e persistito su Firestore (`order` field) tramite `taskStore.reorderTasks`.

### 8.3 Archivio Task Richiudibile (`<q-expansion-item>`)

- **Archiviazione Selettiva:** Dal menu contestuale a 3 puntini di ciascuna card, l'operatore può selezionare _"📦 Archivia Task"_. Il task scompare dalla griglia principale dei task attivi e viene trasferito nella sezione archivio (`archived: true`).
- **Expander di Default Chiuso:** In calce alla pagina del workspace è presente un `<q-expansion-item>` con intestazione _"📦 Task Archiviati (N)"_. Rimane tassativamente chiuso all'avvio per non ingombrare la visuale di lavoro.
- **Ripristino Istantaneo:** Aprendo l'archivio, ciascun task dispone dell'azione rapida _"♻️ Ripristina"_, che lo rimuove dall'archivio e lo riposiziona istantaneamente nella griglia dei task attivi del workspace.

---

## 🪟 9. Sistema Multi-Finestra Desktop Fluttuante & Dockbar Operativa

### 9.1 Architettura Multi-Finestra Fluttuante (`AppFloatingWindow.vue`)

Per superare i limiti di fruizione dei modali dialog a pieno schermo che bloccavano l'interazione simultanea tra chat, fogli di calcolo e impostazioni, OpsFlow implementa un'architettura **Desktop Multi-Window**:

1. **Ridimensionamento Libero (Resize Handle):** Ciascuna finestra dispone di un indicatore visivo nell'angolo inferiore destro e gestori d'evento mouse per il resizing fluido bidirezionale, rispettando vincoli minimi (`minWidth`, `minHeight`) e massimi (`viewport - padding`).
2. **Trascinamento Libero (Draggable Header):** La barra superiore (Design System Elite: Royal Navy `#0a2342` e Gold `#c5a065`) permette il drag & drop della finestra ovunque all'interno dell'area di lavoro, garantendo che non esca mai dai bordi utili.
3. **Modalità Schermo Intero (Fullscreen Toggle):** Doppio click sull'header o click sul pulsante `[ ⛶ ]` espande la finestra a 100vw/100vh. Il tasto `Escape` ripristina istantaneamente le coordinate precedenti.
4. **Riduzione a Icona (Minimize):** Il pulsante `[ - ]` minimizza la finestra riducendola ad una barra compatta di 48px, liberando la visuale della dashboard sottostante.
5. **Apertura Contemporanea Multi-Finestra:** L'operatore può mantenere contemporaneamente aperte più finestre (es. chat del task, foglio impostazioni, decomposizione IA, scheda risorsa del candidato), passando da una all'altra senza interruzioni di contesto.

### 9.2 Gestore Unificato dei Livelli Z-Index (`useFloatingWindowManager.ts`)

Un composable reattivo centralizzato e condiviso (`useFloatingWindowManager.ts` sincronizzato con `taskChatStore.ts`) gestisce la gerarchia visiva globale con base di partenza unificata a `1000`:

- **Porta in Primo Piano (`bringToFront`):** Cliccando su una qualsiasi finestra (chat o modale operativa) o trascinandone l'header, il suo z-index viene incrementato rispetto al massimo globale corrente, ponendola immediatamente e in modo assoluto in primo piano.
- **Apertura Gerarchica Garantita:** Quando una finestra figlia viene aperta da una finestra padre (es. `TaskSettingsModal` aperta tramite il pulsante `[ ⚙️ ]` dentro `TaskChatWindow`), riceve istantaneamente `globalHighestZ + 1`, apparendo sempre sopra la finestra chiamante.
- **Manda in Secondo Piano (`sendToBack`):** Un pulsante dedicato consente di inviare una finestra dietro alle altre senza chiuderla.
- **Registro Reattivo Unificato (`registeredWindows`):** Notifica alla dockbar lo stato, il titolo, l'icona e lo stato di minimizzazione sia delle finestre operative che delle sessioni di chat attive (`chat-${taskId}`).

### 9.3 Dockbar Desktop & Taskbar Operativa (`AppWindowDock.vue`)

Ancorata al centro inferiore dello schermo con effetto glassmorphism:

- **Badge di Stato:** Indicatore visivo a LED (verde per finestre attive a schermo, ambra/dorato per finestre minimizzate).
- **Ripristino con un Click:** Cliccando sull'icona nella dock, la finestra viene ripristinata dalla minimizzazione e portata direttamente in primo piano.
- **Chiusura Rapida:** Consente di chiudere singole finestre direttamente dalla dock.

### 9.4 Finestre Operative Convertite

I seguenti flussi operativi sono stati completamente integrati nello standard multi-finestra desktop:

1. **Finestra Chat & Assistente IA** (`TaskChatWindow.vue` - ID: `chat-${taskId}`)
2. **Atteggiamento del Workspace** (`WorkspaceAttitudeModal.vue` - ID: `workspace-attitude-modal`)
3. **Impostazioni Operative Task** (`TaskSettingsModal.vue` - ID: `task-settings-${taskId}`)
4. **Pianifica Ricerca Ricorrente** (`ScheduleTaskModal.vue` - ID: `schedule-task-modal`)
5. **AI Prompt Architect** (`AIPromptArchitectModal.vue` - ID: `ai-prompt-architect-modal`)
6. **AI Task Architect & Intelligent Decomposition** (`AITaskArchitectModal.vue` - ID: `ai-task-architect-modal`)
7. **Scheda Risorsa / Lead Polymorphic SubTask** (`SubTaskEntityModal.vue` - ID: `subtask-entity-modal`)
8. **Gestione Membri Team & Inviti** (`MainLayout.vue` / `TeamMembersPanel.vue` - ID: `team-members-modal`)
