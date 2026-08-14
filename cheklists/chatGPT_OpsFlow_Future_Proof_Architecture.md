# OpsFlow — Future-Proof Architecture & Extensibility Blueprint

**Version:** 1.0  
**Status:** Architectural baseline for V2/V3  
**Stack:** Quasar + Vue 3 + TypeScript + Pinia + Firebase/Firestore + Cloud Functions + Genkit/Gemini

---

## 1. Executive Summary

OpsFlow deve essere progettato come una piattaforma **AI-first di orchestrazione operativa**, non come una semplice chat con task.

Il principio architetturale centrale è:

> **Task = risorsa operativa. Chat, Timeline, Execution Plan, Files, Voice e Analytics sono viste/moduli della stessa risorsa.**

L'AI propone e orchestra; il sistema valida; l'utente autorizza le azioni sensibili.

Obiettivi:

- evitare riscritture architetturali future;
- supportare multi-window e multi-panel;
- supportare collaborazione multiutente;
- rendere Voice indistinguibile dal testo a livello di dominio;
- introdurre memoria personale, workspace e task;
- rendere gli Agent configurabili senza esporre il prompt engineering;
- aggiungere Tool tramite plugin senza modificare l'orchestratore;
- mantenere controllo, auditabilità e sicurezza;
- preparare il sistema a governance, costi e limiti SuperAdmin.

---

# 2. Principi Architetturali

## 2.1 Resource-first

Ogni entità importante deve essere indipendente.

```text
Tenant
 ├── Users
 ├── Workspace
 │    ├── Members
 │    ├── Agent
 │    ├── Knowledge
 │    └── Tasks
 │         ├── Messages
 │         ├── Executions
 │         ├── Events
 │         ├── Comments
 │         ├── Approvals
 │         └── Attachments
 └── Billing / Governance
```

Un componente Vue non deve possedere lo stato di business.

---

## 2.2 Separazione dei livelli

```text
Presentation
    ↓
Application / Pinia
    ↓
Domain
    ↓
Infrastructure
```

### Presentation

Quasar/Vue:

- componenti;
- drawer;
- modal;
- floating window;
- split panel;
- mobile views.

### Application

Pinia:

- workspaceStore;
- taskStore;
- taskChatStore;
- executionStore;
- voiceStore;
- agentStore;
- memoryStore;
- uiWindowStore.

### Domain

Motori indipendenti:

- Task Engine;
- Execution Engine;
- Agent Engine;
- Tool Engine;
- Memory Engine;
- Approval Engine;
- Collaboration Engine.

### Infrastructure

- Firestore;
- Cloud Functions;
- Genkit;
- Gemini;
- Google APIs;
- servizi esterni.

---

# 3. Task come Operational Resource

Non progettare:

```text
Task → Chat
```

Progettare:

```text
Task
 ├── Chat
 ├── Timeline
 ├── Execution Plan
 ├── Executions
 ├── Files
 ├── Comments
 ├── Approvals
 ├── Voice
 └── Analytics
```

Questo permette di visualizzare lo stesso task in:

```text
Right Drawer
Modal
Floating Window
Split View
Mobile Page
```

senza duplicare la logica.

---

# 4. Firestore Data Model

## 4.1 Workspace

```typescript
export interface Workspace {
  id: string;
  tenantId: string;

  name: string;
  description?: string;

  icon?: string;
  color?: string;

  defaultAgentId?: string;
  knowledgeBaseId?: string;

  archived: boolean;

  settings: {
    defaultTone?: string;
    defaultLanguage?: string;

    allowedTools: string[];

    visibility: "private" | "tenant";

    requireApprovalForTools?: string[];

    maxExecutionSteps?: number;
  };

  createdBy: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Workspace Members

Non usare un semplice `sharedWithUsers[]` come struttura principale.

Preferire:

```text
workspaceMembers/{memberId}
```

con:

```typescript
export interface WorkspaceMember {
  id: string;

  tenantId: string;
  workspaceId: string;
  userId: string;

  role: "owner" | "admin" | "editor" | "operator" | "viewer";

