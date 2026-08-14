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
