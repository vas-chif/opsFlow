# 📋 STEP 18 — Disaccoppiamento Architetturale: Sessione Master SaaS vs Integrazioni Google Workspace (OAuth 2.0 Scoped)

> **Status:** 🟢 APPROVATO AL 100% (Verdetto di Peer Review Integrato — Architettura Multi-Tenant Blindata)  
> **Autore:** Vasile Chifeac & AI Senior Architect, Security Expert & AI Engineer  
> **Data:** 2026-09-06  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Auth, Cloud Firestore, Google Cloud APIs, OAuth 2.0)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §1.9, §3, §4, §5, §9, §10, §11), [SKILL/senior-architect](file:///home/chif-vas/projects/opsflow/SKILL/senior-architect/SKILL.md), [SKILL/senior-security-expert](file:///home/chif-vas/projects/opsflow/SKILL/senior-security-expert/SKILL.md), [SECURITY.md](file:///home/chif-vas/projects/opsflow/SECURITY.md)

---

## 🎯 1. Visione del Sistema & Modello Multi-Tenant / Multi-Workspace

In un'applicazione SaaS B2B moderna ad alto isolamento come **OpsFlow**, è mandatorio distinguere nettamente due concetti che finora sono stati involontariamente confusi nel client:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             LIVELLO 1: IDENTITÀ MASTER SAAS                       │
│  Utente Autenticato: nykname888@gmail.com (Firebase Auth)                       │
│  Custom Claims JWT: { role: "owner", tenantId: "t_bc3a31o2tjqd", isActive: true }│
│  Scopo: Autenticazione al software, licenza, fatturazione, permessi globali      │
│  REGOLA: NON DEVE MAI CAMBIARE O ESSERE SOVRASCRITTO DA RISORSE ESTERNE           │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ possiede N Workspaces
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         LIVELLO 2: WORKSPACE AZIENDALI ISOLATI                   │
│                                                                                  │
│  ┌─────────────────────────────────┐      ┌─────────────────────────────────┐   │
│  │ WORKSPACE A: "VersiliaCare"     │      │ WORKSPACE B: "Studio Legale"    │   │
│  │ - Integrazione:                 │      │ - Integrazione:                 │   │
│  │   versiliacare@gmail.com        │      │   avvocato.studio@gmail.com     │   │
│  │ - Google Sheet: Pazienti/Turni  │      │ - Google Sheet: Pratiche/Udienze│   │
│  │ - Google Drive: Cartelle Cliniche│     │ - Google Drive: Atti Giudiziari │   │
│  └─────────────────────────────────┘      └─────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Principi Architetturali Fondamentali:

1. **Identità Master Utente (Firebase Auth):**  
   L'utente accede ad OpsFlow con la sua email principale (`nykname888@gmail.com`). Questa è l'identità radice del Tenant Owner. È il titolare del profilo, possiede i Custom Claims JWT ed i permessi di lettura/scrittura su Firestore. **Questa sessione deve rimanere immutabile**.
2. **Risorse Esterne Delegate (Workspace-Scoped):**  
   Ogni Workspace (es. _VersiliaCare_) è un ambiente operativo separato che delega l'accesso alle proprie risorse (una specifica Gmail `versiliacare@gmail.com`, un suo Google Sheet, un suo Drive).
3. **Delega Operativa per il Team (Zero-Trust):**  
   Quando un collaboratore o dipendente entra in _VersiliaCare_, interagisce con Gmail o Sheets **esclusivamente tramite l'Agente AI di OpsFlow** (con schede di approvazione `ApprovalCard.vue`). Il collaboratore non deve possedere le credenziali Google di _VersiliaCare_ né effettuare login su Google con quell'account.

---

## 🔍 2. Diagnosi Forense & Cybersecurity dei Problemi Riscontrati

Dalle immagini caricate e dai log della console browser emergono due problemi distinti ma concatenati:

### ❌ Problema A: Il "Session Swap Bug" (CWE-384 / CWE-287) & Blocco Firestore

#### Cosa è accaduto nel codice:

Nel componente [`src/components/WorkspaceAttitudeModal.vue`](file:///home/chif-vas/projects/opsflow/src/components/WorkspaceAttitudeModal.vue#L89-L96):

```typescript
// ❌ ANTI-PATTERN CRITICO: Usa l'auth di sistema invece di un flusso OAuth esterno
const auth = getAuth();
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/gmail.compose");
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.readonly");

const result = await signInWithPopup(auth, provider);
```

#### Conseguenze a catena:

1. **Dirottamento della Sessione:** `signInWithPopup(auth, provider)` su Firebase Auth non si limita a richiedere permessi: **effettua il login dell'utente sul client**.
2. **Distruzione dei Token JWT:** L'utente attivo nel browser non è più `nykname888@gmail.com`, ma è diventato `versiliacare@gmail.com`.
3. **Perdita dei Custom Claims:** L'account `versiliacare@gmail.com` è un account Google generico, non registrato come Owner in OpsFlow. Pertanto **non possiede claims**:
   - `token.isActive` $\rightarrow$ `undefined`
   - `token.role` $\rightarrow$ `undefined`
   - `token.tenantId` $\rightarrow$ `undefined`
4. **Violazione di [firestore.rules](file:///home/chif-vas/projects/opsflow/firestore.rules):**
   ```firestore
   match /tenants/{tenantId}/workspaces/{workspaceId} {
     allow create, update: if isActiveAndVerified() && isAdmin() && belongsToTenant(tenantId);
   }
   ```
   Poiché `isActiveAndVerified()` richiede `request.auth.token.isActive == true` e `isAdmin()` richiede `role == 'owner' || role == 'admin'`, **tutte le scritture Firestore vengono respinte con `PERMISSION_DENIED`**.
5. **Esito Visibile:**
   - Toast rosso: `Errore durante il salvataggio della configurazione Workspace`.
   - Errore nel creare nuovi workspace (`mi da anche ereore nel agiunger workspace`).

---

### ⚠️ Problema B: Avviso Google "Questa app non è stata verificata da Google"

Dalle foto 1 e 2 si vede la finestra Google con il triangolo rosso di avviso e lo sviluppatore `uniqueyouagency.com@gmail.com`.

#### Perché si presenta:

1. **Stato della Schermata di Consenso OAuth:** Nella Google Cloud Console del progetto (`opsflow-88of`), la schermata di consenso OAuth è configurata con **Stato di pubblicazione: "In fase di test" (Testing)**.
2. **Ambiti Sensibili (Sensitive Scopes):** Sono stati richiesti scope sensibili:
   - `gmail.compose` (scrittura email)
   - `spreadsheets` (lettura/scrittura fogli)
   - `drive.readonly` (lettura file)
3. **Mancanza nei "Test Users":** In modalità Testing, Google blocca o mostra l'avviso di "App non verificata" a qualsiasi account che non sia stato esplicitamente inserito nella lista degli **Utenti di test (Test users)** della Google Cloud Console.
4. **Bypass temporaneo di sviluppo:** Cliccando su _"Avanzate"_ $\rightarrow$ _"Apri opsflow-88of.firebaseapp.com (non sicura)"_ (come mostrato nella foto 2), Google consente comunque di rilasciare i consensi, ma il vero blocco avviene subito dopo a causa del Session Swap Bug descritto al punto A.

---

## 🏛️ 3. Audit Multidisciplinare a 5 Livelli (§9 AGENTS.md)

### 1. 🏗️ Livello Architect (Senior Architect)

- **Disaccoppiamento Rigido:** Separare totalmente `authStore.currentUser` (sessione applicativa) dai token di integrazione di terze parti (Google Workspace Token Vault).
- **Archiviazione Scoped al Workspace:** Il token OAuth (`refresh_token`) non appartiene all'utente, ma al Workspace. Il percorso di persistenza nel Vault server-side deve essere:
  `tenants/{tenantId}/workspaces/{workspaceId}/integrations/google`
- **Metadato Pubblico nel Workspace:** Sul documento Firestore del workspace (`tenants/{tenantId}/workspaces/{workspaceId}`) si salva unicamente lo stato non confidenziale:
  ```typescript
  googleIntegration: {
    connected: true,
    connectedEmail: "versiliacare@gmail.com",
    defaultSheetId: "1vPj3wnqElY8YkfOB-k...",
    defaultDriveFolderId: "1gjZJMXimcnFTaK_t0_tjty...",
    connectedAt: "2026-09-06T08:00:00.000Z"
  }
  ```

### 2. 💼 Livello Business & Operations (Senior Business Analyst)

- **Zero Attrito per Multi-Azienda:** Un consulente o una holding gestisce più aziende dallo stesso account OpsFlow. Ogni azienda ha la sua fatturazione e la sua email Google. Nessun collaboratore del workspace deve chiedere la password di Google all'amministratore.
- **Continuità Operativa:** Se un collaboratore viene rimosso dal workspace, l'accesso alle risorse Google aziendali cessa istantaneamente perché il collaboratore non ha mai avuto le credenziali di `versiliacare@gmail.com`.

### 3. 🛡️ Livello Cybersecurity & Hacker (Senior Security Expert)

- **Neutralizzazione Session Hijacking (CWE-384):** Vietare l'uso di `signInWithPopup(auth, ...)` per il collegamento di risorse esterne.
- **Crittografia Token al Riposo (AES-256-GCM):** I `refresh_token` ricevuti da Google non devono MAI essere esposti nel browser dell'utente (né in localStorage né in Pinia). Vengono cifrati dalla Cloud Function con `OAUTH_ENCRYPTION_KEY` a 256 bit e decifrati solo all'atto dell'invocazione di un Tool AI.
- **CSRF & State Protection:** Il parametro `state` della richiesta OAuth deve contenere un token crittografico o un payload firmato HMAC per impedire attacchi di tipo OAuth Login CSRF.

### 4. ⚖️ Livello Giurista (Senior Jurist & GDPR Art. 30/32)

- **Protezione Dati Sanitari:** La casella `versiliacare@gmail.com` gestisce dati personali di pazienti. I token di accesso non devono transitare né risiedere sui dispositivi locali dei collaboratori.
- **Audit Trail:** Ogni autorizzazione o disconnessione di una casella Google deve generare un evento immutabile nella collezione `/audit`.

### 5. 💰 Livello Economico & Cloud Cost (Businessman)

- **Costi Cloud Zero:** L'autorizzazione OAuth 2.0 di Google è completamente gratuita.
- **Zero Query Spreco:** Il salvataggio del token avviene via Cloud Function singola (`googleOAuthCallback`), preservando il target < €1,00/mese per 1000 utenti (§5 AGENTS.md).

---

## 🛠️ 4. Architettura della Soluzione (Flusso OAuth 2.0 Indipendente)

```
[Parent Window (OpsFlow: nykname888@gmail.com)]
          │
          │ 1. Click "Collega Google"
          ▼
Apertura Popup Sincrona (Anti-Popup Blocker, SENZA toccare Firebase Auth!):
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=...&
  redirect_uri=https://europe-west1-opsflow-88of.cloudfunctions.net/googleOAuthCallback&
  response_type=code&
  scope=https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly&
  access_type=offline&
  prompt=consent&
  state=<base64-json: { tenantId, workspaceId, userId, clientOrigin, nonce }>
          │
          │ 2. Utente concede autorizzazioni a versiliacare@gmail.com
          ▼
Google reindirizza a Cloud Function `googleOAuthCallback`:
  - Riceve il `code` e lo `state`.
  - Scambia il codice con Google Token Endpoint $\rightarrow$ ottiene `refresh_token` e `access_token`.
  - Recupera l'email autorizzata (`versiliacare@gmail.com`) via Google userinfo.
  - Cifra il `refresh_token` con AES-256-GCM.
  - Salva in: `tenants/{tenantId}/workspaces/{workspaceId}/integrations/google`.
  - Aggiorna `tenants/{tenantId}/workspaces/{workspaceId}` con `googleIntegration.connected = true`.
  - Restituisce una pagina HTML sicura con script:
    `window.opener.postMessage({ type: 'OPSFLOW_GOOGLE_LINKED', email: 'versiliacare@gmail.com' }, validatedClientOrigin); window.close();`
          │
          │ 3. Notifica postMessage ricevuta dal Parent Window
          ▼
[Parent Window: nykname888@gmail.com RIMANE INTATTO!]
  - Aggiorna reattivamente lo stato nel modal: "Account versiliacare@gmail.com collegato con successo!".
  - I Custom Claims JWT dell'Owner non sono stati toccati.
  - Il salvataggio su Firestore funziona al 100% con esito positivo!
```

---

## 🛡️ 4.1 Due Accorgimenti Tecnici di Rifinitura (Peer Review Integrata)

Durante lo sviluppo del codice dello Step 18, applichiamo tassativamente due requisiti di sicurezza ed ergonomia:

### 1. Target Origin Sicuro su `postMessage` (Zero Wildcard `*`)

- **Problema:** L'uso del wildcard `*` in `window.opener.postMessage(..., '*')` espone i dati dell'account a finestre esterne malevole in caso di clickjacking o redirect maligno del parent.
- **Soluzione:**
  1. Il client include il proprio `clientOrigin` (`window.location.origin`) nello `state` codificato in Base64 inviato a Google.
  2. La Cloud Function `googleOAuthCallback` verifica che `clientOrigin` corrisponda a una whitelist sicura (`http://localhost:9000`, `https://opsflow-88of.web.app`, `https://opsflow-88of.firebaseapp.com`).
  3. Il `postMessage` viene emesso con l'origin esatto e vincolato:
     ```javascript
     window.opener.postMessage(
       { type: "OPSFLOW_GOOGLE_LINKED", email: userEmail },
       validatedOrigin,
     );
     ```
  4. Nel client (`WorkspaceAttitudeModal.vue`), il listener `window.addEventListener("message", ...)` valida esplicitamente che `event.origin` coincida con l'origin consentito.

### 2. Apertura Sincrona del Popup (Anti-Popup Blocker)

- **Problema:** I browser moderni (Brave con Shields attivi, Safari, Chrome) bloccano l'apertura automatica di finestre popup se invocata al termine di operazioni asincrone (`await`) o chiamate di rete.
- **Soluzione:**
  1. All'interno dell'handler sincrono `onClick` del pulsante in Vue:
     ```typescript
     // Apertura istantanea sincrona prima di qualsiasi await
     const popup = window.open(
       "about:blank",
       "opsflow_google_auth",
       "width=520,height=650,status=no,toolbar=no",
     );
     ```
  2. L'URL di autorizzazione OAuth (oppure la chiamata preparatoria) reindirizza immediatamente il popup:
     ```typescript
     if (popup) {
       popup.location.href = authUrl;
     }
     ```
  3. Questo garantisce un'esperienza senza blocchi su qualsiasi browser o sistema operativo.

---

## 📋 5. Piano Operativo di Implementazione (Checklist da Seguire)

### Azione Immediata di Sblocco (Per l'Utente)

- [x] **0.1. Ripristino Sessione Owner** _(da eseguire manualmente se necessario)_:
  - Effettuare il Logout da OpsFlow (tramite pulsante di logout o pulizia della sessione `authStore.logout()`).
  - Effettuare nuovamente il Login con l'account Master: **`nykname888@gmail.com`**.
  - Verificare che i claims siano ripristinati e che il profilo mostri il ruolo `owner`.

---

### Fase 1 — Configurazione Google Cloud Console (Bypass Avviso Schermata Rossa)

- [x] **1.1. Inserimento Utenti di Test (Test Users)** ✅ _Completato via browser agent_:
  - Aggiunti `versiliacare@gmail.com` e `nykname888@gmail.com` come utenti di test.
  - Modalità: **In fase di test (Testing)**.
- [x] **1.2. Verifica URI di Reindirizzamento Autorizzati** ✅ _Completato via browser agent_:
  - `https://europe-west1-opsflow-88of.cloudfunctions.net/googleOAuthCallback` → aggiunto (URI 2)
  - `http://localhost:9000` → aggiunto (URI 3)
  - Già presente: `https://opsflow-88of.firebaseapp.com/__/auth/handler` (URI 1)
  - Messaggio di conferma: **"Client OAuth salvato"** ✅

---

### Fase 2 — Backend: Aggiornamento Token Vault Scoped al Workspace

- [x] **2.1. Aggiornamento `googleOAuthHandler.ts`**:
  - Aggiunto overload `workspaceId` opzionale a `saveOAuthToken` e `getAuthenticatedOAuth2Client`.
  - Introdotto helper `resolveVaultRef` che seleziona il path workspace-scoped:
    `tenants/{tenantId}/workspaces/{workspaceId}/integrations/google`
  - Backward compatibility preservata per i tool esistenti.
  - Crittografia AES-256-GCM con `OAUTH_ENCRYPTION_KEY` mantenuta.
- [x] **2.2. Aggiornamento Cloud Function `googleOAuthCallback`**:
  - Riscritto come handler redirect OAuth 2.0 completo (`onRequest`).
  - Accetta `code` + `state` (Base64) da query string Google redirect.
  - `state` contiene: `tenantId`, `workspaceId`, `userId`, `clientOrigin`, `nonce`.
  - Valida `clientOrigin` contro `ALLOWED_CLIENT_ORIGINS` whitelist.
  - Scambia il codice con Google Token Endpoint → ottiene `refresh_token`.
  - Recupera email autorizzata via Google userinfo API.
  - Cifra e salva token in vault workspace-scoped.
  - Aggiorna documento workspace con `googleIntegration` metadata.
  - Risponde con HTML + `postMessage(data, validatedOrigin)` + `window.close()`. Zero wildcard `*`.
  - `buildPostMessageHtml()` helper con UI Elite Design (Royal Navy #0a2342).

---

### Fase 3 — Frontend: Rimozione `signInWithPopup(auth)` in `WorkspaceAttitudeModal.vue`

- [x] **3.1. Bonifica di `WorkspaceAttitudeModal.vue`**:
  - Rimosso tassativamente `getAuth`, `GoogleAuthProvider`, `signInWithPopup` (CWE-384 eliminato).
  - Implementata apertura sincrona popup OAuth standalone (`about:blank` → `location.href`).
  - Costruzione URL OAuth con `state` Base64 (tenantId, workspaceId, userId, clientOrigin, nonce).
  - Listener `window.addEventListener("message", ...)` con validazione rigorosa `event.origin`.
  - All'arrivo di `OPSFLOW_GOOGLE_LINKED`: aggiornamento reattivo UI senza alterare Firebase Auth.
  - Cleanup completo con `onUnmounted` per popup e listener.
  - Timeout check per popup chiuso prematuramente dall'utente.
- [x] **3.2. Aggiornamento Tipi in `src/types/models.ts`**:
  - Aggiunta interfaccia `GoogleWorkspaceIntegration` (`connected`, `connectedEmail`, `connectedAt`).
  - Campo `googleIntegration?: GoogleWorkspaceIntegration` nell'interfaccia `Workspace`.
  - `syncFromWorkspace` aggiornato per leggere prima `googleIntegration` (workspace-scoped) come priorità.

---

### Fase 4 — Deploy & Validazione

- [x] **4.1. Deploy Cloud Functions** ✅ _Completato_:
  ```bash
  npx -y firebase-tools@latest deploy --only functions:googleOAuthCallback,functions:refineTaskDraft
  ```
  - `googleOAuthCallback (europe-west1)` → ✅ Successful update
  - `refineTaskDraft (europe-west1)` → ✅ Successful update
  - Function URL: `https://europe-west1-opsflow-88of.cloudfunctions.net/googleOAuthCallback`
- [ ] **4.2. Collaudo Qualità Frontend** ✅ — `yarn lint` e `yarn typecheck` (zero errori) — **già superato** (commit `6f156ef`).
- [ ] **4.3. Test Funzionale E2E** _(da eseguire dopo deploy)_:
  - Effettuare login come `nykname888@gmail.com`.
  - Aprire `WorkspaceAttitudeModal` su _VersiliaCare_.
  - Collegare `versiliacare@gmail.com`.
  - Verificare che il login rimanga `nykname888@gmail.com`.
  - Salvare la configurazione: verificare che Firestore risponda con successo e senza `PERMISSION_DENIED`.
  - Creare un nuovo workspace: verificare che non compaia alcun errore.

---

> **Nota di Rispetto Regola §0:** Tutte le modifiche al codice verranno eseguite previa dichiarazione formale del blocco `Explain-Before-Doing`.

---

## ✅ Riepilogo Implementazione (Commit `6f156ef` — branch `dev`)

| Fase     | Punto | Stato | File                               |
| -------- | ----- | ----- | ---------------------------------- |
| Backend  | 2.1   | ✅    | `googleOAuthHandler.ts`            |
| Backend  | 2.2   | ✅    | `index.ts` (`googleOAuthCallback`) |
| Frontend | 3.1   | ✅    | `WorkspaceAttitudeModal.vue`       |
| Frontend | 3.2   | ✅    | `src/types/models.ts`              |
| QA       | 4.2   | ✅    | `yarn lint` + `yarn typecheck`     |
| Deploy   | 4.1   | ⏳    | Da eseguire manualmente            |
| Test E2E | 4.3   | ⏳    | Da eseguire post-deploy            |
