# OpsFlow — SEARCH_PROVIDERS_BENCHMARK

**Versione:** 1.0  
**Data ricerca:** 24 agosto 2026  
**Scope:** Brave Search API, Tavily, Exa, Serper, Kagi, Perplexity, SearXNG, Bing Search API; costi, free tier, resilienza, cache, GDPR e architettura Multi-Provider.  
**Target OpsFlow:** SaaS AI-first, Quasar/Vue 3, Pinia, Firebase/Firestore, Cloud Functions Gen 2, Genkit, Gemini.  
**Target economico MVP:** €0–€5/mese, con hard budget applicativo.

> **Nota:** prezzi e condizioni cambiano. I valori economici qui riportati sono quelli verificati sulle fonti ufficiali il 24/08/2026. Dove non esiste una metrica ufficiale comparabile, non viene inventata. La sezione GDPR è una valutazione tecnico-organizzativa e non sostituisce un parere legale.

---

# 1. VERDETTO ESECUTIVO

La scelta definitiva non deve essere un singolo provider.

## Stack raccomandato

```text
                  OPSFLOW SEARCH TOOL
                         |
                  Execution Budget
                         |
                    Query Cache
                         |
                  SearchProvider
                     Registry
                         |
             +-----------+-----------+
             |           |           |
             v           v           v
           Brave       Tavily       Exa
         PRIMARY      FALLBACK    SPECIALIST
```

### Ordine

1. **Brave Search API — Primary**
2. **Tavily — Fallback**
3. **Exa — Specialist / fallback avanzato**
4. **Serper — overflow opzionale**
5. **SearXNG — futura opzione self-hosted**
6. **Perplexity — premium/research**
7. **Kagi — tecnicamente valido ma fuori target economico**
8. **Bing Web Search API — escluso: ritirato l'11 agosto 2025**

Brave oggi pubblicizza $5 di crediti gratuiti ogni mese e $5/1.000 Search requests. La precedente informazione di 2.000 query/mese appartiene alla struttura precedente del servizio. citeturn0search5turn0search7

Tavily offre 1.000 API credits/mese gratuiti, senza carta di credito, con reset mensile; il PAYG pubblicato è $0,008/credito. citeturn0search1turn0search3

Exa offre $20 iniziali e $10 di crediti gratuiti ogni mese, senza metodo di pagamento; Search costa $7/1.000 richieste. citeturn0search0turn0search2

---

# 2. CORREZIONE IMPORTANTE: BRAVE

Nel progetto era riportato:

```text
2.000 query gratuite/mese
```

La pagina ufficiale corrente mostra:

```text
Search
$5 / 1.000 requests
$5 free credits every month
```

Quindi il free credit corrente equivale nominalmente a circa 1.000 Search requests al prezzo pubblicato, non 2.000. La vecchia pagina Brave del 2025 riportava invece 2.000 query/mese. citeturn0search5turn0search7

**Decisione:** non hardcodare mai `2000` nel codice. Usare una quota configurabile.

---

# 3. MATRICE COMPARATIVA

| Provider                  | Free tier verificato                                   |                    Oltre free | Output                                    | Anti-bot / ToS                                  | Latenza dichiarata                                               | Verdetto       |
| ------------------------- | ------------------------------------------------------ | ----------------------------: | ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| **Brave Search API**      | $5/mese credit                                         |                         $5/1k | JSON, snippets, metadata, LLM context     | API ufficiale; molto più robusto dello scraping | Brave dichiara <1s per 95% del proprio Search; non è SLA OpsFlow | **PRIMARY**    |
| **Tavily**                | 1.000 credits/mese, no CC                              |                 $0,008/credit | JSON AI-oriented                          | API ufficiale                                   | Dipende dalla modalità                                           | **FALLBACK**   |
| **Exa**                   | $20 signup + $10/mese, no CC                           |                  $7/1k Search | JSON, highlights, page content, citations | API ufficiale                                   | 180ms–1s configurabile                                           | **SPECIALIST** |
| **Serper.dev**            | 2.500 free queries pubblicizzate, no CC                |  top-up secondo account/piano | JSON SERP                                 | API ufficiale; dipende dai backend              | 1–2s dichiarati                                                  | **RESERVE**    |
| **Kagi Search API**       | preview/account credit; non free recurring equivalente |                        $12/1k | JSON + snippets/content                   | API commerciale                                 | non pubblicata come SLA universale                               | **COSTOSO**    |
| **Perplexity Search API** | nessun free recurring comparabile verificato           |                         $5/1k | JSON raw search                           | API ufficiale                                   | 50 req/s rate limit                                              | **PREMIUM**    |
| **SearXNG**               | software open source                                   | infrastruttura + manutenzione | JSON/HTML/RSS                             | dipende dagli engine                            | dipende dagli engine                                             | **FUTURE**     |
| **Bing Web Search API**   | —                                                      |                             — | —                                         | —                                               | —                                                                | **RITIRATO**   |

