# 🏛️ TASK: Peer-Review Comparativa a 5 Voci & Verdetto Architetturale — OpsFlow Platform

Agisci come un collegio di revisione tecnica, SRE e legale interdisciplinare composto da:

1. **Principal AI Software Architect** (Sistemi Multi-Agent, Firebase Genkit, Tool Calling, Resilienza I/O).
2. **Cloud Security & Site Reliability Engineer (SRE)** (Google Cloud Platform, Cloud Run Gen 2, Artifact Registry, Cost Governance < €5.00/mese).
3. **Legal Tech & Data Protection Officer (DPO)** (GDPR Art. 6, 14, 30, 32, Direttiva E-Privacy e Web Data Extraction).

---

## 📌 1. CONTESTO DEL PROGETTO & INCIDENT REPORT

Stiamo sviluppando **OpsFlow**, una piattaforma SaaS multi-tenant AI-first (Frontend: Quasar/Vue 3, State: Pinia, Backend: Firebase Cloud Functions Gen 2 + Firebase Genkit + Gemini Flash).

### 🚨 L'Incidente Riscontrato:

- **Prompt 1 (Pianificazione/Strategia):** Risposta rapida con **Status 200 OK** in < 2s.
- **Prompt 2 (Ricerca Operativa Web):** Il tool `searchWebAndPlatformsTool` ha tentato lo scraping di `html.duckduckgo.com` tramite proxy Jina Reader, subendo il blocco anti-bot (**HTTP 403 Forbidden**). L'eccezione non normalizzata ha fatto crashare il runtime Genkit con **HTTP 500 Internal Server Error**.
- **Spesa Anomala GCP (€ 0,42 per 5 prompt):** La Cloud Function era impostata a `memory: "1GiB"` e `timeoutSeconds: 300`, restando bloccata in attesa di timeout e accumulando immagini Docker su Artifact Registry senza retention policy.

---

## 🔬 2. SINTESI DELLE 5 PROPOSTE / PROSPETTIVE DA CONFRONTARE

1. **Diagnosi AntiGravity:** Isolamento del bug sul tool di scraping, verifica che la chat/Pinia è sana al 100%, raccomandazione di separare la pianificazione dall'esecuzione con safe fallback.
2. **Parere ChatGPT:** Separazione rigida tra provider HTTP ed eccezioni Genkit; adozione di un `SearchProvider` polimorfico; circuit breaker su 403; alert su GCP Billing e dismissione di Google Custom Search (in EOL).
3. **Parere Claude:** Focus sul doppio fattore crash-costo (la RAM occupata durante il timeout genera la spesa); identificazione dell'**Art. 14 GDPR** (obbligo informativa entro 30gg) come vero rischio legale; tuning spinto a `256MiB`, `timeoutSeconds: 30` e `firebase functions:artifacts:setpolicy --days 7`.
4. **Proposta Perplexity / Real-Time Index:** Benchmark sui motori di ricerca AI-first specializzati (Tavily, Serper, Exa) con focus sulla latenza e pulizia dei payload Markdown per minimizzare i token.
5. **Proposta Gemini Baseline:** Architettura **Multi-Provider Chaining** a costo zero combinando **Brave Search API** (2.000 req/mese free, indice indipendente) + **Tavily AI** (1.000 req/mese free) + **Jina Search** (`s.jina.ai` come paracadute di emergenza) con triple-layer safe boundary.

---

## 🎯 3. COSA VI CHIEDO DI ANALIZZARE (OUTPUT RICHIESTO):

### A. Benchmark Critico dei 5 Approcci (Punti di Forza vs Over-Engineering)

- Metti a confronto i 5 punti di vista evidenziando quali soluzioni rappresentano il "Gold Standard" pratico per un SaaS in avvio e quali introducono complessità o astrazioni inutili.

### B. Matrice di Decisione Definitiva sui Search Provider

- Confronta **Brave Search API**, **Tavily**, **Serper.dev**, **Jina Search (`s.jina.ai`)** e **SearXNG self-hosted**.
- Definisci la catena di fallback ottimale per garantire tra le **3.000 e le 5.000 ricerche web/mese a costo € 0,00**, con 0% di blocchi 403 e zero manutenzione container.

### C. Pattern di Codice TypeScript "Zero-Crash" (`webSearch.ts`)

- Fornisci il codice completo del tool Genkit con gestione hard timeout (AbortController a 6-8s), normalizzazione immediata in `Safe Empty Result` in caso di errore, validazione Zod e blocco totale dei `throw` verso l'esterno.

### D. Assetto Infrastrutturale GCP & Cost Governance (< € 1,00 - € 5,00/mese)

- Specifica la configurazione definitiva per `index.ts` (`memory`, `timeoutSeconds`, `minInstances: 0`, `maxInstances`, `concurrency`).
- Indica i comandi CLI esatti per la retention di Artifact Registry e il budget cap su Google Cloud.

### E. Action Plan GDPR & Conformità Pratica

- Definisci il trattamento dei contatti professionali pubblici (Art. 6 legittimo interesse), il flag operativo `art14NoticeDueBy` e la sanitizzazione PII.

---

## ⚠️ VINCOLO MANDATORIO DI FORMATTAZIONE:

Restituisci l'intero documento di peer-review e il verdetto tecnico finale **esclusivamente all'interno di un unico file formattato in Markdown (`.md`)**, con tabelle comparative, diagrammi testuali di flusso e blocchi di codice TypeScript pronti per la produzione.
