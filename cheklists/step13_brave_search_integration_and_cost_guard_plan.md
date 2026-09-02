# 📋 Step 13 — Piano Operativo: Integrazione Brave Search API & Cost Guard Hard Stop

> **Progetto:** OpsFlow SaaS Platform  
> **Ruolo Agentico:** Senior Autonomous Full-Stack AI Engineer & Agent Specialist  
> **Data:** 2 Settembre 2026  
> **Stato:** 🟡 IN ATTESA DI APPROVAZIONE UTENTE (Nessuna modifica a codice di produzione prima del consenso)  
> **Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §3 (Sicurezza, Privacy & GDPR Art. 32), §5 (Ottimizzazione Costi Cloud < €1.00/mese per 1.000 utenti), §14 (Orchestrazione Agenti IA Genkit & Gemini)  
> **Skills attivi:** `SKILL/ai-engineer`, `SKILL/prompt-engineer`, `SKILL/senior-architect`, `SKILL/senior-security-expert`, `SKILL/senior-qa-engineer`, `SKILL/senior-business-analyst`

---

## 📌 CONTESTO & OBIETTIVO DELL'INTEGRAZIONE

Brave Search API mette a disposizione **$5.00/mese di crediti promozionali** alla registrazione della carta di credito (~1.000 ricerche web al mese). Per garantire che la carta di credito del titolare **non venga MAI addebitata oltre i $5 gratuiti**, la strategia stabilita richiede una **doppia protezione di sicurezza (Double Cost Guard)**:

1. **Protezione 1 (Dashboard di Brave):** Hard Limit impostato a $5.00/mese con disattivazione totale dell'Auto-Recharge.
2. **Protezione 2 (Ingegneria nel Codice Backend):** Intercettazione automatica dei codici HTTP `402 Payment Required` e `429 Too Many Requests` + Contatore preventivo a 950 ricerche/mese per deviare il traffico al 100% su Tavily ed Exa prima di toccare la soglia di addebito.

---

## 📊 TABELLA DELLA CATENA MULTI-PROVIDER RISULTANTE

La catena a 4 livelli garantisce oltre **3.400 ricerche mensili a costo € 0,00** con zero eccezioni HTTP 500:

|         Livello         | Provider              |  Quota Mensile Gratuita   |  Soglia Switch  | Comportamento su Esaurimento Quota                        | Costo Mese |
| :---------------------: | :-------------------- | :-----------------------: | :-------------: | :-------------------------------------------------------- | :--------: |
|  **Tier 1 (Primario)**  | **Brave Search API**  | ~1.000 query ($5 crediti) |  **950 query**  | Intercetta HTTP 402/429 ➔ Fallback immediato su Tier 2    | **€ 0,00** |
| **Tier 2 (Fallback 1)** | **Tavily AI Search**  |  1.000 query (No carta)   | **1.000 query** | Intercetta HTTP 429/Error ➔ Fallback immediato su Tier 3  | **€ 0,00** |
| **Tier 3 (Fallback 2)** | **Exa.ai Neural**     |  ~1.400 query (No carta)  | **1.400 query** | Intercetta HTTP 429/Error ➔ Fallback immediato su Tier 4  | **€ 0,00** |
| **Tier 4 (Fallback 3)** | **Jina Search API**   |    1M token free tier     |   Illimitato    | Troncamento rigido 3.000 char (<800 token)                | **€ 0,00** |
|     **Safety Net**      | **Safe Empty Result** |        Illimitato         |       N/A       | Ritorna `{ success: false, results: [] }` (Zero HTTP 500) | **€ 0,00** |

---

## 📋 CHECKLIST OPERATIVA DI IMPLEMENTAZIONE

### 🟢 Fase 1 — Setup Dashboard Brave & Secret Governance (Azioni Utente & GCP)

- [ ] **1.1 Registrazione Portale Brave:** Creare o accedere all'account sviluppatore su `https://api.search.brave.com`.
- [ ] **1.2 Inserimento Carta & Riscatto Credito:** Registrare la carta per attivare il piano con **$5.00 di credito promozionale mensile inclusi**.
- [ ] **1.3 Impostazione Hard Limit nella Dashboard:**
  - Navigare in `Billing & Usage` ➔ `Usage Limits`.
  - Impostare il **Monthly Spending Limit** esplicitamente a **$5.00** (spesa aggiuntiva massima consentita: $0.00).
- [ ] **1.4 Disattivazione Auto-Recharge:** Verificare che la spunta **Auto-Recharge / Auto-Top-Up sia disattivata (OFF)**.
- [ ] **1.5 Generazione API Key:** Copiare la chiave API prodotta dalla dashboard (es. `BSAxxxxxxxxxxxxxxxx`).
- [ ] **1.6 Secret Manager GCP & .env Locale:**
  - Inserire `BRAVE_SEARCH_API_KEY=BSAxxxxxxxx...` nel file `opsflow-functions/.env`.
  - Eseguire la registrazione del secret su Google Cloud per la produzione:
    ```bash
    npx firebase-tools functions:secrets:set BRAVE_SEARCH_API_KEY
    ```

