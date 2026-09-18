# Checklist Step 26: Team Invitations, Workspace vs Task Scoped Access & Freemium Limits Model

**Data Creazione:** 2026-09-18  
**Branch:** `dev`  
**Stato:** Completato con Successo ✅  
**Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §1 (dev branch), §3 (GDPR & Security 3-Layer), §5 (Cloud Cost Control), §8 (RBAC & Freemium Limits)  
**Skills Applicate:** `senior-architect`, `senior-security-expert`, `senior-business-analyst`, `senior-jurist`, `senior-qa-engineer`

---

## 🎯 1. Diagnosi e Requisiti Operativi

### 1.1. Eliminazione Pulsante Generico "Condividi" & Aggiunta "Invita Persona via Email"

- **Problema:** Nel menu del workspace (`MainLayout.vue`), l'azione _"Share"_ copiava semplicemente l'URL hash negli appunti (`navigator.clipboard.writeText`), senza alcuna associazione utente né gestione di permessi/membri.
- **Soluzione:**
  - Rimuovere il vecchio metodo `shareWorkspace`.
  - Introdurre il pulsante/azione operativa **`[ + Aggiungi Persona tramite Email ]`** (icona `person_add`).
  - Il componente `TeamMembersPanel.vue` (già implementato con inviti email crittografici) viene montato ed esposto direttamente sia a livello di Workspace che di Task.

### 1.2. Scoping Granulare della Visibilità (Workspace vs Task)

- **Invito a Livello Workspace (`scope = 'workspace'`):**
  - Quando un utente (`role: 'user'`) viene invitato a un Workspace, vede **SOLO quel Workspace** a lui assegnato, e al suo interno vede **TUTTI i task**.
- **Invito a Livello Task (`scope = 'task'`):**
  - Quando un utente (`role: 'user'`) viene invitato a un singolo Task specifico, all'interno del workspace vede **SOLO ed ESCLUSIVAMENTE quel Task** (chat IA, subtask, timeline operativa), rimanendo cieco rispetto a tutti gli altri task del workspace.
- **Ruoli Amministrativi (`owner`, `admin`, `superadmin`):**
  - Mantengono la piena visibilità e gestione di tutti i workspace e di tutti i task del tenant.

### 1.3. Modello di Limiti Freemium (RBAC & Quotas)

- **Nuovo Utente / Utente Base (`user`):**
  - **Max Workspaces:** Massimo **1 solo Workspace**.
  - **Max Task:** Massimo **3 Task** contemporanei (attivi o archiviati).
  - **Ciclo di Cancellazione/Creazione:** Se cancella un task, può crearne un altro fino a un massimo di **3 cancellazioni** (tetto massimo di **6 task totali nel ciclo di vita**).
  - Al raggiungimento dei limiti: blocco amichevole con Dialog/Alert chiaro che spiega il vincolo del piano Free e invita all'upgrade o alla collaborazione in un workspace aziendale gestito da un Admin.
- **Admin Aziendale (`admin`):**
  - Gestisce l'azienda/tenant, i workspace e il personale. Per sbloccare workspace multipli e task illimitati è richiesto il piano a pagamento.
- **SuperAdmin (`superadmin`):**
  - Gestione globale piattaforma SaaS senza limiti.

---

## 📋 2. Piano di Esecuzione per Componente

### 📦 Fase 1 — Modello Dati & Tipi Centralizzati (`src/types/models.ts`)

- [x] Aggiungere `assignedMembers?: string[]` all'interfaccia `Workspace`.
- [x] Aggiungere `assignedMembers?: string[]` all'interfaccia `Task`.
- [x] Estendere `TenantInvitation` con campi di scoping:
  - `scope?: 'tenant' | 'workspace' | 'task'`
  - `workspaceId?: string`
  - `workspaceName?: string`
  - `taskId?: string`
  - `taskTitle?: string`
- [x] Definire l'interfaccia `UserUsageQuota` per tracciare `createdTasksTotal` e `deletedTasksCount`.

### ⚡ Fase 2 — Logica Store & Guardie di Quota (`src/stores/taskStore.ts`)

- [x] Implementare tracciamento e persistenza quota utente (`opsflow_user_{uid}_quota` in `localStorage`).
- [x] Metodi di convalida quota:
  - `canCreateWorkspace(role, uid): { allowed: boolean; reason?: string }`
  - `canCreateTask(role, uid): { allowed: boolean; reason?: string }`
  - `getUserQuota(uid): UserUsageQuota`
- [x] Bloccare `createWorkspace` se utente `user` ha già >= 1 workspace.
- [x] Bloccare `createTask` se utente `user` supera i 3 task attivi/archiviati o il tetto di 6 task con 3 eliminazioni.
- [x] Incrementare `deletedTasksCount` all'esecuzione di `deleteTask`.
- [x] Filtrare i task in `fetchWorkspaceTasks` per il ruolo `user`: mostrare solo i task assegnati se l'accesso è task-scoped.
- [x] Aggiungere azioni per associare/rimuovere collaboratori da Workspace e Task.

### 🖥️ Fase 3 — Adattamento Componente Inviti (`src/components/TeamMembersPanel.vue`)

- [x] Supportare props:
  - `scope?: 'tenant' | 'workspace' | 'task'`
  - `workspaceId?: string`
  - `workspaceName?: string`
  - `taskId?: string`
  - `taskTitle?: string`
  - `isDialog?: boolean`
- [x] Mostrare intestazione contestuale e filtri personalizzati a seconda dello scope.
- [x] Consentire l'invito via email specificando lo scope appropriato.
- [x] Gestire elenco membri attivi/assegnati e rimozione assegnazione.

### 🎨 Fase 4 — Integrazione UI (`src/layouts/MainLayout.vue` & `src/pages/index.vue`)

- [x] In `MainLayout.vue`:
  - Rimuovere `shareWorkspace` (vecchio clipboard copy).
  - Aggiungere voce di menu _"Aggiungi Persona"_ con icona `person_add`.
  - Integrare guardia di quota prima di aprire il modal _"New Workspace"_.
  - Montare `<q-dialog v-model="inviteModalOpen"><TeamMembersPanel ... /></q-dialog>`.
- [x] In `src/pages/index.vue`:
  - Aggiungere bottone `[ + Aggiungi Persona ]` nell'header del Workspace attivo.
  - Aggiungere voce _"Invita al Task"_ nel menu a 3 puntini di ciascuna card task.
  - Integrare guardia di quota prima di aprire `openCreateTaskModal`.
  - Montare il dialog di invito per workspace e task.

### 🧪 Fase 5 — Verifica & Collaudo

- [x] `yarn lint:check` → 0 errori.
- [x] `yarn typecheck` → 0 errori.
- [x] Verifica del corretto isolamento dei permessi e del blocco quote.
