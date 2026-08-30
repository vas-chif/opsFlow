# 🚀 Guida Operativa al Deploy di OpsFlow su Firebase

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Architect  
> **Data:** 30 Agosto 2026  
> **Riferimenti AGENTS.md:** §1 (Git & Branch Management), §2 (Comandi Progetto), §3 (Sicurezza & Firebase SDK)

---

## ⚡ GUIDA RAPIDA PASSO-PASSO (Sequenza Corretta)

Per evitare qualsiasi errore di deploy o mancata compilazione, eseguire sempre questa sequenza di comandi dalla cartella radice del progetto `/home/chif-vas/projects/opsflow`:

### 1️⃣ Risposta al Deploy (Cosa fare al prompt Firebase)

Quando lanci il deploy, Firebase ti farà questa domanda:

```
The following functions are found in your project but do not exist in your local source code:
        chatWithAgent(us-central1)
✔ Would you like to proceed with deletion?
```

👉 **Rispondi `Y` (Yes) oppure invia Invio**: Questo elimina la vecchia funzione registrata nella region `us-central1` e completa il rilascio della nuova funzione ottimizzata nella region **`europe-west1`**.

---

### 2️⃣ Comando di Deploy Mirato Backend + Frontend (Consigliato)

```bash
cd /home/chif-vas/projects/opsflow && yarn --prefix opsflow-functions build && yarn build && npx firebase-tools deploy --only functions:chatWithAgent,hosting
```

---

### 3️⃣ Spiegazione dei Comandi di Build: DOVE e QUANDO eseguirli?

| Comando                                 | Dove eseguirlo                                 | Cosa fa                                                            | È obbligatorio prima del deploy?                                  |
| :-------------------------------------- | :--------------------------------------------- | :----------------------------------------------------------------- | :---------------------------------------------------------------- |
| `yarn --prefix opsflow-functions build` | Dalla radice `/home/chif-vas/projects/opsflow` | Compila TypeScript del Backend in `opsflow-functions/lib/index.js` | **SÌ** (altrimenti le Cloud Functions usano vecchio codice)       |
| `yarn build`                            | Dalla radice `/home/chif-vas/projects/opsflow` | Compila l'applicazione Quasar Vue 3 SPA in `dist/spa`              | **SÌ** (altrimenti Firebase Hosting distribuisce vecchia grafica) |
| `npx firebase-tools deploy`             | Dalla radice `/home/chif-vas/projects/opsflow` | Invia codice compilato ed asset su Google Cloud / Firebase         | **SÌ**                                                            |

---

## 📌 Panoramica dell'Architettura di Deploy

In OpsFlow, l'applicazione è suddivisa in tre componenti principali distribuiti su Google Cloud / Firebase:

1. **Backend Serverless (Genkit / Node.js 22):** Distribuito tramite **Firebase Cloud Functions** (`opsflow-functions`).
2. **Frontend Web (Quasar 2 / Vue 3 SPA):** Distribuito tramite **Firebase Hosting** (`dist/spa`).
3. **Firestore Security Rules:** Distribuito tramite **Firestore Rules Engine** (`firestore.rules`).

---

## 🛠️ 1. Deploy delle Cloud Functions (Backend IA)

> [!CAUTION]
> **ATTENZIONE ALLA CARTELLA DEL TERMINALE:**  
> MAI fare `cd functions/` (la cartella attiva del backend è `opsflow-functions`).  
> Prima di qualsiasi deploy, assicurati di trovarti nella radice `/home/chif-vas/projects/opsflow` oppure usa il comando a percorso assoluto indicato qui sotto.

Per distribuire o aggiornare le Cloud Functions (es. `chatWithAgent`, `generateDbsAttitude`, `setUserRole`, `onTaskCreated`, `onTaskUpdated`):

### 📜 Comando Singolo Sicuro (Funziona da qualsiasi cartella)

```bash
cd /home/chif-vas/projects/opsflow && yarn --prefix opsflow-functions build && npx firebase-tools deploy --only functions,hosting
```

### 🔍 Spiegazione Dettagliata Passo-Passo

#### 1. `cd /home/chif-vas/projects/opsflow`

- **Cosa Fa (Spiegazione Tecnica):** Torna alla cartella radice principale del progetto OpsFlow.
- **Perché è Necessario / Impatto:** **FONDAMENTALE:** Risolve l'errore `No such file or directory` e previene l'errore `cloudresourcemanager` assicurando che i file `firebase.json` e `.firebaserc` siano presenti nella cartella corrente.

---

#### 2. `yarn --prefix opsflow-functions build`

- **Cosa Fa (Spiegazione Tecnica):** Esegue il compilatore TypeScript (`tsc`) all'interno della cartella `opsflow-functions/`, generando i file compilati JavaScript in `opsflow-functions/lib/`.
- **Perché è Necessario / Impatto:** Rispetta la direttiva **AGENTS.md §2** (_Usa esclusivamente yarn_). Firebase Cloud Functions esegue codice JavaScript compilato per Node.js 22.

---

#### 3. `npx firebase-tools deploy --only functions`

- **Cosa Fa (Spiegazione Tecnica):** Invia il pacchetto compilato di `opsflow-functions` ai server Google Cloud Firebase (`us-central1` / `europe-west1`).
- **Perché è Necessario / Impatto:** Crea o aggiorna le funzioni serverless attive in produzione con zero downtime per gli utenti.

---

## 🌐 2. Deploy del Frontend (Quasar 2 SPA su Firebase Hosting)

Per distribuire l'applicazione web reattiva a tutti gli utenti:

### 📜 Comandi da Eseguire

```bash
cd /home/chif-vas/projects/opsflow && yarn build && npx firebase-tools deploy --only hosting
```

### 🔍 Spiegazione Dettagliata Passo-Passo

#### 1. `yarn build`

- **Cosa Fa (Spiegazione Tecnica):** Esegue `quasar build`. Genera il bundle ottimizzato dell'applicazione Single Page Application nella cartella `dist/spa`.
- **Perché è Necessario / Impatto:** Minifica il codice HTML, CSS, JavaScript, compila i componenti Vue 3 ed ottimizza le asset per massima velocità (Lighthouse 100/100).

---

#### 2. `npx firebase-tools deploy --only hosting`

- **Cosa Fa (Spiegazione Tecnica):** Carica la cartella `dist/spa` sui server CDN globali di Firebase Hosting.
- **Perché è Necessario / Impatto:** Rende le modifiche visibili immediatamente agli utenti che accedono all'URL di OpsFlow.

---

## 🔒 3. Deploy delle Firestore Security Rules (Sicurezza DB)

Per aggiornare le regole di sicurezza e isolamento multi-tenant di Firestore senza rifare il build dell'app:

### 📜 Comandi da Eseguire

```bash
cd /home/chif-vas/projects/opsflow && npx firebase-tools deploy --only firestore:rules
```

### 🔍 Spiegazione Dettagliata Passo-Passo

#### `npx firebase-tools deploy --only firestore:rules`

- **Cosa Fa (Spiegazione Tecnica):** Invia il file `firestore.rules` al database Firestore (`(default)` / `europe-west1`).
- **Perché è Necessario / Impatto:** Applica istantaneamente il Layer 2 di sicurezza GDPR Art. 32 ed RBAC (SuperAdmin, Admin, User) bloccando accessi non autorizzati lato database.

---

## 🌟 4. Deploy Completo "All-in-One" (Full-Stack)

Per distribuire **contemporaneamente** Backend, Frontend e Regole di Sicurezza in un'unica operazione:

```bash
cd /home/chif-vas/projects/opsflow && yarn --prefix opsflow-functions build && yarn build && npx firebase-tools deploy
```

---

## ⚠️ Troubleshooting Errori Comuni di Deploy

> [!WARNING]
> **Errore:** `Error: Failed to make request to https://cloudresourcemanager.googleapis.com/v1/projects/opsflow-88of`  
> **Causa:** Il comando `firebase deploy` è stato lanciato all'interno di una sottocartella (es. `functions/` o `opsflow-functions/`) invece che dalla radice.  
> **Risoluzione:** Esegui sempre `cd /home/chif-vas/projects/opsflow` prima di lanciare il deploy.

> [!NOTE]
> **Errore Sessione Scaduta:** `Error: HTTP Error: 401, Unauthorized`  
> **Risoluzione:** Lancia `npx firebase-tools login --reauth` per ri-autenticare l'account Google sviluppatore.

---

## 🧹 5. Artifact Registry Retention Policy (Step 12 GCP Cost Governance)

> [!IMPORTANT]
> **Perché è necessario:** Ogni deploy di Cloud Functions genera un container Docker (~200MB) su Google Cloud Artifact Registry.
> In assenza di una regola di cancellazione, le immagini si accumulano e vengono fatturate.
> **Eseguire questo comando una volta sola** dopo il primo deploy — la policy è permanente.

### Comando di Applicazione della Retention Policy

```bash
# Elimina automaticamente i container Docker di Cloud Functions più vecchi di 7 giorni
# Mantiene sempre almeno gli ultimi 2 tag — zero rischio di cancellare il codice in produzione
firebase functions:artifacts:setpolicy --location europe-west1 --days 7
```

### Verifica della Policy Applicata

```bash
# Verifica che la policy sia attiva sul repository gcf-artifacts in europe-west1
gcloud artifacts repositories describe gcf-artifacts \
  --project=opsflow-88of \
  --location=europe-west1
```

### Risparmio Atteso

| Prima (Step 12)                            | Dopo (Step 12)                                 |
| :----------------------------------------- | :--------------------------------------------- |
| Immagini accumulate illimitatamente        | Immagini > 7 giorni cancellate automaticamente |
| Potenziale: centinaia di MB/mese fatturati | < 2 immagini attive (latest + previous)        |
| Nessuna automazione                        | Policy permanente gestita da Firebase CLI      |

> [!NOTE]
> La retention policy usa il comando ufficiale Firebase CLI (`firebase functions:artifacts:setpolicy`).
> Non è richiesta nessuna configurazione JSON manuale — il CLI gestisce tutto automaticamente.
