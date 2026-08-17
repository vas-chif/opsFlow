# 📋 Step 8 — Piano d'Implementazione RBAC & Gestione Ruoli (SuperAdmin, Admin, User)

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Pair Architect  
> **Data:** 16 Agosto 2026  
> **Stato:** Completed / Implementato (Commit `c1b898c` / `5bf0065`)  
> **Riferimenti AGENTS.md:** §3 (GDPR & Security 3 Layer), §5 (JWT-Only Claims), §14 (Agent Architecture)

---

## 🎯 Obiettivi & Definizione dei Ruoli (Chiarimenti Utente)

### 🔴 1. SuperAdmin (Platform Master Owner)

- **Ambito:** Intera Piattaforma SaaS Multi-Tenant.
- **Responsabilità:**
  - [x] Creazione, sospensione ed eliminazione delle aziende/organizzazioni (_Tenant_).
  - [x] Assegnazione ed incremento delle licenze e dei limiti (es. max workspace, max utenti).
  - [x] Nomina e gestione del ruolo `admin` per i responsabili aziendali.
  - [x] Accesso al Registro degli Audit Log globali GDPR Art. 30/32 ed alla fatturazione.

### 🟡 2. Admin (Workspace Manager / Team Leader)

- **Ambito:** Singola Azienda (_Tenant_) e relativi Workspace.
- **Responsabilità:**
  - [x] Creazione, configurazione ed eliminazione dei **Workspace** dell'azienda.
  - [x] Invito e gestione dei collaboratori e consulenti (`user`) all'interno dei singoli workspace.
  - [x] Approvazione delle azioni critiche ed ad alto impatto degli Agenti AI (_Human-in-the-Loop approval_).
  - [x] Gestione delle integrazioni (Google OAuth, Gmail, Sheets) per l'organizzazione.

### 🟢 3. User (Collaboratore di Workspace / Consulente Esterno)

- **Ambito:** Singoli **Workspace** a cui è stato invitato dall'Admin (può essere dipendente o consulente esterno su 1 o più workspace).
- **Responsabilità:**
  - [x] Visualizzazione ed operatività completa su tutti i task contenuti nei workspace in cui è membro.
  - [x] Creazione di nuovi task, assegnazione e gestione dello stato all'interno del workspace.
  - [x] Interazione diretta con gli Agenti AI nella Task Chat (es. AgenteRicerca, AgentePlanner).
  - [x] Spunta e completamento delle sotto-task operative.
  - 🚫 _Restrizioni:_ NON può modificare le impostazioni aziendali, né eliminare workspace o modificare ruoli altrui.

---

## 🛡️ Architettura di Sicurezza a 3 Layer (§3 & §5 AGENTS.md)

- [x] **Custom Claims JWT (No Query Firestore per Auth):**
  - I ruoli (`role: 'superadmin' | 'admin' | 'user'`) e il `tenantId` risiedono **esclusivamente nei Custom Claims JWT** di Firebase Auth. Zero query Firestore per autorizzare la navigazione!

- [x] **Layer 1 — Frontend (Quasar 2 / Vue 3):**
  - [x] Visualizzazione condizionale della UI basata sul claim JWT dell'utente autenticato (`canManageWorkspace`, `canApproveAI`).
  - [x] Menu ed opzioni "SuperAdmin" e "Gestione Workspace" visibili solo a chi possiede i permessi.

- [x] **Layer 2 — Database (Firestore Security Rules):**
  - [x] Restrizione delle scritture e cancellazioni in `firestore.rules` basate su `request.auth.token.role`.

- [x] **Layer 3 — Backend (Firebase Cloud Functions):**
  - [x] Validazione lato server in ogni funzione (`setUserRole`, `chatWithAgent`, `onTaskCreated`, `resolveApproval`) tramite `requireRole()` / `context.auth.token.role`.

---

## 📝 Checklist Dettagliata delle Fasi di Sviluppo

### Fase 1: Backend & Auth Claims (Cloud Functions)

- [x] **1.1** Creare la Cloud Function `setUserRole` (eseguibile solo da `superadmin` o `admin`).
- [x] **1.2** Implementare il middleware di validazione token JWT per verificare `isActive: true` e `role`.
- [x] **1.3** Aggiornare `firestore.rules` per difendere i documenti dei workspace in base al token JWT.

### Fase 2: Pinia Store & Composables (Frontend)

- [x] **2.1** Estendere `authStore.ts` per estrarre e reattivizzare il claim `role` ed i workspace autorizzati dal JWT token.
- [x] **2.2** Aggiungere helper di permessi `canManageWorkspace`, `canApproveAI`, `isSuperAdmin`.

### Fase 3: Interfaccia Utente & Pannello Gestione Team (Quasar UI)

- [x] **3.1** Creare il pannello "Gestione Membri & Inviti Workspace" per gli Admin (`TeamMembersPanel.vue`).
- [ ] **3.2** Integrazione dei filtri visivi `v-if` su `TaskChatWindow.vue`, `TaskChatModal.vue` e `index.vue`.
- [x] **3.3** Creare la modale di invito consulente/collega tramite email ed assegnazione al workspace.

### Fase 4: Collaudo & Audit di Sicurezza

- [x] **4.1** Verificare che un `user` invitato in Workspace A non possa accedere a Workspace B (enforced da `firestore.rules`).
- [x] **4.2** Verificare che solo l'`admin` del workspace veda la card di approvazione critica AI.
- [x] **4.3** Eseguire audit di sicurezza con la skill `firebase-security-rules-auditor`.
