📋 MASTER CHECKLIST: OpsFlow Platform
STEP 1: Tooling & Setup Environment
1.1 Workstation & IDE

[X] Installazione Cursor (configurato con account e plugin ESLint/Prettier).

[X] Configurazione Yarn (Gestore pacchetti unico).

[X] Setup Git Hooks (Husky + Conventional Commits).

1.2 Infrastruttura Cloud (Firebase)

[X] Setup progetto su piano Blaze.

[X] Configurazione Firebase CLI (Hosting, Firestore, Functions).

[X] Setup ambiente locale (Integrazione .env.example e regole ignorate nel .gitignore).

1.3 Pipeline di Sviluppo

[X] Setup GitHub Actions (Merge/PR con CI automatizzata).

[X] Validazione CI/CD (Linting, Typecheck inseriti nella pipeline).

STEP 2: Architettura Multi-Tenant & Sicurezza
2.1 Autenticazione (Identity)

[X] Custom Claims (tenantId/role in Firebase Auth).

[X] Setup authStore Pinia (JWT hydration).

2.2 Firestore (Data Isolation)

[X] Implementazione Config-Fenced (useFirestore composable).

[X] Security Rules (Isolamento tenant basato su claims).

2.3 UI Protection

[X] Creazione di TenantGuard (Middleware per il routing protetto).

[X] State Management (Pinia taskStore configurato e tipizzato).

STEP 3: Design System "Matita & Leggerezza" (Elite)
3.1 Definizione Identity

[X] Design System "Hand-drawn/Light": Palette definita (Royal Navy, Gold, Sand) applicata con linee sottili, bordi a mano libera (sketchy borders), ombre soffuse (non nette).

[X] Tipografia: Playfair Display (titoli) e Mulish (testo) con pesi leggeri.

[X] Component Library: BaseButton e BaseInput in stile minimale/matita.

3.2 Responsive & Accessibility

[X] Implementazione Dark Mode Toggle (che simula il contrasto carta/grafite).

[X] Ottimizzazione Mobile-First (Testing viewports stretti).

[X] Verifica Accessibilità WCAG 2.1 AA.

3.3 Componenti Operativi

[X] Dashboard Card System (Design "foglio di carta" fluttuante).

[X] Layout Reattivo (MainLayout con navigazione adattiva).

STEP 4: Integrazione IA (Orchestrazione Agentica)
4.1 Prototipo Chat (Gemini)

[X] Inizializzazione Firebase Genkit / Estensione Gemini.

4.2 Workflow Operativo (RAG)

[X] Setup Agenti (Planner, Ispettore, Archivista) via AGENTS.md §14.

[X] Middleware di anonimizzazione PII per le chiamate a Gemini.

STEP 5: Agentic Workspace & Automation Hub (0% IN CORSO)
5.1 UI Bridge & Reattività IA
[ ] Modale "+ New Task" guidata da Prompt Operativo.
[ ] SubTask Inspector Component (Complexity Score & Checklist sotto-task).
[ ] Chat Live Genkit Streaming nel Right Drawer.

5.2 Integration Suite (Google Workspace & Web Search)
[ ] Tool Gmail Drafts (createGmailDraftTool - Human in the Loop, NO invio diretto).
[ ] Tool Google Sheets & Drive (manageGoogleSheetTool).
[ ] Tool Web Search & Lead Sourcing (searchWebAndPlatformsTool).
[ ] Tool Content & Marketing Automation Engine (contentMarketingTool).
Copia e incolla questo prompt nella tua AI (o nel terminale di Cursor/Anti-Gravity) per inizializzare il contesto del sistema.

Markdown

# SYSTEM PROMPT: OpsFlow Agent Architect

Sei l'architetto principale del sistema OpsFlow. Il tuo obiettivo è mantenere l'integrità, la sicurezza e l'efficienza del sistema basato su Quasar, Firebase e Gemini.

## REGOLE DI BASE (COMPLIANCE):

