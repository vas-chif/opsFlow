# 🚀 OpsFlow — Guida Completa al Deploy & Inventario Cloud Functions

> **Progetto:** OpsFlow SaaS Platform (`opsflow-88of`)  
> **Data:** 30 Agosto 2026  
> **Versione Manuale:** 2.0.0 (Full-Stack Alignment)  
> **Architettura Cloud:** Firebase Gen 2 (Cloud Run), Node.js 22 | **Regione Cloud:** `europe-west1`  
> **Riferimenti AGENTS.md:** §1 (Git & Branch Management), §2 (Comandi Progetto), §3 (Sicurezza & Privacy), §5 (Cost Governance < €1.00/mese per 1.000 utenti), §14 (Orchestrazione Agenti IA Genkit)

---

## 📁 1. Struttura del Progetto & Mappatura Compilazione

```
/home/chif-vas/projects/opsflow/
│
├── 📂 opsflow-functions/                     ← BACKEND IA & CLOUD FUNCTIONS (Node.js 22)
│   ├── 📄 package.json                       ← Config: "main": "lib/index.js", Node: "22"
│   ├── 📄 tsconfig.json                      ← Config: "outDir": "lib"
│   ├── 📄 .env                               ← Variables locale (TAVILY_API_KEY, EXA_API_KEY, ecc.)
│   ├── 📂 src/                               ← CODICE SORGENTE TypeScript
│   │   ├── 📄 index.ts                       ← ⭐ ENTRYPOINT (Export di tutte le Cloud Functions)
│   │   ├── 📂 ai/                            ← Orchestrazione Genkit & Gemini
│   │   │   ├── 📄 genkitConfig.ts            ← Inizializzazione Genkit & Gemini 1.5 Flash
│   │   │   ├── 📄 chatFlow.ts                ← Live Chat Flow con tool calling & sliding window
│   │   │   ├── 📄 piiSanitizer.ts            ← Middleware di anonimizzazione PII (GDPR Art. 32)
│   │   │   └── 📄 promptBuilder.ts           ← 3-Level Stacked Prompt Builder (DBS)
│   │   └── 📂 tools/                         ← Tool Calling per Agenti IA
│   │       ├── 📄 webSearch.ts               ← Multi-Provider Chaining (Tavily → Exa → Jina)
│   │       ├── 📄 googleWorkspace.ts         ← Tools Gmail Draft & Google Sheets Append
│   │       ├── 📄 contentMarketing.ts        ← Tool estrazione piano editoriale
│   │       └── 📄 googleOAuthHandler.ts      ← OAuth2 Token Vault & Refresh Logic
│   └── 📂 lib/                               ← CODICE COMPILATO (Generato da `tsc`)
│       └── 📄 index.js                       ← 🎯 FILE ESEGUITO DA FIREBASE IN PRODUZIONE!
│
├── 📂 src/                                   ← FRONTEND CLIENT (Quasar 2 / Vue 3 / Pinia)
│   ├── 📂 components/                        ← Componenti UI (es. TaskKeyPointsCard.vue, TaskChatWindow.vue)
│   ├── 📂 stores/                            ← Store Pinia (es. taskStore.ts, taskChatStore.ts)
│   └── 📂 pages/                             ← File-based routing (Hash mode /#/)
│
├── 📂 dist/spa/                              ← BUNDLE FRONTEND COMPILATO (Generato da `yarn build`)
├── 📄 firestore.rules                        ← Layer 2 Security Rules (Firestore DB)
├── 📄 firebase.json                          ← Configurazione globale Firebase (Hosting & Functions)
└── 📄 .firebaserc                            ← Target di progetto Firebase (`opsflow-88of`)
```

> [!CAUTION]
> **REGOLE FONDAMENTALI SULLA STRUTTURA:**
>
> 1. **MAI** creare o lasciare file `.js` all'interno di `opsflow-functions/src/` (TypeScript non sovrascrive file JS preesistenti con lo stesso nome).
> 2. **MAI** eseguire i comandi di deploy da dentro `opsflow-functions/` — **lanciare SEMPRE i comandi dalla radice `/home/chif-vas/projects/opsflow`**.
> 3. Il file `opsflow-functions/package.json` deve avere `"main": "lib/index.js"`.