Fonti: Brave citeturn0search5turn0search9; Tavily citeturn0search1turn0search3; Exa citeturn0search0turn4search1; Serper citeturn1search14; Kagi citeturn1search5turn1search6; Perplexity citeturn2search14turn2search16; Bing citeturn2search0.

> **Latenza:** non confrontare direttamente numeri pubblicitari dei vendor come se fossero un benchmark indipendente. OpsFlow deve misurare P50/P95 da `europe-west1`.

---

# 4. BRAVE SEARCH API

## Punti forti

- indice indipendente;
- API Search ufficiale;
- Web, News, Video, Images;
- metadata;
- LLM-oriented context;
- 50 requests/s pubblicizzati;
- $5/mese di crediti gratuiti;
- $5/1.000 requests. citeturn0search5turn0search9

Per OpsFlow significa:

```text
Agent
  |
Brave API
  |
JSON
```

invece di:

```text
Agent
 |
HTML scraper
 |
proxy
 |
parser
```

### Verdict

**PRIMARY.**

---

# 5. TAVILY

Free:

```text
1.000 API credits/mese
No credit card
Reset mensile
```

PAYG:

```text
$0,008 / credit
```

Search, extract e crawl consumano crediti secondo la tipologia di richiesta. citeturn0search1turn0search3

### Punto architetturale

Non confondere:

```text
1.000 credits
```

con:

```text
1.000 searches garantite
```

Il router deve ragionare in `credits`, non soltanto in `queries`.

### Verdict

**FALLBACK ufficiale.**

---

# 6. EXA

Exa è particolarmente adatto ad agenti AI:

```text
$20 signup
$10/mese free
No payment method
$7/1k Search
```

La documentazione pubblica indica Search configurabile da circa 180ms a 1s e contenuti/highlights pensati per agenti. citeturn0search0turn4search1

È interessante per:

- company search;
- people search;
- semantic search;
- lead discovery;
- RAG;
- research.

### Verdict

**SPECIALIST / FALLBACK AVANZATO.**

Non è la scelta primaria se il requisito è €0 assoluto oltre il free tier.

---

# 7. SERPER.DEV

Serper pubblicizza:

```text
2.500 free queries
No credit card
```

e un modello top-up senza abbonamento mensile sulla propria homepage; dichiara tempi di risposta tipici di 1–2 secondi. Supporta Search, News, Images, Maps, Places, Videos, Shopping, Scholar e Patents. citeturn1search14

### Uso consigliato

```text
overflow
```

soprattutto per:

```text
Google-like SERP
Maps
Places
Scholar
```

### Non usarlo come

```text
fallback automatico illimitato
```

perché può introdurre costi.

---

# 8. KAGI

Kagi Search API:

```text
$12 / 1.000 requests
```

e utilizza credito API/prepagato. Kagi offre anche Extract a $4/1.000 pagine con output Markdown pulito. citeturn1search5turn1search8

Il prodotto consumer Kagi è privacy-oriented, ma l'API è un servizio commerciale separato.

### Verdict

