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

## ⚙️ 6. Task Settings, Creazione Dinamica Tab & Approval Card Avanzata

### 6.1 Configurazione Operativa del Task (`TaskSettingsModal.vue`)

Accessibile mediante il pulsante `[ ⚙️ ]` integrato nell'header di `TaskChatWindow.vue`:

- **Assegnazione Foglio Target:** Consente di scegliere quale foglio Google (tra quelli censiti nel Workspace) utilizzare per le operazioni di estrazione e append dell'Agente.
- **Specifica del Foglio/Tab Interno (`selectedSheetTab`):** L'operatore può specificare una scheda interna personalizzata (es. _"Lead Qualificati"_, _"Report Clinico"_).
- **Creazione Dinamica Automatica del Tab (`addSheet` batchUpdate):** Se la scheda specificata non esiste ancora all'interno del Google Spreadsheet, la Cloud Function `resolveApproval` esegue automaticamente la chiamata `spreadsheets.batchUpdate` con richiesta `addSheet` su Google Sheets API prima dell'inserimento dei dati, eliminando alla radice gli errori 400/404.
- **Firma Email Specifica per Task:** L'operatore può personalizzare la firma usata nelle bozze Gmail generate per il task, oppure cliccare `[ Carica Firma Workspace ]` per ereditare la firma predefinita del team.
- **Collegamento Risorse al Volo:** Incollando un link o ID di foglio Google nel form di aggiunta rapida, il foglio viene sia associato al task sia salvato nel catalogo risorse del Workspace (`linkedSheets`), rendendolo immediatamente riutilizzabile in altri task.

### 6.2 Approval Card Avanzata (`ApprovalCard.vue`) & Zero PII Hardcoding

- **Zero Hardcoded PII (GDPR & Universal Multi-Tenant):** Tutte le stringhe statiche personali sono state completamente rimosse da codice e prompt. I template, le firme e i metadati sono generati dinamicamente dal contesto del tenant.
- **Modalità Espansa a Schermo Intero:** Pulsante `[ ↗ Espandi ]` per visualizzare le bozze Gmail e le tabelle di preview Google Sheets in un dialog Quasar ad alta leggibilità, ottimizzato per audit complessi.
- **Modifica Preventiva dei Dati:** L'operatore può modificare oggetto, destinatari e corpo per le email Gmail, oppure inserire/modificare singole celle e righe per i fogli Google prima di dare l'approvazione finale.
- **Idempotenza & Risoluzione Conflitti:** La Cloud Function `resolveApproval` verifica lo stato del record: se l'azione è già stata approvata o rifiutata da un altro click, restituisce `{ success: true, alreadyResolved: true }` prevenendo errori 409 (Conflict) o crash della UI.