  permissions: string[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Questo evita di dover cambiare struttura quando il team cresce.

---

# 5. Task

```typescript
export interface Task {
  id: string;

  tenantId: string;
  workspaceId: string;

  title: string;
  description?: string;

  status:
    | "draft"
    | "planned"
    | "running"
    | "waitingApproval"
    | "blocked"
    | "completed"
    | "failed"
    | "cancelled";

  priority: number;

  assignedAgentId?: string;

  assignedUsers: string[];

  tags: string[];

  lastExecutionId?: string;

  latestMessageAt?: Timestamp;

  createdBy: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Il Task non deve contenere direttamente messaggi, log o timeline.

---

# 6. Subcollections del Task

Struttura consigliata:

```text
tenants/{tenantId}
  /workspaces/{workspaceId}
    /tasks/{taskId}

      /messages/{messageId}
      /executions/{executionId}
      /events/{eventId}
      /comments/{commentId}
      /approvals/{approvalId}
      /attachments/{attachmentId}
```

---

# 7. Execution

Una singola esecuzione deve essere una risorsa indipendente.

```typescript
export interface TaskExecution {
  id: string;

  tenantId: string;
  workspaceId: string;
  taskId: string;

  plannerVersion?: string;
  agentVersion?: string;

  startedAt: Timestamp;
  finishedAt?: Timestamp;

  state:
    "planning" | "planned" | "executing" | "waitingApproval" | "completed" | "failed" | "cancelled";

  executionPlan: ExecutionStep[];

  currentStepIndex?: number;

  toolCalls: number;

  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };

  estimatedCost?: number;
  actualCost?: number;

  error?: {
    code: string;
    message: string;
  };
}
```

Execution step:

```typescript
export interface ExecutionStep {
  id: string;

  order: number;

  type: "llm" | "tool" | "approval" | "human" | "condition";

  label: string;

  toolId?: string;

  status: "pending" | "running" | "waitingApproval" | "completed" | "failed" | "skipped";

  requiresApproval: boolean;
}
```

---

# 8. Event Timeline

La timeline deve essere event-driven.

```typescript
export interface TaskEvent {
  id: string;

  tenantId: string;
  workspaceId: string;
  taskId: string;
  executionId?: string;

  type:
    | "user"
    | "assistant"
    | "tool"
    | "approval"
    | "voice"
    | "system"
    | "error"
    | "comment"
    | "status";

  actorType: "user" | "agent" | "system" | "tool";

  actorId?: string;

  createdAt: Timestamp;

  payload: unknown;
}
```

Questo permette di costruire:

- timeline;
- audit log;
- streaming UI;
- activity feed;
- collaborazione;
- analytics.

---

# 9. Messages

```typescript
export interface TaskMessage {
  id: string;

  taskId: string;
  tenantId: string;

  authorType: "user" | "assistant" | "system" | "tool";

  authorId?: string;

  inputType: "text" | "voice" | "image" | "file" | "tool";

  content: string;

  attachments?: AttachmentRef[];

  createdAt: Timestamp;

  metadata?: {
    model?: string;
    executionId?: string;
    tokenUsage?: number;
  };
}
```

La voce deve entrare nel sistema attraverso la stessa pipeline del testo.

---

# 10. Multi-Window UI

Non utilizzare:

```typescript
currentTaskId: string | null;
```

come unico stato globale.

Usare una collezione di viste.

```typescript
export interface TaskViewState {
  viewId: string;

  taskId: string;

  mode: "drawer" | "modal" | "floating" | "split" | "page";

  activeTab: "chat" | "timeline" | "plan" | "files" | "activity";

  minimized?: boolean;

  position?: {
    x: number;
    y: number;
  };

  size?: {
    width: number;
    height: number;
  };
}
```

Pinia:

```typescript
export interface UiWindowState {
  openedViews: Record<string, TaskViewState>;

  activeViewId?: string;
}
```

Lo stesso:

```vue
<TaskView :task-id="taskId" />
```

può essere usato da:

```text
RightDrawer
Modal
FloatingWindow
SplitPanel
MobilePage
```

Il componente non deve sapere dove viene renderizzato.

---

# 11. Pinia Architecture

Struttura consigliata:

```text
stores/
 ├── auth.store.ts
 ├── tenant.store.ts
 ├── workspace.store.ts
 ├── task.store.ts
 ├── task-chat.store.ts
 ├── execution.store.ts
 ├── agent.store.ts
 ├── memory.store.ts
 ├── voice.store.ts
 ├── tool.store.ts
 ├── collaboration.store.ts
 ├── ui-window.store.ts
 └── governance.store.ts
```

## workspaceStore

Responsabile di:

- workspace attivo;
- lista workspace;
- members;
- configurazione workspace.

Non deve gestire i messaggi.

---

## taskStore

Responsabile di:

- task;
- CRUD;
- assegnazioni;
- stato task.

---

## taskChatStore

Responsabile di:

- messaggi;
- streaming;
- invio input;
- stato chat;
- errori chat.

Non deve sapere se la chat è drawer o modal.

---

## executionStore

Responsabile di:

- execution corrente;
- piano;
- step;
- tool calls;
- stato esecuzione;
- approvazioni.

---

## voiceStore

Responsabile esclusivamente di:

```typescript
export interface VoiceState {
  recording: boolean;
  transcribing: boolean;
  playing: boolean;

