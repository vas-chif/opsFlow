# 📋 STEP 19 — Scheduled Sourcing & Smart Diffing Engine + Auto-Styling Professionale Google Sheets

> **Status:** 🟢 IMPLEMENTATO AL 100% — Tutti i task completati ✅ (Branch: `dev`, 2026-09-10)  
> **Autore:** Vasile Chifeac & AI Senior Architect, AI Engineer, Security Expert & Senior Jurist  
> **Data:** 2026-09-10  
> **Progetto:** OpsFlow SaaS (Quasar 2, Vue 3, Pinia, Firebase Cloud Functions Gen 2, Cloud Scheduler, Cloud Firestore, Google Sheets API v4, OAuth 2.0 Scoped)  
> **Riferimenti Normativi & Architetturali:** [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md) (§0, §1.9, §3, §4, §5, §6, §9, §10, §14), [SECURITY.md](file:///home/chif-vas/projects/opsflow/SECURITY.md), [SKILL/senior-architect](file:///home/chif-vas/projects/opsflow/SKILL/senior-architect/SKILL.md), [SKILL/ai-engineer](file:///home/chif-vas/projects/opsflow/SKILL/ai-engineer/SKILL.md), [SKILL/senior-security-expert](file:///home/chif-vas/projects/opsflow/SKILL/senior-security-expert/SKILL.md), [SKILL/senior-jurist](file:///home/chif-vas/projects/opsflow/SKILL/senior-jurist/SKILL.md), [.logicFlow/05_scheduled_sourcing_and_smart_diffing_flow.md](file:///home/chif-vas/projects/opsflow/.logicFlow/05_scheduled_sourcing_and_smart_diffing_flow.md)

---

## 🎯 1. Visione del Sistema & Valutazione di Fattibilità (Feasibility Assessment)

### 1.1 Il Problema Operativo Riscontrato

Attualmente in OpsFlow:

1. **Ricerche Manuali "Una Tantum":** L'AgenteRicerca esegue lo screening dei candidati/lead solo su richiesta esplicita dell'operatore in chat. L'utente non ha la possibilità di impostare un monitoraggio ricorrente continuo (es. ogni 24 ore alle 04:00 del mattino o settimanalmente fino al 30/12/2026).
2. **Rischio Duplicati Cross-Piattaforma:** Se lo stesso candidato viene intercettato prima su LinkedIn e successivamente su Malt, Freelancermap o dal sito web aziendale, gli URL delle fonti sono completamente diversi, ma la persona fisica è identica. Un controllo basato unicamente sull'URL farebbe passare il duplicato.
3. **Rischio Sovrascrittura Dati:** In assenza di una modalità di append rigorosa che identifichi l'ultima riga valorizzata, una nuova esecuzione rischia di sovrascrivere intestazioni o righe precedentemente salvate e annotate.
4. **Google Sheets non Formattato (Grezzo & Compresso):** L'attuale endpoint `spreadsheets.values.append` scrive esclusivamente il testo piano senza alcuna regola estetica: le celle lunghe invadono quelle adiacenti, l'intestazione non è bloccata né evidenziata e le colonne non hanno larghezze adeguate, risultando poco leggibile rispetto alla visualizzazione "Elite" presente nella UI di OpsFlow.

### 1.2 Verdetto di Fattibilità: 🟢 FATTIBILE AL 100%

L'implementazione è pienamente fattibile, sicura ed estremamente efficiente:

- **Nessuna dipendenza esterna vietata:** Utilizza esclusivamente l'SDK ufficiale `googleapis` già integrato in `opsflow-functions` e Firebase Cloud Functions Gen 2 (`onSchedule`).
- **Zero Rischio Session Swap:** Si poggia saldamente sull'architettura dello **Step 18** (token OAuth delegati e salvati a livello di Workspace in `integrations/google`, senza intaccare l'utente Master SaaS).
- **Costi Cloud < € 0.05/mese:** Sfrutta un unico **Cloud Scheduler Dispatcher centralizzato** (es. ogni 60 minuti), evitando la creazione di centinaia di trigger GCP individuali e mantenendo i costi totali ben al di sotto della soglia di € 1,00/mese per 1.000 utenti (§5 `AGENTS.md`).
- **Zero Spreco di Token LLM con Smart Diffing a Doppia Chiave:** La deduplicazione avviene **a livello algoritmico preventivo (Set di URL normalizzati E Set di Nomi/Cognomi normalizzati in minuscolo)** prima della scrittura, senza consumare token di Gemini per analizzare o riscrivere profili già noti.

