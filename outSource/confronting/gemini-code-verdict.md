# 🏛️ OpsFlow Platform — Verdetto Architetturale Definitivo & Peer-Review a 5 Voci

> **Documento:** `docs/OPSFLOW_ARCHITECTURAL_VERDICT.md`[cite: 20]  
> **Versione:** 2.0.0 — Production Baseline (Aggiornato con Intelligence di Mercato Agosto 2026)[cite: 21, 39]  
> **Data:** 24 Agosto 2026  
> **Autori:** Collegio Congiunto (Principal AI Software Architect, Cloud SRE & Data Protection Officer)[cite: 20, 39]  
> **Target Costi:** € 0,00 / mese (MVP) | Hard Cap < € 1,00 – € 5,00 / mese (1.000+ utenti)[cite: 20, 21, 39]  
> **Oggetto:** Risoluzione definitiva crash HTTP 500, eliminazione blocchi anti-bot HTTP 403, abbattimento costi GCP e architettura Multi-Provider Chaining conforme al GDPR[cite: 20, 21, 39].

---

## 📌 1. Executive Summary & Incident Report

### 🚨 Diagnosi Sintetica dell'Incidente

1. **Prompt 1 (Pianificazione/Strategia):** Elaborazione testuale gestita da Gemini ➔ **Status 200 OK** in < 2 secondi[cite: 1, 20].
2. **Prompt 2 (Esecuzione Ricerca Web):** L'Agente AI ha invocato `searchWebAndPlatformsTool`[cite: 1, 20]. Il tool ha eseguito il fetch su `https://r.jina.ai/https://html.duckduckgo.com/html/?q=...`, subendo il blocco anti-bot di DuckDuckGo (**HTTP 403 Forbidden / CAPTCHA**)[cite: 1, 20]. L'eccezione non catturata dal runtime Genkit ha fatto fallire la Cloud Function `chatWithAgent` con **HTTP 500 Internal Server Error**[cite: 1, 20].
3. **Anomalia di Spesa GCP (€ 0,42 per 5 prompt):** La Cloud Function era configurata con `memory: "1GiB"` e `timeoutSeconds: 300`[cite: 1, 9, 20]. Durante il blocco 403, la funzione è rimasta attiva per minuti allocando 1 GB di RAM a pagamento[cite: 1, 9, 20]. Contestualmente, i deploy ripetuti hanno accumulato immagini container su _Google Cloud Artifact Registry_ prive di retention policy[cite: 1, 20].

### ⚡ Aggiornamento di Mercato (Agosto 2026):

- **Brave Search API:** Da febbraio 2026 non offre più 2.000 query/mese gratuite senza carta[cite: 39]. Richiede carta di credito obbligatoria ed eroga $5/mese di credito (~1.000 query), poi fattura $5/1.000 richieste[cite: 39].
- **Bing Web Search API:** Ritirata definitivamente da Microsoft l'11 agosto 2025[cite: 39].
- **Google Custom Search JSON API:** Dismissione totale fissata al 1° gennaio 2027 e chiusa a nuovi account[cite: 39].
- **La Strategia Multi-Provider Chaining è l'unica via praticabile:** Nessun singolo fornitore copre da solo 3.000–6.000 ricerche/mese a costo zero reale senza carta di credito[cite: 39].

---

## 📊 2. SEZIONE A: Matrice di Confronto Critico a 5 Voci

