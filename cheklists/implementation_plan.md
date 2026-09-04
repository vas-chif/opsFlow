# Piano di Implementazione — Distinzione Cancellazione Account Singolo vs Purge Aziendale (Multi-Tenant)

## Descrizione del Problema e Obiettivo

Attualmente, la cancellazione dell'account rimuove l'utente da Firebase Auth e dal documento `users_metadata/{uid}`, ma lascia in Firestore i riferimenti al tenant e ai workspace (`tenants/{tenantId}/workspaces/{wsId}`).

Con questo aggiornamento implementiamo la distinzione chiara tra:

1. **Utente Singolo (Freelancer / Solo-Tenant):** Quando cancella l'account, il sistema elimina sia l'account Firebase Auth sia l'intero tenant con tutti i suoi workspace, task, approval e knowledge base (GDPR Art. 17).
2. **Azienda Multi-Utente (Team / Company Tenant):**
   - **Dipendente / Collaboratore:** Elimina solo l'account personale ed il proprio profilo utente. I workspace ed i task aziendali **rimangono integri** per il resto dell'azienda.
   - **Amministratore / Direttore Aziendale:** Ha a disposizione una funzione speciale protetta **"Elimina Intera Organizzazione / Azienda"**, che richiede una **doppia conferma esplicita** (digitazione del nome azienda) prima di eseguire l'eliminazione totale ricorsiva dell'intero sistema aziendale.

---

## 🛠️ Modifiche Proposte

---

### Backend: Cloud Functions (`opsflow-functions/src/index.ts`)

#### [MODIFY] [index.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/index.ts)

Aggiunta di due Cloud Functions amministrative (regione `europe-west1`):

1. **`onUserAccountDeleted` (Auth Trigger v2):**
   - Intercetta la cancellazione dell'utente in Firebase Auth.
   - Controlla i membri rimanenti in `tenants/{tenantId}/members`.
   - Se l'utente era l'unico membro del tenant (utente singolo/solo), esegue `db.recursiveDelete(db.doc(\`tenants/\${tenantId}\`))` eliminando tutti i workspace e task del tenant.
2. **`purgeCompanyTenant` (Callable Function v2):**
   - Richiede ruolo `admin` o `superadmin` verificato via JWT claims.
   - Richiede parametro `confirmTenantName` per sicurezza anti-errore.
   - Esegue la cancellazione ricorsiva atomica `db.recursiveDelete()` sull'intera alberatura del tenant (`tenants/{tenantId}`).
   - Registra l'evento nei log di audit GDPR.

---

### Frontend: State Management (`src/stores/authStore.ts`)

#### [MODIFY] [authStore.ts](file:///home/chif-vas/projects/opsflow/src/stores/authStore.ts)

- Aggiunta della funzione `purgeCompanyTenant(confirmationName: string)` nello store Pinia per invocare la Cloud Function backend di distruzione azienda.
- Gestione reattiva dello stato `isSingleUserTenant` (verifica se `members.length <= 1`).

---

### Frontend: UI & Dialoghi di Conferma (`src/layouts/MainLayout.vue`)

#### [MODIFY] [MainLayout.vue](file:///home/chif-vas/projects/opsflow/src/layouts/MainLayout.vue)

- Aggiornamento della modale Profilo / Impostazioni Workspace con distinzione visiva tra:
  1. **"Elimina il mio Account"** (con notifica che per gli account aziendali il workspace rimane attivo per il team).
  2. **"Elimina Intera Organizzazione Aziendale"** (visibile solo agli Admin aziendali), con finestra di dialogo Quasar che richiede la digitazione esplicita del nome del workspace prima del purge definitivo.

---

## Piano di Verifica

### Test Automatici & Typecheck

- Esecuzione `yarn --ignore-engines typecheck` per garantire zero errori di tipo.
- Esecuzione `yarn --ignore-engines lint` per conformità formattazione oxfmt/oxlint.

### Verifica Manuale

1. **Test Utente Singolo:** Creazione ed eliminazione account singolo → Verifica in Firebase Console che `tenants/default-tenant` o tenant dedicato sia stato completamente eliminato senza stubs o documenti fantasmi.
2. **Test Dipendente Aziendale:** Eliminazione account utente con ruolo `user` in un tenant multi-utente → Verifica che il workspace ed i task rimangano visibili per gli altri utenti.
3. **Test Purge Amministratore Aziendale:** Eliminazione organizzazione da parte dell'Admin tramite conferma nome azienda → Verifica pulizia totale in Firestore.