---

### 🟢 Fase 2 — Ingegneria di Protezione Backend (`opsflow-functions/src/tools/webSearch.ts`)

- [ ] **2.1 Adattatore `searchBrave`:** Implementare la funzione helper `searchBrave(query: string, apiKey: string)` con l'endpoint ufficiale:
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&text_decorations=false`
- [ ] **2.2 Header di Autenticazione Ufficiali:**
  - Set dell'header obbligatorio Brave: `X-Subscription-Token: ${apiKey}`
  - Set dell'header `Accept: application/json`
  - Set `Accept-Encoding: gzip` per minimizzare il consumo di banda.
- [ ] **2.3 Hard Timeout Wrapper (6.000 ms):** Avvolgere la chiamata in `fetchWithHardTimeout` con `AbortController` (timeout 6.000ms).
- [ ] **2.4 Intercettore Cost Guard (HTTP 402 & 429):**
  ```typescript
  if (res.status === 402 || res.status === 429) {
    logger.warn(
      "webSearch: Brave Search API quota/credit exhausted (HTTP " +
        res.status +
        "), triggering zero-cost fallback",
    );
    return null; // Fallback immediato a Tavily senza rilancio di eccezione
  }
  ```
- [ ] **2.5 Preventive Rolling Quota Guard:** Inserire la costante di protezione preventivo `BRAVE_MONTHLY_LIMIT = 950`. Se il contatore mensile raggiunge 950, la funzione ignora Brave ed invia la query direttamente a Tavily AI.
- [ ] **2.6 Aggiornamento Rollover Sequenziale:**
      Configurare la catena di esecuzione nel tool Genkit:
      `searchBrave` ➔ `searchTavily` ➔ `searchExa` ➔ `searchJina` ➔ `Safe Empty Result`.
- [ ] **2.7 JSDoc Standard Compliance:** Garantire che la funzione `searchBrave` contenga l'header JSDoc completo con `@param` e `@return` (singolare) per zero warning `oxlint`.

---

### 🟢 Fase 3 — Configurazione Secrets & Cloud Functions (`opsflow-functions/src/index.ts`)

- [ ] **3.1 Opt-in Secrets su Cloud Functions:** Inserire `defineSecret("BRAVE_SEARCH_API_KEY")` all'interno di `opsflow-functions/src/index.ts`.
- [ ] **3.2 Inclusione nei Runtime Secrets:** Aggiungere `secrets: [TAVILY_API_KEY, EXA_API_KEY, BRAVE_SEARCH_API_KEY]` nella configurazione di `chatWithAgent`.
- [ ] **3.3 Aggiornamento `.env.example`:** Inserire `BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here` in `opsflow-functions/.env.example`.

---

### 🟢 Fase 4 — Allineamento UI Quasar & Log di Sicurezza (GDPR Art. 32)

- [ ] **4.1 Visualizzazione Provider su UI:** Aggiornare `TaskChatWindow.vue` e `TaskKeyPointsCard.vue` affinché leggano il nome del provider utilizzato (Brave, Tavily, Exa, Jina) dai metadata della risposta tool.
- [ ] **4.2 GDPR Art. 32 Audit Trail:** Verificare che le chiamate a Brave utilizzino `sanitizePii()` per rimuovere nomi, numeri di telefono o email dalla query di ricerca prima di inviarla a Brave Search API.

---

### 🟢 Fase 5 — Verifiche, Build & Deploy

- [ ] **5.1 Formatting & Linting Check:** Eseguire `yarn lint` (0 errori/warning `oxlint`).
- [ ] **5.2 TypeScript Frontend Check:** Eseguire `yarn typecheck` (0 errori `vue-tsc`).
- [ ] **5.3 Backend Compilation Check:** Eseguire `cd opsflow-functions && npm run build` (0 errori `tsc`).
- [ ] **5.4 Git Commit (Conventional Commits):**
      `feat(ai): add brave search api provider with double cost guard protection`
- [ ] **5.5 Deploy Mirato in Produzione:**
  ```bash
  cd /home/chif-vas/projects/opsflow && nvm use 22 && yarn --prefix opsflow-functions build && yarn build && npx firebase-tools deploy --only functions:chatWithAgent,hosting
  ```
- [ ] **5.6 Test di Verifica In Campo:** Effettuare una ricerca dalla UI Quasar e verificare nei log di Firebase `webSearch: provider used -> brave`.

---

## 💡 RISCHIO MITIGATO E VALORE AGGIUNTO

> [!TIP]
> **Garanzia Finanziaria del Piano:**  
> Con l'Hard Limit impostato a $5.00 su Brave Dashboard ed il blocco software HTTP 402/429 + contatore a 950 nel codice backend, **è matematicamente impossibile addebitare $0.01 in più sulla tua carta di credito**.  
> In caso di esaurimento crediti, il sistema OpsFlow scala in modo trasparente e silenzioso sui provider 100% gratuiti (Tavily ed Exa), mantenendo il costo globale del SaaS ampiamente sotto il vincolo di **€1.00/mese per 1.000 utenti attivi**.
