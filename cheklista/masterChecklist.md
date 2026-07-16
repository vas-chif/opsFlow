STEP 1: Tooling & Setup Environment
Questa fase prepara il terreno per uno sviluppo pulito, sicuro e performante.

1.1 Workstation & IDE:

[X] Installazione Cursor (configurato con il tuo account e plugin ESLint/Prettier integrati).

[X] Configurazione Yarn come unico gestore pacchetti (vietato npm o pnpm).

[X] Setup Git Hooks: Configurazione di husky per assicurare che ogni commit rispetti il formato dei Conventional Commits.

1.2 Infrastruttura Cloud (Firebase):

[X] Setup progetto su piano Blaze.

[X] Configurazione di Firebase CLI e inizializzazione di hosting, firestore, functions.

[ ] Setup ambiente locale: .env sanificato (nessuna chiave esposta, uso di dotenv o variabili environment di Firebase).

1.3 Pipeline di Sviluppo:

[ ] Setup GitHub Actions per il deploy automatico (configurazione di firebase-tools nel CI/CD).

[ ] Configurazione eslint e prettier basata sulle regole di stile rigorose dei tuoi progetti precedenti.

STEP 2: Architettura Multi-Tenant & Sicurezza
Fondamentale per gestire i dati di tua moglie e dei suoi clienti senza interferenze.

2.1 Autenticazione (Identity):

[ ] Implementazione Custom Claims in Firebase Auth per assegnare tenantId e role al login.

[ ] Setup authStore in Pinia che intercetta il token JWT e decodifica i claims.

2.2 Firestore (Data Isolation):

[ ] Implementazione del protocollo Config-Fenced: tutte le query devono passare attraverso un composable (useTenantQuery) che forza il path tenants/{tenantId}/....

[ ] Scrittura Security Rules: allow read, write: if request.auth.token.tenantId == resource.data.tenantId.

2.3 UI Protection:

[ ] Creazione di un TenantGuard (Vue Router middleware) che impedisce l'accesso alle rotte operative se il tenantId non è presente nel token.

STEP 3: Integrazione IA (Orchestrazione Agentica)
Il cuore che trasforma l'app in un assistente operativo.

3.1 Prototipo Chat (Gemini):

[ ] Installazione estensione "Chat with Gemini" in Firebase.

[ ] Creazione della collezione tenants/{tenantId}/ai_agents per gestire i prompt di sistema (System Instructions).

3.2 Workflow Operativo (RAG):

[ ] Setup Cloud Function processLead: (Trigger: onCreate su /leads/). Deve inviare il profilo lead a Gemini e salvare il score_compatibilita nel documento.

[ ] Implementazione del Proxy di Sicurezza: Ogni chiamata a Gemini deve passare attraverso una funzione che pulisce i dati PII (nome, cognome, mail) prima che l'IA li veda.

🤖 Prompt per "AI Anti-Gravity" (Generazione agents.md)
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
