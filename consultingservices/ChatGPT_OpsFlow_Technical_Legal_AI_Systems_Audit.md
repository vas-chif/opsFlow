# OpsFlow — Technical-Legal & AI Systems Audit

## Web Search, Genkit Robustness, GCP Cost Governance & GDPR

**Version:** 1.0  
**Date:** 22 August 2026  
**Status:** Recommended remediation baseline  
**Scope:** OpsFlow SaaS multi-tenant — Quasar/Vue 3, Pinia, Firebase Cloud Functions Gen 2, Genkit, Gemini, Firestore

> **Nota:** questo documento è una valutazione tecnico-organizzativa e non sostituisce un parere legale formale di un avvocato/DPO.

---

# 0. Executive Finding

L'incidente non è principalmente un problema di Gemini.

Il problema è architetturale:

```text
LLM
 ↓
Tool
 ↓
HTTP esterno
 ↓
exception non normalizzata
 ↓
Genkit / Function failure
 ↓
HTTP 500
```

e contemporaneamente:

```text
HTTP failure
 ↓
request resta aperta
 ↓
300 secondi × 1 GiB
 ↓
costo Cloud Run/Functions
```

La correzione raccomandata è:

```text
User
 ↓
Agent
 ↓
Tool Registry
 ↓
Provider Adapter
 ↓
HTTP timeout
 ↓
Provider response normalization
 ↓
SAFE RESULT
 ↓
Agent
```

**Un provider esterno non deve mai poter trasformare un errore HTTP in un crash dell'orchestratore.**

---

# 1. Parere Legale & Deontologico Sintetico

1. Non considerare lo scraping diretto di Google/DuckDuckGo come canale commerciale sicuro: Google vieta le query automatizzate non autorizzate e DuckDuckGo richiede l'uso conforme ai propri termini.
2. Un proxy Jina non trasferisce automaticamente a OpsFlow il diritto di interrogare/scrapare il motore sottostante.
3. Per un SaaS commerciale è preferibile usare una **Search API ufficiale/licenziata**, oppure fonti/API con condizioni compatibili con l'uso commerciale.
4. Non esiste un metodo universalmente "legalmente inattaccabile": ToS, GDPR, copyright/database rights e finalità del trattamento vanno valutati separatamente.
5. Il fatto che un dato sia pubblicamente visibile non significa che possa essere raccolto e riutilizzato senza ulteriori valutazioni GDPR.
6. Se OpsFlow tratta dati riferibili a persone fisiche, serve una base giuridica ex art. 6 GDPR; per l'interesse legittimo servono interesse, necessità e bilanciamento documentati.
7. Per dati particolari ex art. 9 GDPR il sistema deve applicare filtri/blocchi preventivi.
8. Per lead generation e marketing non bisogna confondere "dato pubblico" con "consenso al marketing": il Garante ha ribadito nel 2026 che la provenienza da fonti pubbliche non elimina automaticamente i requisiti applicabili alle comunicazioni promozionali.
9. Art. 30 e 32 GDPR devono riflettersi nella governance del trattamento, nel registro, nella sicurezza, nella minimizzazione e nella retention.
10. La **Legge 30 dicembre 2018 n. 145** è la legge di bilancio 2019, non una generale "legge italiana sul web scraping".

---

# 2. Correzione critica: Gemini 1.5 Flash

Il progetto indica:

```text
googleai/gemini-1.5-flash
```

ma al **22 agosto 2026** questo modello non è più utilizzabile: Google/Firebase indicano che Gemini 1.5 Flash è stato disattivato nel 2025.

Quindi la prima attività tecnica è:

```text
MODEL_ID
   ↓
Genkit
   ↓
AI Engine
```

Il nome del modello deve essere configurabile server-side e non hard-coded nel frontend.

Per il nuovo modello, scegliere una variante Flash/Lite attualmente supportata e ottimizzata per costo/latency, dopo aver verificato prezzi e disponibilità del progetto.

---

# 3. Root Cause dell'incidente

Il tool attuale:

```text
r.jina.ai
   ↓
html.duckduckgo.com
   ↓
403 / CAPTCHA
```

non deve essere considerato un'eccezione capace di terminare l'esecuzione.

Il principio corretto è:

```text
HTTP error = normal provider outcome
```

non:

```text
HTTP error = runtime crash
```

---

# 4. Matrice Comparativa Search Provider