---

## 🧠 2. Analisi Multi-Ruolo & Peer Review (5 Livelli di Revisione §9)

### 🏗️ 2.1 Senior Architect Review (opsflow-senior-architect)

- **Config-Fenced Path Strict Enforcement:** I job programmati risiedono rigorosamente nella sotto-collezione isolata per tenant e workspace:
  `tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId}`
- **Pattern Dispatcher vs Worker:** Non creare un cron GCP per ciascun task utente. Implementare un'unica Cloud Function `processScheduledSourcingDispatcher` che si attiva ogni 60 minuti (o intervallo prestabilito), interroga i job con `status == 'active'` e `endDate >= now()`, valuta la finestra oraria (`Europe/Rome`) ed esegue l'aggiornamento.
- **Locking Atomico & Idempotenza:** Aggiungere un campo `isLocked: boolean` e `lastRunAt: string` per prevenire doppie esecuzioni concorrenti causate da retry automatici del cloud scheduler.
- **Append Rigoroso:** In modalità `append_new`, il backend calcola l'offset della prima riga libera (`lastRowIndex + 1`) e accoda i dati senza toccare o rimpiazzare righe pregresse.

### 💼 2.2 Senior Business Analyst & ROI (opsflow-senior-business-analyst)

- **Automazione Notturna (Valore per Recruiter e Headhunter):** L'utente imposta il task alle 18:00; alle 04:00 del mattino il sistema esegue la ricerca, elimina i duplicati cross-piattaforma e formatta il foglio. Alle 08:30 l'utente apre Google Sheets e trova solo le novità già ordinate per Match Score.
- **Risparmio Temporale:** Stima di ~45 minuti/giorno risparmiati per ogni workspace HR o commerciale.
- **Prevenzione Imbarazzo Commerciale:** La deduplicazione preventiva a doppia chiave impedisce contatti doppi o sovrapposti allo stesso candidato anche se reperito da piattaforme differenti.

### 🛡️ 2.3 Senior Security Expert & Hacker (opsflow-senior-security-expert)

- **Deduplicazione a Doppia Chiave (Dual-Key Deduplication):**
  1. `profileUrl`: URL del profilo normalizzato (rimozione query string `?trk=...`, `?utm_...` e trailing slash).
  2. `candidateName`: Stringa _"Nome e Cognome"_ normalizzata in lowercase, rimozione accenti e trimmed (es. `pino villa` == `Pino Villa`).
  - Se il candidato estratto corrisponde per URL **oppure** per Nome e Cognome a una riga già presente, viene scartato immediatamente.
- **Token Freshness & Auto-Refresh:** Prima di eseguire `spreadsheets.values.get` e `spreadsheets.batchUpdate`, il worker invoca `getValidOAuth2Client(tenantId, workspaceId)` da `googleOAuthHandler.ts`, garantendo che l'access token scaduto venga rinnovato tramite refresh token senza fallimenti.
- **Atomic Audit Trail (GDPR Art. 30):** Ogni esecuzione batch scrive un log dettagliato in `tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId}/executionLogs/{logId}` registrando: candidati trovati, duplicati scartati, righe scritte e timestamp.

### ⚖️ 2.4 Senior Jurist & Privacy (opsflow-senior-jurist)

- **GDPR Art. 14 (Informativa Entro 30 Giorni):** L'AgenteRicerca raccoglie dati da fonti pubbliche. Ogni nuovo profilo inserito deve riportare calcolata la data limite di compliance (es. `today + 30 giorni`).
- **Data Retention & Auto-Termination:** La presenza della data di scadenza obbligatoria (`endDate`, es. 30/12/2026) garantisce che i processi di web crawling non rimangano attivi indefinitamente all'insaputa dell'utente, rispettando il principio di limitazione della conservazione e delle finalità (GDPR Art. 5).
- **Protezione Note Manuali:** L'aggiornamento programmatico non deve MAI sovrascrivere o eliminare colonne dove l'operatore ha inserito note manuali (es. "Contattato il 12/09", "Feedback negativo al colloquio").

### 🤖 2.5 AI Engineer Review (opsflow-ai-engineer)

- **Token Governance:** Non inviare il foglio intero all'LLM. La Cloud Function scarica le righe del foglio, estrae programmaticamente i due Set (`existingUrls` e `existingNames`), lancia la ricerca web, deduplica a costo zero prima di Gemini, e invia al modello solo i nuovi candidati grezzi da validare e strutturare.
- **Lock-in su Gemini Flash:** Mantenere il modello `gemini-1.5-flash` per la trasformazione JSON, con schema Zod stringente per estrarre con certezza matematica: ID, Nome, Ruolo, Match Score (0-100), Competenze, Gap, Data GDPR e URL.

---

## 🏛️ 3. Architettura Tecnica & Modelli Dati

### 3.1 Modello Dati Firestore (`ScheduledSourcingJob`)

Da inserire in `src/types/models.ts`:

```typescript
/**
 * Frequency cadence for automated recurring sourcing jobs.
 */
export type ScheduledJobFrequency = "daily_04am" | "weekly_mon_04am" | "custom_cron";

/**
 * Update behavior when integrating newly discovered candidates.
 */
export type SheetUpdateMode = "append_new" | "re_rank_all";

/**
 * Operational definition of a Scheduled Sourcing Job.
 * Path: tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId}
 */
export interface ScheduledSourcingJob {
  id: string;
  tenantId: string;
  workspaceId: string;
  taskId: string;
  title: string;
  status: "active" | "paused" | "completed";

  // Frequency & Lifecycle
  frequency: ScheduledJobFrequency;
  cronExpression: string; // e.g. "0 4 * * *" (daily at 04:00) or "0 4 * * 1" (Mondays)
  timeZone: string; // e.g. "Europe/Rome"
  startDate: string; // ISO 8601 string
  endDate: string; // ISO 8601 string (mandatory limit, e.g. "2026-12-30T23:59:59.999Z")

  // Target Resource & Dual-Key Deduplication
  targetResource: {
    type: "google_sheet";
    spreadsheetId: string;
    sheetName: string;
    dedupUrlColumnIndex: number; // Index of Profile URL column (e.g. 7 for "Fonte / Profilo Pubblico")
    dedupNameColumnIndex: number; // Index of Full Name column (e.g. 1 for "Nome e Cognome")
    dedupColumnHeader: string; // e.g. "Fonte / Profilo Pubblico"
  };

  // Search & Sorting Configuration
  searchConfig: {
    promptTemplate: string;
    searchQuery: string;
    updateMode: SheetUpdateMode;
    autoStyleSheet: boolean; // Apply Elite formatting via batchUpdate
  };

  // Runtime State & Telemetry
  isLocked?: boolean | undefined;
  lastRunAt?: string | undefined;
  nextRunAt?: string | undefined;
  resultsHistory?:
    | Array<{
        executedAt: string;
        newCandidatesFound: number;
        totalDuplicatesSkipped: number;
        status: "success" | "warning" | "error";
        errorMessage?: string;
      }>
    | undefined;
}
```

---

## 🎨 4. Auto-Styling & Layout Professionale Google Sheets (`spreadsheets.batchUpdate`)

L'attuale chiamata `values.append` scrive unicamente testo non formattato. La specifica di styling trasforma il foglio in una tabella coordinata al design "Elite" di OpsFlow:

### 4.1 Specifiche Visive di Stile

1. **Riga Intestazione (Header Row 1):**
   - Sfondo Dark Slate `#1E293B` (RGB: `red: 0.118, green: 0.161, blue: 0.231`).
   - Testo Bianco (`red: 1, green: 1, blue: 1`), Grassetto (`bold: true`), Dimensione 10pt.
   - Allineamento Verticale: `MIDDLE`.
2. **Blocco Intestazione:**
   - `frozenRowCount: 1` per mantenere fissa l'intestazione durante lo scroll.
3. **Andata a Capo Automatica (Wrap Strategy):**
   - `wrapStrategy: "WRAP"` applicata a tutte le celle dati per evitare tagli di testo.