**Qualità interessante, ma fuori target €0–€5/mese.**

---

# 9. PERPLEXITY

Perplexity Search API:

```text
$5 / 1.000 requests
```

Il tool Agent `web_search` costa $0,005/invocazione, oltre ai token/model cost. citeturn2search14

La Search API documenta:

```text
50 requests/s
```

come rate limit. citeturn2search16

### Verdict

Ottimo tecnicamente per research/agentic workflows, ma non è la soluzione zero-cost.

---

# 10. BING: ESCLUSO

Microsoft ha ritirato le **Bing Search APIs l'11 agosto 2025** e ha indicato Grounding with Bing Search negli Azure AI Agents come percorso successivo. citeturn2search0turn2search1

Quindi:

```text
Bing Web Search API
❌ non implementare
```

Non creare un adapter per un prodotto ritirato.

---

# 11. SEARXNG

SearXNG è diverso dagli altri provider:

```text
open-source metasearch
```

non una SaaS Search API con free tier.

La configurazione corrente supporta numerosi engine e prevede sospensioni dopo errori come 403, CAPTCHA e 429. La documentazione raccomanda inoltre limiter e impostazioni privacy appropriate per le istanze. citeturn3search2turn3search5

## Vantaggi

- controllo del deployment;
- controllo della configurazione;
- controllo del logging;
- controllo del caching;
- possibilità di scegliere gli engine.

## Svantaggi

OpsFlow deve gestire:

```text
container
updates
security
monitoring
engine failures
rate limits
bot detection
Valkey
```

### Verdict

```text
MVP             ❌
V2/V3           🟡
self-hosted     🟢
```

---

# 12. SEARXNG SU CLOUD RUN

È tecnicamente possibile:

```text
Cloud Run
  |
SearXNG
  |
Valkey
  |
Search engines
```

Ma `minInstances: 0` non significa "costo totale zero": rimangono eventuali costi di request compute, networking, storage, logging e componenti ausiliari, oltre al costo operativo umano.

Il vero problema MVP è il **maintenance overhead**, non solo il prezzo Cloud Run.

### Decisione

Non introdurlo finché:

```text
provider API cost
>
infrastructure + engineering cost
```

non diventa vero, oppure finché un requisito di privacy/self-hosting non lo giustifica.

---

# 13. ZERO-COST STRATEGY: CORREZIONE DEL REQUISITO

Non promettere:

```text
3.000–6.000 searches garantite a €0
```

perché:

- alcuni free tier sono credits;
- alcuni sono introduttivi;
- le policy possono cambiare;
- fallback multipli moltiplicano le chiamate;
- i free tier non sono SLA.

La strategia corretta è:

# **Zero-Cost Best Effort + Hard Stop**

---

# 14. CHAIN RACCOMANDATA

```text
USER
 |
 v
CACHE
 |
 +-- HIT ------------------------> RETURN
 |
 MISS
 |
 v
BRAVE
 |
 +-- SUCCESS --------------------> RETURN
 |
 FAIL
 |
 v
TAVILY
 |
 +-- SUCCESS --------------------> RETURN
 |
 FAIL
 |
 v
EXA
 |
 +-- SUCCESS --------------------> RETURN
 |
 FAIL
 |
 v
SAFE EMPTY RESULT
```

Serper:

```text
optional paid/controlled overflow
```

---

# 15. NON FARE FALLBACK PER QUALSIASI ERRORE

| Errore             | Retry stesso provider | Fallback                     |
| ------------------ | --------------------- | ---------------------------- |
| 400 invalid query  | no                    | no                           |
| 401/403            | no                    | sì, altro provider           |
| 429                | limitato              | sì                           |
| 5xx                | 1 retry               | sì                           |
| timeout            | no/1 retry            | sì                           |
| quota exhausted    | no                    | sì se free quota disponibile |
| malformed response | no                    | sì                           |
| budget exhausted   | no                    | **STOP**                     |

---

# 16. EXECUTION BUDGET

