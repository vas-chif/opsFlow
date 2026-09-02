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

## 📋 2. Creazione Task & Trigger Agente Automatica

### Sequence Diagram: Task Creation & AgentePlanner Decomposition

```mermaid
sequenceDiagram
    autonumber
    actor Utente
    participant UI as TaskManager (Quasar UI)
    participant FS as Firestore DB
    participant Trigger as Firestore Trigger (onTaskCreated)
    participant AI as AgentePlanner (Genkit)

    Utente->>UI: Crea Nuovo Task ("Pianifica campagna lead Q4")
    UI->>FS: Write tenants/{tenantId}/workspaces/{wsId}/tasks/{taskId} (status: 'pending')
    FS-->>Trigger: Evento onCreate intercettato
    Trigger->>AI: Analisi Titolo & Descrizione (Sanitizzati)
    AI-->>AI: Generazione 3-5 SubTask + Complexity Score (1-10)
    AI->>FS: Update task doc with subtasks, complexityScore, suggestedCategory
    FS-->>UI: Sync Reattivo Firestore -> Task visualizzato con sotto-task generate
```

---

## 💬 3. Ciclo Conversazionale, Memoria di Lavoro & Scheda Punti Chiave

### Il Modello di Memoria Conversazionale a 3 Livelli

Per garantire la massima reattività e costi inferiori a **€1.00/mese per 1.000 utenti** (§5 AGENTS.md), la conversazione si struttura su 3 livelli:

1. **Sliding Window:** Invio al LLM degli ultimi 5 messaggi della conversazione per mantenere il contesto immediato.
2. **Rolling Summary (Punti Chiave):** Sintesi automatica estratta dai messaggi dell'Agente via Regex parser `parseKeyPointsFromReply()`.
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
