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

Per distribuire o aggiornare le Cloud Functions (es. `chatWithAgent`, `generateDbsAttitude`, `setUserRole`, `onTaskCreated`, `onTaskUpdated`), lancia i comandi **dalla radice del progetto OpsFlow** (`/home/chif-vas/projects/opsflow`).

### 📜 Comandi da Eseguire

```bash
cd opsflow-functions && yarn build && cd .. && npx firebase-tools deploy --only functions
```

### 🔍 Spiegazione Dettagliata Passo-Passo

| Comando                                      | Cosa Fa (Spiegazione Tecnica)                                                                                                  | Perché è Necessario / Impatto                                                                                                                                                              |
| :------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cd opsflow-functions`                       | Entra nella cartella radice del codice backend delle Cloud Functions.                                                          | Consente di accedere al file `package.json` ed alla configurazione del compilatore TypeScript del backend.                                                                                 |
| `yarn build`                                 | Esegue il comando `tsc` (TypeScript Compiler) definito in `package.json`, compilando il codice da `src/` alla cartella `lib/`. | Rispetta la direttiva **AGENTS.md §2** (Usa esclusivamente `yarn` come package manager principale). Compila i file `.ts` per Node.js 22.                                                   |
| `cd ..`                                      | Torna nella cartella principale del progetto OpsFlow (`/home/chif-vas/projects/opsflow`).                                      | **CRUCIALE:** Firebase CLI richiede di essere lanciato dove si trovano i file `firebase.json` e `.firebaserc`. Lanciarlo dentro `opsflow-functions` causa l'errore `cloudresourcemanager`. |
| `npx firebase-tools deploy --only functions` | Invia il pacchetto compilato ai server Google Cloud Firebase (`us-central1` / `europe-west1`).                                 | Crea o aggiorna le funzioni serverless attive in produzione con zero downtime.                                                                                                             |

> [!TIP]
> **Comando Singolo Rapido (dalla radice):**
>
> ```bash
> yarn --prefix opsflow-functions build && npx firebase-tools deploy --only functions
> ```

---

## 🌐 2. Deploy del Frontend (Quasar 2 SPA su Firebase Hosting)

Per distribuire l'applicazione web reattiva a tutti gli utenti:

### 📜 Comandi da Eseguire

```bash
yarn build && npx firebase-tools deploy --only hosting
```

### 🔍 Spiegazione Dettagliata Passo-Passo

| Comando                                    | Cosa Fa (Spiegazione Tecnica)                                                                                            | Perché è Necessario / Impatto                                                                                                         |
| :----------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `yarn build`                               | Esegue `quasar build`. Genera il bundle ottimizzato dell'applicazione Single Page Application nella cartella `dist/spa`. | Minifica il codice HTML, CSS, JavaScript, compila i componenti Vue 3 ed ottimizza le asset per massima velocità (Lighthouse 100/100). |
| `npx firebase-tools deploy --only hosting` | Carica la cartella `dist/spa` sui server CDN globali di Firebase Hosting.                                                | Rende le modifiche visibili immediatamente agli utenti che accedono all'URL di OpsFlow.                                               |

---

## 🔒 3. Deploy delle Firestore Security Rules (Sicurezza DB)

Per aggiornare le regole di sicurezza e isolamento multi-tenant di Firestore senza rifare il build dell'app:

### 📜 Comandi da Eseguire

```bash
npx firebase-tools deploy --only firestore:rules
```

### 🔍 Spiegazione Dettagliata Passo-Passo

| Comando                                            | Cosa Fa (Spiegazione Tecnica)                                                         | Perché è Necessario / Impatto                                                                                                                   |
| :------------------------------------------------- | :------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx firebase-tools deploy --only firestore:rules` | Invia il file `firestore.rules` al database Firestore (`(default)` / `europe-west1`). | Applica istantaneamente il Layer 2 di sicurezza GDPR Art. 32 ed RBAC (SuperAdmin, Admin, User) bloccando accessi non autorizzati lato database. |

---

## 🌟 4. Deploy Completo "All-in-One" (Full-Stack)

Per distribuire **contemporaneamente** Backend, Frontend e Regole di Sicurezza in un'unica operazione:

```bash
yarn --prefix opsflow-functions build && yarn build && npx firebase-tools deploy
```

---

## ⚠️ Troubleshooting Errori Comuni di Deploy

> [!WARNING]
> **Errore:** `Error: Failed to make request to https://cloudresourcemanager.googleapis.com/v1/projects/opsflow-88of`  
> **Causa:** Il comando `firebase deploy` è stato lanciato all'interno della cartella `opsflow-functions/` invece della radice di OpsFlow.  
> **Risoluzione:** Esegui sempre `cd ..` prima di lanciare `npx firebase-tools deploy`.

> [!NOTE]
> **Errore Sessione Scaduta:** `Error: HTTP Error: 401, Unauthorized`  
> **Risoluzione:** Lancia `npx firebase-tools login --reauth` per ri-autenticare l'account Google sviluppatore.
