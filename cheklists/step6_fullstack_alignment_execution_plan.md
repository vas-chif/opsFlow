# 📋 Step 6 — Piano Esecutivo Chirurgico Full-Stack (OpsFlow)

> **Standard Architetturale:** Full-Stack Alignment (Regola §0 AGENTS.md)  
> **Autore:** Senior OpsFlow Architect & Full-Stack AI Engineer  
> **Data:** 14 Agosto 2026  
> **Stato:** ✅ COMPLETATO

---

## ⚠️ DIRETTIVA FONDAMENTALE (Full-Stack Alignment)

È fatto divieto assoluto di creare logiche di backend isolate senza la loro controparte visiva e reattiva nel Frontend. Ogni Cloud Function, Tool o listener deve essere **immediatamente collegato e testabile nella UI di Quasar** (Pannelli, Chat, Approval Card, Pinia Store). L'utente deve poter vedere, interagire, approvare e verificare ogni singolo dato a schermo.

---

## 📊 Matrice di Verifica Full-Stack (Backend $\leftrightarrow$ Frontend)

| Feature / Modulo Operativo                | Modulo Backend (`opsflow-functions/src/`)                                                         | Componente & Store Frontend (`src/`)                                        | Stato Allineamento UI |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | :-------------------: |
| **1. Token Vault Google OAuth**           | `tools/googleOAuthHandler.ts`<br>(AES-256-GCM, auto-refresh 5min, eccezioni tipizzate)            | `composables/useGoogleOAuth.ts`<br>+ Banner Re-Auth in `TaskChatWindow.vue` |    ✅ IMPLEMENTATO    |
| **2. Human-in-the-Loop Approvazioni**     | `tools/googleWorkspace.ts` (record `pending` in `/approvals/`) + Cloud Function `resolveApproval` | `<ApprovalCard.vue>` + Actions Pinia in `taskChatStore.ts`                  |    ✅ IMPLEMENTATO    |
| **3. Persistenza Zero-Loss Multi-Window** | Firestore Subcollections `/messages` & `/approvals`                                               | `taskChatStore.ts` (Bootstrap `localStorage` + `onSnapshot` dual-sync)      |    ✅ IMPLEMENTATO    |
| **4. Lead Scout Jina AI & Safe Logging**  | `tools/webSearch.ts` (`jinaReaderTool` via `r.jina.ai`)                                           | `composables/useSecureLogger.ts` (già esistente, confermato)                |    ✅ IMPLEMENTATO    |

---

## 🗂️ Mappa dei File Modificati / Creati

### 🔹 Backend (`opsflow-functions/src/`)

- [x] **[NEW]** `opsflow-functions/src/tools/googleOAuthHandler.ts` (Handler cifrato AES-256-GCM con auto-refresh)
- [x] **[MODIFY]** `opsflow-functions/src/tools/googleWorkspace.ts` (Tool modificati per generare record `pending` in `/approvals/` invece di scrivere direttamente su Gmail/Sheets)
- [x] **[MODIFY]** `opsflow-functions/src/index.ts` (Aggiunta Cloud Function `resolveApproval` + `googleOAuthCallback`)
- [x] **[MODIFY]** `opsflow-functions/src/tools/webSearch.ts` (Aggiunto `jinaReaderTool` via `r.jina.ai`)

### 🔸 Frontend (`src/`)

- [x] **[MODIFY]** `src/types/models.ts` (Aggiunto tipi: `ApprovalRecord`, `PendingActionType`, `PendingActionStatus`, `PendingActionPayload`, `GmailDraftPreview`, `SheetAppendPreview`, `OAuthError`, `OAuthErrorCode`)
- [x] **[NEW]** `src/composables/useGoogleOAuth.ts` (Composable client per consent popup, code exchange, `OAuthError` banner reattivo)
- [x] **[NEW]** `src/components/ApprovalCard.vue` (Componente UI Elite Gold `#c5a065` con anteprima Email/Sheets e pulsanti `[✅ Approve & Execute]` / `[❌ Reject]`)
- [x] **[MODIFY]** `src/stores/taskChatStore.ts` (Aggiunto `approvals[]`, `oauthError`, `appendApproval`, `resolveApprovalInSession`, `setSessionOAuthError`; `closeSession` aggiornato con `_unsubscribeApprovals`)

---

## 📋 Checklist Chirurgica di Implementazione

- [x] **Fase 1: Tipi TypeScript Centralizzati (`src/types/models.ts`)**
  - ✅ Definiti i tipi `ApprovalRecord`, `PendingActionPayload`, `PendingActionStatus`, `GmailDraftPreview`, `SheetAppendPreview`, `OAuthError`, `OAuthErrorCode`.
- [x] **Fase 2: Backend Google OAuth Vault (`googleOAuthHandler.ts`)**
  - ✅ Implementato `getAuthenticatedOAuth2Client` con auto-refresh a 5 min dalla scadenza.
  - ✅ Implementato `saveOAuthToken` per la memorizzazione cifrata AES-256-GCM.
  - ✅ Eccezioni tipizzate `OAuthVaultError` con codici `TOKEN_EXPIRED`, `INSUFFICIENT_SCOPES`, `TOKEN_NOT_FOUND`.
- [x] **Fase 3: Backend Approval Engine (`googleWorkspace.ts` & `resolveApproval`)**
  - ✅ Tool `createGmailDraftTool` e `manageGoogleSheetTool` modificati: scrivono solo record `pending` in `/approvals/`.
  - ✅ Cloud Function `resolveApproval` creata: esegue la chiamata API Google reale solo su approvazione.
  - ✅ Cloud Function `googleOAuthCallback` creata: scambia il codice OAuth e salva i token nel Vault cifrato.
- [x] **Fase 4: Frontend Component `<ApprovalCard.vue>`**
  - ✅ Componente Quasar con anteprima email (To, Subject, Body) e Fogli Google (SpreadsheetId, Range, Rows).
  - ✅ Pulsanti reattivi `[✅ Approve & Execute]` e `[❌ Reject]` con emit verso `TaskChatWindow.vue`.
  - ✅ Design System Elite: bordo oro `#c5a065`, sfondo `#f9f7f2`, font Mulish.
- [x] **Fase 5: Frontend Store & Dual-Sync Realtime (`taskChatStore.ts`)**
  - ✅ `ChatSession` aggiornata con `approvals[]`, `oauthError`, `_unsubscribeApprovals`.
  - ✅ Azioni aggiunte: `appendApproval`, `resolveApprovalInSession`, `setSessionOAuthError`.
  - ✅ `closeSession` aggiornato per cancellare entrambi i listener.
- [x] **Fase 6: Integration & Verification**
  - ✅ `yarn typecheck` → **0 errori** (vue-tsc strict mode).
  - ✅ `yarn lint` → **0 errori, 0 warning** (oxlint + oxfmt 175 file).