---

## ☁️ 2. Inventario Completo delle Cloud Functions

Tutte le Cloud Functions di OpsFlow sono attive nella region **`europe-west1`** per garantire zero costi di egress verso Firestore.

| Nome Esportato        | File Sorgente  | Tipo / Trigger      | Memoria / Timeout | Concurrency | Scopo & Ruolo Security / GDPR                                                            |
| :-------------------- | :------------- | :------------------ | :---------------- | :---------- | :--------------------------------------------------------------------------------------- |
| `chatWithAgent`       | `src/index.ts` | `onRequest` (HTTPS) | `1GiB` / `60s`    | `10`        | Live Chat Flow Genkit con Gemini Flash. PII Sanitized.                                   |
| `setUserRole`         | `src/index.ts` | `onCall` (Callable) | Default / `60s`   | Auto        | Assegnazione Custom Claims JWT (`role`, `tenantId`, `isActive`). Audit Log GDPR Art. 30. |
| `onTaskCreated`       | `src/index.ts` | `onDocumentCreated` | Default / `60s`   | Auto        | Trigger AgentePlanner: scomposizione task automatica in sotto-task.                      |
| `onTaskUpdated`       | `src/index.ts` | `onDocumentUpdated` | Default / `60s`   | Auto        | Trigger AgenteIspettore: audit qualità e verifica avanzamento.                           |
| `resolveApproval`     | `src/index.ts` | `onRequest` (HTTPS) | Default / `60s`   | Auto        | Gate Human-in-the-Loop per approvazione ed esecuzione bozze Gmail / Sheets.              |
| `googleOAuthCallback` | `src/index.ts` | `onRequest` (HTTPS) | Default / `60s`   | Auto        | Callback OAuth2 per memorizzazione sicura dei refresh token Google Workspace.            |
| `generateDbsAttitude` | `src/index.ts` | `onCall` (Callable) | Default / `60s`   | Auto        | Generatore costituzione d'ambiente DBS Workspace per AgentePromptEngineer.               |

---

## ⚡ 3. Guida Esecutiva al Deploy (Passo-Passo)

### 3.1 Sequenza Pre-Deploy (Verifiche Obbligatorie)

Prima di lanciare qualsiasi deploy in produzione, assicurati di eseguire e superare le verifiche di qualità dalla radice del progetto:

```bash
# 1. Verifica dalla radice del progetto
cd /home/chif-vas/projects/opsflow

# 2. Controllo Formatting e Linting (Zero errori oxlint)
yarn lint

# 3. Controllo Tipi TypeScript Frontend (Zero errori vue-tsc)
yarn typecheck

# 4. Controllo Tipi TypeScript Backend
cd opsflow-functions && npm run build && cd ..
```

---

### 3.2 Comandi di Deploy Mirati (Consigliati)

#### A. Deploy Mirato del Backend IA (Cloud Functions)

Utilizzare questo comando quando si apportano modifiche ai tool o alla logica delle funzioni backend:

```bash
cd /home/chif-vas/projects/opsflow && yarn --prefix opsflow-functions build && npx firebase-tools deploy --only functions:chatWithAgent,functions:setUserRole
```

#### B. Deploy Mirato del Frontend Web (Quasar SPA)

Utilizzare questo comando quando si apportano modifiche ai componenti Vue o alla grafica:

```bash
cd /home/chif-vas/projects/opsflow && yarn build && npx firebase-tools deploy --only hosting
```

#### C. Deploy Mirato delle Regole Firestore (Security Rules)

Utilizzare questo comando quando si aggiorna `firestore.rules`:

```bash
cd /home/chif-vas/projects/opsflow && npx firebase-tools deploy --only firestore:rules
```

---

### 3.3 Deploy Completo "Full-Stack All-in-One"

Per rilasciare contemporaneamente Backend, Frontend e Regole di Sicurezza:

```bash
cd /home/chif-vas/projects/opsflow && yarn --prefix opsflow-functions build && yarn build && npx firebase-tools deploy
```

---

## 💡 4. Gestione Prompt di Eliminazione & Cambio Region

