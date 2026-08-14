# 📋 STEP 6: Integrazioni Google OAuth2 & Form Guidato No-Code per Risorse Collegate (Gmail, Sheets, Drive)

**OpsFlow Master Checklist — Step 6**
**Autore:** Vasile Chifeac / AntiGravity Agent
**Stato:** 🟢 COMPLETATO (100%)

---

## 🎯 Obiettivo dello Step 6

Risolvere il problema del "mancato collegamento" delle risorse reali dell'utente (Email Gmail, Fogli Google Sheets, Cartelle Google Drive). Fornire un'interfaccia guidata **No-Code a 4 Tab** nella modale di Atteggiamento Workspace (`WorkspaceAttitudeModal.vue`) in modo che l'utente non debba inventare prompt da zero e che l'IA sappia **esattamente quale mail leggere, quale foglio compilare e quale cartella Drive consultare**.

---

## 🛠️ Moduli Operativi del Piano

### 1. Form Guidato No-Code a 4 Tab (`WorkspaceAttitudeModal.vue`)

- [x] **Tab 1 `[🎭 Comportamento & Tono]`**:
  - Selezione Tono di Voce (Formale, Informale, Operativo, Sintetico ROI).
  - Campo Obiettivo Principale (Focus Objective del Workspace).
  - Chip Group per Regole Obbligatorie (`Do List`) e Regole Vietate (`Don't List`).
  - Pulsanti **Template Rapidi Espansi** (`Commerciale / Lead Scout`, `Amministrazione & Fogli`, `Prompt Optimization Hub`) che auto-compilano tutti i campi.
- [x] **Tab 2 `[🔧 Risorse & Connessioni Google]`**:
  - Stato Connessione Account Google (Pulsante _"Connetti Account Google/Gmail"_ con OAuth2).
  - Campo Input: **ID / Link Foglio Google Sheets Predefinito** (es. Foglio Spese o Foglio Lead).
  - Campo Input: **ID / Link Cartella Google Drive di Riferimento** (es. Cartella Contratti / Condominio).
- [x] **Tab 3 `[🤖 Agenti Assegnati]`**:
  - Selettore degli Agenti attivi nel Workspace (`AgentePlanner`, `AgenteRicerca`, `AgenteIspettore`, `AgenteAmministrativo`).
- [x] **Tab 4 `[🧪 Test Sandbox Live]`**:
  - Area di prova per testare il comportamento dell'IA con la configurazione impostata prima di salvare su Firestore.

---

### 2. Schema Dati Firestore per Risorse Collegate (`models.ts`)

- [x] Estendere l'interfaccia `Workspace` in `src/types/models.ts`:
  ```typescript
  export interface WorkspaceLinkedResources {
    googleEmail?: string;
    defaultSheetId?: string;
    defaultSheetName?: string;
    defaultDriveFolderId?: string;
    isOAuthConnected?: boolean;
  }
  ```
- [x] Aggiornare `useFirestore.ts` e `taskStore.ts` per salvare e recuperare `linkedResources` sul documento `tenants/{tenantId}/workspaces/{workspaceId}`.

---

### 3. Iniezione Risorse nel System Prompt Stacking (`promptBuilder.ts`)

- [x] Aggiornare il **Livello 2 (Workspace Attitude)** dell'Engine di Prompt Stacking in `promptBuilder.ts` per iniettare i collegamenti tecnici:
  ```text
  === LEVEL 2: WORKSPACE OPERATIONAL ATTITUDE & LINKED RESOURCES ===
  Atteggiamento: "Organizzatore amministrativo documenti"
  Email Autorizzata: "user@example.com"
  Foglio Google Sheets Collegato ID: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
  Cartella Google Drive Collegata ID: "1a2b3c4d5e6f7g8h9i0j"
  ```
- [x] In questo modo, quando l'utente scrive nel task _"Leggi le mail di Del Amico ed estrai i documenti"_, l'IA non risponde più in modo generico ma sa **esattamente quale casella leggere e dove salvare l'estrazione**.

---

### 4. Flusso di Autorizzazione Google OAuth2 Client-Side

- [x] Integrare il pulsante di autorizzazione Google OAuth2 per richiedere gli Scope necessari:
  - `https://www.googleapis.com/auth/gmail.compose` (Creazione Bozze Email)
  - `https://www.googleapis.com/auth/spreadsheets` (Lettura/Scrittura Fogli Google)
  - `https://www.googleapis.com/auth/drive.readonly` (Lettura Documenti Drive)

---

### 5. Verifica dei Vincoli di Compilazione & Sicurezza (§3 e §5 AGENTS.md)

- [x] Eseguire `yarn typecheck` per verificare 0 errori di TypeScript.
- [x] Eseguire `yarn lint` per verificare 0 errori/warning su oxlint e oxfmt.
- [x] Verificare che nessuna credenziale PII venga esposta in chiaro nei log.

---

## 📌 Esito Atteso

L'utente ha ora un'interfaccia **chiara, guidata ed intuitiva** per collegare i propri file reali ed il proprio account Google, eliminando ogni incertezza o frase generica dell'IA.
