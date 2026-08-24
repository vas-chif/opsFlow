# 📋 Step 12 — Piano Chirurgico: Search Tool Hardening, Multi-Provider Chaining & GCP Cost Governance

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & Collegio di Architettura IA  
> **Data:** 24 Agosto 2026  
> **Stato:** 🟡 PIANO APPROVATO — PRONTO PER L'ESECUZIONE  
> **Riferimenti AGENTS.md:** §3 (Sicurezza, Privacy & GDPR), §5 (Ottimizzazione Costi Cloud - Target < €1.00/mese per 1.000 utenti), §14 (Orchestrazione Agenti IA Genkit & Gemini)  
> **Documenti di Confronte & Verdetti:** [`outSource/confronting/gemini-code-verdict.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/gemini-code-verdict.md) e [`outSource/confronting/OPSFLOW_ARCHITECTURAL_VERDICT.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/OPSFLOW_ARCHITECTURAL_VERDICT.md)

---

## 🎯 Obiettivo del Piano

Risolvere chirurgicamente e definitivamente:

1. **Il Bug Tecnico HTTP 500 (Crash su Ricerca Web):** Eliminare per sempre il crash della Cloud Function `chatWithAgent` quando l'utente richiede scouting o ricerche reali sul campo (Prompt 2).
2. **I Blocchi Anti-Bot HTTP 403 (Scraping DuckDuckGo / Jina Proxy):** Rimuovere lo scraping diretto dell'HTML di DuckDuckGo ed implementare un'architettura **Multi-Provider Chaining a costo ZERO (3.000+ query/mese senza carta di credito)** basata su API SaaS ufficiali e resilienti.
3. **L'Anomalia di Spesa GCP (€ 0.42 su pochi prompt):** Ridurre la memoria di `chatWithAgent` da `1GiB` a `512MiB`, abbassare il timeout da `300s` a `60s` ed attivare la Retention Policy su **Google Cloud Artifact Registry** per cancellare automaticamente le vecchie immagini Docker.
4. **La Compliance GDPR Art. 14:** Integrare la scadenza automatica dell'informativa privacy (`art14NoticeDueBy` a +30 giorni) per tutti i dati personali e contatti estratti sul web.

---

## 📊 1. Sintesi del Confronto tra i Verdetti (v1.0.0 vs v2.0.0)

