# 📋 Step 12 — Piano Operativo ed Architetturale: Search Tool Hardening, GCP Cost Governance & Working Memory UI

> **Progetto:** OpsFlow SaaS Platform  
> **Ruolo Agentico:** Senior Autonomous Full-Stack AI Engineer & Agent Specialist  
> **Data:** 30 Agosto 2026  
> **Stato:** 🟡 IN ATTESA DI APPROVAZIONE UTENTE (Nessuna modifica a codice di produzione prima del consenso)  
> **Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §3 (Sicurezza, Privacy & GDPR), §4 (Convenzioni Vue 3 & Quasar), §5 (Ottimizzazione Costi Cloud < €1.00/mese per 1.000 utenti), §14 (Orchestrazione Agenti IA Genkit & Gemini)  
> **Skills attivi:** `SKILL/ai-engineer`, `SKILL/prompt-engineer`, `SKILL/senior-architect`, `SKILL/senior-jurist`, `SKILL/senior-security-expert`, `SKILL/senior-qa-engineer`, `SKILL/senior-business-analyst`

---

## 🎯 Obiettivi dell'Intervento

1. **Zero-Crash Search Boundary (`webSearch.ts`):** Eliminare gli errori HTTP 500 ed i blocchi HTTP 403 tramite l'architettura **Multi-Provider Chaining a costo zero (3.000+ query/mese senza carta di credito)**: Tavily AI ➔ Exa.ai ➔ Jina Search API ➔ Safe Empty Result, con timeout rigido a 6s via `AbortController`.
2. **GCP Cost Governance & Tuning (`index.ts`):** Ridurre la memoria a `512MiB`, abbassare il timeout a `60s`, impostare `concurrency: 10` (anti-OOM), allineare la region su `europe-west1` ed attivare la Retention Policy su **Artifact Registry** a 7 giorni (target spesa < €1.00/mese per 1.000 utenti).
3. **Compliance GDPR Art. 14:** Generare automaticamente il timestamp di scadenza dell'informativa privacy (`art14NoticeDueBy` a +30 giorni) per tutti i contatti professionali estratti sul web ed imporre la crittografia client-side AES-256-GCM.
4. **Memoria Utente Intuitiva (UI-Friendly Rolling Summary):** Integrare un meccanismo di memoria di lavoro riassuntiva (_Rolling Summary / Task Key Points_) visualizzato nell'interfaccia Quasar tramite la scheda grafica **"Punti Chiave del Task"** (`TaskKeyPointsCard.vue`), escludendo log tecnici e JSON grezzo.

---

## 🔍 1. Stato dell'Arte & Diagnosi Chirurgica

### A. Diagnosi Crash HTTP 500 su Ricerca Web

- **Causa Radice:** Scraping diretto di HTML da motori di ricerca o proxy web instabili (es. DuckDuckGo HTML) senza gestione delle eccezioni di rete. Quando il server target rispondeva con `HTTP 403 Forbidden` o andava in timeout, la Cloud Function Genkit lanciava un'eccezione non catturata, provocando un crash globale con codice `HTTP 500 Internal Server Error`.
- **Soluzione:** Architettura Multi-Provider Chaining con wrapping di ogni chiamata in un blocco di cattura rigido. NESSUNA eccezione risale al runtime Genkit; in caso di fallimento totale si restituisce un payload sicuro `{ success: false, results: [] }`.

### B. Diagnosi Anomalia di Spesa GCP (€ 0.42 su pochi prompt)

- **Causa Radice:**
  1. **Allocazione RAM/CPU Eccessiva:** Allocazione di `1GiB` di RAM e `300s` di timeout per la Cloud Function `chatWithAgent`. Le richieste bloccate in idle consumavano risorse fatturate.
  2. **Accumulo Immagini Docker:** Ogni deploy generava un container Docker su Artifact Registry (~200MB) senza regole di auto-cancellazione.
  3. **Concurrency sbilanciata:** Concurrency elevata a 80 su `512MiB` rischiava Out-Of-Memory (OOM) su parsing Markdown complessi.
- **Soluzione:** `memory: 512MiB`, `timeoutSeconds: 60`, `concurrency: 10`, `region: europe-west1`, `minInstances: 0` e Retention Policy su Artifact Registry `--days 7`.

### C. Diagnosi Gestione Memoria Conversazionale & UI

- **Causa Radice:** La chat utilizzava una Sliding Window priva di un aggregatore visivo dei punti chiave della conversazione per l'utente umano. L'utente non aveva una visione d'insieme dei requisiti e dei lead scoperti senza rileggere l'intera chat.
- **Soluzione:** Introduzione di una scheda visiva Quasar `TaskKeyPointsCard.vue` alimentata dallo store Pinia `taskStore` / `taskChatStore` che rende reattivamente i punti chiave e le azioni operative estratte dall'Agente.

---

## 📋 Checklist Chirurgica degli Interventi

### 🟢 Fase 1 — Backend & Hardening Tool Calling (`webSearch.ts`)