  transcript: string;

  audioQueue: string[];

  error?: string;
}
```

Il voiceStore non deve creare task o inviare direttamente messaggi.

Flusso:

```text
Microfono
   ↓
STT
   ↓
Text
   ↓
taskChatStore.sendMessage()
```

Output:

```text
Assistant Text
   ↓
TTS
   ↓
Audio Queue
   ↓
Player
```

---

# 12. Input multimodale unificato

Tutti gli input devono essere normalizzati:

```typescript
export interface UserInput {
  type: "text" | "voice" | "image" | "file";

  content?: string;

  attachment?: AttachmentRef;

  metadata?: Record<string, unknown>;
}
```

L'engine non deve distinguere tra:

```text
"cerca aziende IT"
```

e:

```text
utente parla:
"cerca aziende IT"
```

Dopo STT entrambi diventano `UserInput`.

---

# 13. Memory Architecture

Non utilizzare una sola memoria.

Tre livelli:

```text
User Memory
     ↓
Workspace Memory
     ↓
Task Memory
```

## UserMemory

```typescript
export interface UserMemory {
  id: string;

  tenantId: string;
  userId: string;

  preferences: {
    language?: string;
    tone?: string;

    workingHours?: {
      start: string;
      end: string;
    };

    preferredTools?: string[];

    preferredOutputFormat?: "markdown" | "plain" | "table" | "json";
  };

  behavioralPatterns: {
    prefersTables?: boolean;
    prefersShortAnswers?: boolean;
    usuallyApprovesDrafts?: boolean;
  };

  explicitInstructions: string[];

  updatedAt: Timestamp;
}
```

## Workspace Memory

Contiene:

- brand voice;
- terminologia;
- template;
- regole;
- preferenze del cliente;
- procedure.

## Task Memory

Contiene contesto temporaneo relativo al singolo task.

---

# 14. Prompt Stacking

Ordine consigliato:

```text
1. Base OpsFlow Rules
        ↓
2. Tenant Policy
        ↓
3. User Memory
        ↓
4. Workspace Memory
        ↓
5. Agent Configuration
        ↓
6. Task Instructions
        ↓
7. Conversation Context
```

La memoria non deve poter sovrascrivere le regole di sicurezza.

Regola:

```text
Security / Platform Policy
        >
User Memory
        >
Workspace Preferences
        >
Task Instructions
```

---

# 15. Agent Builder No-Code

Non esporre direttamente il system prompt.

L'utente deve configurare:

```text
Identity
Behaviour
Knowledge
Tools
Permissions
Output
Safety
```

Esempio:

```typescript
export interface Agent {
  id: string;

  tenantId: string;

  name: string;
  description?: string;

  role: string;
  objective: string;

  tone?: string;
  language?: string;

  creativity?: number;

  enabledTools: string[];

  permissions: string[];

  safetyPolicy: string[];

  knowledgeBaseId?: string;

  version: number;

