# 🚀 Guida Operativa al Deploy di OpsFlow su Firebase

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Architect  
> **Data:** 22 Agosto 2026  
> **Riferimenti AGENTS.md:** §1 (Git & Branch Management), §2 (Comandi Progetto), §3 (Sicurezza & Firebase SDK)

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