Il confronto analitico tra [`OPSFLOW_ARCHITECTURAL_VERDICT.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/OPSFLOW_ARCHITECTURAL_VERDICT.md) (v1.0.0) e [`gemini-code-verdict.md`](file:///home/chif-vas/projects/opsflow/outSource/confronting/gemini-code-verdict.md) (v2.0.0 - Intelligence Agosto 2026) evidenzia la seguente evoluzione architetturale:

| Componente Architetturale | Verdetto v1.0.0 (`OPSFLOW_ARCHITECTURAL_VERDICT.md`) | Verdetto v2.0.0 (`gemini-code-verdict.md`)                      | Decisione Chirurgica per OpsFlow (Step 12)                                         |
| :------------------------ | :--------------------------------------------------- | :-------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **Tier 1 Primario**       | Brave Search API (Presunti 2.000 gratis/mo)          | Tavily AI Search (1.000 req/mo gratis, **NO Carta di Credito**) | **Tavily AI Search (`https://api.tavily.com/search`)** — 100% Gratis senza carta.  |
| **Tier 2 Co-Primario**    | Tavily AI Search                                     | Exa.ai ($10/mo credit = ~1.400 req/mo, **NO Carta di Credito**) | **Exa.ai (`https://api.exa.ai/search`)** — 1.400 req/mo gratis senza carta.        |
| **Tier 3 Fallback**       | Jina Search API (`s.jina.ai`)                        | Jina Search API (`s.jina.ai`) / Firecrawl (1M token gratis)     | **Jina Search API (`s.jina.ai/{query}`)** — Endpoint API ufficiale Jina.           |
| **Tier 4 Emergency**      | DuckDuckGo HTML Scraper                              | Safe Empty Result (Zero Crash Guarantee, no HTTP 500)           | **Safe Empty Result (`{ success: false, results: [] }`)** — Eliminato DDG Scraper. |
| **GCP Memory & Timeout**  | `memory: "1GiB"`, `timeoutSeconds: 60`               | `memory: "512MiB"`, `timeoutSeconds: 60`, `concurrency: 80`     | **`memory: "512MiB"`, `timeoutSeconds: 60`, `concurrency: 80`**                    |
| **Artifact Registry**     | Nessuna pulizia                                      | Retention Policy < 7 giorni                                     | **Script `artifact-cleanup-policy.json` (Keep last 2 tags)**                       |
| **GDPR Compliance**       | Informativa generica                                 | Art. 14 `art14NoticeDueBy` (+30gg) + Client-side AES-256-GCM    | **Campo `art14NoticeDueBy` + AES-256-GCM su Firestore**                            |

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
- **Risoluzione:** Ridurre la memoria a `512MiB`, abbassare il timeout a `60s` ed applicare la Retention Policy su Artifact Registry per eliminare i container più vecchi di 7 giorni.

---

## 📋 Checklist Chirurgica degli Interventi (Fasi 1 – 6)

### 🟢 Fase 1: Refactoring Chirurgico di `webSearch.ts` (Multi-Provider Chaining)

- [ ] **File:** `opsflow-functions/src/tools/webSearch.ts`
- [ ] **Azione 1.1:** Creare le interfacce TypeScript rigide ed i relativi schemi Zod (`WebSearchQuerySchema`, `SearchResultItemSchema`, `WebSearchOutputSchema`).
- [ ] **Azione 1.2:** Inserire il campo `art14NoticeDueBy` (stringa ISO della data a +30 giorni) nello schema di output per la compliance GDPR Art. 14.
- [ ] **Azione 1.3:** Implementare `fetchTavilySearch(query)` con `AbortController` (timeout 6.000 ms) e filtro `response.status === 403 || 429` (Circuit Breaker).
- [ ] **Azione 1.4:** Implementare `fetchExaSearch(query)` con `AbortController` (timeout 6.000 ms) e normalizzazione JSON.
- [ ] **Azione 1.5:** Implementare `fetchJinaSearch(query)` su `https://s.jina.ai/{query}` con troncamento rigido `.slice(0, 3000)` (< 800 token).
- [ ] **Azione 1.6:** Implementare il rollover sequenziale in `searchWebAndPlatformsTool`:  
      `Tavily` ➔ (se fallisce) ➔ `Exa.ai` ➔ (se fallisce) ➔ `Jina Search` ➔ (se fallisce) ➔ `Safe Empty Result`.
- [ ] **Verifica:** Verificare che in NESSUN CASO il tool lanci un'eccezione `throw` non gestita.

---

### 🟢 Fase 2: Configurazione d'Ambiente & Secret Manager

- [ ] **File:** `opsflow-functions/.env` ed `opsflow-functions/.env.example`
- [ ] **Azione 2.1:** Aggiungere le chiavi per i provider gratuiti senza carta di credito:
  ```env
  TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxx
  EXA_API_KEY=exa-xxxxxxxxxxxxxxxxxxxxxxxx
  ```
- [ ] **Azione 2.2:** Aggiornare `.env.example` documentando l'assenza di costi fissi per questi provider.

---

### 🟢 Fase 3: Optimization Tuning Cloud Run su `index.ts`

- [ ] **File:** `opsflow-functions/src/index.ts`
- [ ] **Azione 3.1:** Aggiornare la dichiarazione della Cloud Function `chatWithAgent`:
  ```typescript
  export const chatWithAgent = onRequest(
    {
      cors: true,
      timeoutSeconds: 60,   // Ridotto da 300s a 60s (Azzera lo spreco di idle time)
      memory: "512MiB",     // Ridotto da 1GiB a 512MiB (Dimezza i costi RAM)
      minInstances: 0,      // Scale-to-Zero per costo zero in inattività
      maxInstances: 10,     // Hard-cap costo per 1000 utenti
      concurrency: 80,      // 80 richieste concorrenti per singola istanza
    },
    async (req, res) => { ... }
  );
  ```
- [ ] **Verifica:** Verificare che la compilazione `yarn --prefix opsflow-functions build` avvenga senza errori TypeScript.

---

### 🟢 Fase 4: Artifact Registry Retention Policy & GCP Billing Control

- [ ] **File:** `opsflow-functions/artifact-cleanup-policy.json` (Nuovo File)
- [ ] **Azione 4.1:** Creare la policy JSON per l'auto-cancellazione dei container Docker vecchi:
  ```json
  [
    {
      "name": "delete-old-images",
      "action": { "type": "Delete" },
      "condition": {
        "tagState": "ANY",
        "olderThan": "7d"
      }
    },
    {
      "name": "keep-recent-tags",
      "action": { "type": "Keep" },
      "condition": {
        "tagState": "TAGGED",
        "packageNamePrefixes": ["chatwithagent", "generatedbsattitude"]
      }
    }
  ]
  ```
- [ ] **Azione 4.2:** Documentare il comando CLI di applicazione della policy in [`Instructions/deploy_instructions.md`](file:///home/chif-vas/projects/opsflow/Instructions/deploy_instructions.md):
  ```bash
  gcloud artifacts settings cleanup-policies upload \
    --project=opsflow-88of \
    --repository=gcf-artifacts \
    --location=us-central1 \
    --policy-file=opsflow-functions/artifact-cleanup-policy.json
  ```

---

### 🟢 Fase 5: Allineamento Frontend Quasar & GDPR Art. 14

- [ ] **File:** `src/components/TaskChatWindow.vue` e `src/stores/taskChatStore.ts`
- [ ] **Azione 5.1:** Verificare che la UI gestisca in modo trasparente il payload di risposta quando `success === false` mostrando il messaggio di fallback grazioso senza generare avvisi di errore nella console client.
- [ ] **Azione 5.2:** Assicurarsi che quando un lead viene aggiunto allo stato local/Firestore, il campo `art14NoticeDueBy` venga registrato nella sotto-collezione del task per tracciare la scadenza dei 30 giorni dell'informativa privacy.

---

### 🟢 Fase 6: Verifiche Full-Stack, Build & Deploy Mirato

- [ ] **Azione 6.1:** Eseguire `yarn --prefix opsflow-functions build` per confermare la compilazione backend.
- [ ] **Azione 6.2:** Eseguire `yarn lint:check` e `yarn typecheck` per garantire zero warning/errori in tutto il repository.
- [ ] **Azione 6.3:** Effettuare il commit Git con Conventional Commits:  
      `feat(ai): apply step12 multi-provider chaining and gcp cost governance`.
- [ ] **Azione 6.4:** Eseguire il deploy mirato su Firebase:
  ```bash
  cd /home/chif-vas/projects/opsflow && npx firebase-tools deploy --only functions:chatWithAgent,hosting
  ```

---

## 🎯 Esito Atteso & Metriche di Successo

1. **Errori HTTP 500:** **0% (Azzerati).** Qualsiasi blocco o timeout di rete restituisce un risultato sicuro `HTTP 200 OK`.
2. **Blocchi HTTP 403 Anti-Bot:** **0% (Azzerati).** Utilizzo esclusivo di API SaaS ufficiali nativamente strutturate per RAG/LLM.
3. **Volume Ricerche Gratuite:** **> 3.000 ricerche/mese a 0,00 € reali** (senza carta di credito inserita).
4. **Costo GCP Totale:** **< € 0,50 / mese per 1.000 utenti attivi.**