- [ ] **1.1 Schemi Zod Rigidi:** Verificare gli schemi Zod `WebSearchQuerySchema`, `LeadSynthesisSchema`, `JinaReaderSchema` ed il tipo di output per il tool di ricerca.
- [ ] **1.2 Campo GDPR Art. 14:** Includere il campo `art14NoticeDueBy` (stringa ISO a +30 giorni) nel payload di output di `searchWebAndPlatformsTool`.
- [ ] **1.3 Helper Hard-Timeout:** Implementare `fetchWithHardTimeout(url, options, timeoutMs)` con `AbortController` (timeout 6.000 ms).
- [ ] **1.4 Provider 1 (Tavily AI):** Implementare `searchTavily(query, apiKey)` su `https://api.tavily.com/search` (1.000 req/mo gratis, zero carta).
- [ ] **1.5 Provider 2 (Exa.ai):** Implementare `searchExa(query, apiKey)` su `https://api.exa.ai/search` (~1.400 req/mo gratis, zero carta).
- [ ] **1.6 Provider 3 (Jina Search):** Implementare `searchJina(query)` su `https://s.jina.ai/{query}` con troncamento rigido a 3.000 caratteri (< 800 token).
- [ ] **1.7 Rollover Sequenziale:** Configurare il fallback: `Tavily` ➔ `Exa.ai` ➔ `Jina` ➔ `Safe Empty Result`.
- [ ] **1.8 JSDoc Compliance:** Verificare la presenza di JSDoc completo con `@param` e `@return` (singolare) per rispettare la regola `valid-jsdoc`.

---

### 🟢 Fase 2 — Cost Governance & Configurazione GCP (`index.ts` & Artifact Registry)

- [ ] **2.1 Opt-in Secrets:** Configurare `defineSecret("TAVILY_API_KEY")` ed `defineSecret("EXA_API_KEY")` in `opsflow-functions/src/index.ts`.
- [ ] **2.2 Opzioni Globali Cloud Functions:** Impostare `setGlobalOptions({ region: "europe-west1", maxInstances: 10 })` per azzerare costi di egress cross-region.
- [ ] **2.3 Parameter Tuning `chatWithAgent`:** Configurare:
  - `region: "europe-west1"`
  - `memory: "512MiB"` (risparmio 50% RAM)
  - `timeoutSeconds: 60` (azzeramento idle time)
  - `minInstances: 0` (scale-to-zero)
  - `maxInstances: 10` (hard-cap costi)
  - `concurrency: 10` (protezione anti-OOM con Genkit)
- [ ] **2.4 Secret Manager & .env:** Inserire le chiavi in `opsflow-functions/.env` ed aggiornare `.env.example`.
- [ ] **2.5 Retention Policy Artifact Registry:** Documentare ed attivare il comando CLI:
  ```bash
  firebase functions:artifacts:setpolicy --location europe-west1 --days 7
  ```

---

### 🟢 Fase 3 — Gestione Memoria & Componente Visivo Quasar (UI-Friendly Key Points)

- [ ] **3.1 Pinia Store Integration:** Estendere `taskChatStore.ts` o `taskStore.ts` per memorizzare l'array dei punti chiave reattivi (`keyPoints: Array<{ id: string; title: string; category: string; icon: string; detail: string } >`).
- [ ] **3.2 Componente Quasar (`TaskKeyPointsCard.vue`):** Creare il componente UI in `src/components/TaskKeyPointsCard.vue` con estetica _Elite_ (Glassmorphism, colori Royal Navy `#0a2342` ed accenti Gold `#c5a065`).
- [ ] **3.3 Integrazione nella Chat Window (`TaskChatWindow.vue`):** Inserire la scheda dei punti chiave nella parte superiore o espandibile del pannello chat per una visualizzazione chiara dell'avanzamento.
- [ ] **3.4 Rolling Summary Parsing:** Estrarre ed aggiornare i punti chiave dai messaggi dell'Agente senza mostrare JSON grezzo all'utente.

---

### 🟢 Fase 4 — Compliance GDPR & Sicurezza

- [ ] **4.1 Tracciamento GDPR Art. 14:** Assicurarsi che ogni lead o contatto estratto contenga la data limite per l'invio dell'informativa privacy (`art14NoticeDueBy` +30gg).
- [ ] **4.2 Client-Side Encryption:** Verificare che i dati PII dei lead vengano cifrati client-side con AES-256-GCM prima della scrittura su Firestore (GDPR Art. 32).
- [ ] **4.3 Audit Trail:** Generare il log di audit per l'estrazione e la creazione di lead nel DB.

---

### 🟢 Fase 5 — Verifiche, Build & Deploy

- [ ] **5.1 Build Backend:** Eseguire `cd opsflow-functions && npm run build` (0 errori TypeScript).
- [ ] **5.2 Quality Checks:** Eseguire `yarn lint:check` (0 warning/errori `oxlint`) e `yarn typecheck` (0 errori `vue-tsc`).
- [ ] **5.3 Git Commit:** Effettuare il commit con Conventional Commits:  
      `feat(ai): implement step12 search tool hardening gcp cost governance and key points ui`.
- [ ] **5.4 Deploy Mirato Firebase:**
  ```bash
  cd /home/chif-vas/projects/opsflow && npx firebase-tools deploy --only functions:chatWithAgent,hosting
  ```
- [ ] **5.5 Verification Testing:** Inviare il Prompt 2 ("Cerca Strutture/Medici VersiliaCare...") e verificare la risposta a schermo (Status 200 OK, < 2s, scheda Punti Chiave aggiornata).

---

## 🎯 Esito Atteso & Metmetriche di Successo

1. **Resilienza Search Tool:** **0% Crash HTTP 500** e **0% Blocchi HTTP 403**.
2. **Costo GCP:** **< €1.00 / mese per 1.000 utenti attivi**.
3. **Esperienza Utente UI:** Scheda visiva "Punti Chiave del Task" chiara ed intuitiva in Quasar.
4. **GDPR Compliance:** Tracciamento Art. 14 ed AES-256-GCM client-side attivi al 100%.