| Provider                          | Costo / Free Tier                                                                                 | Rischio Blocco / ToS                                              | Affidabilità Genkit | Verdetto                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| **Jina Search / LLM-SERP**        | Free access/API key con limiti; Search Foundation ha pricing/condizioni commerciali da verificare | **Basso sul motore, ma verificare licenza commerciale del piano** | **Alta**            | Ottimo adapter tecnico; verificare condizioni per SaaS commerciale                           |
| **Google Custom Search JSON API** | 100 query/giorno per clienti esistenti                                                            | **Basso rispetto allo scraping**                                  | **Alta**            | **Non scegliere per un nuovo progetto**: chiusa a nuovi clienti e shutdown previsto 1/1/2027 |
| **DuckDuckGo HTML scraper**       | Nessun costo API diretto                                                                          | **Alto**                                                          | **Bassa/Media**     | **Da eliminare** dal percorso SaaS                                                           |
| **Tavily Search**                 | 1.000 API credits/mese free                                                                       | **Basso sul motore sottostante**                                  | **Alta**            | **Ottimo candidato** per prototipo/low-volume                                                |
| **Serper.dev**                    | 2.500 query gratuite iniziali                                                                     | **Basso sul motore sottostante**                                  | **Alta**            | **Ottimo candidato** come fallback e per basso volume                                        |

**Nota:** i free tier cambiano; prima di attivare la produzione bisogna verificare pricing, licenza commerciale e ToS del piano effettivamente utilizzato.

---

# 5. Decisione Search Engine

Non costruire:

```text
OpsFlow
 ↓
DuckDuckGo HTML
```

Costruire:

```text
OpsFlow
 ↓
SearchProvider
 ├── Tavily
 ├── Jina
 └── Serper
```

con adapter comuni.

Strategia:

```text
Primary
   ↓
Tavily / Jina

Fallback
   ↓
Serper

Emergency
   ↓
SAFE EMPTY RESULT
```

Il fallback non deve essere un altro scraper.

---

# 6. Search Provider Interface

```typescript
export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
}

export interface SearchResponse {
  success: boolean;

  provider: string;

  results: SearchResult[];

  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };

  latencyMs: number;
}

export interface SearchProvider {
  readonly id: string;

  search(query: string, signal: AbortSignal): Promise<SearchResponse>;
}
```

L'Agent non deve sapere quale provider viene utilizzato.

---

# 7. Production-Ready `webSearch.ts`

Il seguente pattern implementa Zod, timeout, AbortController, status handling, output validation e normalizzazione degli errori.

```typescript
import { z } from "zod";
import { defineTool } from "genkit";

const SearchInputSchema = z.object({
  query: z.string().trim().min(2).max(500),

  maxResults: z.number().int().min(1).max(10).default(5),

  timeoutMs: z.number().int().min(1000).max(15000).default(8000),
});

const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().optional(),
  source: z.string().optional(),
});

const SearchOutputSchema = z.object({
  success: z.boolean(),
  provider: z.string(),
  results: z.array(SearchResultSchema),

  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    })
    .optional(),

  latencyMs: z.number().nonnegative(),
});

type SearchInput = z.infer<typeof SearchInputSchema>;
type SearchOutput = z.infer<typeof SearchOutputSchema>;

const SAFE_EMPTY = (
  provider: string,
  startedAt: number,
  code: string,
  message: string,
  retryable = false,
): SearchOutput => ({
  success: false,
  provider,
  results: [],
  error: {
    code,
    message,
    retryable,
  },
  latencyMs: Date.now() - startedAt,
});

async function searchJina(input: SearchInput): Promise<SearchOutput> {
  const startedAt = Date.now();
  const provider = "jina";

  try {
    const url = `https://s.jina.ai/?q=${encodeURIComponent(input.query)}`;

    const response = await fetch(url, {
      method: "GET",

      headers: {
        Accept: "text/plain",
        "User-Agent": "OpsFlow/1.0",
      },

      signal: AbortSignal.timeout(input.timeoutMs),
    });

    if (!response.ok) {
      const retryable =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;

      return SAFE_EMPTY(
        provider,
        startedAt,
        `HTTP_${response.status}`,
        `Search provider returned HTTP ${response.status}`,
        retryable,
      );
    }

    const text = await response.text();

    if (!text.trim()) {
      return SAFE_EMPTY(
        provider,
        startedAt,
        "EMPTY_RESPONSE",
        "Search provider returned an empty response",
        true,
      );
    }

    const results: z.infer<typeof SearchResultSchema>[] = [];

    const urls = text.match(/https?:\/\/[^\s)\]]+/g) ?? [];

    for (const rawUrl of urls) {
      if (results.length >= input.maxResults) {
        break;
      }

      const cleanUrl = rawUrl.replace(/[),.;]+$/, "");

      try {
        const parsed = new URL(cleanUrl);

        results.push({
          title: parsed.hostname,
          url: parsed.toString(),
          source: parsed.hostname,
        });
      } catch {
        // Ignore malformed URLs.
      }
    }

    return {
      success: true,
      provider,
      results,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error: unknown) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";

    return SAFE_EMPTY(
      provider,
      startedAt,
      isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      isTimeout ? "Search provider timed out" : "Search provider network failure",
      true,
    );
  }
}

