# Checklist Step 25: Workspace Task Archive, Drag & Drop Reordering, Pinning & Reload Persistence

**Data Creazione:** 2026-09-18  
**Branch:** `dev`  
**Stato:** Completato ✅

---

## 🎯 Obiettivi di Step 25

1. **Persistenza Workspace su Refresh (Bug Fix):**
   - Salvare `opsflow_active_workspace_id` in `localStorage` quando un workspace viene selezionato.
   - All'avvio dell'app (`onMounted`), ripristinare esattamente il workspace selezionato prima del refresh anziché forzare `workspaces[0]`.

2. **Fissaggio Task in Alto (Pin 📌):**
   - Aggiungere campo `pinned?: boolean` al modello `Task`.
   - Aggiungere azione _"Fissa in alto / Rimuovi fissaggio"_ nel menu a 3 puntini della card.
   - Mostrare un badge dorato con icona `push_pin` sulle card fissate.
   - I task fissati devono comparire sempre in cima alla griglia.

3. **Ordinamento Reattivo Drag & Drop:**
   - Aggiungere campo `order?: number` al modello `Task`.
   - Rendere le card dei task trascinabili (`draggable="true"`).
   - Gestire eventi `@dragstart`, `@dragover`, `@dragleave`, `@drop`, `@dragend` con feedback visivo.
   - Salvare l'ordine aggiornato su Pinia e Firestore tramite `taskStore.reorderTasks`.

4. **Archivio Task Richiudibile (`<q-expansion-item>`):**
   - Aggiungere campi `archived?: boolean` e `archivedAt?: string | FirestoreTimestamp | null` al modello `Task`.
   - Aggiungere azione _"📦 Archivia Task"_ nel menu della card.
   - Inserire un `<q-expansion-item>` in fondo alla pagina del workspace:
     - Default CHIUSO (`v-model="archivedExpanderOpen"` iniziale `false`).
     - Badge con conteggio dei task archiviati.
     - Azione rapida _"♻️ Ripristina"_ per ciascun task archiviato.

---

## 📋 Checklist Operativa

- [x] **1. Aggiornamento Tipi (`src/types/models.ts`)**
  - [x] Aggiunti `archived?: boolean`, `archivedAt?: FirestoreTimestamp | string | null`, `pinned?: boolean`, `order?: number` a `Task`.

- [x] **2. Aggiornamento Store (`src/stores/taskStore.ts`)**
  - [x] Implementata persistenza `ACTIVE_WORKSPACE_KEY` in `localStorage`.
  - [x] Implementata azione `archiveTask(workspaceId, taskId)`.
  - [x] Implementata azione `restoreTask(workspaceId, taskId)`.
  - [x] Implementata azione `togglePinTask(workspaceId, taskId)`.
  - [x] Implementata azione `reorderTasks(workspaceId, orderedTaskIds)`.

- [x] **3. Aggiornamento Interfaccia Utente (`src/pages/index.vue`)**
  - [x] Corretto `onMounted` per ripristinare il workspace memorizzato in cache.
  - [x] `currentWorkspaceTasks` filtra solo i non archiviati (`!t.archived`) e ordina per `pinned` e `order`.
  - [x] Aggiunta computed `archivedWorkspaceTasks`.
  - [x] Aggiunte azioni menu _"Fissa in alto"_ e _"Archivia Task"_.
  - [x] Implementato Drag & Drop nativo con classi CSS per feedback visivo.
  - [x] Implementato `<q-expansion-item>` per archivio task con bottone ripristina.

- [x] **4. Verifica Qualità e Conformità**
  - [x] `yarn lint:check` a zero errori.
  - [x] `yarn typecheck` a zero errori.
  - [x] Collaudo su dev completato.
