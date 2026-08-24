# OpsFlow — Consulenza Tecnico-Giuridica

## Web Search Tooling, GDPR Compliance & Cost Governance

**Data:** 22 agosto 2026
**Ambito:** Bug critico `searchWebAndPlatformsTool` (crash 500), anomalia di spesa GCP, profilo legale del web scraping, hardening infrastrutturale Cloud Functions Gen 2.

---

## Sintesi Diagnostica

Il bug tecnico e l'anomalia di spesa **condividono la stessa causa**, non sono due problemi indipendenti. Un tool che va in eccezione non gestita, dentro una Cloud Function con `timeoutSeconds: 300` e `memory: 1GiB`, non fallisce "gratis": resta appeso a occupare RAM fino quasi al timeout, e quello è ciò che è stato fatturato. Risolvere il crash risolve anche metà della spesa; l'altra metà è pura configurazione Cloud Run.

---

## 1. Parere Legale & Deontologico Sintetico

> _Non redatto da un avvocato abilitato — informazione giuridica generale, non un parere legale formale su cui basare decisioni operative senza revisione professionale._

- Lo scraping via proxy contro DuckDuckGo viola i ToS di DDG (divieto esplicito di bot/automazione): rischio **contrattuale**, non penale, finché non si aggirano misure tecniche di protezione attive (CAPTCHA) — a quel punto si rientra nel reato di accesso abusivo a sistema informatico (art. 615-ter c.p.).
- Il rischio reale per OpsFlow non è il ToS del motore di ricerca — è il **GDPR sui dati che l'Agente estrae**. Il Garante Privacy ha già colpito esattamente questo caso d'uso: con il provvedimento n. 52 del 01/02/2018 ha vietato a una società l'invio di email commerciali a liberi professionisti i cui indirizzi erano stati prelevati da elenchi di pubblico dominio senza consenso. "Lead Scout" + "draft email" sui dati scraped è, sulla carta, lo stesso identico schema.
- Passare da "scraping mascherato da proxy" a un'**API di ricerca ufficiale con propri ToS** (Tavily/Serper) cambia categoria giuridica: il risultato tecnico è simile, l'esposizione contrattuale no — la responsabilità di come quel provider ottiene i dati resta sua, non di OpsFlow.
- Quando l'Agente estrae dati di contatto di un professionista (email, PEC, telefono) da fonte pubblica, scatta l'**art. 14 GDPR**: va fornita un'informativa al soggetto entro un mese, salvo sforzo sproporzionato — eccezione interpretata restrittivamente dal Garante nel provvedimento n. 329 del 20 maggio 2024 sulla protezione dei dati pubblicati online dal web scraping. Questo è l'obbligo che oggi manca nel flusso, non la scelta del motore di ricerca.

### Approfondimento

**Legalità scraping / ToS.** Il web scraping in sé non è illecito in Italia; lo diventa quando tocca dati personali senza base giuridica, quando estrae parte sostanziale di una banca dati tutelata dalla Legge sul Diritto d'Autore (L. 633/1941), o quando viola i termini di servizio configurando concorrenza sleale ex art. 2598 c.c. Non risulta un collegamento diretto tra scraping e Legge 145/2018 (legge di bilancio 2019, provvedimento omnibus) — se il riferimento era ad altro, va verificato con un legale prima di basarci una policy interna. La cornice operativa reale è: GDPR + Codice Civile + provvedimenti del Garante citati sopra.

**Alternativa a costo zero e legalmente pulita.** Usare un'API di ricerca commerciale (Tavily/Serper, vedi tabella comparativa) invece di proxare un motore di ricerca gratuito. Non è un cavillo formale: quell'API ha propri ToS che autorizzano esplicitamente l'uso programmatico, quindi non si sta aggirando nulla.

**GDPR Art. 14/30/32 sui dati di professionisti scraped.**

- _Art. 32 (sicurezza):_ i dati vanno cifrati at-rest come qualsiasi altro dato in Firestore — non serve E2EE clinico, non essendo dato sanitario.
- _Art. 30 (registro trattamenti):_ il tenant che usa OpsFlow per lead-gen dovrebbe avere una voce nel registro che descriva fonte, finalità e retention di questi contatti. OpsFlow, se orchestra la raccolta per conto del tenant, potrebbe qualificarsi come responsabile del trattamento (Art. 28 GDPR), con relativo DPA da formalizzare a contratto.
- _Art. 14 (informativa):_ il vero gap operativo attuale. Si raccomanda che l'Agente generi automaticamente un flag "informativa dovuta entro il [data]" ogni volta che salva un contatto professionale estratto dal web, invece di lasciarlo alla memoria dell'operatore.

---

## 2. Matrice Comparativa delle Soluzioni di Ricerca Web

| Provider                                 | Costo                                                                                                       | Rischio Blocco/ToS                                                                                                                                                                                                        | Affidabilità Genkit                                                           | Verdetto                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| **DuckDuckGo HTML scraping (via proxy)** | Nominalmente gratis, ma genera costi Cloud Run per retry ed errori                                          | **Altissimo** — violazione ToS diretta; il blocco IP è sistemico e non risolvibile lato client, anzi peggiora nel tempo                                                                                                   | Pessima — è la causa diretta del crash attuale, throughput imprevedibile      | ❌ **Da eliminare subito**                                |
| **Google Custom Search JSON API**        | 100/giorno gratis, poi $5/1000                                                                              | Basso sul piano contrattuale, ma l'API è disponibile solo per clienti esistenti fino alla dismissione del servizio il 1° gennaio 2027; non è più disponibile per nuovi clienti                                            | N/A                                                                           | ❌ **Non attivabile** per un progetto nuovo               |
| **Jina Search API nativa (s.jina.ai)**   | Free tier con rate limit stretti, poi a consumo token                                                       | Medio — l'aggiornamento da free a paid non garantisce l'accesso a siti che bloccano il servizio Jina; la differenza fra i tier è solo di rate limit e performance, quindi eredita comunque il rischio di blocco a monte   | Media — nessuna gestione errori nativa, richiede lo stesso wrapping difensivo | ⚠️ Utilizzabile come **secondo fallback**, non primario   |
| **Tavily Search API**                    | 1.000 crediti al mese gratuiti in modo ricorrente, senza carta di credito richiesta; oltre, $0,008/credito  | Basso — API commerciale con ToS proprie, non scraping travestito; restituisce contenuto già estratto (una chiamata sola invece di search+scrape)                                                                          | Alta — risposta JSON pulita, pensata per agenti LLM                           | ✅ **Raccomandato primario**                              |
| **Serper.dev**                           | 2.500 query gratuite una tantum in fase di prova, non ricorrenti mensilmente; poi $1 → $0,30 per 1000 query | Basso-medio — tecnicamente rivende risultati Google SERP; prassi diffusissima nel settore (SerpApi, DataForSEO operano allo stesso modo da anni) con enforcement individuale verso i clienti API praticamente inesistente | Alta — JSON pulito, latenza bassa                                             | ✅ Ottimo **overflow a pagamento** oltre la soglia Tavily |

**Nota di correzione rispetto a consulenze precedenti:** Serper era stato indicato con "2.500 query/mese" — verificando lo stato attuale, è un credito di prova **una tantum**, non un rinnovo mensile. Per un flusso gratuito sostenibile nel tempo, Tavily è la scelta strutturalmente migliore.

---

## 3. Codice TypeScript Production-Ready — `webSearch.ts`

Principio guida: il modulo non può mai propagare un'eccezione verso Genkit. Ogni possibile fallimento — timeout, 403, JSON malformato, quota esaurita — si traduce in un oggetto tipizzato, mai in un `throw` che risale.

```typescript
// opsflow-functions/src/tools/webSearch.ts
import { defineTool } from "@genkit-ai/ai";
import { z } from "zod";

// ── CONTRATTO I/O — questo schema è la superficie di sicurezza del tool ──

const WebSearchInputSchema = z.object({
  query: z.string().min(2).max(300),
  numResults: z.number().int().min(1).max(10).default(5),
});

const WebSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  source: z.enum(["tavily", "serper"]),
});

const WebSearchOutputSchema = z.object({
  success: z.boolean(),
  results: z.array(WebSearchResultItemSchema),
  provider: z.enum(["tavily", "serper", "none"]),
  error: z
    .object({
      code: z.enum([
        "PROVIDER_TIMEOUT",
        "PROVIDER_BLOCKED",
        "PROVIDER_QUOTA_EXCEEDED",
        "INVALID_RESPONSE",
        "ALL_PROVIDERS_FAILED",
        "UNEXPECTED_ERROR",
      ]),
      message: z.string(),
    })
    .nullable(),
});

type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;
type ResultItem = z.infer<typeof WebSearchResultItemSchema>;

// ── CONFIG ────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 8_000; // mai vicino ai 300s del timeout della function
const MAX_RETRIES_PER_PROVIDER = 1; // un solo retry, con backoff — mai un loop stretto

// ── Errore interno tipizzato — non esce mai da questo file ────────────
class ProviderError extends Error {
  constructor(
    public readonly code:
      "PROVIDER_TIMEOUT" | "PROVIDER_BLOCKED" | "PROVIDER_QUOTA_EXCEEDED" | "INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ── fetch con timeout hard — garantisce che nulla resti appeso ────────
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Provider 1: Tavily (primario) ──────────────────────────────────────
async function searchWithTavily(query: string, numResults: number): Promise<ResultItem[]> {
  const res = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: numResults,
        search_depth: "basic", // 1 credito; 'advanced' ne costa 2
      }),
    },
    FETCH_TIMEOUT_MS,
  );

  if (res.status === 429)
    throw new ProviderError("PROVIDER_QUOTA_EXCEEDED", "Tavily: quota mensile esaurita");
  if (!res.ok) throw new ProviderError("PROVIDER_BLOCKED", `Tavily: HTTP ${res.status}`);

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.results)) {
    throw new ProviderError("INVALID_RESPONSE", "Tavily: risposta non nel formato atteso");
  }

  return data.results.map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.content ?? "").slice(0, 400),
    source: "tavily" as const,
  }));
}

// ── Provider 2: Serper.dev (fallback a pagamento) ──────────────────────
async function searchWithSerper(query: string, numResults: number): Promise<ResultItem[]> {
  const res = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: numResults }),
    },
    FETCH_TIMEOUT_MS,
  );

  if (res.status === 403 || res.status === 429) {
    throw new ProviderError("PROVIDER_BLOCKED", `Serper: HTTP ${res.status}`);
  }
  if (!res.ok) throw new ProviderError("PROVIDER_BLOCKED", `Serper: HTTP ${res.status}`);

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.organic)) {
    throw new ProviderError("INVALID_RESPONSE", "Serper: risposta non nel formato atteso");
  }

  return data.organic.slice(0, numResults).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    url: String(r.link ?? ""),
    snippet: String(r.snippet ?? ""),
    source: "serper" as const,
  }));
}

// ── Wrapper: 1 retry con backoff, mai un'eccezione in uscita ───────────
async function tryProvider(
  fn: () => Promise<ResultItem[]>,
  providerLabel: string,
): Promise<{ ok: true; results: ResultItem[] } | { ok: false; error: ProviderError }> {
  for (let attempt = 0; attempt <= MAX_RETRIES_PER_PROVIDER; attempt++) {
    try {
      return { ok: true, results: await fn() };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const providerErr = isTimeout
        ? new ProviderError(
            "PROVIDER_TIMEOUT",
            `${providerLabel}: timeout dopo ${FETCH_TIMEOUT_MS}ms`,
          )
        : err instanceof ProviderError
          ? err
          : new ProviderError("PROVIDER_BLOCKED", `${providerLabel}: ${String(err)}`);

      const isLastAttempt = attempt === MAX_RETRIES_PER_PROVIDER;
      const noRetryUseful = providerErr.code === "PROVIDER_QUOTA_EXCEEDED"; // quota esaurita: ritentare è inutile

      if (isLastAttempt || noRetryUseful) return { ok: false, error: providerErr };
      await new Promise((r) => setTimeout(r, 500)); // backoff fisso, non esponenziale: siamo già dentro un timeout stretto
    }
  }
  return {
    ok: false,
    error: new ProviderError("PROVIDER_BLOCKED", `${providerLabel}: fallimento imprevisto`),
  };
}

// ── TOOL GENKIT — punto di ingresso unico, protetto su tre livelli ─────
export const webSearchTool = defineTool(
  {
    name: "web_search",
    description:
      "Cerca sul web aziende, professionisti e informazioni pubbliche di settore. In caso di fallimento di tutti i provider restituisce un risultato vuoto — non lancia mai eccezioni.",
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
  },
  async (input): Promise<WebSearchOutput> => {
    // LIVELLO 3 (esterno): anche un bug nel codice sottostante non deve mai risalire a Genkit
    try {
      const { query, numResults } = input;

      // 1. Tavily — primario
      const tavily = await tryProvider(() => searchWithTavily(query, numResults), "Tavily");
      if (tavily.ok) {
        return safeOutput({
          success: true,
          results: tavily.results,
          provider: "tavily",
          error: null,
        });
      }

      // 2. Serper — fallback, solo se configurato
      if (process.env.SERPER_API_KEY) {
        const serper = await tryProvider(() => searchWithSerper(query, numResults), "Serper");
        if (serper.ok) {
          return safeOutput({
            success: true,
            results: serper.results,
            provider: "serper",
            error: null,
          });
        }
        return safeOutput({
          success: false,
          results: [],
          provider: "none",
          error: {
            code: "ALL_PROVIDERS_FAILED",
            message: `Tavily: ${tavily.error.message} | Serper: ${serper.error.message}`,
          },
        });
      }

      // 3. Nessun secondo provider configurato — fallisce comunque in modo pulito
      return safeOutput({
        success: false,
        results: [],
        provider: "none",
        error: { code: "ALL_PROVIDERS_FAILED", message: tavily.error.message },
      });
    } catch (unexpected) {
      // Rete di sicurezza finale — non deve mai attivarsi, ma se un bug la raggiunge
      // il tool restituisce comunque JSON valido invece di far crashare la Cloud Function
      return safeOutput({
        success: false,
        results: [],
        provider: "none",
        error: { code: "UNEXPECTED_ERROR", message: String(unexpected) },
      });
    }
  },
);

// LIVELLO 2: valida sempre l'output contro lo schema prima di restituirlo —
// se un provider restituisse dati fuori contratto, non esce comunque un oggetto malformato
function safeOutput(candidate: WebSearchOutput): WebSearchOutput {
  const parsed = WebSearchOutputSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return {
    success: false,
    results: [],
    provider: "none",
    error: { code: "INVALID_RESPONSE", message: "Output non conforme allo schema atteso" },
  };
}
```

---

## 4. Configurazione GCP Ottimale — `index.ts`

I due parametri che hanno generato la spesa (`memory: 1GiB`, `timeoutSeconds: 300`) erano sovradimensionati per un carico I/O-bound. Il fix è quasi interamente dichiarativo.

```typescript
// opsflow-functions/src/index.ts
import { onCallGenkit } from "firebase-functions/https";
import { defineSecret } from "firebase-functions/params";
import { chatFlow } from "./ai/chatFlow";

const tavilyKey = defineSecret("TAVILY_API_KEY");
const serperKey = defineSecret("SERPER_API_KEY");
const geminiKey = defineSecret("GEMINI_API_KEY");

export const chatWithAgent = onCallGenkit(
  {
    // ── QUESTI 6 PARAMETRI RISOLVONO L'ANOMALIA DI SPESA ──────────────
    memory: "256MiB", // era 1GiB — il carico è chiamate di rete, non calcolo locale
    timeoutSeconds: 30, // era 300 — un tool bloccato fallisce in secondi (vedi FETCH_TIMEOUT_MS), non tiene viva la function per minuti
    cpu: 1,
    concurrency: 20, // più richieste leggere per istanza → meno cold start per la stessa spesa
    minInstances: 0, // accetta ~1-2s di cold start: tenere un'istanza sempre calda costa
    maxInstances: 3, // hard cap — nessuna spirale di costo anche in caso di retry storm o traffico anomalo
    region: "europe-west1", // stessa regione del Firestore del progetto → zero costi di egress cross-region
    secrets: [tavilyKey, serperKey, geminiKey],
  },
  chatFlow,
);
```

> **Nota su `minInstances: 0`:** la documentazione ufficiale Firebase segnala che tenere calda un'istanza inattiva costa tipicamente meno di 6€ al mese. Con un budget di 5-10€ totali, anche una sola istanza sempre attiva assorbe gran parte del margine. Con `minInstances: 0` si paga solo per l'esecuzione effettiva.

### Fix Artifact Registry (5 minuti, comando singolo)

Non serve costruire una cleanup policy da zero: Firebase CLI ne ha già una dedicata.

```bash
firebase functions:artifacts:setpolicy
```

Per default questo comando configura Artifact Registry per eliminare automaticamente le immagini container più vecchie di 1 giorno — un buon equilibrio fra costo di storage e possibilità di rollback rapido. Per più margine di rollback manuale:

```bash
firebase functions:artifacts:setpolicy --days 7
```

### Rete di sicurezza aggiuntiva — Budget Alert

```bash
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="OpsFlow Hard Cap" \
  --budget-amount=10EUR \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0
```

Email automatica a 5€, 8€ e 10€ — indipendentemente da qualunque bug futuro nel codice.

### Durante lo sviluppo, evitare deploy inutili

Testare `chatFlow` con l'emulatore locale (`firebase emulators:start`) prima di ogni `firebase deploy --only functions`: ogni deploy genera una nuova immagine container in Artifact Registry, quindi meno deploy di test = meno immagini da pulire, oltre a zero consumo di token Gemini reali durante l'iterazione.

---

## 5. Decisione Finale Raccomandata

**Ricerca web:** Tavily come provider primario (free tier ricorrente, estrazione già inclusa, ToS puliti), Serper.dev come overflow a pagamento oltre i 1.000 crediti/mese. Eliminare subito il proxy DuckDuckGo — è insieme il rischio legale più alto, il meno affidabile tecnicamente e la causa diretta del crash.

**Codice:** distribuire `webSearchTool` come definito sopra — a tre livelli di protezione (wrapper per-provider, validazione schema, try/catch esterno) non può più generare un HTTP 500, qualunque cosa faccia il provider a valle.

**Infrastruttura:** applicare i 6 parametri Cloud Run + il comando `firebase functions:artifacts:setpolicy` immediatamente — sono modifiche di configurazione, zero rischio di regressione, e da sole avrebbero probabilmente contenuto l'anomalia di spesa anche prima di sistemare il bug.

**Compliance:** prima di scalare il volume di lead scraping, aggiungere al modello dati `Task`/`AgentOutput` un campo `art14NoticeDueBy` generato automaticamente ogni volta che l'Agente salva un contatto professionale estratto dal web — è la differenza fra "prassi diffusa" e "precedente enforcement diretto" per questo caso d'uso specifico.

---

## Fonti Consultate

- Federprivacy — Analisi del provvedimento del Garante Privacy sul web scraping: https://www.federprivacy.org/informazione/primo-piano/web-scraping-un-analisi-del-provvedimento-del-garante-privacy
- Ecommerce Legale — Web scraping e intelligenza artificiale, linee guida del Garante: https://ecommercelegale.it/senza-categoria/web-scraping/
- La Legge per Tutti — Web scraping: quando è legale e quando è vietato: https://www.laleggepertutti.it/732181_web-scraping-quando-e-legale-e-quando-e-vietato
- Google Developers — Custom Search JSON API, pricing e dismissione: https://developers.google.com/custom-search/v1/overview
- Jina AI — Reader API FAQ: https://jina.ai/reader/
- FreeAPIHub — Tavily Search API, free tier: https://freeapihub.com/apis/tavily-search-api
- ApiSerpent — Free Google Search API tiers tested (2026): https://apiserpent.com/blog/free-google-search-api-tested
- Firebase Documentation — Manage functions (cleanup policy): https://firebase.google.com/docs/functions/manage-functions
- Firebase Documentation — Manage functions 1st gen (costo minInstances): https://firebase.google.com/docs/functions/1st-gen/manage-functions-1st

_Documento generato come supporto consulenziale — verificare con i professionisti competenti (legale, commercialista) prima di adottare decisioni vincolanti in materia di compliance GDPR._
