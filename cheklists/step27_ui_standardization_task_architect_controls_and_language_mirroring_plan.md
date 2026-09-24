# Step 27 — UI English Standardization, Task Architect Volume Controls & Dynamic AI Language Mirroring

> **Branch:** `dev`  
> **Status:** COMPLETED  
> **Owner:** Vasile Chifeac  
> **Created:** 2026-09-24  
> **Updated:** 2026-09-24 (Finalizzazione Fase 5 Audit Preventivo)

---

## 🎯 Obiettivi Principali

1. **Standardizzazione UI 100% English:**
   - Tutti i componenti e modali operativi (`AITaskArchitectModal.vue`, `AIPromptArchitectModal.vue`, `TaskSettingsModal.vue`, `ScheduleTaskModal.vue`, `SubTaskEntityModal.vue`, `CreateSubtaskModal.vue`, `TeamMembersPanel.vue`) adottano una UI Enterprise interamente in lingua inglese.
   - Sostituzione dei vecchi template localizzati ("Milano", "Camunda", clinica "Versilia") con preset enterprise geograficamente neutri e ad alto valore aggiunto.

2. **Mirroring Dinamico della Lingua (Zero-Bias Multilingua):**
   - Riformulazione della direttiva di sistema nel Livello 1 di `promptBuilder.ts` (`opsflow-functions`): l'AI individua nativamente la lingua del messaggio utente (es. Italiano, Inglese, Spagnolo, Francese, Tedesco, Rumeno) e risponde rigorosamente nella stessa lingua.
   - Eliminazione del vecchio bias che imponeva l'italiano su base di storico o titolo del workspace.
   - Disaccoppiamento tra registro operativo dell'Atteggiamento del Workspace (Livello 2) e lingua della conversazione.

3. **Controlli di Volume & Anti-Allucinazione nel Task Architect:**
   - Introduzione in `AITaskArchitectModal.vue` del selettore target: `[10 Candidates]`, `[20 Candidates]`, `[50+ Progressive Harvesting]`.
   - Toggle nativo `[🛡️ Strict Ground-Truth & Anti-Hallucination Guardrail]` attivo di default.
   - Badge riepilogativi nel box di preview del task (`[🎯 Target: X]`, `[🛡️ Ground-Truth Reale]`, `[📅 Progressive Tranches]`).
   - Gestione backend in `TASK_ARCHITECT_SYSTEM_PROMPT` per decomposizione multi-ruolo (sezioni separate e subtasks distinte per ogni figura professionale richiesta) e scomposizione a tranche progressive.

4. **Allineamento Flussi di Logica (`.logicFlow/`):**
   - Aggiornamento di `02_workspace_lifecycle_and_setup_flow.md` e `03_task_execution_and_ui_flow.md`.

5. **Integrazione Audit Preventivo (Fase 5 - Residui UI & Zero-Shot Meta-Prompting):**
   - Blindatura in inglese puro del prompt base (Livello 1) per eliminare il prior token bias verso l'italiano.
   - Standardizzazione dei residui in italiano identificati nella chat operativa (`TaskChatWindow.vue`, `TaskChatModal.vue`) e nel dialogo GDPR Layer 1 (`DeleteAccountDialog.vue`).

---

## 📋 Checklist di Implementazione

### Fase 1: Documentazione Architetturale (`.logicFlow/`)

- [x] Aggiornare `.logicFlow/02_workspace_lifecycle_and_setup_flow.md` con la Sezione 7.5 sullo standard UI 100% English e disaccoppiamento linguistico.
- [x] Aggiornare `.logicFlow/03_task_execution_and_ui_flow.md` con la Sezione 10 su Controlli Volumi, Scomposizione Multi-Ruolo e Dynamic Language Mirroring.

### Fase 2: Backend Cloud Functions (`opsflow-functions`)

- [x] Aggiornare `opsflow-functions/src/ai/promptBuilder.ts`: Nuova direttiva Livello 1 per Dynamic Language Mirroring (Zero-Bias).
- [x] Aggiornare `opsflow-functions/src/index.ts`:
  - `TASK_ARCHITECT_SYSTEM_PROMPT`: Regole multi-ruolo, vincoli Ground-Truth / zero profili sintetici, GAP logging per tariffe/disponibilità, tranche di harvesting per target `10 | 20 | 50+`.
  - Cloud Function `refineTaskDraft`: Accettazione parametri `targetVolume` e `strictGuardrail` e iniezione nel contesto AI.