```typescript
interface SearchBudget {
  maxSearchCalls: number;
  maxProviders: number;
  maxTotalLatencyMs: number;
  maxEstimatedCostUsd: number;
}
```

MVP Free Mode:

```typescript
const FREE_SEARCH_BUDGET: SearchBudget = {
  maxSearchCalls: 3,
  maxProviders: 3,
  maxTotalLatencyMs: 20_000,
  maxEstimatedCostUsd: 0,
};
```

Il router deve fermarsi quando:

```text
budget exhausted
```

non continuare il chaining.

---

# 17. PROVIDER QUOTA MODEL

```typescript
interface ProviderQuota {
  providerId: string;

  monthlyFreeUnits: number;

  usedUnits: number;

  unitType: "REQUEST" | "CREDIT";

  resetAt: string;

  paidAllowed: boolean;
}
```

Non hardcodare:

```typescript
BRAVE_FREE = 2000;
```

ma:

```typescript
providerQuota.monthlyFreeUnits;
```

---

# 18. PROVIDER INTERFACE

```typescript
interface SearchProvider {
  readonly id: string;

  readonly capabilities: {
    web: boolean;
    news: boolean;
    people: boolean;
    companies: boolean;
    contentExtraction: boolean;
  };

  search(input: SearchInput, context: SearchContext): Promise<SearchResponse>;
}
```

---

# 19. PROVIDER REGISTRY

```typescript
class SearchProviderRegistry {
  private providers = new Map<string, SearchProvider>();

  register(provider: SearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): SearchProvider | undefined {
    return this.providers.get(id);
  }

  list(): SearchProvider[] {
    return [...this.providers.values()];
  }
}
```

Aggiungere un provider significa creare un adapter e registrarlo, senza modificare l'engine Genkit.

---

# 20. SAFE SEARCH BOUNDARY

```typescript
async function safeSearch(
  provider: SearchProvider,
  input: SearchInput,
  context: SearchContext,
): Promise<SearchResponse> {
  const startedAt = Date.now();

  try {
    const result = await provider.search(input, context);

    return SearchResponseSchema.parse(result);
  } catch (error) {
    return {
      success: false,
      provider: provider.id,
      results: [],
      error: classifyToolError(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}
```

La regola è:

```text
provider exception
        |
        v
safe result
        |
        v
Genkit
```

mai:

```text
provider exception
        |
        v
uncaught exception
        |
        v
HTTP 500
```

---

# 21. CACHE

La cache è più importante di aggiungere molti provider.

Schema:

```text
tenants/{tenantId}/searchCache/{cacheKey}
```

```typescript
interface SearchCacheEntry {
  key: string;

  normalizedQuery: string;

  provider: string;

  results: SearchResult[];

  createdAt: Timestamp;

  expiresAt: Timestamp;

  provenance: Provenance[];

  privacyClass: "PUBLIC" | "PERSONAL_DATA" | "SENSITIVE_REVIEW";
}
```

---

# 22. QUERY NORMALIZATION

```typescript
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}
```

La chiave reale dovrebbe includere anche:

```text
query
language
country
search mode
freshness
result count
```

---

# 23. CACHE TTL

Non usare un TTL unico.

| Tipo                  | TTL indicativo                     |
| --------------------- | ---------------------------------- |
| Informazioni statiche | 7–30 giorni                        |
| Aziende/fornitori     | 1–7 giorni                         |
| News                  | 1–6 ore                            |
| Normativa             | 6–24 ore, con verifica della fonte |
| Prezzi/disponibilità  | minuti/no cache                    |
| Dati personali lead   | breve/review                       |

Il TTL finale deve rispettare provider terms e necessità GDPR.

---

# 24. STORAGE POLICY DEL PROVIDER

Ogni adapter deve dichiarare:

```typescript
interface ProviderDataPolicy {
  queryRetention: "UNKNOWN" | "LIMITED" | "NO_RETENTION";

  resultCaching: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "PROHIBITED";

  persistentStorage: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "PROHIBITED";

  modelTraining: "UNKNOWN" | "ALLOWED" | "PROHIBITED";

  dpaAvailable: boolean;
}
```