| Prospettiva / Modello                | Punti di Forza & Intuizioni Determinanti                                                                                                                                                                                                 | Elementi di Over-Engineering da Scartare per l'MVP                                                                        | Sintesi del Contributo Integrato                                                                                                  |
| :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------- |
| **1. AntiGravity**[cite: 1, 20]      | Isolamento chirurgico del bug in `webSearch.ts`; verifica che UI Quasar, store Pinia, Sliding Window e autenticazione siano sani al 100%[cite: 1, 20].                                                                                   | Tendenza a proporre un fallback statico unico e mockato[cite: 1, 30].                                                     | **Certificazione di stabilità del core UI e dello stato frontend**[cite: 1, 20, 30].                                              |
| **2. ChatGPT**[cite: 8, 20]          | Concetto di **Tool Boundary**: un errore HTTP è un dato ordinario e non un'eccezione fatale[cite: 8, 21]. Tassonomia errori (`ToolErrorCode`) e Circuit Breaker[cite: 8, 21].                                                            | Astrazione polimorfica a classi astratte e Registry dinamico eccessivamente complessi per soli 2-3 provider[cite: 8, 30]. | **Gestione dell'errore come dato sicuro (`Safe Result`) ed Execution Budget**[cite: 8, 21, 30].                                   |
| **3. Claude**[cite: 13, 20, 39]      | Dimostrazione del legame tra timeout 300s × 1GiB RAM e costi GCP[cite: 13, 23]. Rilevazione dei cambi di pricing 2026 (Brave carta obbligatoria, Bing EOL)[cite: 39]. Diagnosi dell'**Art. 14 GDPR** (`art14NoticeDueBy`)[cite: 13, 23]. | Proposta di stack a 5 provider con DataForSEO prima di validare i volumi reali[cite: 39].                                 | **Market intelligence 2026, tuning risorse Cloud Run (`512MiB`, 30s) e automazione CLI per Artifact Registry**[cite: 13, 21, 39]. |
| **4. Perplexity**[cite: 18, 20]      | Validazione quote reali e bocciatura tecnica di SearXNG su Cloud Run (IP datacenter GCP bloccati dai CAPTCHA)[cite: 18, 22, 28].                                                                                                         | Valutazione di motori di ricerca enterprise a canone fisso non necessari per l'MVP[cite: 18, 30].                         | **Verifica ToS sul divieto di raw caching permanente su database multi-tenant (es. Exa)**[cite: 18, 28].                          |
| **5. Gemini Baseline**[cite: 10, 20] | Architettura **Multi-Provider Chaining** a costo zero (Tavily + Exa + Jina/Brave) con isolamento a 3 livelli e troncamento a 3.000 caratteri (<800 token)[cite: 10, 16, 26].                                                             | Dipendenza iniziale da DuckDuckGo scraping rimossa[cite: 10, 14, 20].                                                     | **Codice unificato di orchestrazione Genkit con schema Zod sicuro e rollover**[cite: 10, 14, 20].                                 |

---

## 🌐 3. SEZIONE B: Benchmark Definitivo dei Search Provider & Multi-Provider Chaining

### Matrice Comparativa Aggiornata (Agosto 2026)

