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

[ ] Creazione di TenantGuard (Middleware per il routing protetto).

[X] State Management (Pinia taskStore configurato e tipizzato).

STEP 3: Design System & Branding
3.1 Definizione Identity

[X] Setup Palette Colori (Variabili SCSS centralizzate in Quasar).

[X] Definizione Tipografia (Font system per leggibilità in ICU/aree critiche).

[X] Setup Component Library (Base components: BaseButton, BaseInput, StatusBadge).

3.2 Responsive & Accessibility

[ ] Implementazione Dark Mode Toggle (Global state).

[ ] Ottimizzazione Mobile-First (Testing su viewports stretti).

[ ] Verifica Accessibilità WCAG 2.1 AA.

3.3 Componenti Operativi

[ ] Dashboard Card System (Componenti riutilizzabili per Task/Lead).

[ ] Layout Reattivo (MainLayout con navigazione adattiva).

STEP 4: Integrazione IA (Orchestrazione Agentica)
4.1 Prototipo Chat (Gemini)

[ ] Inizializzazione Firebase Genkit / Estensione Gemini.

4.2 Workflow Operativo (RAG)

[ ] Setup Agenti (Planner, Ispettore, Archivista) via agents.md.

[ ] Middleware di anonimizzazione PII per le chiamate a Gemini.
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