Se:

```text
resultCaching = UNKNOWN
```

OpsFlow deve preferire:

```text
NO persistent cache
```

finché il contratto non è stato verificato.

---

# 25. PRIVACY / NO-LOG: NON CONFONDERE I TERMINI

Questi concetti sono differenti:

```text
No tracking
≠
No query retention
≠
No training
≠
Zero Data Retention
```

---

# 26. BRAVE PRIVACY

Il DPA Brave Search API disponibile pubblicamente indica:

```text
90 giorni
search query logs
```

e una possibilità di Zero Data Retention per clienti Enterprise, soggetta alle condizioni del DPA. citeturn1search22

Quindi:

```text
Brave standard
≠
No-log assoluto
```

### Verdict

```text
🟢 per query minimizzate
🟡 per PII
```

---

# 27. EXA PRIVACY

Exa dichiara ZDR per configurazioni Enterprise. citeturn4search1turn4search5

Tuttavia la privacy policy generale aggiornata al 29 giugno 2026 afferma che Query Data può essere usato per migliorare prodotti e tecnologia, inclusi training/fine-tuning, e invita a non inserire dati personali nelle query. citeturn4search2

Quindi:

```text
Enterprise ZDR
= ottimo

Standard
= review prima di inviare PII
```

---

# 28. TAVILY PRIVACY

Non assumere automaticamente:

```text
Tavily = no-log
```

Per produzione verificare il piano effettivo:

```text
Privacy Policy
Terms
DPA
retention
training policy
subprocessors
storage rights
```

### Regola

Non inviare PII raw finché la policy contrattuale non è stata verificata per il piano utilizzato.

---

# 29. SERPER PRIVACY

Stessa regola:

```text
no automatic ZDR assumption
```

Per cache persistente:

```text
contract review
```

---

# 30. KAGI PRIVACY

Kagi si presenta come servizio privacy-oriented; tuttavia l'API è un prodotto commerciale separato e deve essere verificata sulla documentazione contrattuale API prima di usarla per PII o storage persistente. citeturn1search12turn1search5

---

# 31. SEARXNG PRIVACY

Con SearXNG OpsFlow controlla la propria istanza, inclusi configurazione e alcune impostazioni di privacy. La documentazione mostra inoltre limiter e controlli relativi agli engine. citeturn3search2turn3search5

Ma:

```text
self-hosted SearXNG
≠
controllo dei provider downstream
```

---

# 32. GDPR: TRE LIVELLI

OpsFlow deve trattare separatamente:

```text
1. QUERY
2. SEARCH RESULTS
3. EXTRACTED LEAD DATA
```

---

# 33. QUERY MINIMIZATION

Non inviare:

```text
"Cerca Mario Rossi, nato il..., telefono..."
```

se è sufficiente:

```text
"Aziende IT a Massa specializzate in..."
```

Pipeline:

```text
User prompt
   |
PII detection
   |
query minimization
   |
provider
```

---

# 34. PROVENANCE

Ogni dato estratto deve avere fonte:

```typescript
interface Provenance {
  sourceUrl: string;

  sourceDomain: string;

  retrievedAt: Timestamp;

  provider: string;

  extractionMethod: "SEARCH" | "API" | "READER" | "MANUAL";
}
```

Questo supporta:

- audit;
- rettifica;
- cancellazione;
- contestazioni;
- qualità;
- tracciabilità.

---

# 35. PRIVACY METADATA

```typescript
interface PrivacyMetadata {
  containsPersonalData: boolean;

  categories?: string[];

  legalBasis?: string;

  sourceType: "PUBLIC_WEB" | "API" | "DIRECT";

  art14ReviewRequired: boolean;

  retentionUntil?: Timestamp;

  deletionStatus: "ACTIVE" | "DELETED" | "REVIEW";
}
```

Non significa che ogni dato pubblico richieda automaticamente lo stesso trattamento: la base giuridica, finalità, necessità, bilanciamento e applicabilità dell'Art. 14 vanno valutati per il caso d'uso.