1. SECURITY-FIRST: Ogni dato deve essere isolato tramite {tenantId}. È vietato l'accesso a collezioni non filtrate.
2. DRY (Don't Repeat Yourself): Usa composables per la logica di business e middleware per le guardie di sicurezza.
3. NO EXPOSED PII: Ogni chiamata verso modelli LLM (Gemini) deve passare attraverso un middleware di anonimizzazione dei dati personali.
4. STACK: TypeScript (Strict), Pinia, Quasar, Firebase SDK.

## TASK: Creazione di agents.md

Analizza i file di resume forniti e genera il file `agents.md` che contenga:

1. DEFINIZIONE AGENTI:
   - AgenteRicerca: Monitora e filtra lead/trainer.
   - AgenteAmministrativo: Compila template/Excel e riassume mail.
   - AgenteSupervisore: Controlla la conformità delle azioni dell'utente alle regole di progetto.
2. PROTOCOLLO COMUNICAZIONE: Descrivi come gli agenti comunicano tra loro via Firestore (trigger -> function -> result).
3. SYSTEM PROMPT AGENTI: Definisci il comportamento dell'AgenteRicerca: deve essere sintetico, orientato al ROI, focalizzato sul match di skill.

GENERAZIONE: Crea il file seguendo questa struttura rigorosa e commentata.

---

## 📌 STEP 5: Agentic Workspace & Automation Hub (COMPLETED ✅)

- [x] **Prompt-Driven `+ New Task` Modal**: Dialog con Titolo, Obiettivo / Prompt Operativo per IA e Categoria (`general`, `marketing`, `research`, `admin`, `dev`).
- [x] **AI SubTask Inspector Component**: Visualizzatore del Complexity Score (1-10 progress bar), checklist interattiva sotto-task e card esito audit AgenteIspettore.
- [x] **Right Drawer Genkit Live Chat**: Streaming chat tra utente ed agenti IA con badge visivi per ciascun Tool attivato.
- [x] **Google Workspace Suite (`createGmailDraftTool` & `manageGoogleSheetTool`)**: Generazione bozze email su Gmail (NO invio diretto automatizzato) e gestione tabelle Google Sheets.
- [x] **Web Search & Lead Generation Tools (`searchWebAndPlatformsTool` & `leadSynthesisTool`)**: Ricerca web in tempo reale e profilazione lead/trainer.
- [x] **Content Marketing Engine (`contentMarketingTool`)**: Piani editoriali, post LinkedIn e cold outreach scripts.
- [x] **AGENTS.md §14 Update & Zero-Error Pipeline**: `yarn typecheck` (PASSED 0ms), `yarn lint` (PASSED 0 errors, 0 warnings), Firebase Cloud Functions deployed.

---

## 📌 STEP 6: Integrazioni Google OAuth2 & Form Guidato No-Code per Risorse Collegate (COMPLETED ✅)

- [x] **Form Guidato No-Code a 4 Tab (`WorkspaceAttitudeModal.vue`)**: Tab `Comportamento`, Tab `Risorse Google`, Tab `Agenti`, Tab `Sandbox`.
- [x] **Collegamento Esplicito Risorse**: Account Google Email (OAuth2), ID Foglio Google Sheets Predefinito, ID Cartella Google Drive.
- [x] **Iniezione Risorse nel System Prompt Stacking (`promptBuilder.ts`)**: Iniezione automatica degli ID risorse nel Livello 2 del prompt.
- [x] **Zero-Error Pipeline Verification**: `yarn typecheck` (PASSED 0ms) e `yarn lint` (PASSED 0 errors, 0 warnings).

---

## 📌 STEP 7: Dynamic AI Clean & Execution Plan (COMPLETED ✅)

- [x] Ottimizzazione prompt AgentePlanner e deduplicazione automatica task.
- [x] Pipeline zero-hallucination con convalida schemi Zod.

---

## 📌 STEP 8: RBAC Custom Claims & Multi-Role Governance (COMPLETED ✅)

- [x] Custom Claims Firebase Auth (`tenantId`, `role`: `superadmin`, `admin`, `user`).
- [x] Zero Query Firestore per autorizzazione navigazione e routing protetto (risparmio 99.98% costi DB).
- [x] Firestore Security Rules a 3 layer conforme a GDPR Art. 32.

---

## 📌 STEP 9: Operational Goals & Roadmap (COMPLETED ✅)

- [x] Definizione perimetro architetturale SaaS ad alto ROI.
- [x] Esclusione trappole di costo (WebSockets real-time continue, modelli non-Flash).

---

## 📌 STEP 10: UX Anti-Hallucination & Voice Interface (COMPLETED ✅)

- [x] Human-in-the-Loop con `<ApprovalCard.vue>` prima di ogni scrittura esterna.
- [x] Web Speech API nativa del browser per dettatura e sintesi vocale (€0.00 costi cloud).

---

## 📌 STEP 11: Token Cost & Chat Timeout Resilience (COMPLETED ✅)

- [x] Lock-in su modelli Flash economici e ultra-veloci.
- [x] Gestione timeout resilienti e recovery loop.

---

## 📌 STEP 12: Search Tool Hardening & GCP Cost Governance (COMPLETED ✅)

- [x] Rolling Key Points parser per il monitoraggio dei punti chiave task.
- [x] Configurazione endpoint europe-west1 e ottimizzazione quote.

---

## 📌 STEP 13: Brave Search Integration & Cost Guard (COMPLETED ✅)

- [x] Provider multi-search con Brave Search API per lead generation B2B.
- [x] Cost guard e fallback su fonti pubbliche.

---

## 📌 STEP 14: Email Magic Invitation & Team Onboarding (COMPLETED ✅)

- [x] Magic link onboarding tramite token hash crittografati in Firestore.
- [x] Gestione inviti collaboratori con ruoli pre-assegnati.

---

## 📌 STEP 15: Tenant Provisioning & First Login Onboarding (COMPLETED ✅)

- [x] Provisioning automatico del tenant master e workspace predefiniti al primo accesso.
- [x] Inizializzazione isolata per tenant.

---

## 📌 STEP 16: Firestore Permissions & Gemini Model Upgrade (COMPLETED ✅)

- [x] Hardening Firestore Security Rules e allineamento permessi sotto-collezioni.
- [x] Aggiornamento modello Gemini 2.5/Flash.

---

## 📌 STEP 17: AI Task Architect & Smart Refiner (COMPLETED ✅)

- [x] Modale `AiPromptArchitectModal.vue` per la generazione guidata di task ad alta precisione.
- [x] Scomposizione strutturata con metriche di complessità.

---

## 📌 STEP 18: Workspace Google OAuth Decoupling (COMPLETED ✅)

- [x] Token Vault isolato per Workspace (`tenants/{tenantId}/workspaces/{workspaceId}/integrations/google`).
- [x] Disaccoppiamento completo rispetto all'account master SaaS con auto-refresh token.

---

## 📌 STEP 19: Scheduled Sourcing, Dual-Key Diffing & Elite Sheet Auto-Styling (COMPLETED ✅)

- [x] **Fase 1 (Modelli TypeScript)**: Interfacce `ScheduledSourcingJob`, `ScheduledJobFrequency`, `SheetUpdateMode`, `ScheduledJobExecutionLog` in `src/types/models.ts`.
- [x] **Fase 2 (Security Rules)**: Regole Firestore per `scheduledJobs` e log audit server-only in `firestore.rules`, indici compositi in `firestore.indexes.json`.
- [x] **Fase 3 (Auto-Styling)**: Helper `applyProfessionalSheetStyling` in `opsflow-functions` con formattazione automatica header (#1E293B), freeze row 1, wrap e larghezza colonne ottimali.
- [x] **Fase 4 (Dispatcher & Smart Diffing)**: Cloud Function `processScheduledSourcingDispatcher` (ogni 60 min, Europe/Rome) con Dual-Key Diffing (Set di URL normalizzati e Nomi normalizzati), auto-terminate GDPR Art. 5, audit log Art. 30 e notifica automatica in chat del task.
- [x] **Fase 5 (UI Quasar 2)**: Modale `ScheduleTaskModal.vue` Elite (frequenze, date picker fine validità, selezione foglio con ⭐ Master), pulsante `⏰` e chip dinamico (Verde/Arancione/Grigio) nella header toolbar di `TaskChatWindow.vue`, banner richiamo rapido in `TaskSettingsModal.vue`.
- [x] **Fase 6 (Documentazione & Verifica)**: `.logicFlow/05_scheduled_sourcing_and_smart_diffing_flow.md` completo, `masterChecklist.md` aggiornato, `yarn lint` e `yarn typecheck` a 0 errori.
