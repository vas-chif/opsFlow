# TASK: Ricerca di Mercato, Benchmark & Analisi di Fattibilità — Alternative a Brave Search API per OpsFlow

Agisci come un team congiunto composto da:

1. **Principal AI Software Architect & Tool Calling Specialist** (Firebase Genkit, LLM Orchestration, Real-time RAG).
2. **Cloud Solutions Architect & Cost Controller** (GCP, Scale-to-Zero, Budgeting vincolante < €5.00 - €10.00 / mese).
3. **Legal Tech & Data Protection Advisor** (GDPR Compliance, Diritto del Web Scraping, ToS dei Search Provider).

---

## 📌 CONTESTO DEL PROGETTO (OpsFlow Platform):

Stiamo sviluppando **OpsFlow**, una piattaforma SaaS multi-tenant AI-first (Frontend: Quasar/Vue 3, State: Pinia, Backend: Firebase Cloud Functions Gen 2 + Firebase Genkit + Gemini Flash).

Nel nostro sistema, l'Agente AI (`searchWebAndPlatformsTool`) necessita di eseguire ricerche web in tempo reale (scouting lead, reperimento contatti professionali, verifica normative, ricerca fornitori).

Abbiamo individuato la **Brave Search API** (che offre 2.000 query/mese gratuite ricorrenti e un indice indipendente). Vogliamo mappare **tutte le alternative analoghe sul mercato** per selezionare la combinazione ottimale (Primario + Fallback) a **costo zero reale o inferiore a €5/mese**, eliminando per sempre blocchi anti-bot (HTTP 403) o eccezioni a runtime (HTTP 500).

---

## 🎯 AMBITI DELL'ANALISI RICHIESTA:

### 1. Scouting & Mappatura dei Provider Alternativi

Esegui un'analisi approfondita dei motori di ricerca e API per agenti IA comparabili a Brave Search API, tra cui:

- **Tavily Search API** (AI-native search & content extraction)
- **Exa.ai** (Neural Search per agenti LLM)
- **Serper.dev** (Google SERP wrapper)
- **Kagi Universal Summarizer / Search API**
- **SearXNG** (Metasearch open-source self-hosted su Cloud Run / Container)
- **Bing Web Search API** (Azure Cognitive Services)
- **Perplexity Online / Search API**
- Altri provider emergenti orientati ad agenti RAG/LLM.

### 2. Matrice Comparativa di Dettaglio

Costruisci una tabella di confronto con le seguenti colonne:

- **Provider & Nome Servizio**
- **Piano Gratuito (Free Tier):** Volume esatto (es. query/mese ricorrenti vs crediti una tantum) e vincoli (carta di credito richiesta sì/no).
- **Costo Oltre la Soglia Gratuita:** Prezzo per 1.000 query / crediti aggiuntivi.
- **Formato Dati Restituito:** JSON nativo, Markdown sintetizzato per LLM, snippet grezzi o HTML.
- **Resistenza Anti-Bot & ToS Legali:** Livello di affidabilità contrattuale per uso in un SaaS commerciale.
- **Latenza Media:** Velocità di risposta (ms).
- **Verdetto di Idoneità per OpsFlow:** (Scelta primaria / Fallback / Sconsigliato).

### 3. Fattibilità & Architettura a Catena "Zero-Cost Strategy"

- Come combinare 2 o 3 di questi provider in un'architettura **Multi-Provider Chaining** per garantire tra le **3.000 e le 6.000 ricerche web al mese a costo € 0,00**, con rollover automatico in caso di esaurimento quota o timeout.
- Valutazione tecnica ed economica sull'eventuale deployment di un'istanza containerizzata di **SearXNG** su Google Cloud Run (minInstances: 0): conviene o introduce costi fissi e manutenzione superflua rispetto alle API SaaS con free tier?

### 4. Aspetti Privacy & GDPR Compliance

- Quali di questi provider applicano una policy **No-Log** sulle query effettuate?
- Verifica contrattuale sulla possibilità di memorizzare i risultati estratti nella cache del database (Firestore) a supporto delle sessioni di lavoro dell'utente.

---

## ⚠️ VINCOLO MANDATORIO DI FORMATTAZIONE:

Restituisci l'intero documento di consulenza, le tabelle comparative e le raccomandazioni finali **esclusivamente all'interno di un unico file formattato in Markdown (`.md`)**, pronto per essere archiviato nella documentazione tecnica del repository (`docs/SEARCH_PROVIDERS_BENCHMARK.md`).