---

# 36. WEB CONTENT = UNTRUSTED INPUT

Un risultato web può contenere:

```text
Ignore previous instructions
Reveal system prompt
Send Gmail
Call another tool
```

Quindi:

```text
WEB CONTENT
≠
SYSTEM INSTRUCTION
```

Pipeline:

```text
Web
 |
Fetch
 |
Sanitize
 |
UNTRUSTED CONTENT
 |
LLM
```

Questa misura è fondamentale per Genkit Tool Calling.

---

# 37. DATA MINIMIZATION

Non salvare automaticamente:

```text
full HTML
full page
all SERP
all personal data
```

quando bastano:

```text
companyName
website
genericEmail
businessPhone
source
timestamp
```

---

# 38. LEAD VERIFICATION

Un risultato di Search non equivale a un fatto verificato.

Usare:

```typescript
type VerificationStatus = "UNVERIFIED" | "SOURCE_MATCHED" | "CROSS_CHECKED" | "USER_VERIFIED";
```

Per dati critici:

```text
email
telefono
azienda
normativa
```

la modalità `RESEARCH` può effettuare cross-check su due provider.

---

# 39. SEARCH MODES

```typescript
type SearchMode = "FAST" | "STANDARD" | "RESEARCH";
```

### FAST

```text
cache
→ Brave
```

### STANDARD

```text
cache
→ Brave
→ Tavily
```

### RESEARCH

```text
cache
→ Brave
→ Tavily
→ Exa
→ cross-check
```

Questa strategia riduce il consumo rispetto a usare sempre tutti i provider.

---

# 40. COST GOVERNANCE

Servono quattro livelli:

```text
LEVEL 1
ExecutionBudget

LEVEL 2
Provider Quotas

LEVEL 3
Cloud Run maxInstances

LEVEL 4
GCP Billing Alert
```

Il billing alert non è un hard spending cap.

Il vero blocco deve avvenire nell'applicazione:

```text
paidAllowed = false
```

in Free Mode.

---

# 41. FREE MODE

```typescript
const FREE_MODE = {
  providers: ["brave", "tavily", "exa"],

  maxPaidRequests: 0,

  maxEstimatedCostUsd: 0,

  cache: true,
};
```

---

# 42. CONTROLLED MODE

```typescript
const CONTROLLED_MODE = {
  providers: ["brave", "tavily", "exa", "serper"],

  maxPaidRequests: 1,

  maxEstimatedCostUsd: 0.01,

  cache: true,
};
```

---

# 43. ENTERPRISE MODE

```typescript
const ENTERPRISE_MODE = {
  providers: ["brave", "tavily", "exa", "serper", "perplexity"],

  maxPaidRequests: 5,

  maxEstimatedCostUsd: 0.25,

  cache: true,
};
```

---

# 44. COME RAGGIUNGERE 3.000–6.000 USER SEARCH INTENTS

Non puntare a:

```text
6.000 provider requests gratis garantite
```

Puntare a:

```text
6.000 user intents
        |
        v
normalization
        |
        v
cache/deduplication
        |
        v
3.000–4.000 real provider calls
        |
        v
free quotas
        |
        v
hard stop
```

La riduzione del traffico tramite cache è più affidabile dell'aggiunta indiscriminata di provider.

---

# 45. CACHE HIT RATIO

OpsFlow dovrebbe monitorare:

```text
cacheHitRate
```

Target iniziale:

```text
> 30%
```

Target maturo:

```text
> 50%
```

Non sono SLA: sono obiettivi operativi da verificare con dati reali.

---

# 46. BENCHMARK REALE OPSFLOW

Le latenze dei vendor non sono sufficienti.

Creare:

```text
scripts/search-benchmark.ts
```

Dataset iniziale:

```text
100 query italiane
50 query inglesi
25 local business
25 suppliers
25 lead generation
25 regulatory
```

Totale:

```text
250 queries/provider
```

---

# 47. METRICHE