export const searchWebAndPlatformsTool = defineTool(
  {
    name: "searchWebAndPlatformsTool",

    description:
      "Searches the public web through an approved provider. " +
      "Provider failures are returned as safe structured results " +
      "and never intentionally crash the agent runtime.",

    inputSchema: SearchInputSchema,
    outputSchema: SearchOutputSchema,
  },
  async (input): Promise<SearchOutput> => {
    const parsed = SearchInputSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        provider: "none",
        results: [],
        error: {
          code: "INVALID_INPUT",
          message: "Invalid search parameters",
          retryable: false,
        },
        latencyMs: 0,
      };
    }

    const result = await searchJina(parsed.data);

    const validated = SearchOutputSchema.safeParse(result);

    if (!validated.success) {
      return {
        success: false,
        provider: "jina",
        results: [],
        error: {
          code: "INVALID_PROVIDER_OUTPUT",
          message: "Search provider returned invalid data",
          retryable: false,
        },
        latencyMs: result.latencyMs,
      };
    }

    return validated.data;
  },
);
```

**Nota:** per produzione è preferibile usare il formato strutturato dell'API del provider quando disponibile, anziché dipendere dal parsing del testo/Markdown restituito da una SERP.

---

# 8. Error Taxonomy

```typescript
type ToolErrorCode =
  | "INVALID_INPUT"
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PROVIDER_BLOCKED"
  | "PROVIDER_HTTP_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_PROVIDER_OUTPUT"
  | "QUOTA_EXCEEDED"
  | "UNKNOWN";
```

Questo permette all'Agent di decidere:

```text
retry
switch provider
ask user
stop
```

---

# 9. Retry Policy

### Retry

```text
408
429
500
502
503
504
timeout
```

### Non retry sullo stesso provider

```text
400
401
403
404
```

Un `403` del motore/search provider deve diventare:

```text
STOP
 ↓
FALLBACK
```

non:

```text
403
 ↓
retry × 5
 ↓
cost explosion
```

---

# 10. Token & Execution Budget

Ogni Execution deve avere:

```typescript
interface ExecutionBudget {
  maxSteps: number;
  maxToolCalls: number;
  maxSearchCalls: number;
  maxTokens: number;
  maxDurationMs: number;
  maxEstimatedCost: number;
}
```

Per MVP:

```text
maxSteps: 5
maxToolCalls: 5
maxSearchCalls: 3
maxDurationMs: 25-30 sec
```

Questo evita loop AI incontrollati.

---

# 11. GCP Configuration

Per `chatWithAgent` sincrona:

```typescript
import { onCall } from "firebase-functions/v2/https";

export const chatWithAgent = onCall(
  {
    region: "europe-west1",

    memory: "512MiB",

    timeoutSeconds: 30,

    concurrency: 1,

    minInstances: 0,

    maxInstances: 2,
  },
  async (request) => {
    // Auth validation
    // Tenant validation
    // Budget validation
    // Agent execution
  },
);
```

### Motivazioni

| Parametro    | Valore MVP | Motivo                                     |
| ------------ | ---------: | ------------------------------------------ |
| memory       |     512MiB | Punto di partenza prudente per Node/Genkit |
| timeout      |        30s | Evita request appese per minuti            |
| concurrency  |          1 | Massima prevedibilità durante MVP          |
| minInstances |          0 | Scale-to-zero                              |
| maxInstances |          2 | Protezione da runaway cost                 |

Questi valori vanno poi verificati con metriche reali.

---

# 12. Separare Chat e Heavy Jobs

Non mettere ricerche lunghe dentro una request HTTP sincrona.

### Chat

```text
chatWithAgent
 ↓
LLM
 ↓
short tools
 ↓
response
```

### Research

```text
User
 ↓
create Execution
 ↓
Cloud Tasks / worker
 ↓
Search
 ↓
