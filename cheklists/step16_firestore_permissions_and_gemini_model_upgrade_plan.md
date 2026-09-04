# 📋 STEP 16 — Firestore Permissions Hardening & Gemini Flash Model Upgrade (Framework DBS & Multi-Tenant)

> **Status:** 🟡 In Pianificazione / Pronto per Approvazione  
> **Autore:** Vasile Chifeac & AI Senior Architect / AI Engineer  
> **Data:** 2026-09-04  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Auth, Cloud Firestore, Genkit, Gemini)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §3, §4, §5, §14), [SKILL/senior-architect](file:///home/chif-vas/projects/opsflow/SKILL/senior-architect/SKILL.md), [SKILL/ai-engineer](file:///home/chif-vas/projects/opsflow/SKILL/ai-engineer/SKILL.md)

---

## 🎯 Obiettivo dello Step 16

Risolvere in modo definitivo e strutturato le due anomalie critiche emerse durante il testing end-to-end su `localhost:9000` con il nuovo utente sanitario provisionato (`nykname888@gmail.com` / VersiliaCare):

1. **Risoluzione Permessi Firestore (`FirebaseError: Missing or insufficient permissions`):**
   - Correggere il mapping dei ruoli JWT in `authStore.ts` includendo `"owner"` e `"member"` nell'array `validRoles`.
   - Forzare il refresh del token JWT (`getIdTokenResult(true)`) al login e al boot per sincronizzare istantaneamente i Custom Claims (`tenantId`, `role`, `isActive`) ed `email_verified`.
   - Aggiornare `firestore.rules` introducendo le regole esplicite per:
     - `tenants/{tenantId}/tasks/{taskId}` (collezione flat/legacy consultata da `taskStore`).
     - `users/{userId}` (profilo anagrafico utente scritto da `provisionInitialTenant`).
   - Rendere resiliente `taskStore.ts` con fallback e gestione sicura delle eccezioni nei metodi `fetchWorkspaces` e `fetchTasks`.

2. **Upgrade Modello Gemini Flash (`500 Internal Server Error` su `generateDbsAttitude`):**
   - Aggiornare tutti i riferimenti al modello LLM da `googleai/gemini-1.5-flash` (dismesso da Google su `v1beta`) a `googleai/gemini-3.6-flash`.
   - Validare la corretta generazione strutturata JSON (Framework DBS: settore, tono, 3-5 skill, DO/DON'T rules) per il profilo infermieristico territoriale VersiliaCare.
   - Effettuare la build ed il deploy su Firebase Cloud Functions (`europe-west1`).

---

## 🔍 Root Cause Analysis (RCA) Dettagliata

| Componente                                  | Sintomo Errore                                                                 | Causa Tecnica Radice                                                                                                | Soluzione Architetturale                                                                                         |
| :------------------------------------------ | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| **AuthStore (`authStore.ts`)**              | `Missing permissions` su `getTenantDocs` (`tenants/default-tenant/workspaces`) | `mapClaims()` scartava `"owner"` perché non presente in `validRoles`. Il `tenantId` degradava a `"default-tenant"`. | Aggiungere `"owner"` e `"member"` a `validRoles`. Forzare refresh token JWT via `getIdToken(true)` in `login()`. |
| **Firestore Rules (`firestore.rules`)**     | `Missing or insufficient permissions` al caricamento task                      | Mancavano le regole per `tenants/{tenantId}/tasks/{taskId}` e `users/{userId}`.                                     | Aggiungere blocchi `match` sicuri con verifica `isActiveAndVerified()` e `belongsToTenant()`.                    |
| **Cloud Functions (`generateDbsAttitude`)** | `500 Internal Server Error` al click "Genera Atteggiamento IA"                 | Google ha dismesso `gemini-1.5-flash` (HTTP 404). Richiesto `gemini-3.6-flash`.                                     | Sostituire con `googleai/gemini-3.6-flash` in `genkitConfig.ts`, `index.ts` e `chatFlow.ts`.                     |

---

## 📋 Checklist Operativa di Esecuzione

### Fase 1 — Frontend: AuthStore & Token Claims Hydration

- [x] **1.1. Aggiornamento `validRoles` in `src/stores/authStore.ts`**:
  - Inserire `"owner"` e `"member"` nella lista `validRoles: TenantRole[]`.
- [x] **1.2. Token Refresh Forzato post-login e post-verifica**:
  - In `authStore.login()`, aggiungere `await credential.user.getIdToken(true)` dopo `credential.user.reload()`.
  - In `buildUserProfile()`, usare `await firebaseUser.getIdTokenResult(true)` per garantire che i claims aggiornati dal backend vengano letti subito.
- [x] **1.3. Hardening `taskStore.ts`**:
  - Gestire con blocco `try / catch` isolato la query opzionale a `firestore.COLLECTIONS.TASKS` (legacy tasks), impedendo che l'assenza di task flat blocchi la navigazione dell'utente.

---

### Fase 2 — Backend & Sicurezza: Firestore Security Rules

- [x] **2.1. Aggiunta Regole per `tenants/{tenantId}/tasks/{taskId}`**:
  - Consentire lettura e scrittura a utenti autenticati, verificati e appartenenti al tenant (`isActiveAndVerified() && belongsToTenant(tenantId)`).
- [x] **2.2. Aggiunta Regole per `users/{userId}`**:
  - Consentire lettura e scrittura al proprietario del profilo (`request.auth.uid == userId`) e agli amministratori del tenant.
- [x] **2.3. Deploy Regole Firestore**:
  - Eseguire `npx firebase-tools deploy --only firestore:rules` per applicare immediatamente le nuove restrizioni su `opsflow-88of`.

---

### Fase 3 — AI Infrastructure: Upgrade a Gemini 3.6 Flash (Genkit)

- [x] **3.1. Aggiornamento `genkitConfig.ts`**:
  - Sostituire default model in `opsflow-functions/src/ai/genkitConfig.ts`:
    `model: "googleai/gemini-3.6-flash"`.
- [x] **3.2. Aggiornamento `generateDbsAttitude` & `onTaskCreated` in `index.ts`**:
  - Sostituire `model: "googleai/gemini-3.6-flash"` nelle chiamate `ai.generate`.
- [x] **3.3. Aggiornamento `chatFlow.ts`**:
  - Sostituire `model: "googleai/gemini-3.6-flash"` in tutte le invocazioni Genkit della chat interattiva.
- [x] **3.4. Build & Linting Cloud Functions**:
  - Eseguire `npm run lint` e `npm run build` in `opsflow-functions`.
- [x] **3.5. Deploy Selettivo Cloud Functions**:
  - Eseguire `npx firebase-tools deploy --only functions:generateDbsAttitude,functions:onTaskCreated,functions:chatWithAgent`.

---

### Fase 4 — Test End-to-End & Validazione Utente Sanitario (VersiliaCare)

- [ ] **4.1. Verifica Assenza Errori Console su `localhost:9000`**:
  - Ricaricare l'applicazione con utente `nykname888@gmail.com`.
  - Verificare che non compaia più alcun `FirebaseError: Missing or insufficient permissions`.
  - Verificare che il workspace `main` ("Workspace Principale") venga caricato correttamente in Pinia.
- [ ] **4.2. Test Live del Configuratore DBS (AI Prompt Architect)**:
  - Aprire la modale "✨ AI Prompt Architect".
  - Inserire il prompt dell'utente:
    > _"son infermiere dipendente pubblico, con permesso di attivita domiciliare 12 h settimanali con partita iva forfettaria: son nella zona forte dei marmi, versilia, massa-carrara, pietrasanta massarosa... ecco il mio sito https://versiliacare.it/ in base al sito devo cercare clienti che rispecchiano il mio profilo nella zona indicata"_
  - Cliccare su **Genera Atteggiamento IA**.
  - Verificare la ricezione HTTP 200 e la generazione della scheda con Settore Sanitario Domiciliare, Tono Empatico/Rigoroso, Skill Matrix e regole DO / DON'T anti-allucinazione.
  - Cliccare su **Applica al Workspace** e verificare il salvataggio su Firestore.

---

### Fase 5 — Git Commit & Branch Alignment

- [ ] **5.1. Esecuzione Pre-Commit Checklist**:
  - `yarn typecheck` (zero errori).
  - `yarn lint:check` (zero errori).
- [ ] **5.2. Git Commit su `dev`**:
  - Messaggio convenzionale: `fix(auth-ai): resolve firestore permissions for owner role and upgrade to gemini-3.6-flash`.
- [ ] **5.3. Git Push**:
  - Push su `origin/dev`.