Quando si sposta una Cloud Function da una region all'altra (es. da `us-central1` a `europe-west1`), il CLI di Firebase mostrerà questo messaggio durante il deploy:

```text
The following functions are found in your project but do not exist in your local source code:
        chatWithAgent(us-central1)

Would you like to proceed with deletion? Selecting no will continue the rest of the deployments.
```

- 👉 **Rispondi `Y` (Yes) oppure premi INVIO:** Questo elimina la vecchia istanza inattiva negli USA (`us-central1`) e completa il rilascio della funzione attiva nella region **`europe-west1`**.

---

## 🧹 5. Artifact Registry Retention Policy (GCP Cost Governance)

> [!IMPORTANT]
> **Perché è necessario:** Ogni deploy di Cloud Functions genera un container Docker (~200MB) su Google Cloud Artifact Registry.
> Senza una regola di cancellazione, le immagini si accumulano e vengono fatturate.
> **Eseguire questo comando una sola volta** dopo il primo deploy — la policy è permanente.

### Comando di Applicazione della Retention Policy (7 Giorni)

```bash
firebase functions:artifacts:setpolicy --location europe-west1 --days 7
```

### Verifica della Policy Applicata

```bash
gcloud artifacts repositories describe gcf-artifacts \
  --project=opsflow-88of \
  --location=europe-west1
```

### Tabella Risparmio Costi Atteso

| Metrica                | Prima                       | Dopo                                        |
| :--------------------- | :-------------------------- | :------------------------------------------ |
| **Immagini Docker**    | Accumulo illimitato         | Cancellate automaticamente dopo 7 giorni    |
| **Immagini Attive**    | Decine di immagini obsolete | Max 2 immagini (latest + precedente)        |
| **Costo Mese Stimato** | Crescente nel tempo         | **< € 0.50 / mese per 1.000 utenti attivi** |

---

## ⚠️ 6. Resolution Guide Errori Comuni (Troubleshooting)

### 🔴 Errore 1: `Container Healthcheck failed` su Cloud Run

- **Sintomo:** `Could not create or update Cloud Run service chatwithagent, Container Healthcheck failed.`
- **Causa Radice:** RAM impostata a 512MiB o inferiore. Su GCP Cloud Run, 512MiB assegnano 0.5 vCPU; l'inizializzazione di Genkit in freddo va in timeout.
- **Risoluzione:** Assicurarsi che in `opsflow-functions/src/index.ts` sia impostato `memory: "1GiB"`. Con 1GiB viene assegnata 1 vCPU intera ed il boot completa in <1.5s.

### 🔴 Errore 2: `Failed to make request to cloudresourcemanager.googleapis.com`

- **Sintomo:** Errore di permessi o file di configurazione non trovato durante `firebase deploy`.
- **Causa Radice:** Il comando è stato lanciato da dentro la sottocartella `opsflow-functions/` anziché dalla radice.
- **Risoluzione:** Eseguire sempre `cd /home/chif-vas/projects/opsflow` prima del deploy.

### 🔴 Errore 3: `HTTP Error: 401, Unauthorized`

- **Sintomo:** Sessione del CLI Firebase scaduta.
- **Risoluzione:** Eseguire `npx firebase-tools login --reauth` ed effettuare nuovamente l'accesso nell'interfaccia browser.

---

## 🛡️ 7. Direttive di Sicurezza & GDPR Vincolanti (§AGENTS.md)

1. **Gestione Secret & API Keys:** MAI committare file `.env` o chiavi in chiaro su Git. Usare `opsflow-functions/.env` per sviluppo locale e `defineSecret()` / Firebase Secret Manager per produzione.
2. **GDPR Art. 32 (No Log PII):** Vietati i `console.log` con dati personali o sanitari in codice di produzione backend. Usare esclusivamente `firebase-functions/logger` con payload sanitizzati via `sanitizePii()`.
3. **Zero-Exception Tool Boundary:** I tool Genkit (es. `webSearch.ts`) NON devono mai lanciare eccezioni `throw` non gestite che provochino crash `HTTP 500`. Utilizzare il wrapping `fetchWithHardTimeout` e ritornare strutture dati con `success: false`.