Crawler
 ↓
Enrichment
 ↓
Firestore Events
 ↓
UI streaming
```

Questo elimina la necessità di mantenere una HTTP request aperta per minuti.

---

# 13. Artifact Registry

Ogni deploy può generare nuove versioni delle immagini.

Usare **Cleanup Policies**.

Strategia MVP:

```text
KEEP
5 recent versions

DELETE
untagged > 7 days

DELETE
old versions > 30 days
```

Prima applicare:

```text
DRY RUN
```

poi:

```text
ACTIVE
```

Esempio:

```json
[
  {
    "name": "keep-recent",
    "action": {
      "type": "Keep"
    },
    "mostRecentVersions": {
      "keepCount": 5
    }
  },
  {
    "name": "delete-untagged-old",
    "action": {
      "type": "Delete"
    },
    "condition": {
      "tagState": "untagged",
      "olderThan": "7d"
    }
  },
  {
    "name": "delete-old",
    "action": {
      "type": "Delete"
    },
    "condition": {
      "olderThan": "30d"
    }
  }
]
```

---

# 14. Cloud Storage Lifecycle

Solo per dati temporanei:

```text
temporary/
research-cache/
exports/
```

Esempio:

```json
{
  "rule": [
    {
      "action": {
        "type": "Delete"
      },
      "condition": {
        "age": 7,
        "matchesPrefix": ["temporary/"]
      }
    }
  ]
}
```

Non applicare questa regola ai dati applicativi permanenti.

---

# 15. GDPR Data Classification

Prima dell'LLM:

```text
Raw Web Result
      ↓
Data Classifier
      ↓
Corporate / Personal / Sensitive / Unknown
```

### Corporate

```text
company name
VAT
website
generic email
business address
```

### Personal

```text
nome.cognome@email
mobile
nome professionista
profilo individuale
```

### Sensitive

```text
health
politics
religion
sexual orientation
biometric
etc.
```

Per dati sensibili:

```text
BLOCK
```

salvo specifica base giuridica e valutazione applicabile.

---

# 16. Minimizzazione

Non estrarre:

```text
tutto ciò che il crawler trova
```

ma solamente:

```text
campi necessari alla finalità
```

Esempio:

```typescript
interface Lead {
  companyName: string;
  website?: string;
  genericEmail?: string;
  phone?: string;

  sourceUrl: string;

  collectedAt: string;
}
```

Evitare l'acquisizione automatica di dati personali non necessari.

---

# 17. Provenance

Ogni dato web deve conservare la fonte:

```typescript
interface Provenance {
  sourceUrl: string;
  sourceDomain: string;

  collectedAt: string;

  provider: string;

  extractionMethod: "search" | "reader" | "api" | "manual";

  confidence?: number;
}
```

Questo è utile per audit, rettifica, cancellazione, verifica e qualità AI.

---

# 18. GDPR Article 30

Nel Registro delle attività di trattamento deve essere rappresentata l'attività relativa a:

```text
Web Search / Lead Research / Data Enrichment
```

con almeno:

```text
Purpose
Categories of data
Categories of subjects
Recipients
Transfers
Retention
Security measures
Legal basis
```

Non significa creare necessariamente un documento art. 30 per ogni record Firestore: è una misura di governance a livello di trattamento.

---

# 19. GDPR Article 32

Misure tecniche consigliate:

```text
TLS
IAM
Firestore Security Rules
Tenant isolation
Secret Manager
Least privilege
Audit logs
Retention
Encryption
Access logging
Rate limiting
Tool permissions
```

Le API key dei provider devono vivere in:

```text
Google Secret Manager
```

e non nel frontend.

---

# 20. Marketing

Separare:

```text
Lead Research
```

da:

```text
Marketing Execution
```

La pipeline:

```text
Search
 ↓
Find email
 ↓
Send commercial email
```

non diventa automaticamente lecita perché l'email è pubblica.

L'azione marketing deve avere una policy separata e un controllo specifico prima dell'invio.

---

# 21. Search Cache

Per ridurre costi:

```text
normalized query
      ↓
hash
      ↓
cache
      ↓
hit?
 ┌────┴────┐
YES       NO
 ↓         ↓
return   provider
           ↓
         cache
```

TTL indicativi:

```text
general research: 24h
company profile: 7d
volatile data: 1h
```

---

# 22. Cost Guard

Ogni Tool dovrebbe dichiarare:

```typescript
interface ToolCostPolicy {
  estimatedCost: number;
  maxCallsPerExecution: number;
  requiresApproval: boolean;
}
```

Esempio:

```text
Search
maxCalls: 3
approval: NO