  createdBy: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Il sistema genera internamente lo stack di istruzioni.

---

# 16. Tool Plugin Architecture

L'orchestratore non deve conoscere Gmail, Sheets, Jina, Firecrawl ecc.

Deve conoscere solamente l'interfaccia `AgentTool`.

```typescript
export interface AgentTool<TInput = unknown, TResult = unknown> {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;

  readonly permissions: string[];
  readonly scopes?: string[];

  validate(input: TInput): Promise<void>;

  execute(ctx: ToolContext, input: TInput): Promise<TResult>;

  rollback?(ctx: ToolContext, result: TResult): Promise<void>;

  estimateCost?(input: TInput): Promise<number>;
}
```

Tool context:

```typescript
export interface ToolContext {
  tenantId: string;
  userId: string;
  workspaceId: string;
  taskId: string;
  executionId: string;

  approved: boolean;

  permissions: string[];

  logger: ToolLogger;
}
```

---

# 17. Tool Registry

Struttura:

```text
tools/
 ├── gmail/
 │    ├── gmail.tool.ts
 │    ├── schema.ts
 │    └── index.ts
 │
 ├── sheets/
 ├── drive/
 ├── jina/
 ├── firecrawl/
 ├── search/
 └── ...
```

Registrazione:

```typescript
toolRegistry.register(new GmailDraftTool());
toolRegistry.register(new GoogleSheetsTool());
toolRegistry.register(new JinaReaderTool());
toolRegistry.register(new FirecrawlTool());
```

L'orchestratore:

```typescript
const tool = registry.get(command.toolId);

await tool.validate(command.input);

const result = await tool.execute(context, command.input);
```

Aggiungere un nuovo Tool deve richiedere idealmente solo:

```text
nuova cartella
+
implementazione AgentTool
+
registrazione automatica
```

Non modificare il core engine.

---

# 18. Human-in-the-Loop

Il percorso corretto è:

```text
User Request
      ↓
Planner Agent
      ↓
Execution Plan
      ↓
Validation
      ↓
User Approval
      ↓
Command
      ↓
Tool
      ↓
Result
```

Mai:

```text
LLM
 ↓
Google API
```

---

# 19. Command Bus

Ogni azione operativa diventa un comando.

```typescript
export interface ToolCommand {
  id: string;

  tenantId: string;
  userId: string;

  workspaceId: string;
  taskId: string;
  executionId: string;

  toolId: string;

  input: unknown;

  requiresApproval: boolean;

  approvedAt?: Timestamp;
  approvedBy?: string;
}
```

Pipeline:

```text
LLM
 ↓
Command
 ↓
Permission Validator
 ↓
Policy Validator
 ↓
Approval
 ↓
Execution Queue
 ↓
Tool
```

Questo protegge OpsFlow anche quando il comportamento del modello è imprevedibile.

---

# 20. Execution Plan UI

Tra prompt e tool deve esistere una fase visuale.

Esempio:

```text
Richiesta
   ↓
Planner
   ↓
┌─────────────────────────────┐
│ Execution Plan              │
│                             │
│ ✓ Cerca aziende             │
│ ✓ Analizza siti             │
│ ✓ Estrai contatti pubblici  │
│ ✓ Crea tabella              │
│ ○ Prepara email             │
│                             │
│ [Modifica] [Approva]        │
└─────────────────────────────┘
```

L'utente può:

- modificare;
- eliminare step;
- riordinare;
- disabilitare tool;
- approvare.

---

# 21. Collaboration

Non modellare la condivisione principalmente come:

```typescript
sharedWithUsers: string[];
```

Usare:

```text
workspaceMembers
```

e ruoli granulari.

Esempio:

```typescript
type WorkspaceRole = "owner" | "admin" | "editor" | "operator" | "viewer";
```

Permissions:

```text
workspace.read
workspace.write
task.read
task.write
task.assign
task.comment
agent.use
agent.manage
tool.use
tool.approve
billing.read
```

Questo rende possibile aggiungere nuovi ruoli senza cambiare il modello.

---

# 22. Presence

La presenza deve essere separata dal Task.

```typescript
export interface UserPresence {
  userId: string;

  tenantId: string;

  status: "online" | "away" | "offline";

  currentWorkspaceId?: string;
  currentTaskId?: string;

  typing?: boolean;

  lastSeenAt: Timestamp;
}
```

Non memorizzare continuamente la presenza nel documento Task.

---

# 23. RBAC e Governance

Separare:

```text
Platform Role
Tenant Role
Permissions
```

Custom Claims:

```typescript
interface AuthClaims {
  platformRole?: "superadmin";

  tenantId?: string;

  tenantRole?: "owner" | "admin" | "user";

  permissions?: string[];
}
```

Il SuperAdmin non deve essere confuso con l'Admin del cliente.

---

# 24. Governance / Cost Control

Configurazione tenant:

```typescript
export interface TenantConfig {
  tenantId: string;

  monthlyBudget: number;

  maxTokens?: number;

  maxUsers?: number;
  maxAgents?: number;

  enabledFeatures: string[];

  limits: {
    dailyExecutions?: number;
    monthlyExecutions?: number;
    maxExecutionSteps?: number;
  };
}
```

Governance platform:

```typescript
export interface PlatformGovernance {
  budgetTier: "5" | "10" | "200";

  monthlyBudget: number;

  hardLimit: boolean;

  alertThresholds: number[];

  emergencyStop: boolean;
}
```

I limiti devono essere verificati server-side.

Mai fidarsi del frontend.

---

# 25. Security Rules Future-Proof

Le regole Firestore devono ragionare principalmente su:

```text
tenantId
workspace membership
role
permissions
```

Non su una serie infinita di casi specifici.

Concettualmente:

```text
isAuthenticated
AND
belongsToTenant
AND
hasWorkspaceAccess
AND
hasPermission
```

Il client non deve poter:

- modificare claims;
- modificare costi;
- approvare server-side actions simulando un altro utente;
- eseguire direttamente tool privilegiati.

Le API sensibili devono passare da Cloud Functions.

---

# 26. Streaming

Lo streaming non deve essere considerato un messaggio finale.

Gestire:

```text
Execution
 ↓
Event stream
 ↓
UI
```

Eventi possibili:

```text
execution.started
plan.created
step.started
tool.started
tool.progress
tool.completed
assistant.delta
approval.required
execution.completed
execution.failed
```

Il frontend può costruire una UI live senza conoscere i dettagli interni dell'agente.

---

# 27. Web Search / Lead Generation

Evitare di progettare OpsFlow intorno allo scraping diretto di LinkedIn o Indeed.

Preferire fonti e API consentite, dati pubblici e servizi di crawling/search configurabili.

Architettura:

```text
Search Tool
     ↓
URL discovery
     ↓
Reader / Crawler
     ↓
Extraction
     ↓
LLM normalization
     ↓
Validation
     ↓
Draft output
     ↓
User approval
     ↓
Sheets / CRM
```

Possibili adapter:

```text
Search
├── Google-compatible provider
├── Serper
├── Tavily
├── Exa
└── SearXNG
```

Reader/Crawler:

```text
Jina Reader
Firecrawl
Crawl4AI
Playwright
```

L'integrazione deve essere sempre dietro `AgentTool`.

---

# 28. Cost Optimization

Non inviare ogni operazione direttamente al modello più costoso.

Pipeline:

```text
Cheap model
   ↓
classification
   ↓
planning
   ↓
tool execution
   ↓
strong model only when required
```

Implementare:

- token budget;
- execution budget;
- tool cost estimation;
- caching;
- deduplication;
- max execution steps;
- timeout;
- retry policy;
- circuit breaker.

Ogni Execution deve registrare:

```text
input tokens
output tokens
model
tool calls
estimated cost
actual cost
duration
```

---

# 29. Directory Structure

Una struttura iniziale coerente:

```text
src/
 ├── components/
 │    ├── task/
 │    ├── workspace/
 │    ├── chat/
 │    ├── execution/
 │    ├── voice/
 │    └── windows/
 │
 ├── stores/
 │    ├── auth.store.ts
 │    ├── tenant.store.ts
 │    ├── workspace.store.ts
 │    ├── task.store.ts
 │    ├── task-chat.store.ts
 │    ├── execution.store.ts
 │    ├── agent.store.ts
 │    ├── memory.store.ts
 │    ├── voice.store.ts
 │    ├── collaboration.store.ts
 │    ├── tool.store.ts
 │    └── ui-window.store.ts
 │
 ├── domain/
 │    ├── task/
 │    ├── execution/
 │    ├── agent/
 │    ├── memory/
 │    ├── collaboration/
 │    └── tools/
 │
 ├── tools/
 │    ├── gmail/
 │    ├── sheets/
 │    ├── drive/
 │    ├── search/
 │    ├── jina/
 │    └── firecrawl/
 │
 └── services/
      ├── firestore/
      ├── auth/
      ├── genkit/
      └── audio/
```

Non è necessario riscrivere l'app attuale.

La struttura può essere introdotta progressivamente.

---

# 30. Strategia di Implementazione senza Refactoring Pesante

Non fare una migrazione "big bang".

## Fase 1 — Compatibilità

Aggiungere ai modelli esistenti solo i campi opzionali necessari:

```typescript
executionId?: string;
assignedUsers?: string[];
lastExecutionId?: string;
```

Nessuna modifica distruttiva.

---

## Fase 2 — Task View

Creare:

```text
TaskView
```

e spostare progressivamente la UI del Right Drawer dentro questo componente.

Il Drawer diventa soltanto un contenitore.

---

## Fase 3 — Pinia

Separare:

```text
taskStore
taskChatStore
executionStore
uiWindowStore
```

senza cambiare immediatamente il backend.

---

## Fase 4 — Execution

Introdurre `TaskExecution` e `TaskEvent`.

La chat esistente continua a funzionare.

---

## Fase 5 — Tool Registry

Creare `AgentTool` e migrare progressivamente gli strumenti esistenti.

---

## Fase 6 — Approval / Command Bus

Inserire la validazione tra Genkit e tool.

---

## Fase 7 — Voice

Collegare STT/TTS a `taskChatStore`.

---

## Fase 8 — Collaboration

Aggiungere `workspaceMembers`, comments e presence.

---

# 31. Definition of Done Architetturale

OpsFlow può essere considerato pronto per V2 quando:

- [ ] lo stesso Task può essere visualizzato in Drawer, Modal e Split View;
- [ ] nessun componente contiene la logica principale del Task;
- [ ] chat e voice usano la stessa pipeline `UserInput`;
- [ ] Execution è separata dal Task;
- [ ] Timeline è event-driven;
- [ ] Tool sono plugin;
- [ ] l'LLM non chiama direttamente API sensibili;
- [ ] esiste un Command Bus;
- [ ] le azioni sensibili richiedono approvazione;
- [ ] Workspace Members sostituisce la condivisione rigida;
- [ ] User/Workspace/Task Memory sono separati;
- [ ] RBAC è permission-based;
- [ ] costi e budget sono verificati server-side;
- [ ] streaming è basato su eventi;
- [ ] nuovi Tool non richiedono modifiche al core engine.

---

# 32. Decisioni Architetturali da Fissare Ora

Le decisioni più importanti da congelare nel codice sono:

### ADR-001

**Task come Resource, non come Chat.**

### ADR-002

**Execution separata dal Task.**

### ADR-003

**Event-driven Timeline.**

### ADR-004

**TaskView indipendente dal contenitore UI.**

### ADR-005

**Pinia separato per dominio e non per schermata.**

### ADR-006

**Voice normalizzato come UserInput.**

### ADR-007

**Memory a tre livelli.**

### ADR-008

**Tool Plugin Architecture.**

### ADR-009

**Command Bus + Human-in-the-Loop.**

### ADR-010

**RBAC basato su permissions.**

### ADR-011

**Workspace Membership per collaborazione.**

### ADR-012

**Budget enforcement server-side.**

---

# 33. Target Architecture

La visione finale è:

```text
                         ┌───────────────┐
                         │     USER      │
                         └───────┬───────┘
                                 │
                       Text / Voice / File
                                 │
                                 ▼
                       ┌─────────────────┐
                       │   Task View     │
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Task Engine   │
                       └────────┬────────┘
                                │
                     ┌──────────▼──────────┐
                     │     Agent Engine    │
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │   Execution Plan    │
                     └──────────┬──────────┘
                                │
                         Human Approval
                                │
                     ┌──────────▼──────────┐
                     │    Command Bus      │
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │    Tool Registry    │
                     └──────────┬──────────┘
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
          Google              Search             Web
          APIs                APIs                Crawlers
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                         Task Event Stream
                                │
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
             Chat            Timeline          Voice
               │                │                │
               └────────────────┼────────────────┘
                                ▼
                          Firestore
```

---

# 34. Conclusione

La priorità non è aggiungere subito tutte le funzionalità V2/V3.

La priorità è fare in modo che il codice attuale abbia già i **punti di estensione corretti**.

Le cinque fondamenta da introdurre per prime sono:

1. **TaskView** indipendente dal layout;
2. **Execution + Event** separati dal Task;
3. **Pinia domain-oriented**;
4. **AgentTool + ToolRegistry**;
5. **Command Bus + Approval Layer**.

Una volta presenti queste cinque fondamenta, Multi-Window, Voice, Collaboration, Memory, nuovi Agent e nuovi Tool diventano estensioni progressive anziché nuove architetture.

La regola da mantenere per tutto il progetto è:

> **Non costruire una feature futura oggi. Costruisci oggi il punto di estensione che permetterà di aggiungerla domani senza cambiare il core.**