4. **Dimensionamento Colonne (Pixel Widths):**
   - Colonna A (ID Candidato): `120 px`
   - Colonna B (Nome e Cognome): `160 px`
   - Colonna C (Ruolo / Specializzazione): `220 px`
   - Colonna D (Match Score %): `110 px`
   - Colonna E (Competenze Combacianti): `320 px`
   - Colonna F (Gap & Criticità): `320 px`
   - Colonna G (Data Limite GDPR Art. 14): `130 px`
   - Colonna H (Fonte / Profilo Pubblico): `220 px`
   - Colonna I (Note Screening & Contatto): `380 px`
5. **Allineamento Contenuti:**
   - Centrato (`CENTER`): Colonna A (ID), Colonna D (Match Score), Colonna G (Data GDPR).
   - Sinistra (`LEFT`): Tutte le colonne testuali e link.

### 4.2 Payload BatchUpdate di Esempio (`opsflow-functions`)

```typescript
const batchRequests = [
  // 1. Freeze Riga 1
  {
    updateSheetProperties: {
      properties: {
        sheetId: targetSheetIdNumber,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  },
  // 2. Styling Riga Intestazione (Sfondo #1E293B, testo bianco bold)
  {
    repeatCell: {
      range: {
        sheetId: targetSheetIdNumber,
        startRowIndex: 0,
        endRowIndex: 1,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
          textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
    },
  },
  // 3. Wrap Strategy Globale
  {
    repeatCell: {
      range: {
        sheetId: targetSheetIdNumber,
        startRowIndex: 1,
      },
      cell: {
        userEnteredFormat: {
          wrapStrategy: "WRAP",
          verticalAlignment: "TOP",
        },
      },
      fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
    },
  },
  // 4. Larghezze Colonne
  ...columnWidths.map((width, colIdx) => ({
    updateDimensionProperties: {
      range: {
        sheetId: targetSheetIdNumber,
        dimension: "COLUMNS",
        startIndex: colIdx,
        endIndex: colIdx + 1,
      },
      properties: { pixelSize: width },
      fields: "pixelSize",
    },
  })),
];
```

---

## ⚡ 5. Regola Operativa per il Prompt del Task (Applicabile SUBITO per Ricerche Manuali)

Mentre si procede con l'implementazione del Dispatcher automatico notturno, è possibile applicare **subito** la deduplicazione e l'integrazione non distruttiva inserendo questo blocco vincolante nella sezione `🛡️ VINCOLI OPERATIVI E COMPLIANCE` del prompt del Task o nell'Attitude del Workspace:

```markdown
- REGOLA DI INTEGRAZIONE E ANTI-SOVRASCRITTURA GOOGLE SHEETS:
  - PRIMA di predisporre la tabella per il Foglio Google, consulta i dati già salvati nel foglio target.
  - NON sovrascrivere l'intestazione o le righe esistenti: i nuovi dati devono essere predisposti per essere inseriti in coda (modalità append), continuando esattamente dalla prima riga successiva disponibile.
  - DEDUPLICAZIONE RIGIDA (NOME + COGNOME & URL): Se un candidato reperito corrisponde per "Nome e Cognome" (confronto normalizzato in minuscolo) o per URL a un profilo già censito nel foglio, NON DEVI SCRIVERLO. Scartalo ed escludilo dall'aggiornamento.
  - Inserisci esclusivamente i profili NUOVI non ancora presenti nel database.
```

Questo garantisce che anche le approvazioni manuali in chat (`ApprovalCard.vue`) scartino i profili già visti e aggiungano solo le novità in coda.

---

## 📋 6. Master Checklist di Implementazione (Fase per Fase)

### Fase 1: Modelli TypeScript & Contratti di Interfaccia

- [x] **1.1** Inserire in `src/types/models.ts` le interfacce `ScheduledJobFrequency`, `SheetUpdateMode`, `ScheduledSourcingJob` e i relativi contratti di audit.
- [x] **1.2** Verificare la conformità con `yarn typecheck` (zero errori).

### Fase 2: Regole di Sicurezza Firestore (`firestore.rules`)

- [x] **2.1** Aggiungere la regola di autorizzazione per la sotto-collezione `scheduledJobs`:
  ```firestore
  match /tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId} {
    allow read, write: if isActiveAndVerified() && belongsToTenant(tenantId);
  }
  ```
