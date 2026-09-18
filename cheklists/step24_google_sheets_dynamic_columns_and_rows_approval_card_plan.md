# 📋 STEP 24 — Dynamic Columns & Rows Management in Google Sheets Approval Card (Full Data Inspection Modal)

> **Status:** 🟢 COMPLETATO AL 100% — Verificato e Convalidato su Dev  
> **Autore:** Vasile Chifeac & AI Senior Architect, AI Engineer, UX Designer  
> **Data:** 2026-09-18  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Cloud Functions Gen 2, Cloud Firestore, Google Sheets API)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §1, §3, §4, §5, §6), [.logicFlow/03](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md) (§6.2), [cheklists/step23](file:///home/chif-vas/projects/opsflow/cheklists/step23_ai_task_architect_dual_mode_regeneration_plan.md)

---

## 🎯 1. Visione del Sistema & Requisito Utente

### 1.1 Il Bisogno Operativo

Nella modale a schermo intero **"Google Sheets — Ispezione Dati Completa"** di [`ApprovalCard.vue`](file:///home/chif-vas/projects/opsflow/src/components/ApprovalCard.vue), l'operatore può attualmente visualizzare i dati tabellari proposti dall'Agente IA, modificare il foglio di destinazione, l'intervallo/scheda e aggiungere nuove righe (`[ + Aggiungi Riga ]`).

Tuttavia, prima dell'approvazione finale (Human-in-the-Loop), l'operatore necessita della flessibilità di:

1. **Aggiungere Colonne (`[ + Aggiungi Colonna ]`):** Creare al volo una o più nuove colonne (es. note interne, canali preferiti, referenti alternativi), espandendo coerentemente l'header (riga 0) e tutte le righe di dati (riga 1..N) con celle editabili.
2. **Eliminare Colonne (`removeColumn`):** Eliminare selettivamente colonne non desiderate o create per errore tramite un'icona di rimozione dedicata sull'header della colonna.
3. **Allineamento Pixel-Perfect:** Garantire che la riga header (riga 0) e le righe dati (riga 1..N) mantengano un allineamento visivo impeccabile con i pulsanti di eliminazione riga.

---

## 📋 2. Matrice Operativa delle Fasi di Implementazione (Checklist)

### 📌 FASE 1: Aggiornamento Flussi di Logica Architetturali (`.logicFlow`)

- [x] **1.1** Aggiornare [.logicFlow/03_task_execution_and_ui_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md) nella sezione 6.2 documentando la gestione bidirezionale (righe e colonne dinamiche) nella modale di ispezione Google Sheets.

---

### 📌 FASE 2: Logica Dati e Composable in `ApprovalCard.vue`

- [x] **2.1** Implementare `addColumn(defaultName?: string)`:
  - Espande la riga 0 (`editableRows[0]`) con il nome della nuova colonna.
  - Aggiunge una cella vuota `""` a tutte le righe di dati successive.
  - Fornisce feedback all'operatore tramite notifica Quasar (`q.notify`).
- [x] **2.2** Implementare `removeColumn(colIdx: number)`:
  - Verifica che rimanga almeno una colonna.
  - Esegue lo `splice` dell'indice colonna su ogni riga di `editableRows`.
  - Notifica l'operatore dell'avvenuta rimozione.

---

### 📌 FASE 3: UI & Template Hardening in `ApprovalCard.vue`

- [x] **3.1** Inserire il pulsante `[ + Aggiungi Colonna ]` nella toolbar della modale a schermo intero accanto a `[ + Aggiungi Riga ]`.
- [x] **3.2** Inserire il pulsante `[ + Colonna ]` nell'anteprima inline della card per uniformità operativa.
- [x] **3.3** Aggiungere il pulsante rapido di eliminazione colonna sull'header delle colonne (`rowIdx === 0`) in modalità modifica (`isEditing && isPending`).
- [x] **3.4** Inserire una cella placeholder di bilanciamento in riga 0 per allineare geometricamente la griglia con i pulsanti di cancellazione riga.

---

### 📌 FASE 4: Validazione, Typecheck & Collaudo (§7 Pre-Commit Checklist)

- [x] **4.1** Esecuzione `yarn --ignore-engines typecheck` a zero errori.
- [x] **4.2** Esecuzione `yarn --ignore-engines lint:check` a zero errori e zero warning.
- [x] **4.3** Collaudo a video e verifica reattività di aggiunta/rimozione colonne.
- [x] **4.4** Commit convenzionale su branch `dev`.
