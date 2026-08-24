# 🌐 OpsFlow — Search Providers Benchmark & Multi-Provider Chaining Architecture

> **Documento:** `docs/SEARCH_PROVIDERS_BENCHMARK.md`  
> **Versione:** 1.0.0 — Enterprise Architecture Baseline  
> **Data:** 22 Agosto 2026  
> **Autori:** Principal AI Architect, Cloud SRE & Data Protection Officer  
> **Target Budget:** € 0,00 / mese (MVP & Low Volume) | Hard-Cap < € 5,00 / mese (Scaling)  
> **Obiettivo:** Azzeramento definitivo blocchi anti-bot (HTTP 403), eliminazione runtime crash (HTTP 500) e garanzia di 3.000–5.000 ricerche web/mese a costo zero.

---

## Executive Summary

Il fallimento dell'integrazione iniziale di ricerca web su OpsFlow è derivato dall'uso di web scraping non autorizzato tramite proxy su motori di ricerca generalisti (DuckDuckGo), che applicano filtri anti-bot sistemici.

L'architettura target sostituisce lo scraping non autorizzato con un **Multi-Provider Chaining Pattern** basato su API ufficiali conformi ai ToS e progettate specificamente per agenti LLM e RAG.

Combinando le quote gratuite mensili ricorrenti di **Brave Search API** (2.000 query/mese) e **Tavily Search API** (1.000 query/mese), con fallback elastico su **Jina Search API (`s.jina.ai`)**, OpsFlow ottiene **3.000+ ricerche web strutturate al mese a € 0,00**, con 0% di blocchi anti-bot e latenza media inferiore a 1.200ms.

---

## 1. Scouting & Analisi Dettagliata dei Provider di Ricerca

### A. Brave Search API

- **Caratteristiche:** Indice web proprietario e completamente indipendente (oltre 30 miliardi di pagine indicizzate). Non fa scraping né si appoggia a Google o Bing.
- **Free Tier:** **2.000 query/mese ricorrenti gratuite** (Piano _Data for AI_ o _Search_). Nessuna carta di credito richiesta per l'attivazione base.
- **Oltre la soglia:** $3,00 – $5,00 per 1.000 query aggiuntive.
- **Formato Dati:** JSON nativo strutturato (titolo, URL, snippet, extra snippets per RAG, entity schema).
- **Valutazione Legale & Privacy:** Policy No-Log assoluta, conformità GDPR Art. 32 nativa, ToS autorizzano esplicitamente l'indicizzazione e il caching per applicazioni AI/LLM.

### B. Tavily Search API

- **Caratteristiche:** Motore di ricerca neurale concepito specificamente per agenti AI. Non restituisce solo link, ma esegue automaticamente l'aggregazione, la pulizia e l'estrazione del contenuto Markdown delle pagine più rilevanti in una singola chiamata API.
- **Free Tier:** **1.000 crediti/mese gratuiti ricorrenti**.
- **Oltre la soglia:** $0,008 per credito (~$8,00 per 1.000 query avanzate).
- **Formato Dati:** JSON strutturato con testo Markdown pre-sanificato, ottimizzato per ridurre i token LLM.
- **Valutazione Legale & Privacy:** Licenza commerciale inclusa per tool calling e pipeline RAG; server conformi SOC2 e GDPR.

### C. Exa.ai (ex Metaphor)

- **Caratteristiche:** Motore di ricerca basato su embeddings e rappresentazioni vettoriali (Neural Search). Consente ricerche semantiche tramite similarità concettuale (es. _"trova aziende simili a X che offrono servizio Y in Toscana"_).
- **Free Tier:** $10 di credito iniziale una tantum (~1.000 query totali). Non offre un free tier mensile ricorrente permanente.
- **Oltre la soglia:** ~$5,00 – $10,00 per 1.000 query (in base al tipo di estrazione del contenuto).
- **Valutazione:** Eccezionale per compiti di ricerca semantica complessa, ma non idoneo come perno primario della strategia a costo zero a causa del credito una tantum.

### D. Serper.dev

- **Caratteristiche:** Wrapper ad altissima velocità sulle Google SERP ufficiali (Google Search, Google Maps, Google News).
- **Free Tier:** 2.500 query gratuite **una tantum** all'iscrizione.
- **Oltre la soglia:** $1,00 per 1.000 query (il costo per query a pagamento più basso sul mercato per dati Google).
- **Valutazione:** Ideale come fornitore di riserva a pagamento (_Overflow Provider_) qualora si superino tutte le soglie gratuite mensili.

### E. Jina Search API (`s.jina.ai`)

- **Caratteristiche:** SERP reader aperto offerto dall'ecosistema Jina AI. Effettua la ricerca e restituisce direttamente il testo consolidato in formato Markdown.
- **Free Tier:** Accesso aperto con rate-limiting dinamico (senza costi fissi).
- **Formato Dati:** Markdown lineare pulito.
- **Valutazione:** Perfetto come paracadute di emergenza a costo zero quando tutti i crediti dei provider primari sono esauriti.

### F. Kagi Universal Summarizer / Search API

- **Caratteristiche:** Motore di ricerca ultra-premium orientato alla totale privacy e assenza di pubblicità.
- **Free Tier:** Nessun piano gratuito ricorrente (solo una prova limitata a 50 ricerche una tantum). Piani a partire da $5-$10/mese.
- **Valutazione:** **Sconsigliato per OpsFlow** a causa dell'assenza di un free tier scalabile e costi minimi fissi incompatibili con la politica < €5/mese.

### G. Bing Web Search API (Microsoft Azure)

- **Caratteristiche:** Motore di ricerca enterprise di Microsoft su Azure Cognitive Services.
- **Pricing:** Ha deprecato il free tier generoso. Il piano base parte da $3,00 – $7,00 per 1.000 transazioni.
- **Valutazione:** **Sconsigliato**. Complessità di onboarding su Azure e assenza di tier gratuito ricorrente.

### H. SearXNG Self-Hosted (Container su Cloud Run)

- **Caratteristiche:** Metamotore open-source che aggrega 70+ motori di ricerca senza tracciare gli utenti.
- **Analisi di Fattibilità su Cloud Run:**
  - _Costi di Calcolo:_ Anche impostando `minInstances: 0`, ogni avvio da freddo (Cold Start) di un container Python/SearXNG richiede **8–15 secondi** di latenza, inaccettabile per una chat interattiva.
  - _Blocchi IP degli Hosting Datacenter:_ Quando SearXNG interroga Google, Bing o DuckDuckGo dagli IP dei datacenter di Google Cloud (es. `europe-west1`), i motori bersaglio rilevano immediatamente il traffico ASN cloud e applicano il blocco CAPTCHA su tutto il container.
  - _Costi di Storage Artifact Registry:_ Il mantenimento dell'immagine container genera micro-costi fissi mensili (€0,15 - €0,30).
- **Verdetto:** **Fortemente sconsigliato.** Introduce debito tecnico, manutenzione di proxy residenziali e latenza elevata rispetto a soluzioni SaaS gestite.

---

## 2. Matrice Comparativa dei Provider di Ricerca Web

| Provider & Servizio               |     Free Tier Ricorrente      | Costo Oltre Soglia (/1k req) |  Formato Risposta   |         Rischio ToS / Blocco          | Latenza Media  |            Idoneità OpsFlow            |
| :-------------------------------- | :---------------------------: | :--------------------------: | :-----------------: | :-----------------------------------: | :------------: | :------------------------------------: |
| **Brave Search API**              | **2.000 req / mese** (No CC)  |            $3,00             |     JSON Nativo     |    **Nullo** (Indice Proprietario)    |    ~450 ms     |      🟢 **Primario (Livello 1)**       |
| **Tavily Search API**             | **1.000 req / mese** (No CC)  |            $8,00             | JSON + Markdown RAG |     **Nullo** (AI Dedicated ToS)      |   ~1.100 ms    |     🟢 **Co-Primario (Livello 2)**     |
| **Jina Search API (`s.jina.ai`)** | **Illimitato** (Rate-limited) |            € 0,00            |      Markdown       |    **Basso** (Endpoint di ricerca)    |   ~1.400 ms    |       🟡 **Fallback Emergenza**        |
| **Serper.dev**                    |       2.500 una tantum        |          **$1,00**           | JSON (Google SERP)  |      **Basso** (API Commerciale)      |    ~350 ms     |  🟢 **Miglior Overflow a Pagamento**   |
| **Exa.ai**                        |        $10 una tantum         |        $5,00 – $10,00        |   JSON Vettoriale   |       **Nullo** (Neural Engine)       |    ~900 ms     |  ⚪ **Valutazione Futura (Deep RAG)**  |
| **SearXNG Self-Hosted**           |    Illimitato (Self-host)     |    Costo RAM GCP + Proxy     |     JSON / HTML     | **Altissimo** (IP Datacenter GCP 403) |   > 8.000 ms   | 🔴 **Sconsigliato (Over-Engineering)** |
| **Kagi Search API**               |    Assente (Trial 50 req)     |         Minimo $5/mo         |        JSON         |               **Nullo**               |    ~600 ms     |   🔴 **Sconsigliato (Costi Fissi)**    |
| **DuckDuckGo Scraper**            |            € 0,00             |             N/A              |     HTML Grezzo     |  **Critico** (HTTP 403 / Crash 500)   | N/A (Bloccato) |       ⛔ **Eliminato & Bandito**       |

---

## 3. Architettura "Multi-Provider Chaining" a Costo Zero

L'architettura adottata implementa il pattern **Chain of Responsibility** con fallback automatico a cascata e isolamento a 3 livelli:
