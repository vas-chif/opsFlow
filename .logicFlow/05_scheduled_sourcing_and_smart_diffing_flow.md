# 🏛️ OpsFlow — Architectural Flow 05: Scheduled Sourcing, Dual-Key Smart Diffing & Sheet Auto-Styling

> **Componente:** Schedulazione Ricerche Ricorrenti, Deduplicazione Preventiva a Doppia Chiave (URL + Nome) e Auto-Styling Fogli Google  
> **Tecnologie:** Firebase Cloud Functions Gen 2 (`onSchedule`), Google Sheets API v4 (`spreadsheets.batchUpdate`), Genkit, Gemini 1.5 Flash, Cloud Firestore  
> **Standard:** Zero Duplicate Guarantee (Cross-Platform), GDPR Art. 14 (+30d auto-notice), Design System Elite, Multi-Tenant Workspace Fenced  
> **Stato Documento:** Definitivo — Principal Architecture Approved

---

## 📌 1. Panoramica del Flusso di Sourcing Programmato

Il flusso di **Scheduled Sourcing & Smart Diffing** consente agli utenti di OpsFlow di automatizzare il monitoraggio periodico di lead, candidati e partner commerciali nel tempo (es. ogni 24 ore alle 04:00 o settimanalmente), interrompendosi tassativamente al raggiungimento della data di scadenza prestabilita (es. 30/12/2026).

Il processo si distingue per l'assoluta efficienza algoritmica: prima di qualsiasi elaborazione AI o scrittura, la Cloud Function **legge il file target esistente**, memorizza in memoria sia gli **URL univoci** sia i **Nomi e Cognomi normalizzati**, e **scarta preventivamente i duplicati cross-piattaforma** (es. stesso professionista trovato una volta su LinkedIn e una volta su Malt), azzerando lo spreco di token e prevenendo contatti ripetuti.

```mermaid
graph TD
    A[Cloud Scheduler Dispatcher: onSchedule 60 min] -->|1. Query Firestore| B{Cerca Job Attivi}
    B -->|status == active & now <= endDate| C[Worker Esecutore]
    B -->|now > endDate| D[Imposta status = completed & Notifica]

    C -->|2. Workspace OAuth Token| E[Google Sheets API: Leggi File Esistente]
    E -->|3. Estrazione Colonne Chiave| F[Set existingUrls + Set existingNames]

    C -->|4. Esegui Ricerca Web| G[Multi-Provider Search Tool]
    G -->|5. Candidati Grezzi Trovati| H{Smart Diffing a Doppia Chiave}

    H -->|URL Già Presente OPPURE Stesso Nome/Cognome| I[Scarta Duplicato: 0 Token Spreco]
    H -->|Nuovo Profilo Reale Rilevato| L[Gemini Flash: Scoring & GDPR Date]

    L -->|6. Scrittura & Re-ranking| M{Modalità Aggiornamento}
    M -->|append_new| N[values.append in coda dalla prima riga libera]
    M -->|re_rank_all| O[Unisci, Riordina per Match Score e Riscrivi]

    N --> P[spreadsheets.batchUpdate: Styling Professionale]
    O --> P

    P --> Q[Scrivi Log Esecuzione & Messaggio in Chat Workspace]
```

---

## ⛓️ 2. Sequence Diagram: Ciclo Completo di Esecuzione & Diffing

```mermaid
sequenceDiagram
    autonumber
    participant Sched as Cloud Scheduler (GCP)
    participant Disp as Dispatcher Cloud Function
    participant DB as Cloud Firestore
    participant OAuth as googleOAuthHandler.ts
    participant Sheets as Google Sheets API v4
    participant Search as Web Search Engine (Brave/Tavily)
    participant AI as Gemini 1.5 Flash
    participant Chat as Task Chat Window (UI)

    Sched->>Disp: Trigger onSchedule("every 60 minutes")
    Disp->>DB: Query scheduledJobs (status=='active')

    loop Per ogni Job Programmato Valido
        alt now() > endDate
            Disp->>DB: Update job: { status: 'completed' }
            Disp->>Chat: Notifica "Scadenza raggiunta: monitoraggio terminato"
        else Ora Attuale Corrisponde alla Finestra di Lancio
            Disp->>OAuth: getValidOAuth2Client(tenantId, workspaceId)
            OAuth-->>Disp: Authenticated OAuth2Client

            Note over Disp,Sheets: Fase 1: Lettura Preventiva & Estrazione Chiavi
            Disp->>Sheets: spreadsheets.values.get(spreadsheetId, range)
            Sheets-->>Disp: Matrice Righe Esistenti (2D Array)
            Disp->>Disp: existingUrls = new Set(normalizeUrl(row[urlCol]))
            Disp->>Disp: existingNames = new Set(normalizeName(row[nameCol]))

            Note over Disp,Search: Fase 2: Ricerca Web
            Disp->>Search: searchWebAndPlatformsTool(task.prompt)
            Search-->>Disp: Array Risultati Web Grezzi

            Note over Disp: Fase 3: Smart Diffing a Doppia Chiave
            Disp->>Disp: newCandidates = results.filter(r => !existingUrls.has(r.url) && !existingNames.has(r.name))

            alt newCandidates.length == 0
                Disp->>DB: Log esecuzione: "0 novità trovate, skip scrittura"
            else newCandidates.length > 0
                Note over Disp,AI: Fase 4: Analisi & Match Scoring AI
                Disp->>AI: Valuta solo nuovi candidati + calcola Data GDPR (+30d)
                AI-->>Disp: Candidati Strutturati (ID, Ruolo, Score, Competenze)

                Note over Disp,Sheets: Fase 5: Scrittura Non-Distruttiva
                alt updateMode == 'append_new'
                    Disp->>Sheets: spreadsheets.values.append(newRows, range: prima riga vuota)
                else updateMode == 're_rank_all'
                    Disp->>Disp: Merge righe vecchie + nuove, sort per Match Score DESC (preserva note utente)
                    Disp->>Sheets: spreadsheets.values.update(allSortedRows)
                end

                Note over Disp,Sheets: Fase 6: Auto-Styling Professionale
                Disp->>Sheets: spreadsheets.batchUpdate(freezeHeader, darkHeaderBg, wrapText, colWidths)

                Disp->>DB: Salva Risultati in resultsHistory & auditLog
                Disp->>Chat: Scrivi messaggio: "🤖 Monitoraggio: +N nuovi candidati inseriti"
            end
        end
    end
```

---

## 🎨 3. Flusso Dettagliato di Auto-Styling Google Sheets (`spreadsheets.batchUpdate`)

Quando OpsFlow salva i candidati su Google Sheets, applica una trasformazione visiva coordinata per eguagliare la chiarezza della UI:

```mermaid
graph LR
    A[Dati Grezzi Inseriti in Coda] --> B[Chiamata spreadsheets.batchUpdate]

    subgraph Direttive Grafiche Elite
        B --> C[Freeze Header: frozenRowCount: 1]
        B --> D[Header Theme: Sfondo #1E293B, Testo Bianco Bold, Middle]
        B --> E[Global Text Wrap: wrapStrategy WRAP]
        B --> F[Dimensionamento Colonne: Pixel Size Specifico]
        B --> G[Allineamento: Centro per ID/Date/Score, Sinistra per Testi]
    end

    C --> H[Foglio Google Formattato & Leggibile al 100%]
    D --> H
    E --> H
    F --> H
    G --> H
```

### Tabella delle Dimensioni & Allineamenti Colonne:

| Indice | Intestazione Colonna          | Larghezza (px) | Allineamento Orizzontale |  Wrap  |
| :----: | :---------------------------- | :------------: | :----------------------: | :----: |
| **0**  | `ID Candidato`                |    `120 px`    |         `CENTER`         |   No   |
| **1**  | `Nome e Cognome`              |    `160 px`    |          `LEFT`          |   Sì   |
| **2**  | `Ruolo / Specializzazione`    |    `220 px`    |          `LEFT`          |   Sì   |
| **3**  | `Match Score (%)`             |    `110 px`    |         `CENTER`         |   No   |
| **4**  | `Competenze Combacianti`      |    `320 px`    |          `LEFT`          | `WRAP` |
| **5**  | `Gap & Criticità Riscontrate` |    `320 px`    |          `LEFT`          | `WRAP` |
| **6**  | `Data Limite GDPR Art. 14`    |    `130 px`    |         `CENTER`         |   No   |
| **7**  | `Fonte / Profilo Pubblico`    |    `220 px`    |          `LEFT`          |   No   |
| **8**  | `Note Screening & Contatto`   |    `380 px`    |          `LEFT`          | `WRAP` |

---

## 🛡️ 4. Gestione Errori, Resilienza & Privacy (GDPR Art. 14 / Art. 32)

1. **Deduplicazione Cross-Piattaforma:**
   Il controllo verifica sia `normalizeUrl(url)` sia `normalizeName(name)`. Se una persona compare con profili diversi su LinkedIn e Malt, o se la query string cambia, il nome minuscolo e pulito impedisce la re-iscrizione duplicata.
2. **Append Non-Sovrascrivente:**
   In modalità `append_new`, la scrittura inizia sempre dalla prima riga libera disponibile (`A{lastRow + 1}`), lasciando intatte tutte le righe precedentemente approvate e le note manuali.
3. **Gestione Token Scaduto:**
   Se l'operazione su Sheets restituisce `HTTP 401 Unauthorized`, il worker tenta il rinnovo tramite `refreshAccessToken()`. Se fallisce, il job passa in `paused` con errore `oauth_revoked` e viene emesso un avviso in chat.
4. **GDPR Art. 14 Automatic Deadline:**
   Per ogni nuovo candidato reperito tramite fonti pubbliche, il sistema valorizza automaticamente la data limite calcolata a `+30 giorni` dalla data odierna.
