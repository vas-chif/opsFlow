# 📋 Step 14 — Piano d'Implementazione Sistema Invito Dipendenti via Email & Onboarding Aziendale

> **Progetto:** OpsFlow SaaS Platform  
> **Modulo:** Team Onboarding & Multi-Tenant Management  
> **Autore:** Vasile Chifeac & Senior AI Architect Team  
> **Data:** 4 Settembre 2026  
> **Stato:** 🚀 APPROVATO (100%) con 3 Prescrizioni Tecniche Vincolanti — Pronto per Implementazione  
> **Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §3 (GDPR & Security 3-Layer), §5 (Cloud Cost Control < €1/1000 utenti), §14 (Orchestrazione & Permessi)  
> **Skills Applicate:** `senior-architect`, `senior-business-analyst`, `senior-security-expert`, `senior-jurist`

---

## 🎯 1. Visione & Diagnosi del Problema

### ❌ Il Limite Attuale (Prototipo `TeamMembersPanel.vue`):

Attualmente, l'aggiunta di un dipendente richiede all'Amministratore l'inserimento manuale dell'**UID Firebase** dell'utente oltre all'email.

- In ambiente di produzione reale, **nessun datore di lavoro o direttore aziendale conosce o può reperire l'UID tecnico** di un dipendente prima che questi si sia registrato.
- Se l'utente si registra autonomamente da `/register`, viene assegnato al proprio tenant isolato personale (`default-tenant`), rimanendo disconnesso dall'azienda.

### ✅ La Soluzione Target (Email Magic Invitation):

Un flusso di onboarding a **zero attrito** basato su **Invito via Email con Token Crittografico Monouso**:

1. L'Amministratore inserisce solo l'**Email** ed il **Ruolo** (`admin` o `user`).
2. Il sistema genera un token crittografico sicuro con scadenza a **7 giorni** e recapita l'email di invito.
3. Il dipendente clicca sul link (`/#/invite?token=...&tenant=...`), crea la password (o effettua login/Google) ed entra **immediatamente** come membro attivo del workspace aziendale.

---

## ⚠️ 2. I 3 Vincoli Tecnici Obbligatori (Security & Architecture Hardening)

Prima di scrivere il codice, sono stabilite queste **3 prescrizioni architetturali vincolanti**:

1. 🔒 **Invio Email RIGOROSAMENTE Server-Side (Bandito `@emailjs/browser` per i Token):**
   - Per le email di invito contenenti token crittografici è **vietato** l'uso di librerie client-side. Il token monouso non deve mai transitare o essere generato nel browser dell'Admin.
   - L'email di invito viene spedita **esclusivamente dal backend** all'interno della Cloud Function `createTenantInvitation` (usando un provider transazionale affidabile come Resend / Brevo o l'estensione Firebase Trigger Email).
2. ⚡ **Lookup Diretto O(1) con Document ID = `tokenHash`:**
   - Nel database Firestore, il documento dell'invito usa come ID direttamente l'hash SHA-256 del token:
     `tenants/{tenantId}/invitations/{tokenHash}`
   - In questo modo, quando il dipendente atterra su `/#/invite?token=...&tenant=...`, la Cloud Function calcola `sha256(token)` ed esegue un **singolo `getDoc()` diretto O(1)** istantaneo, sicuro ed a costo minimo (zero query `where` e zero sprechi di indici compositi).
3. 🔄 **Force Refresh Token Obbligatorio al Riscatto (`getIdToken(true)`):**
   - Quando `acceptTenantInvitation` imposta i Custom Claims con Firebase Admin SDK, il browser dell'utente possiede ancora il vecchio token JWT privo di tenant o permessi.
   - Nella pagina `src/pages/invite.vue`, subito dopo la risposta positiva della Cloud Function, è **obbligatorio** invocare:
     ```typescript
     await auth.currentUser?.getIdToken(true);
     await authStore.refreshClaims();
     ```
     prima di effettuare la navigazione a `/workspaces`, evitando che il Vue Router blocchi l'accesso per mancanza di permessi.

---

## 🏛️ 3. Analisi Multidisciplinare (Le 5 Dimensioni di Skill)

### 1. 🏛️ Senior Architect (`SKILL/senior-architect`)

- **Isolamento Multi-Tenant:** La collezione degli inviti risiede strettamente nel percorso aziendale `tenants/{tenantId}/invitations/{tokenHash}`.
- **Transazione Atomica:** Il riscatto del token avviene tramite `runTransaction` su Firestore con assegnazione atomica dei Custom Claims JWT `{ tenantId, role, isActive: true }`.
- **Zero Query di Navigazione:** Nessuna lettura Firestore ridondante per verificare i permessi; il routing continua a basarsi esclusivamente sui Custom Claims del token JWT (§5).

### 2. 📊 Senior Business Analyst (`SKILL/senior-business-analyst`)

- **Admin Journey:** L'Admin ha il pieno controllo con una scheda _"Inviti Pendenti"_ che mostra:
  - Email destinatario
  - Ruolo assegnato
  - Data invio e data di scadenza
  - Azioni rapide: 🔄 _Rinvia Email_ | 🚫 _Revoca Invito_
- **Employee Journey:** Esperienza "Welcome to Company": il dipendente atterra su una pagina brandizzata che mostra _"Sei stato invitato ad unirti a [Nome Azienda]"_, con completamento registrazione in 1 click.

### 3. 🛡️ Senior Security Expert (`SKILL/senior-security-expert`)

- **Token Monouso (Anti-Replay):** Token generato con `crypto.randomBytes(32).toString('hex')`. Nel DB viene salvato solo l'hash SHA-256 (`tokenHash`), garantendo che anche in caso di fuga dati il token originale non sia ricostruibile.
- **Anti-Privilege Escalation:** Il ruolo finale dell'utente non viene deciso dal client web ma sigillato e verificato dalla Cloud Function backend `acceptTenantInvitation`.
- **Anti-IDOR / Anti-Tampering:** Nessun ID di tenant o dato riservato viene mostrato all'utente prima che il token sia stato convalidato.
- **Rate-Limiting & Anti-Spam:** Massimo 10 inviti inviabili per minuto per evitare abusi di invio email.

### 4. ⚖️ Senior Jurist (`SKILL/senior-jurist`)

- **Conformità GDPR Art. 6 (Base Giuridica):** Trattamento basato su misure precontrattuali/contrattuali aziendali e legittimo interesse organizzativo.
- **Informativa Art. 14:** Testo chiaro nell'email con link alla Privacy Policy e avviso: _"Se non riconosci questo invito, puoi ignorare l'email o richiederne la cancellazione"_.
- **Retention Limitata (Art. 17 - Oblio Automatico):** Gli inviti non riscossi decadono e vengono eliminati automaticamente dopo **7 giorni**.
- **Diritto di Revoca:** L'Admin può revocare l'invito in qualsiasi momento, rimuovendo all'istante l'indirizzo email dai sistemi.

### 5. 💼 Senior Businessman & Cloud Cost (`AGENTS.md §5`)

- **Controllo Costi (< €1.00/1.000 utenti):**
  - Creazione invito: esattamente **1 write Firestore**.
  - Accettazione invito: **1 read O(1) + 1 write**.
  - Zero polling in background o listener costosi.
- **Consegna Email Server-Side:** Invio tramite Cloud Function con provider transazionale scalabile ad alto tier gratuito (Resend / Brevo) o Firebase Trigger Email Extension.

---

## 📝 4. Checklist Dettagliata per Fasi di Sviluppo

### 📦 Fase 1 — Modello Dati & Security Rules

- [x] **1.1. Modello Dati TypeScript (`src/types/models.ts`)**:
  - Definire l'interfaccia `TenantInvitation`:
    ```typescript
    export interface TenantInvitation {
      tokenHash: string; // Document ID O(1)
      tenantId: string;
      email: string;
      role: TenantRole;
      status: "pending" | "accepted" | "expired" | "revoked";
      invitedBy: string;
      createdAt: FirestoreTimestamp;
      expiresAt: FirestoreTimestamp;
      acceptedAt?: FirestoreTimestamp;
      acceptedByUid?: string;
    }
    ```
- [ ] **1.2. Firestore Security Rules (`firestore.rules`)**:
  - Aggiungere il blocco di sicurezza per `tenants/{tenantId}/invitations/{tokenHash}`:
    - _Lettura / Scrittura:_ Consentita solo all'Admin del tenant (`isActiveAndVerified() && isAdmin() && belongsToTenant(tenantId)`).
    - _Riscatto pubblico:_ Bloccato l'accesso diretto client-side; il riscatto deve passare esclusivamente via Cloud Function backend con Admin SDK.

---

### ⚡ Fase 2 — Backend Cloud Functions (`opsflow-functions`)

- [ ] **2.1. Callable Function: `createTenantInvitation`**:
  - Verifica JWT chiamante (`admin` o `superadmin`).
  - Sanitize input email e verifica formato.
  - Generazione token crittografico monouso (`crypto.randomBytes(32)`).
  - Calcolo `tokenHash = crypto.createHash('sha256').update(token).digest('hex')`.
  - Scrittura documento invito su path O(1): `tenants/{tenantId}/invitations/{tokenHash}`.
  - Invio dell'email transazionale **esclusivamente lato server** con link `https://[domain]/#/invite?token=[token]&tenant=[tenantId]`.
  - Audit log GDPR dell'emissione.
- [ ] **2.2. Callable Function: `acceptTenantInvitation`**:
  - Input: `{ token, tenantId }`.
  - Calcolo `tokenHash` ed esecuzione **`getDoc` O(1)** su `tenants/{tenantId}/invitations/{tokenHash}`.
  - Validazione: documento esistente, data di scadenza (`expiresAt > now`) e stato `pending`.
  - Transazione atomica (`runTransaction`):
    - Impostazione Custom Claims su Firebase Auth per l'utente loggato (`tenantId`, `role`, `isActive: true`).
    - Scrittura in `tenants/{tenantId}/members/{uid}` con anagrafica e ruolo.
    - Aggiornamento stato invito in `accepted` con timestamp e UID.
- [ ] **2.3. Callable Function: `revokeTenantInvitation`**:
  - Permette all'Admin di annullare un invito pendente prima che venga riscosso, eliminando o marcando `revoked` il documento.
- [ ] **2.4. Pulizia Automatica Scadenze (TTL / Cron)**:
  - Eliminazione automatica degli inviti `pending` più vecchi di 7 giorni.

---

### 🖥️ Fase 3 — Frontend & Interfaccia Utente (Quasar 2 / Vue 3)

- [ ] **3.1. Aggiornamento Modale Invito (`src/components/TeamMembersPanel.vue`)**:
  - Rimuovere definitivamente il campo `inviteUid`.
  - Form snello ed elegante: solo **Email dipendente** + **Select Ruolo** (`admin` o `user`).
  - Pulsante con feedback di caricamento e notifica Quasar (`Membro invitato con successo! Email inviata.`).
- [ ] **3.2. Scheda "Inviti Pendenti" in `TeamMembersPanel.vue`**:
  - Nuova tab o sottotabella che elenca gli inviti non ancora riscossi:
    - Badge di stato: 🟡 _In attesa_, 🔴 _Scaduto_.
    - Bottone 🔄 _Rinvia_ e 🗑️ _Revoca Invito_.
- [ ] **3.3. Creazione Nuova Pagina di Atterraggio (`src/pages/invite.vue`)**:
  - Filename-based routing automatico (`/#/invite`).
  - Design Elite conforme a §6 (Navy `#0a2342`, Gold `#c5a065`, GlassCard):
    - Se l'utente non è autenticato: form compatto _"Crea la tua password"_ o _"Accedi con Google"_ per completare l'adesione.
    - Se l'utente è già loggato: card con pulsante _"Conferma adesione all'azienda [Nome]"_.
    - **Invocazione obbligatoria di `await auth.currentUser.getIdToken(true)` e `authStore.refreshClaims()`** al successo prima del redirect a `/workspaces`.

---

### 🧪 Fase 4 — Test, Sicurezza & Checklist Pre-Commit (§7)

- [ ] **4.1. Typecheck Rigoroso**:
  - `yarn --ignore-engines typecheck` → 0 errori.
- [ ] **4.2. Lint & Formattazione**:
  - `yarn --ignore-engines lint` → 0 errori/warning.
- [ ] **4.3. Test di Sicurezza (Anti-Hacking & Pentest)**:
  - Tentativo di riscatto token scaduto → Deve restituire errore chiaro.
  - Tentativo di riutilizzo token già riscosso → Deve essere respinto (Anti-Replay).
  - Tentativo di forzatura ruolo da parte dell'utente invitato → Deve essere respinto dal server.
- [ ] **4.4. Test di Sincronizzazione Sessione**:
  - Verifica che dopo il riscatto il token JWT contenga immediatamente i nuovi Custom Claims senza richiedere logout/login manuale.

---

## 🚀 Direttiva di Approvazione per AntiGravity

Il Piano d'Implementazione Step 14 è **APPROVATO AL 100%**.

Quando si deciderà di avviare lo sviluppo, procedere rispettando rigorosamente le 3 prescrizioni tecniche vincolanti:

1. **Invio Email Esclusivamente Server-Side:** Spedizione dentro la Cloud Function backend (provider transazionale o Firebase Extension).
2. **Document ID = Token Hash:** Salvare il record su `tenants/{tenantId}/invitations/{tokenHash}` per lookup O(1) diretto.
3. **Force Refresh JWT sul Client:** Eseguire `await user.getIdToken(true)` in `src/pages/invite.vue` prima della navigazione.