Gmail Send
maxCalls: 1
approval: YES

Bulk Enrichment
maxCalls: 1
approval: YES
```

---

# 23. SuperAdmin Budget Guard

Pipeline:

```text
Request
 ↓
Estimate
 ↓
Budget Check
 ↓
allowed?
 ├── YES → execute
 └── NO  → block
```

```typescript
interface BudgetDecision {
  allowed: boolean;
  estimatedCost: number;
  remainingBudget: number;
  reason?: string;
}
```

Il controllo deve essere server-side.

---

# 24. Budget Tiers

```typescript
type BudgetTier = "5" | "10" | "200";
```

```typescript
interface TenantAIQuota {
  monthlyBudget: number;
  currentUsage: number;

  hardLimit: boolean;

  warningThresholds: number[];

  maxExecutionCost: number;
  maxDailyCost: number;
}
```

---

# 25. Osservabilità

Per ogni Execution:

```text
executionId
   │
   ├── model
   ├── inputTokens
   ├── outputTokens
   ├── toolCalls
   ├── providerLatency
   ├── functionDuration
   ├── memory
   ├── estimatedCost
   ├── actualCost
   └── result
```

Questo permette di capire realmente da dove arriva una spesa come:

```text
€0.42
```

---

# 26. SLO MVP

```text
Normal chat:
< 5 sec

Search tool:
< 8 sec

Tool timeout:
8-10 sec

Function timeout:
30 sec

Max search calls:
3

Max execution steps:
5

Min instances:
0

Max instances:
2
```

Le attività lunghe devono diventare asincrone.

---

# 27. Decisione Finale

## ELIMINARE

```text
DuckDuckGo HTML scraping
```

dal percorso principale.

## MANTENERE

```text
Jina
```

come adapter tecnico, verificando le condizioni/licenze del piano per uso commerciale.

## AGGIUNGERE

```text
Tavily
```

come provider semplice per prototipo/low-volume.

## AGGIUNGERE

```text
Serper
```

come fallback e provider SERP Google-oriented.

## NON INVESTIRE

```text
Google Custom Search JSON API
```

per una nuova implementazione nel 2026: Google indica che è chiusa ai nuovi clienti e che il servizio termina il 1 gennaio 2027.

---

# 28. Architettura Search Definitiva

```text
                  SEARCH TOOL
                       │
                       ▼
                Search Registry
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
           Tavily    Jina      Serper
             │         │         │
             └─────────┼─────────┘
                       ▼
                 Normalizer
                       │
                       ▼
                GDPR Filter
                       │
                       ▼
                Provenance
                       │
                       ▼
                    Cache
                       │
                       ▼
                 Safe Result
                       │
                       ▼
                     Agent
```

---

# 29. Architettura Error Handling Definitiva

```text
External Provider
       │
       ▼
   HTTP Request
       │
       ▼
   AbortController
       │
       ▼
   Status Validator
       │
       ├── 2xx ────────► Parse → Zod → Safe Result
       ├── 429 ────────► Retry/Fallback
       ├── 5xx ────────► Retry/Fallback
       ├── Timeout ────► Fallback
       └── 403 ────────► STOP + Fallback
```

**Mai propagare un normale errore provider come crash del runtime.**

---

# 30. Architettura Cost Control Definitiva

```text
Request
  ↓
Authentication
  ↓
Tenant Policy
  ↓
Budget Check
  ↓
Execution Budget
  ↓
Agent
  ↓
Tool
  ↓
Provider
  ↓
Result
  ↓
Cost Meter
  ↓
Firestore Event
```

Il costo diventa un dato di dominio, non un numero scoperto a fine mese.

---

# 31. Piano di Implementazione

## P0 — Immediato

- [ ] Eliminare DuckDuckGo HTML scraper dal percorso principale.
- [ ] Aggiungere AbortController.
- [ ] Timeout Search 8-10s.
- [ ] Normalizzare ogni errore in `{ success:false, results:[] }`.
- [ ] Eliminare `throw` non gestiti dai provider adapter.
- [ ] `minInstances: 0`.
- [ ] `memory: 512MiB` salvo evidenza contraria.
- [ ] `timeoutSeconds: 30`.
- [ ] `maxInstances: 2`.
- [ ] Verificare/migrare il modello Gemini 1.5 Flash ormai disattivato.

## P1

- [ ] SearchProvider interface.
- [ ] Provider Registry.
- [ ] Tavily adapter.
- [ ] Serper adapter.
- [ ] Jina adapter.
- [ ] Retry/fallback.
- [ ] Search cache.

## P2

- [ ] Execution Budget.
- [ ] Token Budget.
- [ ] Cost Meter.
- [ ] Budget Guard.
- [ ] Tool permissions.
- [ ] Provenance.

## P3

- [ ] GDPR data classifier.
- [ ] Sensitive-data blocker.
- [ ] Retention.
- [ ] Registro trattamenti.
- [ ] DPIA screening.

## P4

- [ ] Cloud Tasks/async worker per ricerche lunghe.
- [ ] Artifact Registry cleanup.
- [ ] Cloud Storage lifecycle.
- [ ] Cost alerts.

---

# 32. ADR da Aggiungere al Blueprint Future-Proof

### ADR-013 — External Provider Isolation

Nessun provider esterno può propagare direttamente errori al runtime dell'Agent.

### ADR-014 — Search Provider Abstraction

Search Engine e crawler sono adapter sostituibili.

### ADR-015 — Tool Safe Result Contract

Ogni Tool produce un risultato strutturato e validabile.

### ADR-016 — Provider Circuit Breaker

Timeout, 403, 429 e 5xx sono gestiti da policy centralizzata.

### ADR-017 — AI Cost Governance

Ogni Execution ha budget di:

```text
tokens
steps
tool calls
time
money
```

### ADR-018 — Privacy-Aware Web Research

Separare:

```text
search
fetch
personal-data enrichment
marketing execution
```

### ADR-019 — Provenance

Ogni informazione web deve poter essere ricondotta alla fonte.

### ADR-020 — Model Abstraction

Il modello Gemini è configurabile server-side e sostituibile senza modificare il frontend.

---

# 33. Verdetto del Team

### Tecnologia

**La soluzione attuale è recuperabile senza refactoring pesante.**

Il bug 500 non richiede una riscrittura di Genkit: richiede una corretta **Tool Boundary**.

### Cloud

Il primo intervento non è cambiare provider AI.

È:

```text
timeout
memory
minInstances
maxInstances
provider timeout
Artifact cleanup
```

### AI

Il modello non deve mai ricevere un'eccezione infrastrutturale.

Deve ricevere:

```json
{
  "success": false,
  "results": [],
  "error": {
    "code": "PROVIDER_BLOCKED",
    "retryable": false
  }
}
```

### Legal

La strategia corretta non è:

> "troviamo un modo per aggirare il CAPTCHA".

È:

> **"eliminiamo la dipendenza dallo scraping del motore e utilizziamo provider/API con condizioni compatibili con il caso d'uso."**

### Business

Per il target:

```text
< €5-10/mese
```

l'architettura deve essere:

```text
scale-to-zero
+
bounded execution
+
cheap model
+
provider free tiers
+
cache
+
hard budget limits
+
async processing
```

---

# 34. Regola Finale OpsFlow

```text
NO EXTERNAL CALL
WITHOUT TIMEOUT

NO TOOL
WITHOUT SAFE RESULT

NO TOOL
WITHOUT COST LIMIT

NO PERSONAL DATA
WITHOUT PURPOSE + LEGAL BASIS

NO MARKETING ACTION
WITHOUT SEPARATE COMPLIANCE CHECK

NO LLM
WITHOUT EXECUTION BUDGET

NO PROVIDER
WITHOUT ADAPTER

NO PRODUCTION IMAGE
WITHOUT RETENTION POLICY
```

Questa combinazione affronta contemporaneamente il **500**, il rischio di runaway cost, la sostituibilità dei provider e la compliance, mantenendo la filosofia Future-Proof già definita per OpsFlow.

---

# 35. Fonti ufficiali consultate

- Google AI — Gemini deprecations/shutdown schedule.
- Google Developers — Custom Search JSON API.
- Google — Search Terms / automated traffic.
- DuckDuckGo — Terms of Service e Acceptable Use Policy.
- Jina AI — Reader/Search API e rate limits.
- Tavily — pricing e API credits.
- Serper — pricing e free queries.
- Google Cloud — Cloud Run memory, concurrency e minimum instances.
- Google Cloud — Artifact Registry cleanup policies.
- Google Cloud — Cloud Storage lifecycle.
- Garante Privacy — web scraping e dati personali.
- Garante Privacy — legittimo interesse e marketing.
- Normattiva — Legge 30 dicembre 2018, n. 145.
