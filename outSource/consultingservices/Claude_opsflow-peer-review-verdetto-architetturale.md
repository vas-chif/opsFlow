# OpsFlow — Peer Review Tecnico-Giuridico

## Verdetto Architetturale Definitivo: Search Tool, Cost Governance & GDPR

**Data:** 22 agosto 2026
**Collegio:** Principal AI Software Architect · Cloud Security & SRE · Legal Tech Counsel (GDPR)
**Materiale in revisione:** Proposte A / B / C (sintesi tecniche interne) + due audit esterni allegati (`ChatGPT_OpsFlow_Technical_Legal_AI_Systems_Audit.md`, `gemini-code-1787385033042.md`)

> _Nessun membro del collegio è un avvocato abilitato in esercizio: la parte legale è informazione tecnico-organizzativa, non un parere legale formale._

---

## 0. Executive Summary — Leggere Prima di Tutto

Tre scoperte emerse durante la verifica incrociata dei documenti allegati cambiano le priorità rispetto a quanto originariamente richiesto:

1. **🔴 P0 — Possibile modello AI morto in produzione.** Il documento ChatGPT segnala che `gemini-1.5-flash` (il modello configurato nel blueprint OpsFlow) è stato dismesso da Google. Verifica indipendente: Gemini 1.5 Flash 001 è stato disattivato il 27 maggio 2025, la versione 002 il 24 settembre 2025. Ad oggi (22 agosto 2026) la generazione corrente è Gemini 3.x (`gemini-3.5-flash`, `gemini-3.1-flash-lite`). **Questo va verificato prima di qualunque altra cosa in questo documento** — se il model ID reale in Firestore/env è ancora `gemini-1.5-flash`, ogni chiamata a `chatWithAgent` sta fallendo indipendentemente dal bug del search tool. Controllare i log di Cloud Logging per l'errore esatto restituito dall'API Gemini.
2. **🟠 Un bug concreto nel codice allegato "gemini-code".** Il modulo `webSearch.ts` di quel documento non può funzionare come scritto — dettaglio in Appendice A. Non è un giudizio di parte: è un difetto di sintassi verificabile riga per riga.
3. **🟠 Una citazione legale errata nello stesso documento.** "L. 145/2018" viene presentata come normativa sulla pubblicità sanitaria. Verificato su fonti ufficiali: è la legge di bilancio 2019, materia fiscale, nessuna relazione con scraping, GDPR o pubblicità sanitaria — dettaglio in Appendice B.

Nessuna delle tre Proposte A/B/C va adottata integralmente e as-is. Il verdetto del collegio (Sezioni 1-5) è una sintesi che prende il meglio di ciascuna e scarta le parti non verificate o sovradimensionate.

---

## 1. Analisi Critica delle Tre Proposte

### Proposta A — Architettura Ibrida Resiliente

**Punti di forza:** error boundary a 3 livelli concettualmente corretto; tuning Cloud Functions (256MiB/30s/min0/max3) allineato ai valori che convergono anche altrove; comando nativo `firebase functions:artifacts:setpolicy` invece di reinventare una cleanup policy da zero — la scelta più pragmatica delle tre per questo specifico problema.
**Debolezza:** Jina come fallback viene trattato come rete di sicurezza "a costo zero" senza qualificare il rischio. Jina stesso dichiara che il piano a pagamento non garantisce l'accesso a siti che bloccano il servizio — quindi il fallback eredita la stessa incertezza del provider primario, solo con probabilità minore. Va bene come _terza_ linea, non come seconda.
**Verdetto:** solido come base per un MVP, non sufficiente da solo su crash-prevention (manca una tassonomia esplicita degli errori — vedi Proposta B).

### Proposta B — Registry Astratto & Execution Budget

**Punti di forza:** è l'unica delle tre che risolve il problema alla radice invece che ai sintomi. La tassonomia esplicita degli errori (`ToolErrorCode`) con blocco immediato su 403 e retry limitato a 429/5xx è **la risposta corretta e definitiva** alla domanda "come garantire che un errore HTTP non diventi mai un crash": non un pattern probabilistico ma una macchina a stati con un numero finito di uscite, tutte sicure. L'`ExecutionBudget` per sessione (max 3 ricerche, max 5 step) è un livello di protezione che né A né C possiedono: agisce _dentro_ l'esecuzione dell'agente, non solo a livello di infrastruttura — impedisce un loop costoso anche se la Cloud Function tecnicamente avrebbe ancora tempo/memoria disponibili.
**Debolezza — over-engineering se implementato tutto insieme:** il registry dinamico con caching delle query normalizzate è un investimento che ha senso quando esistono realmente 3+ provider in rotazione attiva con pattern di traffico da ottimizzare. Al lancio, con un solo provider primario e un fallback, è complessità che si paga in tempo di sviluppo senza un beneficio immediato proporzionale. Significativamente, il documento sorgente da cui B è tratto propone _lui stesso_ un piano a fasi (P0/P1/P2) in cui il registry dinamico è P1, non P0 — la Proposta B, così come riassunta, comprime tutte le fasi in una sola implementazione "adesso", perdendo questa gerarchia.
**Verdetto:** il pattern di error handling è gold standard e va adottato subito. Il registry dinamico e il caching vanno pianificati ma non bloccano la release del fix.

### Proposta C — Compliance-Driven & Extreme Resource Tuning

**Punti di forza:** l'unica delle tre che traduce un obbligo giuridico (Art. 14 GDPR) in un campo concreto del modello dati (`art14NoticeDueBy`) invece di lasciarlo come nota procedurale. È la proposta più "shippable" sul fronte compliance: poche righe di schema, rischio legale concreto ridotto. La combinazione Tavily + Serper (nessun Jina) è anche la più pulita contrattualmente: entrambi sono API commerciali con ToS espliciti per uso programmatico, mentre Jina resta un'area grigia da verificare (Proposta A lo eredita, C lo evita).
**Debolezza:** come A, non specifica una tassonomia degli errori — si affida a un wrapper a 3 livelli che è corretto ma meno rigoroso del circuit breaker di B.
**Verdetto:** miglior proposta sul fronte GDPR e provider selection; da fondere con il rigore di error-handling di B.

### Tabella Riepilogativa

| Aspetto                             | Proposta A              | Proposta B                                         | Proposta C                                        |
| ----------------------------------- | ----------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Search provider                     | Tavily + Jina fallback  | Registry Tavily/Jina/Serper                        | Tavily + Serper overflow                          |
| Rigore error handling               | Buono (3 livelli)       | **Eccellente** (tassonomia + circuit breaker)      | Buono (3 livelli)                                 |
| Controllo runaway cost              | Solo a livello infra    | **Eccellente** (ExecutionBudget di sessione)       | Infra + budget alert GCP                          |
| GDPR by design                      | Non specificato         | Classificazione dati + blocco automatico sensibili | **Concreto**: `art14NoticeDueBy` nel modello dati |
| Rischio over-engineering pre-lancio | Basso                   | Medio-alto se implementata tutta subito            | Basso                                             |
| Pulizia contrattuale provider       | Media (include Jina)    | Media (include Jina)                               | **Alta** (solo API commerciali)                   |
| Artifact cleanup                    | Comando nativo Firebase | Policy JSON custom (più granulare)                 | Non specificato                                   |

---

## 2. Scelta Definitiva del Search Provider

**Decisione: Tavily primario + Serper come overflow a pagamento. Jina non entra nel percorso principale.**

Motivazione: con solo due provider, entrambi API commerciali con ToS che autorizzano esplicitamente l'uso programmatico, si ottiene resilienza equivalente a uno stack a tre provider con meno superficie di integrazione e zero ambiguità contrattuale. Jina resta un'opzione valida da riconsiderare solo se il volume combinato Tavily+Serper diventasse insufficiente.

| Provider                      | Ruolo                            | Costo                                                                     | Rischio 403                                            |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Tavily                        | Primario                         | 1.000 crediti/mese gratuiti ricorrenti                                    | Basso — API dedicata, non SERP scraping                |
| Serper.dev                    | Overflow                         | Da $1 a $0,30 per 1.000 query oltre la prova iniziale una tantum di 2.500 | Basso — stesso principio                               |
| Google Custom Search JSON API | **Escluso**                      | N/A                                                                       | Chiusa a nuovi clienti, dismissione 1° gennaio 2027    |
| DuckDuckGo HTML scraping      | **Escluso**                      | N/A                                                                       | Causa diretta dell'incidente originale                 |
| Jina Search (`s.jina.ai`)     | Opzionale, non attivo di default | Free tier a rate limit stretti                                            | Medio — nessuna garanzia di bypass sui blocchi a valle |

**Sul target "< €1,00/mese per i primi 1.000 utenti" e "0% di blocchi 403":**

Sul secondo punto: l'uso di API commerciali elimina _per categoria_ il tipo di blocco che ha causato l'incidente — un 403 da Tavily o Serper significherebbe una tua chiave non valida o quota interna esaurita (evento raro e diagnosticabile), non un blocco anti-bot ostile e imprevedibile come quello di DuckDuckGo. "0% garantito" resta comunque una promessa troppo assoluta per qualsiasi sistema che dipende da terzi; "categoria di rischio eliminata" è l'affermazione corretta.

Sul primo punto, la cifra dipende dall'intensità d'uso, non è automatica:

- Ipotesi leggera (2 ricerche/utente/mese × 1.000 utenti = 2.000 ricerche): 1.000 coperte gratis da Tavily, 1.000 a ~$1/1.000 su Serper → **circa $1/mese**, in linea con il target.
- Ipotesi più intensa (10 ricerche/utente/mese = 10.000 ricerche): 1.000 gratis + 9.000 a pagamento → **circa $9/mese** solo per la ricerca.

Il target è raggiungibile nella fase di lancio con adozione moderata, ma va monitorato con il Cost Meter (Sezione 4) mano a mano che l'uso reale del workspace "Lead Scout" cresce — non è un numero fisso indipendente dal volume.

---

## 3. Pattern Definitivo di Crash Prevention

Sintesi di A/C (wrapper a 3 livelli, sempre JSON valido in uscita) + B (tassonomia esplicita degli errori, circuit breaker, execution budget di sessione). Nessuno dei tre elementi da solo è sufficiente; insieme rendono il crash HTTP 500 strutturalmente impossibile, non solo improbabile.

```typescript
// opsflow-functions/src/tools/webSearch.ts
//
// LIVELLO 1 — Tassonomia esplicita (Proposta B): ogni HTTP status mappa
//             a un'azione definita, mai a un'eccezione generica.
// LIVELLO 2 — Wrapper per-provider con retry solo dove ha senso (A/B/C).
// LIVELLO 3 — Execution Budget di sessione: impedisce il loop costoso
//             anche se l'infrastruttura avrebbe ancora margine (Proposta B).
// LIVELLO 4 — Validazione Zod dell'output + try/catch esterno (A/C):
//             rete di sicurezza finale, non deve mai attivarsi.

import { defineTool } from "@genkit-ai/ai";
import { z } from "zod";

// ── LIVELLO 1: Tassonomia degli errori ──────────────────────────────────

type ToolErrorCode =
  | "INVALID_INPUT"
  | "PROVIDER_BLOCKED" // 400/401/403/404 — STOP, mai ritentare sullo stesso provider
  | "RATE_LIMIT" // 429 — quota propria esaurita, non un blocco ostile
  | "PROVIDER_HTTP_ERROR" // 5xx — errore lato provider, ritenta con backoff
  | "TIMEOUT" // AbortController scattato
  | "INVALID_RESPONSE" // JSON malformato o fuori schema
  | "BUDGET_EXCEEDED" // limite di sessione raggiunto — vedi LIVELLO 3
  | "ALL_PROVIDERS_FAILED"
  | "UNEXPECTED_ERROR";

interface ClassifiedError {
  code: ToolErrorCode;
  retryableOnSameProvider: boolean;
}

function classifyHttpStatus(status: number): ClassifiedError {
  if (status === 429) return { code: "RATE_LIMIT", retryableOnSameProvider: true };
  if (status >= 500) return { code: "PROVIDER_HTTP_ERROR", retryableOnSameProvider: true };
  // 400 / 401 / 403 / 404 → STOP immediato, si passa al provider successivo
  return { code: "PROVIDER_BLOCKED", retryableOnSameProvider: false };
}

class ProviderError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
    public readonly retryableOnSameProvider = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ── LIVELLO 3: Execution Budget di sessione ─────────────────────────────
// Vive nel documento Task (un contatore per task, non per singola chiamata)

export interface ExecutionBudget {
  maxSearchCallsPerTask: number; // MVP: 3
  currentSearchCalls: number;
}

function checkBudget(budget: ExecutionBudget): { allowed: boolean; reason?: string } {
  if (budget.currentSearchCalls >= budget.maxSearchCallsPerTask) {
    return {
      allowed: false,
      reason: `Limite di ${budget.maxSearchCallsPerTask} ricerche per questo task raggiunto`,
    };
  }
  return { allowed: true };
}

// ── Contratto I/O ────────────────────────────────────────────────────────

const WebSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(300),
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
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;
type ResultItem = z.infer<typeof WebSearchResultItemSchema>;

const FETCH_TIMEOUT_MS = 8_000;

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

// ── LIVELLO 2: Provider adapter — usano la tassonomia del Livello 1 ─────

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
        search_depth: "basic",
      }),
    },
    FETCH_TIMEOUT_MS,
  );

  if (!res.ok) {
    const { code, retryableOnSameProvider } = classifyHttpStatus(res.status);
    throw new ProviderError(code, `Tavily: HTTP ${res.status}`, retryableOnSameProvider);
  }

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.results))
    throw new ProviderError("INVALID_RESPONSE", "Tavily: formato inatteso");

  return data.results.map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.content ?? "").slice(0, 400),
    source: "tavily" as const,
  }));
}

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

  if (!res.ok) {
    const { code, retryableOnSameProvider } = classifyHttpStatus(res.status);
    throw new ProviderError(code, `Serper: HTTP ${res.status}`, retryableOnSameProvider);
  }

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.organic))
    throw new ProviderError("INVALID_RESPONSE", "Serper: formato inatteso");

  return data.organic.slice(0, numResults).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    url: String(r.link ?? ""),
    snippet: String(r.snippet ?? ""),
    source: "serper" as const,
  }));
}

// Wrapper: ritenta SOLO se la tassonomia lo permette (Proposta B) —
// un 403 non genera mai un retry, passa subito al provider successivo.
async function tryProvider(
  fn: () => Promise<ResultItem[]>,
  label: string,
): Promise<{ ok: true; results: ResultItem[] } | { ok: false; error: ProviderError }> {
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return { ok: true, results: await fn() };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const classified = isTimeout
        ? new ProviderError("TIMEOUT", `${label}: timeout dopo ${FETCH_TIMEOUT_MS}ms`, true)
        : err instanceof ProviderError
          ? err
          : new ProviderError("UNEXPECTED_ERROR", `${label}: ${String(err)}`, false);

      const shouldRetry = classified.retryableOnSameProvider && attempt < MAX_ATTEMPTS;
      if (!shouldRetry) return { ok: false, error: classified };
      await new Promise((r) => setTimeout(r, 500)); // backoff fisso, coerente col timeout stretto
    }
  }
  return {
    ok: false,
    error: new ProviderError("UNEXPECTED_ERROR", `${label}: fallimento imprevisto`),
  };
}

// ── TOOL GENKIT — punto di ingresso unico ───────────────────────────────

export const webSearchTool = defineTool(
  {
    name: "web_search",
    description:
      "Cerca sul web aziende e professionisti tramite provider commerciali. Non lancia mai eccezioni; su fallimento totale restituisce un risultato vuoto.",
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
  },
  async (input, { context }): Promise<WebSearchOutput> => {
    try {
      // LIVELLO 3 — controllo budget PRIMA di chiamare qualunque provider
      const budget = (context as { executionBudget?: ExecutionBudget })?.executionBudget;
      if (budget) {
        const budgetCheck = checkBudget(budget);
        if (!budgetCheck.allowed) {
          return safeOutput({
            success: false,
            results: [],
            provider: "none",
            error: { code: "BUDGET_EXCEEDED", message: budgetCheck.reason! },
          });
        }
        budget.currentSearchCalls += 1;
      }

      const { query, numResults } = input;

      const tavily = await tryProvider(() => searchWithTavily(query, numResults), "Tavily");
      if (tavily.ok)
        return safeOutput({
          success: true,
          results: tavily.results,
          provider: "tavily",
          error: null,
        });

      if (process.env.SERPER_API_KEY) {
        const serper = await tryProvider(() => searchWithSerper(query, numResults), "Serper");
        if (serper.ok)
          return safeOutput({
            success: true,
            results: serper.results,
            provider: "serper",
            error: null,
          });
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

      return safeOutput({
        success: false,
        results: [],
        provider: "none",
        error: { code: "ALL_PROVIDERS_FAILED", message: tavily.error.message },
      });
    } catch (unexpected) {
      // LIVELLO 4 — rete di sicurezza finale, non deve mai attivarsi
      return safeOutput({
        success: false,
        results: [],
        provider: "none",
        error: { code: "UNEXPECTED_ERROR", message: String(unexpected) },
      });
    }
  },
);

function safeOutput(candidate: WebSearchOutput): WebSearchOutput {
  const parsed = WebSearchOutputSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return {
    success: false,
    results: [],
    provider: "none",
    error: { code: "INVALID_RESPONSE", message: "Output non conforme allo schema" },
  };
}
```

**Perché questo è "matematicamente" senza crash:** ogni ramo del codice — successo, errore classificato, errore non classificato, output malformato, eccezione imprevista — termina in un `return` che rispetta `WebSearchOutputSchema`. Non esiste un percorso di esecuzione che si conclude con un `throw` non catturato. Il try/catch esterno non è ridondanza stilistica: è la dimostrazione che anche un bug futuro nel codice sopra (un nuovo provider aggiunto male, ad esempio) non può comunque propagare un'eccezione a Genkit.

---

## 4. Assetto GCP Definitivo

I tre documenti di origine convergono in modo indipendente sullo stesso ordine di grandezza — è un segnale forte che questa regione dei parametri è corretta a prescindere da quale proposta si segua.

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
    memory: "256MiB", // A/C; il 512MiB di B è una "prudenza di partenza", non un requisito
    timeoutSeconds: 30, // unanime su A/B/C
    cpu: 1,
    concurrency: 10, // compromesso tra il conservativo 1 (B) e il 20 (C) — vedi nota
    minInstances: 0, // unanime — scale-to-zero
    maxInstances: 3,
    region: "europe-west1",
    secrets: [tavilyKey, serperKey, geminiKey],
  },
  chatFlow,
);
```

**Nota su `concurrency: 10`:** la Proposta B sceglie `1` per "massima prevedibilità durante l'MVP" — è una scelta legittima e la più sicura se il team non ha ancora fiducia nell'isolamento dello stato fra richieste concorrenti sulla stessa istanza. `10` è un compromesso: riduce i cold-start rispetto a `1` senza introdurre il livello di complessità di `20`. Aumentare gradualmente dopo aver osservato metriche reali di latenza p95, non prima.

**Artifact Registry** — usare il comando nativo (più semplice, sufficiente per l'MVP):

```bash
firebase functions:artifacts:setpolicy --days 7
```

Se in futuro serve una politica più granulare (mantenere N versioni taggate + eliminare untagged più aggressivamente), la policy JSON esplicita della Proposta B resta disponibile come upgrade path, non come requisito immediato.

**Budget Alert (rete di sicurezza indipendente dal codice):**

```bash
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="OpsFlow Hard Cap" \
  --budget-amount=10EUR \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0
```

**Separazione chat/ricerca pesante (da Proposta B, da pianificare non da implementare oggi):** finché Tavily/Serper rispondono in 1-2 secondi, la ricerca sincrona dentro `chatWithAgent` resta corretta. Il trigger per introdurre una coda asincrona (Cloud Tasks) è quando/se si aggiungeranno tool di crawling o arricchimento che possono superare i 30 secondi — non prima. Costruirlo oggi sarebbe esattamente l'over-engineering segnalato in Sezione 1.

---

## 5. GDPR Action Plan Minimo Indispensabile

Fusione del campo concreto di C con la classificazione dati e la separazione ricerca/marketing di B — sono complementari, non alternativi.

1. **Campo `art14NoticeDueBy` nel modello `Task`/`AgentOutput`** (Proposta C). Ogni volta che l'Agente salva un contatto professionale estratto dal web, il campo si popola automaticamente con la data limite per l'informativa ex Art. 14 GDPR (regola generale: un mese dalla raccolta). Poche righe di schema, il gap di compliance più concreto oggi presente nel flusso.
2. **Blocco preventivo sui dati particolari ex Art. 9** (Proposta B): un classificatore leggero prima che qualsiasi risultato web raggiunga l'LLM, che distingue dato aziendale (nome azienda, P.IVA, email generica, indirizzo sede — via libera) da dato potenzialmente sensibile (salute, orientamento, dati biometrici, ecc. — blocco automatico salvo base giuridica specifica).
3. **Minimizzazione esplicita**: il tool di ricerca estrae solo i campi necessari alla finalità dichiarata (nome azienda, sito, email generica, telefono, fonte), non "tutto ciò che il crawler trova".
4. **Provenance su ogni record**: `sourceUrl`, `collectedAt`, `provider`, `extractionMethod`. Necessario per audit, rettifica e cancellazione su richiesta, oltre che per verificare la qualità del dato.
5. **Separare "Ricerca" da "Esecuzione Marketing"** (Proposta B, punto spesso trascurato): il fatto che un'email sia pubblica non la rende automaticamente lecita da usare per outreach commerciale — è la logica dietro al Provvedimento del Garante n. 52/2018 già discusso in una consulenza precedente su questo stesso progetto. L'invio di un'email commerciale a un contatto scraped deve passare da un gate di approvazione separato da quello della semplice ricerca, non essere un'estensione automatica dello stesso pipeline.
6. **Secret Manager per le chiavi**, mai nel frontend — già coperto dalla configurazione in Sezione 4 tramite `defineSecret`.

---

## 6. Verdetto Finale del Collegio

**Principal AI Software Architect:** la tassonomia degli errori e l'Execution Budget della Proposta B sono l'unico elemento tra le tre proposte che risolve il problema strutturalmente invece che con un cerotto ben fatto. Vanno adottati subito; il registry dinamico che li accompagna può aspettare.

**Cloud SRE:** i parametri di Cloud Run convergono in modo indipendente su tutte e tre le fonti — è il segnale più forte di questo intero audit che quella configurazione è corretta. La priorità pratica resta comunque un'altra: verificare che il modello Gemini configurato esista ancora, perché nessuna ottimizzazione di `memory` o `concurrency` ha senso se ogni chiamata al modello sta già fallendo a monte.

**Legal Tech Counsel:** la Proposta C traduce un obbligo normativo reale in un campo di schema, cosa che né A né B fanno esplicitamente — è la differenza tra "conformità sulla carta" e "conformità nel codice". Detto questo, il documento "gemini-code" allegato dimostra un rischio concreto del fare affidamento su citazioni normative generate da un AI senza verifica: una legge di bilancio presentata con sicurezza come normativa sulla pubblicità sanitaria, se finita in un contratto o in un'informativa reale, sarebbe stata un problema autonomo scollegato da tutto il resto di questo audit.

---

## Appendice A — Difetto nel Codice di `gemini-code-1787385033042.md`

Il modulo `searchWebAndPlatformsTool` in quel documento costruisce l'endpoint così:

```typescript
const endpoint = `[https://s.jina.ai/$](https://s.jina.ai/$){encodeURIComponent(query)}`;
```

In una template literal JavaScript, `${...}` è sintassi di interpolazione; `$(...)` no. Il risultato letterale di questa riga è una stringa che comincia con il carattere `[`, non un URL valido — il pattern si ripete identico nel fallback verso Google e nell'endpoint `r.jina.ai` di `jinaReaderTool`. Conseguenza pratica: `fetch()` riceve un URL non parsabile, la Promise viene rifiutata, il `catch` esistente intercetta correttamente l'errore — quindi il codice **non va in crash** — ma il tool primario di ricerca non restituirà mai un risultato reale, in nessuna condizione. Il modulo raggiunge la "non-crashabilità" per la ragione sbagliata: non perché gestisce bene gli errori del provider, ma perché non riesce mai a contattarlo. È un promemoria utile: un tool che non lancia mai eccezioni non è automaticamente un tool che funziona.

## Appendice B — Citazione Normativa Non Verificata in `gemini-code-1787385033042.md`

Il documento afferma, alla sezione 3 del parere legale, che i contenuti di outreach devono rispettare toni non ingannevoli "ai sensi della L. 145/2018" in materia di pubblicità sanitaria. Verifica su fonte ufficiale (Normattiva) e su analisi tecniche indipendenti della norma: la Legge 30 dicembre 2018, n. 145 è la Legge di Bilancio 2019, pubblicata in Gazzetta Ufficiale n. 302 del 31/12/2018 — contiene misure fiscali e di bilancio (rifinanziamento Sabatini-ter, soglie del regime forfettario, limiti al contante per il turismo). Non contiene disposizioni su pubblicità sanitaria, web scraping o GDPR. Il documento ChatGPT allegato aveva già segnalato correttamente questo punto in modo indipendente. Prima di citare questa norma in qualunque materiale rivolto a clienti o autorità, verificarne il contenuto direttamente su Normattiva.

---

## Fonti Consultate per la Verifica

- Google AI for Developers — Deprecations: https://ai.google.dev/gemini-api/docs/deprecations
- Google AI for Developers — Changelog: https://ai.google.dev/gemini-api/docs/changelog
- GitHub (tisfeng/Easydict #842) — Comunicazione ufficiale Google sulla dismissione di Gemini 1.5: https://github.com/tisfeng/Easydict/issues/842
- Normattiva — Legge 30 dicembre 2018, n. 145: https://www.normattiva.it/uri-res/N2Ls?urn%3Anir%3Astato%3Alegge%3A2018-12-30%3B145%21vig=
- Studio Zito — Sintesi contenuti Legge di Bilancio 2019: https://www.studiozito.pro/legge-di-bilancio-2019-l-145-2018/
- Google Developers — Custom Search JSON API (dismissione 1/1/2027): https://developers.google.com/custom-search/v1/overview
- Jina AI — Reader API FAQ: https://jina.ai/reader/
- Firebase Documentation — Manage functions (cleanup policy): https://firebase.google.com/docs/functions/manage-functions

_Documento di supporto tecnico-organizzativo — verificare con professionisti abilitati (avvocato, DPO, commercialista) prima di decisioni vincolanti, e verificare in Cloud Logging lo stato reale del modello AI prima di procedere con qualsiasi altra modifica._