- [x] Compilazione backend: `npm run build` in `opsflow-functions` con 0 errori.

### Fase 3: Frontend Store & Modal Operativi (`src/`)

- [x] Aggiornare `src/stores/taskStore.ts`: Estendere `refineTaskDraft` per accettare e trasmettere `targetVolume` e `strictGuardrail`.
- [x] Aggiornare `src/components/AITaskArchitectModal.vue`:
  - Selettore target `[10 Candidates]`, `[20 Candidates]`, `[50+ Progressive Harvesting]`.
  - Toggle `[🛡️ Strict Ground-Truth & Anti-Hallucination Guardrail]` (default: true).
  - Badge di anteprima (`Target`, `Ground-Truth Reale`, `Progressive Tranches`).
  - Standardizzazione testi in inglese e preset enterprise neutrali.
- [x] Aggiornare `src/components/AIPromptArchitectModal.vue`: Standardizzazione UI in inglese e preset neutrali.
- [x] Aggiornare `src/components/TaskSettingsModal.vue`: Standardizzazione tab, label, categorie e notifiche in inglese.
- [x] Aggiornare `src/components/ScheduleTaskModal.vue`: Frequenze cron, etichette e notifiche in inglese.
- [x] Aggiornare `src/components/SubTaskEntityModal.vue`: Stati entità e label in inglese.
- [x] Aggiornare `src/components/CreateSubtaskModal.vue`: Sorgenti estratte e messaggi in inglese.
- [x] Aggiornare `src/components/TeamMembersPanel.vue`: Notifiche e bottoni in inglese.

### Fase 4: Validazione e Test di Non-Regressione

- [x] Esecuzione `yarn lint:check` (0 errori, 0 warning).
- [x] Esecuzione `yarn typecheck` (0 errori di compilazione TypeScript).
- [x] Verifica compilazione backend `npm run build` in `opsflow-functions`.
- [x] Commit Git conforme alle direttive su branch `dev` (`commit 5d13de6`).

### Fase 5: Estensione Standardizzazione Residua & Blindatura Zero-Shot (Audit Preventivo)

- [x] **Blindatura Zero-Shot di Livello 1 in `opsflow-functions/src/ai/promptBuilder.ts`:**
  - Conversione in inglese internazionale del meta-prompt di Livello 1 (OpsFlow Base Architecture & Security) per eliminare qualsiasi prior token bias verso l'italiano e rafforzare la direttiva di Dynamic Language Mirroring.
  - Allineamento del messaggio di fallback in `opsflow-functions/src/ai/chatFlow.ts`.
- [x] **Standardizzazione UI Chat Operativa in `src/components/TaskChatWindow.vue`:**
  - Aggiornamento placeholder barra messaggi (`"Type an instruction or dictate by voice... (Shift+Enter for newline)"`).
  - Aggiornamento placeholder note operative (`"Enter operational notes, observations, or reminders..."`).
  - Aggiornamento placeholder titolo sotto-task (`"Subtask title..."`).
  - Traduzione bottoni `label="Annulla"` -> `label="Cancel"`.
  - Standardizzazione notifiche toast e messaggi di errore operativi in lingua inglese.
- [x] **Standardizzazione Modale Chat in `src/components/TaskChatModal.vue`:**
  - Traduzione bottoni `label="Annulla"` -> `label="Cancel"` e toast informativi.
- [x] **Standardizzazione Dialogo Eliminazione Account in `src/components/DeleteAccountDialog.vue`:**
  - Traduzione bottoni `label="Annulla"` -> `label="Cancel"`, titoli di conferma ed avvisi GDPR.
- [x] **Validazione Finale di Non-Regressione:**
  - `yarn lint:check` (0 errori, 0 warning).
  - `yarn typecheck` (0 errori TypeScript).
  - `npm run build` in `opsflow-functions` (0 errori backend).
- [x] **Nuovo Commit Git Conforme su Branch `dev`:**
  - Messaggio Conventional Commit per la finalizzazione dell'estensione.
