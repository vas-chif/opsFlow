# 📋 STEP 20 — Macro Task & Micro SubTasks Decoupling + Cascade Scheduler Teardown + Polymorphic Entity Management

> **Status:** 🟢 COMPLETATO — Validato con 0 errori typecheck e 0 warning lint  
> **Autore:** Vasile Chifeac & AI Senior Architect, AI Engineer, Security Expert & Senior Jurist  
> **Data:** 2026-09-14  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Cloud Functions Gen 2, Cloud Firestore, Cloud Scheduler)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §1, §3, §4, §5, §6, §9, §10, §14), [SECURITY.md](file:///home/chif-vas/projects/opsflow/SECURITY.md), [SKILL/senior-architect](file:///home/chif-vas/projects/opsflow/SKILL/senior-architect/SKILL.md), [SKILL/senior-security-expert](file:///home/chif-vas/projects/opsflow/SKILL/senior-security-expert/SKILL.md), [SKILL/senior-jurist](file:///home/chif-vas/projects/opsflow/SKILL/senior-jurist/SKILL.md), [.logicFlow/06_macro_task_and_micro_subtasks_polymorphic_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/06_macro_task_and_micro_subtasks_polymorphic_flow.md)

---

## 🎯 1. Visione del Sistema & Valutazione di Fattibilità

### 1.1 Il Problema Operativo Riscontrato

1. **Contraddizione Semantica Macro-Stato:** Un task di sourcing (es. recruiting SAP EWM) genera un elenco di più persone fisiche (_Pino Villa, Mihai Ionescu, Giorgio Mazzeo, Andrey Gromov, Franz Rieger_). Attualmente il Task principale possiede stati come `contacted`, `positive-response`, `negative-response`, `follow-up-30-days`. Impostare l'intero task su "Contattato" se è stato chiamato un solo candidato genera incoerenza logica e impedisce di monitorare l'avanzamento effettivo dei singoli profili.
2. **Disconnessione tra Task e Scheduler:** Quando un task principale viene marcato come `completed` (es. candidato trovato o selezione chiusa) o `cancelled`, gli scheduler ricorrenti collegati al task continuano a girare in background fino alla data di scadenza (es. fine anno), consumando quote Google Cloud e chiamate API inutili.
3. **Mancanza di una Scheda Operativa per la Singola Risorsa:** L'utente non può cliccare sulla persona dalla tabella dei risultati o dalla Timeline per aprire un cassetto dedicato con note private, storico cronologico dei contatti (chiamate, email, risposte) e selettore di stato del singolo candidato.
4. **Rigidità di Dominio (Monolito HR):** Il sistema deve essere polimorfico e supportare con la medesima eleganza anche contesti sanitari/ambulatoriali (pazienti e prestazioni), procurement (ordini e materiali fornitore) e manutenzione impianti.

### 1.2 Verdetto di Fattibilità: 🟢 FATTIBILE AL 100%

- **Isolamento Architetturale (§4):** I Sub-Task risiedono in `tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}`, garantendo isolamento per tenant e pulizia dei dati.
- **Cascade Teardown Deterministico:** Un trigger Firestore su `onTaskUpdated` intercetta la transizione a `completed` o `cancelled` e spegne all'istante tutti i `scheduledJobs` associati (`status: 'paused'`, `pauseReason: 'parent_task_closed'`).
- **Zero Costi Aggiuntivi (§5):** Il teardown automatico riduce i consumi Cloud interrompendo i job non più necessari.
- **Design Elite (§6):** Creazione del componente `SubTaskEntityModal.vue` coerente con la palette Navy/Gold/Sand e layout a tre pannelli.

---

## 🧠 2. Analisi Multi-Ruolo & Peer Review (5 Livelli di Revisione §9)

### 🏗️ 2.1 Senior Architect Review (opsflow-senior-architect)

- **Separazione Netta Macro vs Micro:**
  - Macro Task: `pending`, `in-progress`, `completed`, `cancelled`.
  - Micro Sub-Task: `new`, `contacted`, `waiting_response`, `negotiation`, `positive_response`, `negative_response`, `follow_up`, `completed`.
- **Atomic Cascade Teardown:** Il trigger backend disattiva con batch atomico tutti i job correlati al task per evitare race condition con il dispatcher orario.
- **Component Reusability:** Il componente `SubTaskEntityModal.vue` deve essere disaccoppiato e consumare una prop polimorfica `entity: EntitySubTask`.

### 💼 2.2 Senior Business Analyst & ROI (opsflow-senior-business-analyst)

- **Controllo Totale della Pipeline:** L'operatore visualizza a colpo d'occhio quanti profili sono in trattativa, quanti hanno rifiutato e chi ha accettato.
- **Chiusura di Successo Chiara:** Quando un candidato o fornitore accetta (`accepted`), il Sub-Task si conclude positivamente (`won`), fornendo metriche precise di conversione per il workspace.

### 🛡️ 2.3 Senior Security Expert & Hacker (opsflow-senior-security-expert)

- **Access Control & Multi-Tenancy:** La collezione `subtasks` eredita le Firestore Security Rules del task genitore; nessun utente può accedere ai sub-task di un altro tenant.
- **Audit Logs GDPR Art. 30:** Ogni cambio di stato, nota o evento nella timeline del sub-task viene tracciato con l'ID dell'utente loggato.

### ⚖️ 2.4 Senior Jurist & Privacy (opsflow-senior-jurist)

- **GDPR Art. 5 (Storage Limitation):** Il cascade teardown garantisce che nessun profilo venga monitorato o ricercato oltre la durata del task primario.
- **GDPR Art. 9 (Sanità e Dati Sensibili):** Se il dominio è `healthcare`, le note cliniche e i riferimenti identificativi devono essere cifrati client-side (AES-256-GCM) prima dell'invio a Firestore (§3 AGENTS.md).

### 🤖 2.5 Prompt & AI Engineer (opsflow-ai-engineer)

- **Integrazione KeyPoints & Sourcing:** Quando l'AgenteRicerca estrae candidati nella chat, la tabella o i punti chiave offrono la generazione automatica in batch all'approvazione per trasferire direttamente le informazioni strutturate (nome, score, competenze, URL profilo) senza allucinazioni.

---

## 📋 3. Matrice Operativa delle Fasi di Implementazione (Checklist)

### 📌 FASE 1: Modelli TypeScript Centralizzati (`src/types/models.ts`)

- [x] **1.1** Scorporare `TaskStatus` in `MacroTaskStatus` (`pending` | `in-progress` | `completed` | `cancelled`) e mantenere compatibilità retroattiva se necessario.
- [x] **1.2** Definire `EntitySubTaskStatus` (`new` | `contacted` | `waiting_response` | `negotiation` | `positive_response` | `negative_response` | `follow_up` | `completed`).
- [x] **1.3** Definire `EntitySubTaskOutcome` (`in_progress` | `won` | `lost` | `cancelled`).
- [x] **1.4** Definire l'interfaccia `EntityTimelineEvent` (id, eventType, title, description, authorId, authorName, timestamp).
- [x] **1.5** Definire l'interfaccia `NestedMiniTask` (id, title, completed, dueDate, assignedTo).
- [x] **1.6** Definire l'interfaccia completa `EntitySubTask` con supporto per domini polimorfici (`recruiting`, `healthcare`, `procurement`, `operations`, `generic`).
- [x] **1.7** Chiudere ogni nuova interfaccia e tipo con i marcatori `/* end Nome */` e commenti JSDoc standard (§4 AGENTS.md).

---

### 📌 FASE 2: Backend Cloud Functions — Cascade Teardown & Creazione Batch Sub-Task

- [x] **2.1** In `opsflow-functions/src/index.ts`, creare/estendere il trigger Firestore `onTaskStatusUpdated` in ascolto su `tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}`.
- [x] **2.2** Rilevare la transizione dello status da `pending`/`in-progress` a `completed` oppure `cancelled`.
- [x] **2.3** Interrogare la sotto-collezione `tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs` per trovare tutti i job con `taskId == taskId` e `status == 'active'`.
- [x] **2.4** Aggiornare i job trovati impostando `status: 'paused'`, `isLocked: false` e `pauseReason: 'parent_task_closed'`.
- [x] **2.5** Generare un Audit Log GDPR Art. 30 che certifichi la disattivazione degli scheduler per chiusura task.
- [x] **2.6** Creare helper per la gestione e salvataggio dei Sub-Task in Firestore con isolamento tenant rigoroso.
- [x] **2.7 (Auto-Creazione Batch dall'Estrazione)**: In `resolveApproval` (`manageGoogleSheetTool`), all'atto del click su "Approve & Execute", parsare le righe di dati (es. candidati) e generare automaticamente i rispettivi record nella sotto-collezione `subtasks`, ereditando campi, attributi e note senza costringere l'utente a crearli manualmente uno ad uno.

---

### 📌 FASE 3: Refactoring Macro Task UI & Reopening Safety

- [x] **3.1** In `src/components/TaskChatWindow.vue` e `src/components/TaskChatModal.vue`, ripulire il selettore di stato del macro-task rimuovendo gli stati individuali di contatto (`contacted`, `positive-response`, `negative-response`, `follow-up-30-days`).
- [x] **3.2** Mantenere esclusivamente i 4 Macro-Stati: `Pending`, `In Progress`, `Completed`, `Cancelled`.
- [x] **3.3** Aggiungere dialog di conferma quando l'utente clicca su "Completa Task" o "Annulla Task", avvisando che tutti i monitoraggi ricorrenti attivi verranno messi in pausa automaticamente.
- [x] **3.4** Sincronizzare reattivamente il chip di monitoraggio `⏰` nella toolbar: se il task è completato o cancellato, il chip passa visivamente a Grigio / "In Pausa".
- [x] **3.5 (Reopening Safety & Rollback)**: Se un task passa da `completed`/`cancelled` a `in-progress` (riapertura manuale), i job pianificati NON devono riattivarsi alla cieca. Mostrare un dialog rapido: _"Il task è stato riaperto: desideri riattivare anche la ricerca programmata notturna?"_ per richiedere esplicita conferma.

---

### 📌 FASE 4: UI Sub-Task & Entity Management Modal (`SubTaskEntityModal.vue`)

- [x] **4.1** Creare il componente `src/components/SubTaskEntityModal.vue` seguendo il Design System Elite (stile Matita & Leggero, colori Royal Navy `#0a2342` e Gold `#c5a065`).
- [x] **4.2** Sezione Header con Nome Risorsa, Ruolo/ID, Badge di stato rapido e menu a tendina per cambiare stato (`Da Contattare` $\rightarrow$ `Contattato` $\rightarrow$ `In Trattativa` $\rightarrow$ `Accettato` $\rightarrow$ `Rifiutato`).
- [x] **4.3** Sezione Dati Ereditati: visualizzazione chiara e non modificabile per errore dei dettagli estratti dalla tabella (competenze, URL profilo, tariffa/note).
- [x] **4.4** Sezione Note Operative: area testo espandibile multi-linea con salvataggio automatico o pulsante Salva per appunti di chiamata/colloquio.
- [x] **4.5** Sezione Timeline Privata dell'Entità: visualizzazione cronologica degli eventi con pulsanti di inserimento rapido (📞 Chiamata, ✉️ Email, 💬 WhatsApp, 📝 Nota interna).
- [x] **4.6** Sezione Mini-Task Nidificati: checklist operativa per micro-azioni interne all'entità (es. _"Inviare NDA quadro entro giovedì"_).
- [x] **4.7** Pulsanti Azione Finale:
  - Bottone Verde Gold: _"⭐ Accetta & Concludi"_ $\rightarrow$ imposta stato a `completed` con `outcome: 'won'`.
  - Bottone Grigio/Rosso: _"❌ Rifiuta / Archivia"_ $\rightarrow$ imposta stato a `completed` con `outcome: 'lost'`.
- [x] **4.8** Integrazione trigger: Clic sulla riga nella tabella della chat / lista risorse per aprire direttamente la modale del Sub-Task della persona selezionata.
- [x] **4.9 (Isolamento Stato & Sync Monodirezionale)**: Gli stati operativi (`new`, `contacted`, `negotiation`, `won`, `lost`) vivono e si aggiornano esclusivamente all'interno di OpsFlow nel componente `SubTaskEntityModal.vue`, senza tentare scritture continue sulle celle di Google Sheets (prevenzione conflitti e rate-limit API).
- [x] **4.10 (Macro Rollup & Suggerimento Chiusura)**: Quando tutti i sub-task collegati raggiungono un esito definitivo (`won` o `lost`), il sistema non chiude il macro-task a sorpresa, ma mostra un banner/notifica non invasivo: _"Tutte le risorse sono state gestite. Vuoi completare e archiviare il task principale?"_.

---

### 📌 FASE 5: Polimorfismo Multi-Dominio (Sanità, Procurement, Operations)

- [x] **5.1** Configurare vocabolario e label adattive in base al campo `domain`:
  - Se `recruiting`: "Candidato", "Tariffa", "Competenze".
  - Se `healthcare`: "Paziente", "Prestazione", "Priorità Clinica" (con crittografia client-side AES-256-GCM attiva).
  - Se `procurement`: "Articolo / Materiale", "Fornitore", "Quantità / Prezzo".
  - Se `operations`: "Impianto / Macchinario", "Anomalia", "Tecnico Assegnato".
- [x] **5.2** Garantire che la struttura dati Firestore rimanga identica e agnostica rispetto al dominio selezionato.

---

### 📌 FASE 6: Pre-Commit Checklist, Testing & Validazione

- [x] **6.1** Eseguire `yarn typecheck` e superare con 0 errori.
- [x] **6.2** Eseguire `yarn lint` / `yarn lint:check` (oxlint & oxfmt) e superare con 0 warning e 0 errori.
- [x] **6.3** Verificare la conformità JSDoc e i marcatori `/* end function */` in tutti i nuovi file.
- [x] **6.4** Eseguire commit Conventional Commit (`feat(subtasks): ...`) su branch dedicato `feature/macro-micro-subtasks-cascade-scheduler`.
- [x] **6.5** Aggiornare `masterChecklist.md` per marcare lo Step 20 come completato.

---

## 💡 4. I 4 Dettagli Operativi Fondamentali Integrati

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│              LINEE GUIDA ESECUTIVE PER L'IMPLEMENTAZIONE STEP 20                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 1. CREAZIONE BATCH AUTOMATICA (Auto-Generation on Approval)                       │
│    All'approvazione della card di Google Sheets (manageGoogleSheetTool in        │
│    resolveApproval), genera automaticamente i singoli record SubTask nella        │
│    sotto-collezione 'subtasks' ereditando: Nome, Ruolo, Score, URL profilo, Note. │
│    Zero clic ripetitivi per l'operatore.                                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 2. REOPENING SAFETY & ROLLBACK (Nessuna riattivazione alla cieca)                │
│    Se un task torna da 'completed' o 'cancelled' a 'in-progress', i job          │
│    programmati messi in pausa NON si riattivano automaticamente.                 │
│    Compare un dialog di conferma: "Il task è stato riaperto: desideri riattivare  │
│    anche la ricerca programmata notturna?".                                       │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 3. ISOLAMENTO STATO & SYNC MONODIREZIONALE (No conflitti con Google Sheets)       │
│    Gli stati operativi (new, contacted, negotiation, won, lost) risiedono e si    │
│    aggiornano esclusivamente all'interno di OpsFlow (SubTaskEntityModal.vue).    │
│    Non viene effettuato alcun aggiornamento bidirezionale continuo sulle celle    │
│    del foglio Google, preservando le quote API ed evitando race condition.       │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 4. MACRO ROLLUP & NOTIFICA DI CHIUSURA CONSAPEVOLE                                │
│    Quando tutti i sub-task collegati raggiungono un esito finale (won o lost),     │
│    il sistema non forza la chiusura del macro-task a sorpresa, ma mostra una     │
│    notifica elegante: "Tutte le risorse sono state gestite. Vuoi completare e    │
│    archiviare il task principale?".                                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 5. Checklist di Conformità GDPR & Cybersecurity (§3, §10 AGENTS.md)

- [ ] **GDPR Art. 5 (Limitazione della conservazione):** Disattivazione a cascata immediata dei monitoraggi alla chiusura del task padre.
- [ ] **GDPR Art. 9 & 32 (Sicurezza dati sanitari):** Cifratura AES-256-GCM client-side per domini clinici.
- [ ] **GDPR Art. 30 (Registro dei trattamenti):** Audit trail su Firestore per ogni modifica di stato dell'entità e per il teardown a cascata.
- [ ] **Tenant Fencing:** Nessun subtask o audit log salvato al di fuori del path `tenants/{tenantId}/...`.
- [ ] **Zero Sensitive Logging:** Nessun dato PII in chiaro nei log Cloud Function o console del browser.