- [x] **2.2** Verificare la sicurezza con il controllo `firebase-security-rules-auditor`.

### Fase 3: Auto-Styling Post-Scrittura in Backend (`opsflow-functions`)

- [x] **3.1** Creare la funzione helper `applyProfessionalSheetStyling(sheets, spreadsheetId, sheetTitle)` in `opsflow-functions/src/tools/googleWorkspace.ts`.
- [x] **3.2** Integrare la chiamata `spreadsheets.batchUpdate` in `resolveApproval` in `opsflow-functions/src/index.ts` subito dopo `values.append`.
- [x] **3.3** Testare il rendering su un foglio Google reale e verificare freeze, colori, wrap e larghezza colonne.

### Fase 4: Cloud Function Dispatcher & Smart Diffing a Doppia Chiave (`opsflow-functions`)

- [x] **4.1** Implementare `processScheduledSourcingDispatcher` con trigger `onSchedule("every 60 minutes")`.
- [x] **4.2** Aggiungere la logica di lettura preventiva del foglio (`spreadsheets.values.get`), estraendo contemporaneamente:
  - `existingUrls = new Set<string>()`: URL del profilo normalizzati (rimozione tracking UTM e trailing slash).
  - `existingNames = new Set<string>()`: Stringa "Nome e Cognome" normalizzata (`normalizeName(row[1])`, minuscolo e trimmed).
- [x] **4.3** Implementare la normalizzazione bi-direzionale (URL e Nome/Cognome).
- [x] **4.4** Integrare la chiamata al tool di ricerca web con il prompt del task.
- [x] **4.5** Applicare la logica di diffing a doppia chiave:
  ```typescript
  const newCandidates = results.filter((r) => {
    const isUrlDuplicate = r.profileUrl && existingUrls.has(normalizeUrl(r.profileUrl));
    const isNameDuplicate = r.name && existingNames.has(normalizeName(r.name));
    return !isUrlDuplicate && !isNameDuplicate;
  });
  ```
- [x] **4.6** Implementare le due modalità di inserimento:
  - `append_new`: Continua rigorosamente dalla prima riga successiva disponibile senza toccare i dati precedenti o l'intestazione.
  - `re_rank_all`: Unisce esistenti e nuovi, ordina per Match Score decrescente e riscrive la tabella preservando le colonne di note manuali.
- [x] **4.7** Gestire la scadenza automatica: se `now() >= endDate`, imposta `status = 'completed'` ed emette la notifica finale.
- [x] **4.8** Scrivere il messaggio di riepilogo nella chat del workspace (es. _"🤖 Monitoraggio programmato completato: trovati 3 nuovi profili, 5 duplicati scartati (per URL o Nome)"_).

### Fase 5: Interfaccia Utente Quasar 2 (`ScheduleTaskModal.vue`)

- [x] **5.1** Creare il componente `src/components/ScheduleTaskModal.vue` conforme al Design System Elite:
  - Selettore frequenza rapido: _Giornaliero (04:00 AM)_, _Settimanale (Lunedì 04:00 AM)_, _Personalizzato_.
  - Input `q-date` per la data limite di fine validità (obbligatoria, default: es. 31/12 dell'anno corrente).
  - Selettore Google Sheet di destinazione (con badge ⭐ Master e indicazione colonna chiave).
  - Selezione modalità di integrazione (_Aggiungi in coda_ vs _Ricalcola graduatoria Match Score_).
- [x] **5.2** Integrare il pulsante di apertura `⏰ Pianifica Ricerca Ricorrente` nella testata della Task Chat Window (`TaskChatWindow.vue`) e nel `TaskSettingsModal.vue`.
- [x] **5.3** Visualizzare lo stato del job attivo con chip informativo e badge di stato (Verde = Attivo, Arancione = In Pausa, Grigio = Terminato per Scadenza).

### Fase 6: Aggiornamento Documentazione Flussi Architetturali

- [x] **6.1** Aggiornare il flusso formale `.logicFlow/05_scheduled_sourcing_and_smart_diffing_flow.md` con il diffing a doppia chiave.
- [x] **6.2** Aggiornare l'indice generale della documentazione (`masterChecklist.md`).
- [x] **6.3** Eseguire `yarn lint` e `yarn typecheck` per verificare l'integrità totale del progetto.
