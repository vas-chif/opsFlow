# Refactoring System Instructions Dinamiche, Task-as-a-Chat e Workspace Timelines

Ristrutturazione dell'architettura agentica di OpsFlow per eliminare le System Instructions hardcoded, implementare il **Prompt Stacking a 3 Livelli** (Base + Workspace + Task), la gestione **Task-as-a-Chat** con stati commerciali/operativi avanzati, lo **Spostamento fluido di Task tra Workspace** e le **Timeline Gerarchiche**.

---

## 💡 Analisi Tecnico-Architetturale & Verdetto (§0 & AGENTS.md)

### 1. La tua intuizione è CORRETTA al 100%

Impostare le System Instruction rigide/fisse nel codice (`hardcoded`) è un **anti-pattern** nei sistemi SaaS IA multi-tenant.

- **Perché:** Ogni azienda, ogni cliente e persino ogni **Workspace** all'interno dello stesso account ha una "personalità" ed un "atteggiamento operativo" differente:
  - _Workspace Commerciale / Lead Scout:_ Atteggiamento focalizzato sull'acquisizione, la profilazione e la gestione degli stati (Contattato, Risposta Positiva, Follow-up 30gg).
  - _Workspace Amministrazione & Fogli:_ Atteggiamento focalizzato sulla pulizia email, lo spostamento dati su Google Sheets e il controllo spese.
  - _Workspace Prompt Engineering / Optimization:_ Atteggiamento analitico focalizzato sull'ottimizzazione dei prompt per ridurre l'errore allo 0%.

### 2. Confronto e Validazione della risposta di Gemini

La soluzione proposta da Gemini basata sul **Prompt Stacking a 3 Livelli** è **eccellente, robusta e perfettamente in linea con i nostri standard di architettura**.

| Livello       | Componente                | Origine Dati                                             | Responsabilità                                                                                                    |
| :------------ | :------------------------ | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Livello 1** | **System Base Prompt**    | Codice / Costanti Sicurezza                              | Regole generali OpsFlow, GDPR, Sanitizzazione PII, isolamento `tenantId`.                                         |
| **Livello 2** | **Workspace Prompt**      | Documento Firestore Workspace (`workspace.systemPrompt`) | Definisce l'atteggiamento, lo stile ed il ruolo operativo dello specifico Workspace (configurabile dall'utente!). |
| **Livello 3** | **Task Context & Prompt** | Documento Task & Chat (`task.prompt` + `chatMessages`)   | L'obiettivo specifico del task, lo storico dei messaggi ed i Tool attivi abilitati per l'esecuzione.              |

---

## 🛠️ Proposed Changes

### Core Models & State Management

#### [MODIFY] [models.ts](file:///home/chif-vas/projects/opsflow/src/types/models.ts)

- Estensione dell'interfaccia `Workspace` con i campi:
  - `systemPrompt?: string`: Istruzioni di sistema personalizzate dell'atteggiamento del Workspace.
  - `category?: TaskCategory`: Categoria prevalente del Workspace (`marketing`, `research`, `admin`, `dev`, `prompt_engineering`).
- Estensione dell'interfaccia `Task` con stati operativi estesi:
  - `status: 'pending' | 'in_progress' | 'contacted' | 'positive_response' | 'negative_response' | 'follow_up_30_days' | 'completed' | 'cancelled'`
- Definizione dell'interfaccia `TaskChatMessage`:
  - `{ id, taskId, sender: 'user' | 'agent', agentName?, text, timestamp, toolsUsed?, draftUrl? }`

#### [MODIFY] [useFirestore.ts](file:///home/chif-vas/projects/opsflow/src/composables/useFirestore.ts) & [taskStore.ts](file:///home/chif-vas/projects/opsflow/src/stores/taskStore.ts)

- Implementazione della funzione atomic `moveTask(taskId: string, sourceWorkspaceId: string, targetWorkspaceId: string)`:
  - Legge il task dal Workspace sorgente `tenants/{tenantId}/workspaces/{sourceWsId}/tasks/{taskId}`.
  - Lo scrive nel nuovo Workspace `tenants/{tenantId}/workspaces/{targetWsId}/tasks/{taskId}`.
  - Elimina il vecchio documento dal Workspace sorgente ed aggiorna la cache Pinia client-side in 0ms.
- Aggiunta della gestione del campo `systemPrompt` nella creazione/modifica dei Workspace.

---

### Cloud Functions & Prompt Stacking Engine

#### [NEW] [promptBuilder.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/ai/promptBuilder.ts)

- Funzione `buildAgentSystemInstruction({ tenantId, workspacePrompt, taskContext, userPrompt })`:
  - Assembla dinamicamente i 3 livelli di prompt prima di ogni invocazione Gemini/Genkit.
  - Applica il filtro di sanitizzazione PII.

#### [MODIFY] [chatFlow.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/ai/chatFlow.ts) & [index.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/index.ts)

- Modifica del flusso `chatWithAgentFlow` per caricare dinamicamente da Firestore il `systemPrompt` del Workspace attivo invece di usare stringhe fisse hardcoded.

---

### User Interface (UI / UX)

#### [NEW] [TaskChatModal.vue](file:///home/chif-vas/projects/opsflow/src/components/TaskChatModal.vue) / [MODIFY] [index.vue](file:///home/chif-vas/projects/opsflow/src/pages/index.vue)

- **Task-as-a-Chat Interface:** Aprire un Task mostra una modale/vista stile Chat completa con cronologia dei comandi, azioni degli agenti e bozze generate.
- **Gestione Stati Avanzati:** Dropdown/Chip interattivo per cambiare rapidamente lo stato del task (`Contattato`, `Risposta Positiva`, `Risposta Negativa`, `Follow-up tra 30gg`, `Completato`).
- **Pulsante Sposta Task:** Menu a discesa per spostare il Task corrente ad un altro Workspace con 1 click.
- **Workspace Activity Timeline Tab:** Sezione nel Canvas del Workspace che aggrega in ordine cronologico tutte le attività ed i log degli agenti del Workspace.
- **Workspace Prompt Editor:** Finestra di dialogo nella barra del Workspace per consentire all'utente di definire ed aggiornare l'atteggiamento dell'IA per quel Workspace.

---

## 🧪 Verification Plan

### Automated Tests

1. **Type Check & Lint Check:**
   - Esecuzione `yarn --ignore-engines typecheck` per verificare la perfetta aderenza TypeScript.
   - Esecuzione `yarn --ignore-engines lint` per garantire 0 errori e 0 warning oxlint/oxfmt.
   - Esecuzione `npm --prefix opsflow-functions run lint && npm --prefix opsflow-functions run build`.

2. **Cloud Functions Deployment:**
   - Esecuzione `firebase deploy --only functions` per aggiornare le Cloud Function in produzione su `opsflow-88of`.

### Manual Verification

1. **Test Prompt Dinamico Workspace:** Creare un Workspace "Commerciale Lead Scout" con un prompt personalizzato e verificare tramite la chat live che l'IA risponda adottando l'atteggiamento specifico di quel Workspace.
2. **Test Spostamento Task:** Creare un task in Workspace A, cliccare su "Sposta in Workspace B" e verificare che il task scompaia da A e compaia istantaneamente in B in Firestore e nella cache locale.
3. **Test Stati Task & Timeline:** Aggiornare lo stato di un task a `contacted` o `follow_up_30_days` e verificare l'aggiornamento della timeline del Workspace.