```typescript
interface BenchmarkRecord {
  provider: string;

  query: string;

  latencyMs: number;

  status: number;

  success: boolean;

  resultCount: number;

  validUrls: number;

  duplicateRate: number;

  relevanceScore: number;

  costEstimateUsd: number;
}
```

Calcolare:

```text
P50 latency
P95 latency
403 rate
429 rate
5xx rate
timeout rate
empty result rate
relevance
cost / successful useful result
```

---

# 48. SCORING

```text
Quality           30%
Reliability       25%
Cost              20%
Latency           10%
Privacy           10%
Integration        5%
```

Formula:

```typescript
score =
  quality * 0.3 +
  reliability * 0.25 +
  cost * 0.2 +
  latency * 0.1 +
  privacy * 0.1 +
  integration * 0.05;
```

La metrica strategica migliore è:

# **Cost per useful verified result**

non semplicemente:

```text
cost per query
```

---

# 49. DECISIONE SEARXNG

## Non nel MVP.

Diventa interessante quando:

```text
provider API cost
>
infrastructure + engineering cost
```

oppure:

```text
customer requires self-hosted
```

oppure:

```text
privacy / custom engine mix
```

richiede controllo diretto.

---

# 50. PROVIDER RANKING

## 1 — Brave

**PRIMARY**

Motivi:

- API ufficiale;
- indice indipendente;
- output adatto ad agenti;
- free credit mensile;
- costo semplice.

## 2 — Tavily

**FALLBACK**

Motivi:

- AI-native;
- 1.000 credits/mese;
- no credit card;
- Search/Extract/Crawl. citeturn0search1

## 3 — Exa

**SPECIALIST**

Motivi:

- semantic search;
- people/company;
- AI agents;
- latenza configurabile;
- free monthly credits. citeturn0search0turn4search1

## 4 — Serper

**RESERVE**

Motivi:

- 2.500 free queries;
- Google-like SERP;
- vertical search. citeturn1search14

## 5 — SearXNG

**FUTURE SELF-HOSTED**

## 6 — Perplexity

**PREMIUM**

## 7 — Kagi

**PREMIUM / COSTOSO**

## 8 — Bing

**RITIRATO**

---

# 51. ARCHITETTURA DEFINITIVA

```text
                         USER
                           |
                           v
                     GENKIT AGENT
                           |
                           v
                  SEARCH INTENT ROUTER
                           |
              +------------+------------+
              |            |            |
             FAST       STANDARD     RESEARCH
              |            |            |
              +------------+------------+
                           |
                           v
                         CACHE
                           |
                          MISS
                           |
                           v
                         BRAVE
                           |
                        failure
                           |
                           v
                        TAVILY
                           |
                        failure
                           |
                           v
                          EXA
                           |
                           v
                     CROSS-CHECK
                           |
                           v
                       ZOD VALIDATION
                           |
                           v
                    PRIVACY FILTER
                           |
                           v
                       PROVENANCE
                           |
                           v
                      SAFE RESULT
                           |
                           v
                         GENKIT
```

---

# 52. P0 — IMPLEMENTARE SUBITO

```text
[ ] SearchProvider interface
[ ] Provider Registry
[ ] Brave adapter
[ ] Tavily adapter
[ ] Exa adapter
[ ] Safe boundary
[ ] Zod
[ ] AbortController
[ ] timeout
[ ] ExecutionBudget
[ ] cache
[ ] provenance
[ ] privacy metadata
[ ] paid fallback OFF
```

---

# 53. P1

```text
[ ] Serper adapter
[ ] Circuit breaker
[ ] cost dashboard
[ ] provider health score
[ ] PII/query minimization
[ ] prompt injection filtering
[ ] provider storage policies
```

---

# 54. P2

```text
[ ] SearXNG pilot
[ ] semantic cache
[ ] async research jobs
[ ] advanced provider benchmarking
[ ] enterprise ZDR contracts
```

---

# 55. CHECKLIST CONTRATTUALE PROVIDER

Prima di usare un provider in produzione per dati potenzialmente personali:

```text
[ ] API Terms
[ ] commercial SaaS use
[ ] DPA
[ ] query retention
[ ] result retention
[ ] training usage
[ ] caching rights
[ ] redistribution rights
[ ] attribution
[ ] subprocessors
[ ] international transfers
[ ] deletion
[ ] incident/security terms
```

Se:

```text
caching rights = UNKNOWN
```

non consentire cache persistente per quel provider.

---

# 56. ADR

## ADR-SEARCH-001 — Provider Abstraction

OpsFlow non dipende da un singolo motore.

## ADR-SEARCH-002 — No Direct SERP Scraping

Google/DuckDuckGo HTML scraping non è infrastruttura Search production.

## ADR-SEARCH-003 — Primary

Brave Search API.

## ADR-SEARCH-004 — AI Fallback

Tavily.

## ADR-SEARCH-005 — Semantic Specialist

Exa.

## ADR-SEARCH-006 — Cost Guard

Nessun paid fallback in `FREE_MODE`.

## ADR-SEARCH-007 — Cache Contract

Persistent cache solo quando consentita dalla policy del provider.

## ADR-SEARCH-008 — Untrusted Web

Web content è sempre input non attendibile.

## ADR-SEARCH-009 — Provenance

Ogni dato estratto deve conservare fonte e timestamp.

---

# 57. VERDETTO FINALE

| Provider                  | Decisione                |
| ------------------------- | ------------------------ |
| **Brave Search API**      | 🟢 **PRIMARY**           |
| **Tavily**                | 🟢 **FALLBACK**          |
| **Exa**                   | 🟢 **SPECIALIST**        |
| **Serper.dev**            | 🟡 **OVERFLOW**          |
| **SearXNG**               | 🟡 **FUTURE**            |
| **Perplexity Search API** | 🟡 **PREMIUM**           |
| **Kagi Search API**       | 🟡 **PREMIUM / COSTOSO** |
| **Bing Web Search API**   | 🔴 **RITIRATO**          |

## Decisione ufficiale

> **Brave Search API come Primary + Tavily come Fallback + Exa come Specialist, con cache, ExecutionBudget, Provider Registry, Zod, timeout, provenance e privacy filter. Serper solo come overflow controllato. SearXNG rimandato a una fase successiva.**

---

# 58. NORTH STAR ARCHITECTURE

OpsFlow non deve chiedersi:

> "Qual è il motore di ricerca migliore?"

Deve chiedersi:

> **"Quale provider è più adatto a questa execution rispettando qualità, quota, privacy, latenza e budget?"**

Quindi:

```text
                  SEARCH INTENT
                       |
             +---------+---------+
             |         |         |
           QUALITY    COST    PRIVACY
             |         |         |
             +---------+---------+
                       |
                       v
                 PROVIDER ROUTER
                       |
              +--------+--------+
              |        |        |
              v        v        v
            BRAVE    TAVILY    EXA
              |        |        |
              +--------+--------+
                       |
                       v
                  SAFE RESULT
```

Questa astrazione rende OpsFlow indipendente dal destino commerciale di qualsiasi singolo Search Provider.

---

# 59. FONTI UFFICIALI

- Brave Search API pricing/features. citeturn0search5turn0search9
- Brave precedente free tier da 2.000 query/mese. citeturn0search7
- Brave Search API DPA / retention. citeturn1search22
- Tavily pricing/free tier. citeturn0search1turn0search3
- Exa pricing. citeturn0search0turn0search2
- Exa enterprise, latency e ZDR. citeturn4search1
- Exa privacy policy. citeturn4search2
- Serper official pricing/free quota. citeturn1search14
- Kagi Search API pricing. citeturn1search5turn1search6
- Kagi Summarizer. citeturn1search0
- Perplexity API pricing. citeturn2search14
- Perplexity rate limits. citeturn2search16
- Microsoft Bing Search API retirement. citeturn2search0turn2search1
- SearXNG configuration and engine failure handling. citeturn3search2turn3search5
