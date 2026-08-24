# 📋 Step 12 — Piano Chirurgico Perfezionato (v2.1.0): Search Tool Hardening, Multi-Provider Chaining & GCP Cost Governance

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & Enterprise AI Architecture Board  
> **Data:** 24 Agosto 2026  
> **Versione:** 2.1.0 — Final Implementation Plan  
> **Stato:** 🟡 PIANO PERFEZIONATO ED APPROVATO — PRONTO PER L'ESECUZIONE  
> **Riferimenti AGENTS.md:** §3 (Sicurezza, Privacy & GDPR), §5 (Ottimizzazione Costi Cloud - Target < €1.00/mese per 1.000 utenti), §14 (Orchestrazione Agenti IA Genkit & Gemini)  
> **Documenti di Confronto & Verdetti:** [`outSource/confronting/gemini-code-verdict.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/gemini-code-verdict.md), [`outSource/confronting/OPSFLOW_ARCHITECTURAL_VERDICT.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/OPSFLOW_ARCHITECTURAL_VERDICT.md) e [`outSource/confronting/reipstaGemini/gemini-code-1787567703383.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/reipstaGemini/gemini-code-1787567703383.md)

---

## 🎯 Obiettivo del Piano

Risolvere chirurgicamente e definitivamente:

1. **Il Bug Tecnico HTTP 500 (Crash su Ricerca Web):** Eliminare per sempre il crash della Cloud Function `chatWithAgent` quando l'utente richiede scouting o ricerche reali sul campo (Prompt 2).
2. **I Blocchi Anti-Bot HTTP 403 (Scraping DuckDuckGo / Jina Proxy):** Rimuovere lo scraping diretto dell'HTML di DuckDuckGo ed implementare un'architettura **Multi-Provider Chaining a costo ZERO (3.000+ query/mese senza carta di credito)** basata su API SaaS ufficiali e resilienti (Tavily AI ➔ Exa.ai ➔ Jina Search API).
3. **L'Anomalia di Spesa GCP (€ 0.42 su pochi prompt):** Ridurre la memoria di `chatWithAgent` da `1GiB` a `512MiB`, abbassare il timeout da `300s` a `60s`, impostare `concurrency: 10` (anti-OOM) ed attivare la Retention Policy su **Google Cloud Artifact Registry** per cancellare automaticamente le vecchie immagini Docker (> 7 giorni).
4. **La Compliance GDPR Art. 14:** Integrare la scadenza automatica dell'informativa privacy (`art14NoticeDueBy` a +30 giorni) per tutti i dati personali e contatti estratti sul web.

---

## 📊 1. Sintesi dell'Integrazione e Perfezionamenti (v2.0.0 ➔ v2.1.0)

Dall'analisi incrociata dei verdetti e dei contributi tecnici di Gemini e Claude, sono stati integrati i seguenti **3 perfezionamenti chirurgici fondamentali**:

| Componente Architetturale    | Verdetto v1.0.0 (`OPSFLOW_ARCHITECTURAL_VERDICT.md`) | Verdetto v2.0.0 (`gemini-code-verdict.md`)           | Perfezionamento Definitivo (v2.1.0)                                  | Motivazione Tecnico-Economica                                     |
| :--------------------------- | :--------------------------------------------------- | :--------------------------------------------------- | :------------------------------------------------------------------- | :---------------------------------------------------------------- |
| **Tier 1 Primario**          | Brave Search API (Presunti 2.000 gratis/mo)          | Tavily AI Search (1.000 req/mo gratis, **NO Carta**) | **Tavily AI Search (`https://api.tavily.com/search`)**               | 100% Gratis senza carta di credito.                               |
| **Tier 2 Co-Primario**       | Tavily AI Search                                     | Exa.ai ($10/mo credit = ~1.400 req/mo, **NO Carta**) | **Exa.ai (`https://api.exa.ai/search`)**                             | ~1.400 req/mo gratis senza carta di credito.                      |
| **Tier 3 Fallback**          | Jina Search API (`s.jina.ai`)                        | Jina Search API (`s.jina.ai`) / Firecrawl            | **Jina Search API (`s.jina.ai/{query}`)**                            | Endpoint API ufficiale Jina (1M token gratis).                    |
| **Tier 4 Emergency**         | DuckDuckGo HTML Scraper                              | Safe Empty Result (Zero Crash Guarantee)             | **Safe Empty Result (`{ success: false, results: [] }`)**            | Eliminato DDG Scraper; mai eccezioni HTTP 500.                    |
| **GCP Memory & Concurrency** | `memory: "1GiB"`, `concurrency: 80`                  | `memory: "512MiB"`, `concurrency: 80`                | **`memory: "512MiB"`, `concurrency: 10`**                            | **Anti-OOM:** Evita crash RAM se più utenti eseguono tool Genkit. |
| **Secrets Management**       | `process.env`                                        | Secret Manager / `process.env`                       | **`defineSecret("TAVILY_API_KEY")` + `defineSecret("EXA_API_KEY")`** | Compatibilità nativa Firebase Secret Manager ed `.env`.           |
| **Regional Alignment**       | `us-central1`                                        | `europe-west1`                                       | **`region: "europe-west1"`**                                         | Allineamento geografico con Firestore (0 egress cost).            |
| **Artifact Registry**        | Nessuna pulizia                                      | Retention Policy < 7 giorni                          | **`firebase functions:artifacts:setpolicy --days 7`**                | Auto-cancellazione container vecchi > 7 giorni.                   |
| **GDPR Compliance**          | Informativa generica                                 | Art. 14 `art14NoticeDueBy` (+30gg)                   | **Campo `art14NoticeDueBy` + AES-256-GCM su Firestore**              | Compliance legale ed audit trail GDPR.                            |

---

## 🔍 2. Diagnosi Chirurgica delle Cause Radice

### A. La Causa del Crash HTTP 500 (Unhandled Exception in Genkit Tool)

- **Meccanismo del Guasto:** In `opsflow-functions/src/tools/webSearch.ts`, il tool faceva il fetch di `https://r.jina.ai/https://html.duckduckgo.com/...`. DuckDuckGo rispondeva con `HTTP 403 Forbidden`. Il codice lanciava un'eccezione `fetch` non catturata dentro il blocco del tool Genkit.
- **Conseguenza:** Genkit non gestiva l'eccezione a livello di tool, interrompendo l'intero flusso `chatWithAgentFlow` e facendo scattare il `catch (err)` di livello HTTP con codice `500 Internal Server Error`.
- **Risoluzione:** Trasformare gli errori di rete e i blocchi HTTP 403/429 in **dati ordinari di risposta** (`{ success: false, results: [] }`). L'eccezione non deve MAI risalire al runtime Genkit.

### B. La Causa dell'Anomalia di Spesa GCP (€ 0.42 su 5 Prompt)

- **Meccanismo della Spesa:**
  1. **RAM/CPU Cloud Run:** `chatWithAgent` allocava `1GiB` di RAM e `1 vCPU`. Durante l'attesa del timeout di 300 secondi (5 minuti), GCP fatturava 1GB di memoria attiva per ogni richiesta bloccata.
  2. **Storage Immagini Docker:** Ogni esecuzione di `firebase deploy --only functions` generava un nuovo container da ~200MB su Google Cloud Artifact Registry. In assenza di una regola di cancellazione (Retention Policy), le immagini si accumulavano a pagamento.
- **Risoluzione:** Ridurre la memoria a `512MiB`, abbassare il timeout a `60s`, impostare `concurrency: 10` ed applicare la Retention Policy su Artifact Registry per eliminare i container più vecchi di 7 giorni.

---

## 📋 Checklist Chirurgica degli Interventi (Fasi 1 – 6)

### ✅ Fase 1: Refactoring Chirurgico di `webSearch.ts` (Multi-Provider Chaining)

- [x] **File Target:** `opsflow-functions/src/tools/webSearch.ts`
- [x] **Azione 1.1:** Interfacce TypeScript rigide ed schemi Zod (`WebSearchQuerySchema`, `SearchResultItemSchema`, `WebSearchOutputSchema`).
- [x] **Azione 1.2:** Campo `art14NoticeDueBy` (stringa ISO della data a +30 giorni) nello schema di output per compliance GDPR Art. 14.
- [x] **Azione 1.3:** Helper `fetchWithHardTimeout(url, options, timeoutMs)` con `AbortController` (timeout 6.000 ms).
- [x] **Azione 1.4:** `searchTavily(query, apiKey)` per Tavily AI Search (1.000 req/mo free).
- [x] **Azione 1.5:** `searchExa(query, apiKey)` per Exa.ai Neural Search (~1.400 req/mo free).
- [x] **Azione 1.6:** `searchJina(query)` su `https://s.jina.ai/{query}` con troncamento rigido `.slice(0, 3000)` (< 800 token).
- [x] **Azione 1.7:** Rollover sequenziale in `searchWebAndPlatformsTool`:  
      `Tavily` ➔ (se fallisce) ➔ `Exa.ai` ➔ (se fallisce) ➔ `Jina Search` ➔ (se fallisce) ➔ `Safe Empty Result`.
- [x] **Verifica:** NESSUN CASO in cui il tool lanci un'eccezione `throw` non gestita. ✅

---

### ✅ Fase 2: Configurazione d'Ambiente & Secret Manager

- [x] **File Target:** `opsflow-functions/.env`
- [x] **Azione 2.1:** Aggiunte chiavi per i provider gratuiti senza carta di credito:
  ```env
  TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxx
  EXA_API_KEY=exa-xxxxxxxxxxxxxxxxxxxxxxxx
  ```
- [x] **Azione 2.2:** Documentazione dell'assenza di costi fissi per questi provider.

> [!IMPORTANT]
> **⚠️ AZIONE RICHIESTA ALL'UTENTE:** Sostituire i placeholder `tvly-xxx...` e `exa-xxx...`  
> con le chiavi API reali registrate su:
>
> - **Tavily AI:** [https://app.tavily.com](https://app.tavily.com) (gratuito, nessuna carta di credito)
> - **Exa.ai:** [https://dashboard.exa.ai](https://dashboard.exa.ai) (gratuito, nessuna carta di credito)

---

### ✅ Fase 3: Optimization Tuning Cloud Run su `index.ts`

- [x] **File Target:** `opsflow-functions/src/index.ts`
- [x] **Azione 3.1:** `setGlobalOptions({ region: "europe-west1", maxInstances: 10 })` — allineamento regionale geografico, zero egress cost.
- [x] **Azione 3.2:** `chatWithAgent` aggiornato con:
  - `timeoutSeconds: 60` (da 300s — risparmio di idle billing)
  - `memory: "512MiB"` (da 1GiB — risparmio 50% RAM)
  - `minInstances: 0` (scale-to-zero)
  - `concurrency: 10` (anti-OOM con Genkit)
  - `region: "europe-west1"`
- [x] **Verifica:** Build TypeScript `tsc` — 0 errori. ✅

---

### ✅ Fase 4: Artifact Registry Retention Policy & GCP Billing Control

- [x] **File Target:** `Instructions/deploy_instructions.md` (Sezione 5 aggiunta)
- [x] **Azione 4.1:** Documentato il comando `firebase functions:artifacts:setpolicy --location europe-west1 --days 7`.
- [x] **Azione 4.2:** Documentate istruzioni di verifica e risparmio atteso.

> [!IMPORTANT]
> **⚠️ AZIONE RICHIESTA ALL'UTENTE:** Eseguire una volta dopo il deploy:
>
> ```bash
> firebase functions:artifacts:setpolicy --location europe-west1 --days 7
> ```

---

### ✅ Fase 5: Allineamento Frontend Quasar & GDPR Art. 14

- [x] **File Target:** `src/components/TaskChatWindow.vue`
- [x] **Azione 5.1:** Endpoint aggiornato da `us-central1` a `europe-west1` (allineamento regionale).
- [x] **Azione 5.2:** Timeout client ridotto da 180.000ms a 55.000ms (5s headroom sotto il limite CF di 60s).
- [x] **Azione 5.3:** Campo `art14NoticeDueBy` generato nel tool `searchWebAndPlatformsTool` — l'LLM lo riceve nel contesto RAG e può citarlo nella risposta narrativa.

---

### ✅ Fase 6: Verifiche Full-Stack, Build & Deploy Mirato

- [x] **Azione 6.1:** `cd opsflow-functions && npm run build` — 0 errori TypeScript. ✅
- [x] **Azione 6.2:** `yarn lint` — 0 errors/warnings. `yarn typecheck` — PASS. ✅
- [x] **Azione 6.3:** Commit Git Conventional Commits — `feat(ai): apply step12 multi-provider search chaining and gcp cost governance`. ✅
- [ ] **Azione 6.4 (UTENTE):** Deploy mirato Firebase:
  ```bash
  cd /home/chif-vas/projects/opsflow && npx firebase-tools deploy --only functions:chatWithAgent,hosting
  ```
- [ ] **Azione 6.5 (UTENTE → VERIFICA POST-DEPLOY):** Eseguire il Prompt 2 ("Cerca Strutture/Medici VersiliaCare...") e verificare Status 200 OK in < 2 secondi.

---

## 🎯 Esito Atteso & Metriche di Successo

1. **Errori HTTP 500:** **0% (Azzerati).** Qualsiasi blocco o timeout di rete restituisce un risultato sicuro `HTTP 200 OK`.
2. **Blocchi HTTP 403 Anti-Bot:** **0% (Azzerati).** Utilizzo esclusivo di API SaaS ufficiali nativamente strutturate per RAG/LLM.
3. **Volume Ricerche Gratuite:** **> 3.000 ricerche/mese a 0,00 € reali** (senza carta di credito inserita).
4. **Stabilità Memoria Cloud Run:** **0 Crash OOM** grazie a `concurrency: 10` su `512MiB`.
5. **Costo GCP Totale:** **< € 0,50 / mese per 1.000 utenti attivi.**
