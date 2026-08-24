# Consulenza Tecnico-Giuridica & AI Systems Audit — OpsFlow

## 1. Parere legale

1. Questo è un parere operativo e non sostituisce una valutazione legale formale per OpsFlow.
2. La disponibilità pubblica di una pagina non rende automaticamente leciti scraping, riuso, conservazione o rivendita dei dati.
3. Il proxy `r.jina.ai → DuckDuckGo HTML` è tecnicamente fragile e può violare ToS, policy anti-automazione o diritti sui contenuti; DuckDuckGo autorizza l’uso dei servizi “as authorized” e può sospendere l’accesso.
4. Non bisogna aggirare CAPTCHA, login, rate limit, blocchi IP, `robots.txt` o altri controlli di accesso.
5. Il Garante italiano richiede una valutazione caso per caso di base giuridica, finalità, minimizzazione, riuso e diritti sui contenuti; il web scraping non è “inattaccabile” solo perché i dati sono online.
6. La soluzione più difendibile è usare API ufficiali con contratto, ToS e DPA verificati, conservando solo risultati minimi: URL, titolo, snippet e data di verifica.
7. Un medico, professionista individuale o artigiano è normalmente persona fisica: nome, email, telefono e sede possono essere dati personali.
8. Servono base giuridica Art. 6, informativa Art. 14, registro Art. 30, misure Art. 32, tempi di conservazione, procedura di opposizione e valutazione DPIA ove il trattamento sia sistematico.
9. Per email promozionali in Italia, la pubblicazione online o in un registro pubblico non sostituisce normalmente il consenso richiesto dall’Art. 130 del Codice Privacy.
10. La Legge 145/2018 riguarda principalmente la Digital Services Tax, non autorizza lo scraping; va rimossa dal capitolo “base legale dello scraping” e trattata separatamente come materia fiscale.

## 2. Matrice comparativa

| Provider                            | Costo                                                                                                                                                                                                                | Rischio blocco/ToS                                                                                                                                                                                         | Affidabilità Genkit                                                                | Verdetto                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Jina Search API** `s.jina.ai`     | Free tier con token gratuiti iniziali; il servizio è token-based e una ricerca parte da circa 10.000 token. Limiti pubblicati: 100 RPM senza chiave, 100 RPM con chiave free e 1.000 RPM con chiave paid.            | Basso-medio. È un’API nativa e non richiede di costruire direttamente uno scraper DDG, ma Jina dichiara di rispettare i blocchi del sito target: i ToS e i diritti dei siti originari restano applicabili. | Alta, se si gestiscono timeout, 403, 429, JSON non valido e risposte vuote.        | **Scelta consigliata per il prototipo e il budget minimo.** Usare `s.jina.ai/?q=...`, non `r.jina.ai/https://html.duckduckgo.com/...`. |
| **Google Custom Search JSON API**   | 100 query gratuite/giorno, poi 5 USD per 1.000 query. Tuttavia la documentazione aggiornata indica che è disponibile solo ai clienti esistenti e sarà dismessa il 1° gennaio 2027.                                   | Basso usando l’API ufficiale; alto se si interroga direttamente Google Search con scraping o query automatizzate non autorizzate.                                                                          | Alta, JSON strutturato e comportamento prevedibile.                                | **Non adottare per una nuova architettura**: disponibilità chiusa ai nuovi clienti e dismissione prevista.                             |
| **DuckDuckGo HTML + header custom** | Apparentemente 0 €, ma senza SLA né contratto API.                                                                                                                                                                   | **Alto**: CAPTCHA, 403, blocchi IP, instabilità e possibile violazione di ToS. Cambiare `User-Agent` non crea un’autorizzazione.                                                                           | Bassa: HTML variabile, parsing fragile, timeout e risposta non deterministica.     | **Da eliminare.** Mai usare header custom per aggirare sistemi anti-bot.                                                               |
| **Tavily Search API**               | 1.000 crediti gratuiti/mese; ricerca basic = 1 credito, advanced = 2 crediti.                                                                                                                                        | Basso-medio sul piano tecnico, ma bisogna verificare ToS, DPA, conservazione delle query e diritti di riuso dei risultati.                                                                                 | Alta: API progettata per agenti e output JSON.                                     | Buona alternativa commerciale. Per contenere i costi usare sempre `basic`, `max_results` basso e caching.                              |
| **Serper.dev**                      | La pagina ufficiale pubblicizza prezzi da 0,30 USD per 1.000 query; le fonti pubbliche riportano 2.500 query iniziali gratuite, normalmente da considerare come trial una tantum e non come quota mensile garantita. | Basso-medio perché si usa un’API SERP, ma resta necessario verificare contratto, DPA e diritti di redistribuzione.                                                                                         | Alta: JSON semplice, tempi generalmente brevi e buono per ricerche local/business. | Buono per un pilot e per risultati Google-like; non assumere che il free tier sia ricorrente.                                          |

La matrice non elimina il rischio giuridico sui **contenuti sorgente**. Un provider può autorizzare l’accesso alla propria API senza trasferire a OpsFlow il diritto di archiviare o rivendere integralmente testi, immagini, profili o database di terzi.

## 3. `webSearch.ts`

Il principio importante è che il tool **non deve mai propagare l’eccezione** al ciclo Genkit. Deve trasformare ogni errore in un output conforme allo schema. La funzione principale deve comunque proteggere anche `ai.generate()`, perché autenticazione, validazione dello schema o errori del modello possono ancora produrre un 500.

```ts
// opsflow-functions/src/tools/webSearch.ts

import { z } from "genkit";
import { ai } from "../ai/genkitConfig";

const ProviderSchema = z.enum(["auto", "jina", "google", "tavily", "serper"]);

export const SearchInputSchema = z.object({
  query: z.string().trim().min(2).max(500),
  maxResults: z.coerce.number().int().min(1).max(10).default(5),
  provider: ProviderSchema.default("auto"),
});

export const SearchResultSchema = z.object({
  title: z.string().max(500),
  url: z.string().url(),
  snippet: z.string().max(2_000),
  source: z.string().max(40),
  publishedAt: z.string().optional(),
});

export const SearchErrorSchema = z.object({
  code: z.string().max(80),
  message: z.string().max(300),
  retryable: z.boolean(),
});

export const SearchOutputSchema = z.object({
  success: z.boolean(),
  provider: ProviderSchema,
  results: z.array(SearchResultSchema).max(10),
  error: SearchErrorSchema.optional(),
});

type SearchInput = z.infer<typeof SearchInputSchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;
type Provider = z.infer<typeof ProviderSchema>;

type HttpResult = {
  ok: boolean;
  status: number;
  data?: unknown;
  code?: string;
};

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanQuery(query: string): string {
  return query
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function safeFailure(
  provider: Provider,
  code: string,
  message: string,
  retryable = false,
): z.infer<typeof SearchOutputSchema> {
  return {
    success: false,
    provider,
    results: [],
    error: { code, message, retryable },
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;

      chunks.push(decoder.decode(chunk, { stream: true }));
      totalBytes += chunk.byteLength;

      if (value.byteLength > remaining) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.join("") + decoder.decode();
}

async function fetchJson(url: string, init: RequestInit): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "OpsFlow/1.0",
        ...(init.headers ?? {}),
      },
    });

    const body = await readBoundedText(response, MAX_RESPONSE_BYTES);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: `HTTP_${response.status}`,
      };
    }

    try {
      return {
        ok: true,
        status: response.status,
        data: JSON.parse(body) as unknown,
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        code: "INVALID_JSON",
      };
    }
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";

    return {
      ok: false,
      status: 0,
      code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

function httpFailure(provider: Provider, response: HttpResult): z.infer<typeof SearchOutputSchema> {
  const retryable =
    response.status === 429 ||
    response.status >= 500 ||
    response.code === "TIMEOUT" ||
    response.code === "NETWORK_ERROR";

  if (response.status === 403) {
    return safeFailure(
      provider,
      "PROVIDER_FORBIDDEN",
      "Il provider ha rifiutato la richiesta; nessun tentativo di bypass verrà eseguito.",
      false,
    );
  }

  if (response.status === 429) {
    return safeFailure(provider, "RATE_LIMITED", "Limite del provider raggiunto.", true);
  }

  return safeFailure(
    provider,
    response.code ?? "PROVIDER_ERROR",
    "Il provider di ricerca non ha restituito una risposta valida.",
    retryable,
  );
}

function payloadItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) {
    return [];
  }

  const candidates = [data.results, data.data, data.organic, data.items];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function normalizeResults(provider: Provider, data: unknown, maxResults: number): SearchResult[] {
  const output: SearchResult[] = [];
  const seen = new Set<string>();

  for (const item of payloadItems(data)) {
    const url = asString(item.url ?? item.link);
    const title = asString(item.title, "Risultato senza titolo");
    const snippet = asString(item.snippet ?? item.description ?? item.content);

    if (!/^https?:\/\//i.test(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    output.push({
      title: title.slice(0, 500),
      url,
      snippet: snippet.slice(0, 2_000),
      source: provider,
      publishedAt: asString(item.publishedAt ?? item.date) || undefined,
    });

    if (output.length >= maxResults) break;
  }

  return output;
}

async function searchJina(query: string): Promise<HttpResult> {
  const url = new URL("https://s.jina.ai/");
  url.searchParams.set("q", query);

  const headers: Record<string, string> = {};
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }

  return fetchJson(url.toString(), { method: "GET", headers });
}

async function searchGoogle(query: string, maxResults: number): Promise<HttpResult> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !searchEngineId) {
    return { ok: false, status: 0, code: "GOOGLE_CONFIG_MISSING" };
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", searchEngineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(maxResults, 10)));

  return fetchJson(url.toString(), { method: "GET" });
}

async function searchTavily(query: string, maxResults: number): Promise<HttpResult> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return { ok: false, status: 0, code: "TAVILY_CONFIG_MISSING" };
  }

  return fetchJson("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });
}

async function searchSerper(query: string, maxResults: number): Promise<HttpResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return { ok: false, status: 0, code: "SERPER_CONFIG_MISSING" };
  }

  return fetchJson("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
      gl: "it",
      hl: "it",
    }),
  });
}

function configuredProvider(): Provider {
  const result = ProviderSchema.safeParse(process.env.SEARCH_PROVIDER ?? "jina");

  if (!result.success || result.data === "auto") return "jina";
  return result.data;
}

async function executeSearch(input: SearchInput): Promise<z.infer<typeof SearchOutputSchema>> {
  const provider = input.provider === "auto" ? configuredProvider() : input.provider;
  const query = cleanQuery(input.query);

  if (query.length < 2) {
    return safeFailure(provider, "INVALID_QUERY", "La query è vuota o troppo breve.");
  }

  let response: HttpResult;

  switch (provider) {
    case "jina":
      response = await searchJina(query);
      break;
    case "google":
      response = await searchGoogle(query, input.maxResults);
      break;
    case "tavily":
      response = await searchTavily(query, input.maxResults);
      break;
    case "serper":
      response = await searchSerper(query, input.maxResults);
      break;
    default:
      return safeFailure(provider, "UNSUPPORTED_PROVIDER", "Provider non supportato.");
  }

  if (!response.ok) {
    console.warn("web_search_provider_failure", {
      provider,
      status: response.status,
      code: response.code,
    });
    return httpFailure(provider, response);
  }

  return {
    success: true,
    provider,
    results: normalizeResults(provider, response.data, input.maxResults),
  };
}

export const searchWebAndPlatformsTool = ai.defineTool(
  {
    name: "searchWebAndPlatformsTool",
    description:
      "Cerca informazioni pubbliche tramite un provider autorizzato. " +
      "Non aggira CAPTCHA, login, rate limit o blocchi. " +
      "Se la ricerca fallisce, restituisce success=false e results=[].",
    inputSchema: SearchInputSchema,
    outputSchema: SearchOutputSchema,
  },
  async (rawInput): Promise<z.infer<typeof SearchOutputSchema>> => {
    try {
      const parsed = SearchInputSchema.safeParse(rawInput);

      if (!parsed.success) {
        return safeFailure("auto", "INVALID_INPUT", "Parametri non validi.");
      }

      return await executeSearch(parsed.data);
    } catch (error) {
      console.error("web_search_unexpected_failure", {
        name: error instanceof Error ? error.name : "UnknownError",
      });

      return safeFailure(
        "auto",
        "UNEXPECTED_TOOL_ERROR",
        "Ricerca temporaneamente non disponibile.",
        true,
      );
    }
  },
);
```

Regola da aggiungere al prompt di sistema:

```text
If the search tool returns success=false or an empty results array:
do not invent facts, do not retry more than once, and tell the user that
the source could not be reached. Continue only with verified context.
```

## 4. Configurazione GCP

### `index.ts`

```ts
// opsflow-functions/src/index.ts

import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

import { runChatFlow } from "./ai/chatFlow";

const JINA_API_KEY = defineSecret("JINA_API_KEY");
const TAVILY_API_KEY = defineSecret("TAVILY_API_KEY");
const SERPER_API_KEY = defineSecret("SERPER_API_KEY");
const GOOGLE_CSE_API_KEY = defineSecret("GOOGLE_CSE_API_KEY");
const GOOGLE_CSE_ID = defineSecret("GOOGLE_CSE_ID");

setGlobalOptions({
  region: "europe-west1",
  cpu: "gcf_gen1",
  memory: "256MiB",
  timeoutSeconds: 60,
  concurrency: 1,
  minInstances: 0,
  maxInstances: 2,
});

export const chatWithAgent = onCall(
  {
    secrets: [JINA_API_KEY, TAVILY_API_KEY, SERPER_API_KEY, GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID],
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Autenticazione richiesta.");
    }

    try {
      return await runChatFlow({
        uid: request.auth.uid,
        tenantId: request.auth.token.tenantId,
        role: request.auth.token.role,
        input: request.data,
      });
    } catch (error) {
      console.error("chat_flow_failure", {
        name: error instanceof Error ? error.name : "UnknownError",
      });

      throw new HttpsError("internal", "Il flusso AI non è temporaneamente disponibile.");
    }
  },
);
```

| Parametro        |  Valore budget | Motivo                                                           |
| ---------------- | -------------: | ---------------------------------------------------------------- |
| `region`         | `europe-west1` | Regione UE e latenza ragionevole per OpsFlow europeo.            |
| `memory`         |       `256MiB` | Sufficiente per fetch JSON e flusso leggero; monitorare gli OOM. |
| `cpu`            |   `"gcf_gen1"` | Riduce il rischio del default Gen 2 di 1 CPU.                    |
| `timeoutSeconds` |           `60` | Il tool web ha timeout interno di 8 secondi.                     |
| `concurrency`    |            `1` | Corretta con CPU frazionaria e più sicura per lo stato Genkit.   |
| `minInstances`   |            `0` | Nessun costo di istanza idle, accettando il cold start.          |
| `maxInstances`   |            `2` | Limita moltiplicazione di costi e richieste ai provider.         |
| `App Check`      |         attivo | Riduce invocazioni abusive dalla callable function.              |
| `Auth/RBAC`      |    obbligatori | Verificare `tenantId`, `isActive` e `role` dai Custom Claims.    |

Se compaiono errori di memoria, usare:

```ts
memory: "512MiB",
cpu: "gcf_gen1",
concurrency: 1,
```

Non è possibile garantire matematicamente meno di 0,50 € al mese: il costo dipende da invocazioni, durata, log, rete, provider esterni, storage e quota gratuita. `maxInstances` limita il danno ma non costituisce un hard cap.

### Artifact Registry

Per sviluppo:

```bash
firebase functions:artifacts:setpolicy \\
  --location europe-west1 \\
  --days 1
```

Per produzione:

```bash
firebase functions:artifacts:setpolicy \\
  --location europe-west1 \\
  --days 7
```

Policy più controllata:

```json
[
  {
    "name": "delete-old-function-images",
    "action": { "type": "Delete" },
    "condition": {
      "tagState": "any",
      "olderThan": "7d"
    }
  },
  {
    "name": "keep-recent-function-images",
    "action": { "type": "Keep" },
    "mostRecentVersions": {
      "keepCount": 3
    }
  }
]
```

Applicazione in modalità test:

```bash
gcloud artifacts repositories set-cleanup-policies REPOSITORY \\
  --project=PROJECT_ID \\
  --location=europe-west1 \\
  --policy=artifact-cleanup.json \\
  --dry-run
```

Dopo la verifica:

```bash
gcloud artifacts repositories set-cleanup-policies REPOSITORY \\
  --project=PROJECT_ID \\
  --location=europe-west1 \\
  --policy=artifact-cleanup.json \\
  --no-dry-run
```

### Cloud Storage

Non applicare una cancellazione globale al bucket Firebase. Usare TTL solo per prefissi temporanei:

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 7,
        "matchesPrefix": ["tmp/", "ai-cache/", "exports/temporary/"]
      }
    }
  ]
}
```

```bash
gcloud storage buckets update gs://PROJECT_ID.appspot.com \\
  --lifecycle-file=storage-lifecycle.json
```

Impostare inoltre:

- alert di billing a 1 €, 5 € e 10 €;
- quota giornaliera per ogni API di ricerca;
- rate limit per `tenantId` e per utente;
- cache per query normalizzate con TTL di 5–15 minuti;
- logging senza query complete, email, telefoni o contenuti recuperati;
- deploy mirati, ad esempio `firebase deploy --only functions:chatWithAgent`.

## 5. Decisione finale raccomandata

1. **Rimuovere immediatamente** `r.jina.ai/https://html.duckduckgo.com/html/?q=...`.
2. Usare `s.jina.ai/?q=...` come provider principale del prototipo, con chiave API, timeout di 8 secondi e massimo 5 risultati.
3. Mantenere un adapter provider-neutral per poter passare a Tavily o Serper senza modificare Genkit.
4. Preferire Tavily per una prima versione commerciale se DPA, retention e diritto di riuso sono accettabili.
5. Usare Serper soprattutto se servono risultati Google-like o ricerche local/business.
6. Non costruire una nuova dipendenza da Google Custom Search JSON API, vista la chiusura ai nuovi clienti e la dismissione prevista.
7. Conservare solo `title`, `url`, `snippet`, `source` e `checkedAt`; evitare il salvataggio permanente di HTML o pagine integrali.
8. Per lead contenenti persone fisiche, bloccare l’invio email automatico: l’agente può creare una **bozza**, ma l’utente deve approvarla.
9. Separare nel registro dei trattamenti ricerca web, arricchimento lead, profilazione, generazione AI e invio email.
10. Far validare prima del go-live commerciale la combinazione tra GDPR, Art. 130, diritti sui database/contenuti e ToS dei provider.
