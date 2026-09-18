# 📋 STEP 22 — Architectural Refactoring: Workspace Attitude vs Operational Task Decoupling & Native Anti-Hallucination DBS Engine

> **Status:** 🟢 COMPLETATO AL 100% — Verificato e Convalidato su Dev  
> **Autore:** Vasile Chifeac & AI Senior Architect, AI Engineer, Security Expert & Senior Jurist  
> **Data:** 2026-09-18  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Cloud Functions Gen 2, Cloud Firestore, Genkit, Gemini 3.6 Flash)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §1, §3, §4, §5, §6, §9, §10, §14), [.logicFlow/02](file:///home/chif-vas/projects/opsflow/.logicFlow/02_workspace_lifecycle_and_setup_flow.md), [.logicFlow/03](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md), [cheklists/step21](file:///home/chif-vas/projects/opsflow/cheklists/step21_task_live_editing_and_backend_anti_hallucination_guardrails_plan.md)

---

## 🎯 1. Visione del Sistema & Valutazione di Fattibilità

### 1.1 Il Problema del Disaccoppiamento

1. **Confusione di Dominio:** Rischio di inserire nell'**AI Attitude del Workspace (Costituzione)** dati specifici di un singolo incarico (es. "Oracle 19c", "Camunda", "NobleProg", date contingenti). L'Attitude deve rappresentare unicamente il **COME CI SI COMPORTA** (metodologia di ricerca aperta, vincoli deontologici, forzatura GDPR Art. 14, gestione dei gap) e rimanere riutilizzabile per centinaia di task diversi.
2. **Task Operativo (IL COSA CERCARE):** Nasce dall'elaborazione di note o email grezze ricevute da clienti/fornitori. L'AI Task Architect deve estrarre i vincoli contingenti reali e creare sotto-task atomiche progressive. Se un dato (es. tariffa o recapito) non è presente nell'email, **non deve essere inventato**, ma marcato come **GAP da verificare**.
3. **Guardrail Anti-Allucinazione Nativo in DBS:** Quando l'utente genera l'Attitude con "GENERATE DBS ATTITUDE", le regole DO e DON'T devono incorporare deterministicamente i vincoli di Ground-Truth (solo URL reali, divieto sintetici, data GDPR +30gg).

---

## 📋 2. Matrice Operativa delle Fasi di Implementazione (Checklist)

### 📌 FASE 1: Flussi di Logica Architetturali (`.logicFlow`)

- [x] **1.1** Aggiornare [.logicFlow/02_workspace_lifecycle_and_setup_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/02_workspace_lifecycle_and_setup_flow.md) inserendo:
  - Sezione 3.1: Disaccoppiamento Rigido tra AI Attitude del Workspace ("COME") e Task Operativo ("COSA").
  - Sezione 3.2: Guardrail Anti-Allucinazione Nativo in "Generate DBS Attitude" con DO e DON'T tassativi.
- [x] **1.2** Aggiornare [.logicFlow/03_task_execution_and_ui_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/03_task_execution_and_ui_flow.md) inserendo:
  - Sezione 2.1: Generatore Task da Email / Input Grezzo ("New Task from Text/Email").
  - Sezione 2.2: Gestione Deterministica dei GAP Operativi (nessuna allucinazione su tariffe/date mancanti).
  - Sezione 2.3: Integrazione con i guardrail backend dello Step 21.

---

### 📌 FASE 2: Backend DBS Attitude Generator Hardening (`opsflow-functions`)

- [x] **2.1** In `opsflow-functions/src/index.ts`, riscrivere `DBS_SYSTEM_PROMPT`:
  - Imporre la **neutralità di dominio** (vietato includere dettagli di singoli incarichi, nomi clienti o date).
  - Includere obbligatoriamente nella generazione delle regole DO: raccolta di soli URL reali da motori di ricerca, forzatura GDPR Art. 14 a +30 giorni, marcatura delle disponibilità non certe come GAP, contatti standardizzati ("Contatto via InMail / Profilo Pubblico").
  - Includere obbligatoriamente nei divieti DON'T: divieto assoluto di URL 404 inventati, divieto di email/telefoni fittizi (`example.*`, numeri dummy), divieto di inventare disponibilità/tariffe.
- [x] **2.2** In `opsflow-functions/src/index.ts` all'interno di `generateDbsAttitude`:
  - Verificare che il payload generato garantisca la presenza delle regole anti-allucinazione minime anche in caso di variazioni del modello.

---

### 📌 FASE 3: Backend Task Architect Raw Email & Gap Handler (`opsflow-functions`)

- [x] **3.1** In `opsflow-functions/src/index.ts`, aggiornare `TASK_ARCHITECT_SYSTEM_PROMPT`:
  - Aggiungere istruzioni specifiche per interpretare email/testi grezzi non strutturati.
  - Generare titolo sintetico e descrizione operativa focalizzata sui requisiti reali (tecnologia, seniority, sede/remoto, date).
  - Scomporre il task in 3-5 sotto-task atomiche progressive.
  - **Regola Zero-Hallucination sui GAP:** Se mancano informazioni (es. tariffa oraria, budget, disponibilità), catalogarle esplicitamente come "GAP da verificare in chiamata/intervista" nella descrizione o sotto-task, senza mai inventarle.

---

### 📌 FASE 4: Frontend UI Modals Hardening (`AIPromptArchitectModal.vue` & `AITaskArchitectModal.vue`)

- [x] **4.1** In [src/components/AIPromptArchitectModal.vue](file:///home/chif-vas/projects/opsflow/src/components/AIPromptArchitectModal.vue):
  - Aggiungere il badge/toggle visivo **"🛡️ Strict Ground-Truth / Zero-Hallucination Mode"** attivo di default.
  - Chiarire nel testo guida che l'Attitude definisce il metodo operativo del Workspace e non i dettagli di un singolo corso/progetto.
- [x] **4.2** In [src/components/AITaskArchitectModal.vue](file:///home/chif-vas/projects/opsflow/src/components/AITaskArchitectModal.vue):
  - Aggiornare i testi di aiuto e il placeholder per indicare chiaramente: _"Incolla qui l'email o la richiesta grezza ricevuta dal cliente o fornitore..."_.
  - Aggiungere template/preset realistici orientati a richieste clienti (es. _"📧 Docente da Email Cliente"_).
  - Mostrare nella preview i GAP operativi identificati dall'IA come punti da verificare.

---

### 📌 FASE 5: Validazione, Typecheck & Collaudo (§7 Pre-Commit Checklist)

- [x] **5.1** Esecuzione `yarn --ignore-engines typecheck` su Frontend a zero errori.
- [x] **5.2** Esecuzione `yarn --ignore-engines lint:check` su Frontend a zero errori e zero warning.
- [x] **5.3** Compilazione TypeScript di `opsflow-functions` (`npm run build` in `opsflow-functions/`) a zero errori.
- [x] **5.4** Spunta finale della checklist e commit convenzionale su branch `dev`.