| Provider & Servizio                             |                          Piano Gratuito Reale                          |           Costo Oltre Quota (/1k query)            |                   Formato Risposta                    |             Resistenza Anti-Bot & ToS Legali             |         Latenza Media         |                 Idoneità OpsFlow                 |
| :---------------------------------------------- | :--------------------------------------------------------------------: | :------------------------------------------------: | :---------------------------------------------------: | :------------------------------------------------------: | :---------------------------: | :----------------------------------------------: |
| **Tavily AI Search**[cite: 12, 18, 39]          |    **1.000 crediti/mese** (Ricorrenti, NO carta)[cite: 12, 18, 39]     |        $ 0,008 / credito[cite: 12, 18, 39]         | JSON AI-ready con Markdown estratto[cite: 12, 18, 39] |       **Nullo** (API nativa per LLM)[cite: 12, 13]       |     ~900 ms[cite: 19, 29]     |    🟢 **PRIMARIO (Tier 1)**[cite: 13, 21, 39]    |
| **Exa.ai**[cite: 18, 22, 39]                    |   **$10/mese crediti** (~1.400 req/mese, NO carta)[cite: 18, 22, 39]   |        $ 7,00 / 1.000 req[cite: 18, 22, 39]        |   JSON Semantico / Neural Search[cite: 18, 22, 39]    |         **Nullo** (API Enterprise)[cite: 19, 29]         |     ~700 ms[cite: 18, 22]     |      🟢 **CO-PRIMARIO (Tier 2)**[cite: 39]       |
| **Firecrawl Search**[cite: 39]                  |        **1.000 crediti/mese** (~500 search, NO carta)[cite: 39]        |         $ 16,00 / 5.000 crediti[cite: 39]          |   JSON/Markdown con full-page extraction[cite: 39]    |       **Nullo** (Proxy gestiti a monte)[cite: 39]        |           ~1.200 ms           |       🟢 **TERZIARIO (Tier 3)**[cite: 39]        |
| **Brave Search API**[cite: 18, 22, 39]          | **$ 5,00/mese credit** (~1.000 req, CARTA RICHIESTA)[cite: 18, 22, 39] |        $ 5,00 / 1.000 req[cite: 18, 22, 39]        |   JSON nativo con snippet puliti[cite: 18, 22, 39]    |   **Nullo** (Indice autonomo 30B pagine)[cite: 16, 22]   |     ~450 ms[cite: 16, 26]     |  🟡 **OPZIONALE (Se carta inserita)**[cite: 39]  |
| **Jina Search (`s.jina.ai`)**[cite: 12, 18, 39] |       **Illimitato** (Rate-limited a 100 RPM)[cite: 12, 18, 39]        |             Token-based[cite: 17, 27]              |            Markdown lineare[cite: 12, 18]             | **Basso** (Endpoint di ricerca ufficiale)[cite: 12, 20]  |    ~1.500 ms[cite: 16, 26]    | 🟡 **PARACADUTE DI EMERGENZA**[cite: 12, 13, 16] |
| **DataForSEO (Standard)**[cite: 39]             |                       Sandbox $1 trial[cite: 39]                       |    **$ 0,0006 / query** ($0,60/1.000)[cite: 39]    |        JSON Google SERP strutturato[cite: 39]         |           **Nullo** (API ufficiale)[cite: 39]            | ~5 min (coda async)[cite: 39] |  ⚪ **OVERFLOW A PAGAMENTO (Fase 2)**[cite: 39]  |
| **Serper.dev**[cite: 12, 18, 39]                |        2.500 req (Una tantum, non ricorrente)[cite: 12, 18, 39]        |        $ 1,00 / 1.000 req[cite: 12, 18, 39]        |            JSON Google SERP[cite: 12, 18]             |      Basso (Wrapper scraping Google)[cite: 18, 19]       |     ~400 ms[cite: 16, 26]     |       ⚪ **RISERVA UNA TANTUM**[cite: 39]        |
| **SearXNG (Cloud Run)**[cite: 18, 22, 39]       |                   0,00 € (Open Source)[cite: 19, 29]                   |  RAM Cloud Run + Proxy Residenziali[cite: 18, 19]  |               JSON / HTML[cite: 18, 19]               | **Altissimo** (IP GCP bloccati da CAPTCHA)[cite: 18, 19] |   > 4.000 ms[cite: 18, 19]    |   🔴 **SCONSIGLIATO (Overhead)**[cite: 18, 19]   |
| **Google Custom Search**[cite: 12, 13, 39]      |                        Deprecato[cite: 12, 13]                         |          EOL 01/01/2027[cite: 12, 13, 39]          |                  JSON[cite: 12, 17]                   |        Chiuso ai nuovi clienti[cite: 12, 13, 39]         |       N/A[cite: 13, 23]       |  ⛔ **ESCLUSO DAL PROGETTO**[cite: 12, 13, 39]   |
| **Bing Web Search API**[cite: 18, 22, 39]       |                         Ritirato[cite: 18, 22]                         | Dismesso da Microsoft 11/08/2025[cite: 18, 22, 39] |                   N/A[cite: 18, 22]                   |       Servizio non più esistente[cite: 18, 22, 39]       |       N/A[cite: 18, 22]       |  ⛔ **ESCLUSO DAL PROGETTO**[cite: 18, 22, 39]   |

---

### 🔄 Catena di Chaining a Costo Zero (Zero Carte di Credito Richieste)

Combinando **Tavily** (1.000 req/mo) + **Exa.ai** (1.400 req/mo) + **Firecrawl/Jina** (500+ req/mo), OpsFlow ottiene **fino a 3.000+ ricerche web al mese a 0,00 € reali**, senza inserire carte di credito[cite: 39]:
