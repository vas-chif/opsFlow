# 📋 STEP 23 — Dual-Mode AI Task Architect: In-Context Subtask Regeneration for Active Tasks vs New Task Creation

> **Status:** 🟢 COMPLETATO AL 100% — Verificato e Convalidato su Dev  
> **Autore:** Vasile Chifeac & AI Senior Architect, AI Engineer, UX Designer  
> **Data:** 2026-09-18  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Cloud Functions Gen 2, Cloud Firestore, Gemini 3.6 Flash)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §1, §3, §4, §5, §6, §14), [.logicFlow/03](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md), [cheklists/step22](file:///home/chif-vas/projects/opsflow/cheklists/step22_workspace_attitude_vs_task_decoupling_and_native_anti_hallucination_plan.md)

---

## 🎯 1. Visione del Sistema & Valutazione del Bug

### 1.1 Il Bug di Navigazione / Event Collision

1. **Sintomo:** All'interno di `TaskSettingsModal.vue` (Impostazioni Operative Task), cliccando su _"Rigenera"_ nel banner _"✨ Rigenera Sotto-Task"_ per il task aperto (es. "BPM Senior Java"), il sistema apriva erroneamente `ScheduleTaskModal.vue` ("Pianifica Ricerca Ricorrente").
2. **Causa:** Riga 519 di `TaskSettingsModal.vue` conteneva `@click="emit('openScheduleModal')"`, emettendo l'evento di schedulazione ricorrente anziché la rigenerazione delle sotto-task.
3. **Requisito Utente:** Reciclare lo stesso componente `AITaskArchitectModal.vue` (Intelligent Decomposition & Operational Sheet) sia per la creazione di nuovi task sia per la ri-decomposizione del task già aperto, **senza duplicare componenti e senza creare nuovi task duplicati nel DB**. L'aggiornamento deve avvenire direttamente sul task attivo (`updateTask`).

---

## 📋 2. Matrice Operativa delle Fasi di Implementazione (Checklist)

### 📌 FASE 1: Aggiornamento Flussi di Logica Architetturali (`.logicFlow`)

- [x] **1.1** Aggiornare [.logicFlow/03_task_execution_and_ui_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md) documentando il flusso Dual-Mode di `AITaskArchitectModal` (Creazione nuovo task vs Rigenerazione in-context sotto-task task attivo).

---

### 📌 FASE 2: Potenziamento Dual-Mode di `AITaskArchitectModal.vue`

- [x] **2.1** Introdurre la prop opzionale `existingTask?: Task | null` e l'evento `(e: "taskUpdated", task: Task): void`.
- [x] **2.2** Introdurre il computed `isRegenerateMode = computed(() => !!props.existingTask)`.
- [x] **2.3** Dinamizzare testi, intestazione, sottotitolo e label del pulsante principale:
  - Header: `"✨ AI Task Architect — Rigenera Sotto-Task"` con badge/indicazione del task attivo.
  - Testo guida: focus sulla revisione dell'obiettivo e scomposizione in nuove sotto-task operative per il task aperto.
  - Template rapidi nascosti in modalità rigenerazione (il prompt è già pre-caricato dal task).
- [x] **2.4** Implementare `handleUpdateExistingTask`:
  - Invoca `taskStore.updateTask(workspaceId, existingTask.id, { title, description, aiMetadata: { ...subtasks } })`.
  - Notifica l'utente con feedback positivo.
  - Emette `taskUpdated` e chiude la modale, mantenendo la persistenza su Firestore.

---

### 📌 FASE 3: Correzione e Cablaggio in `TaskSettingsModal.vue`

- [x] **3.1** In `TaskSettingsModal.vue`, rimuovere l'errato `@click="emit('openScheduleModal')"` dal pulsante _"Rigenera"_ (riga 519).
- [x] **3.2** Aggiungere l'evento `openRegenerateModal` con payload `{ prompt, title, category }`.
- [x] **3.3** Implementare `handleTriggerRegenerate` che raccoglie il prompt modificato e lo emette verso il genitore.

---

### 📌 FASE 4: Integrazione e Visualizzazione in `TaskChatWindow.vue`

- [x] **4.1** Importare `AITaskArchitectModal` in `TaskChatWindow.vue`.
- [x] **4.2** Gestire gli stati reattivi `showRegenerateTaskModal` e `regenerateDraft`.
- [x] **4.3** Cablare `@open-regenerate-modal` su `<TaskSettingsModal>`: chiude le impostazioni e apre AI Task Architect pre-popolato.
- [x] **4.4** Montare `<AITaskArchitectModal>` in modalità `existingTask`:
  - Al salvataggio (`taskUpdated`), aggiorna reattivamente `windowState.task` e ricarica i task senza ricaricare la pagina.
- [x] **4.5** Collegare anche il pulsante di fallback `"✨ Scomponi in Sotto-Task con AI Architect"` (riga 2219) alla modale interattiva.

---

### 📌 FASE 5: Validazione, Typecheck & Collaudo (§7 Pre-Commit Checklist)

- [x] **5.1** Esecuzione `yarn --ignore-engines typecheck` a zero errori.
- [x] **5.2** Esecuzione `yarn --ignore-engines lint:check` a zero errori e zero warning.
- [x] **5.3** Collaudo a video e verifica zero regressioni su rotte e modali.
- [x] **5.4** Commit convenzionale su branch `dev`.
