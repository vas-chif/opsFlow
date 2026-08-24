# 🔍 Ricerca di Mercato & Analisi di Fattibilità — Alternative a Brave Search API per OpsFlow

**File:** `docs/SEARCH_PROVIDERS_BENCHMARK.md`
**Data:** 24 agosto 2026
**Team:** Principal AI Software Architect (Genkit/Tool Calling) · Cloud Solutions Architect & Cost Controller · Legal Tech & Data Protection Advisor
**Oggetto:** Provider di ricerca web per il tool `searchWebAndPlatformsTool` (Firebase Genkit + Gemini) — target: <€5–10/mese, 3.000–6.000 ricerche/mese
**Cambio EUR/USD di riferimento:** 1 € ≈ 1,168 $ (24/08/2026) — tutti i prezzi sorgente sono in USD, conversioni approssimate

---

## ⚡ Executive Summary — la premessa del brief è cambiata

Prima della matrice comparativa, tre fatti verificati in rete ad agosto 2026 ridisegnano lo scenario rispetto a quanto ipotizzato nel task originale:

| #   | Cosa è cambiato                                                                                                                                                                                                                                                                                                                                                                               | Impatto su OpsFlow                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Brave Search API ha eliminato il free tier ricorrente** (2.000 query/mese senza carta) a **febbraio 2026**. Oggi ogni piano richiede carta di credito, include $5/mese di credito (~1.000 query), poi fattura $5/1.000 richieste Search.                                                                                                                                                    | Brave **non è più "gratis reale"** come descritto nel brief. Resta un indice indipendente di qualità, ma è a pagamento fin dalla prima chiamata oltre il credito mensile, e richiede carta obbligatoria. |
| 2   | **Bing Web Search API è stata ritirata integralmente da Microsoft l'11 agosto 2025** (nuove sottoscrizioni bloccate da inizio 2025). Il sostituto ufficiale — _Grounding with Bing Search_ dentro Azure AI Foundry — è un prodotto agent-only vincolato ad Azure AI Agent Service, ~$14/1.000 "transazioni", che restituisce contesto per l'LLM e **non** un elenco JSON di risultati grezzi. | Va **eliminata dai candidati**: non è integrabile come una classica search API REST, non esiste più nella forma richiesta dal brief.                                                                     |
| 3   | **Google Custom Search JSON API chiude il 1° gennaio 2027**, ed è già chiusa alle nuove registrazioni dal 2025 (100 query/giorno gratis, tetto rigido 10.000/giorno anche a pagamento).                                                                                                                                                                                                       | Non utilizzabile per una nuova integrazione, indipendentemente dal fatto che offrisse una quota gratuita.                                                                                                |

**Conclusione strategica:** la strategia "Multi-Provider Chaining" ipotizzata nel brief non è più solo l'opzione più efficiente — è **l'unica strada percorribile**. Nessun singolo provider copre oggi 3.000–6.000 ricerche/mese a costo zero reale; la combinazione di 3+ provider è obbligatoria, non opzionale.

---

## 1. Scouting & Mappatura — stato dei provider (agosto 2026)

| Provider                                                                | Categoria                                | Stato                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| **Tavily**                                                              | AI-native search + extraction            | ✅ Attivo, free tier ricorrente                                    |
| **Exa.ai**                                                              | Neural/semantic search                   | ✅ Attivo, free tier ricorrente                                    |
| **Serper.dev**                                                          | Google SERP wrapper                      | ✅ Attivo, trial _una tantum_ (non ricorrente)                     |
| **Kagi Search API**                                                     | Indice proprietario privacy-first        | ⚠️ Attivo, nessun free tier API                                    |
| **SearXNG**                                                             | Metasearch open-source self-hosted       | ✅ Attivo (software gratuito, hosting a carico nostro)             |
| **Bing Web Search API**                                                 | Indice Microsoft                         | ❌ **Ritirata l'11/08/2025**                                       |
| **Perplexity Sonar/Search API**                                         | Answer engine con web search integrata   | ⚠️ Attivo, free tier trascurabile                                  |
| **You.com API**                                                         | AI-native search                         | ⚠️ Attivo, nessun free tier ricorrente (solo credito una tantum)   |
| **Jina AI (Reader/Search)**                                             | Search + content extraction rate-limited | ✅ Attivo, free tier generoso (rate-limited, non a quota mensile)  |
| **Firecrawl Search**                                                    | Search + scraping AI-native              | ✅ Attivo, free tier ricorrente                                    |
| **DataForSEO SERP API**                                                 | SERP wrapper pay-as-you-go               | ⚠️ Attivo, nessun free tier ricorrente ma costi PAYG minimi        |
| **Google Custom Search JSON API**                                       | Indice Google (Programmable Search)      | ❌ Chiusa a nuovi account, shutdown totale 01/01/2027              |
| **Gemini "Grounding with Google Search"** (nativo, già in stack Genkit) | Grounding LLM, non search API classica   | ✅ Attivo, 5.000 prompt grounded/mese gratis (famiglia Gemini 3.x) |

---

## 2. Schede sintetiche per provider

### 2.1 Tavily Search API

Free tier: **1.000 credit/mese ricorrenti**, nessuna carta richiesta. 1 credito = ricerca base, 2 = ricerca "advanced" con estrazione contenuto, una chiamata "Research" può costare 4–250 credit. Oltre il free tier: piano Researcher $30/mese, pay-as-you-go $0,008/credit, piano Growth $500/mese ($0,005/credit a volume). Restituisce contenuto già pulito/strutturato pensato per RAG (non solo link). Integrazione nativa LangChain (tool di default) e MCP server disponibile. Nota: acquisita da Nebius (AI cloud) a febbraio 2026 per $275–400M; il pricing pubblico non è cambiato nella finestra osservata post-acquisizione.

### 2.2 Exa.ai

Free tier: **$20 di credito all'iscrizione + $10/mese ricorrenti**, nessuna carta richiesta (~1.000–1.400 ricerche/mese al tasso standard di $7/1.000). Attenzione: una fonte secondaria (non la pricing page ufficiale) riporta un ampliamento a 20.000 richieste/mese a luglio 2026, probabilmente riferito a una modalità "minimal"/a basso costo diversa dalla search neurale standard — **da riverificare su exa.ai/pricing prima di dimensionare l'architettura**. Endpoint: Search $7/1.000, Deep Search $12–15/1.000, Contents (full-page text) $1/1.000 pagine, Answer $5/1.000. Ricerca semantica/neurale, utile come fallback per query concettuali dove Tavily (più keyword-oriented) rende meno bene.

### 2.3 Serper.dev

Free tier: **2.500 query una tantum** (non ricorrenti mensilmente), nessuna carta richiesta. Oltre: pacchetti prepagati da $50/50.000 credit (~$1/1.000) fino a ~$0,30/1.000 a volume; i credit scadono 6 mesi dopo l'acquisto. È un puro wrapper SERP Google — risultati grezzi (title/snippet/link), non contenuto estratto. 1 credito = fino a 10 risultati, 2 credit = 11–100 risultati. Molto veloce (~1–2s dichiarati). Utile come riserva "burst" iniziale, non come pilastro ricorrente del chaining data la natura one-time del trial.

### 2.4 Kagi Search API

**Nessun free tier per l'API.** Prezzi riportati da fonti terze tra $15 e $25 per 1.000 query (Kagi non pubblica una pricing page API dettagliata — dato a bassa confidenza, verificare direttamente con il vendor). Nessun MCP server ufficiale (serve wrapper HTTP manuale). Posizionamento privacy-first per il prodotto consumer, ma per uso programmatico è il provider più costoso tra quelli esaminati e privo di quota gratuita.
**Verdetto: sconsigliato** per una strategia zero-cost; eventualmente da rivalutare come opzione qualità/nicchia se il budget aumenta.

### 2.5 SearXNG (self-hosted)

Software open-source (AGPL-3.0), gratuito, nessun limite di query, nessuna API key. Va **self-hostato** (nessuna offerta cloud ufficiale) — vedi sezione 5 per l'analisi Cloud Run dedicata. Aggrega altri motori (Google, Bing, DuckDuckGo, ecc.) via scraping, non ha un proprio indice.

### 2.6 Bing Web Search API

❌ **Ritirata definitivamente l'11 agosto 2025** (annuncio 15 maggio 2025, nuove risorse già bloccate da inizio 2025). Qualsiasi chiave esistente ha smesso di funzionare a quella data. Il percorso di migrazione ufficiale Microsoft è _Grounding with Bing Search_ dentro Azure AI Foundry: richiede un intero progetto Azure con resource group e model deployment, fattura ~$14/1.000 transazioni (una singola domanda utente può generare più transazioni), e — punto cruciale — **non restituisce risultati di ricerca grezzi** all'applicazione: fornisce contesto web direttamente al modello che genera la risposta. Non è quindi un sostituto drop-in di una search API classica.
**Verdetto: escludere dal confronto**, non più disponibile nella forma richiesta.

### 2.7 Perplexity Sonar / Search API

Free tier reale pressoché assente: pochi $ di crediti trial una tantum per nuovi account, oppure $5/mese di credito API solo per chi ha già l'abbonamento Pro ($20/mese) — quindi non gratuito in senso stretto. Pricing token: Sonar $1/$1 per milione, Sonar Pro $3/$15 per milione, più fee per richiesta (~$5/1.000 per ricerca grezza, $14–22/1.000 per "Pro Search" agentico). È concettualmente un **answer engine** (LLM + ricerca + citazioni in un'unica risposta sintetizzata), non una search API che restituisce un array di link da processare autonomamente — forma di output diversa da quella che serve a `searchWebAndPlatformsTool`.
**Verdetto: sconsigliato** come sostituto diretto; potenzialmente interessante in futuro per una feature "risposta con citazioni", non per lo scouting/verifica dati grezzi richiesto oggi.

### 2.8 You.com API (provider emergente)

Nessun piano gratuito permanente; $100 di credito una tantum all'iscrizione. Search $5/1.000 chiamate, Contents $1/1.000 pagine, Research da $12/1.000. SOC 2, una fonte cita "zero data retention" (da verificare in DPA ufficiale prima di fare affidamento contrattuale su questo punto).
**Verdetto: fallback pagato accettabile dopo l'esaurimento del credito iniziale**, non ricorrente gratuito.

### 2.9 Jina AI — Reader / Search (`s.jina.ai`, `r.jina.ai`) (provider emergente)

Free tier **rate-limited anziché a quota mensile fissa**: 100 richieste/minuto, 100K token/minuto, 2 richieste concorrenti (tier gratuito); 1.000.000 di token gratuiti all'iscrizione (uso non commerciale). Il vantaggio pratico è la funzione Reader: converte qualunque URL in Markdown pulito per l'LLM — ottimo complemento a un provider di search che restituisce solo link grezzi (es. Serper), risolvendo il secondo step "leggi il contenuto della pagina" senza costi aggiuntivi.
**Verdetto: ottimo layer complementare** (estrazione contenuto + ricerca di scorta) nella catena.

### 2.10 Firecrawl Search (provider emergente)

Free tier: **1.000 credit/mese ricorrenti**, nessuna carta richiesta (portato da un precedente tetto lifetime di 500 a questo valore ricorrente nel 2026). L'endpoint Search costa ~2 credit/query; include anche scraping ed estrazione full-page nello stesso prodotto. Paid: Hobby $16/mese (5.000 credit), Standard $83/mese (100.000 credit). MCP server disponibile, core open-source (self-hostabile). Integrazioni LangChain/CrewAI/LlamaIndex.
**Verdetto: ottimo terzo pilastro** della catena — combina search + estrazione contenuto in un'unica chiamata gratuita ricorrente.

### 2.11 DataForSEO SERP API (rete di sicurezza a pagamento)

Nessun free tier ricorrente; $1 di credito trial una tantum, nessuna carta per il sandbox. Pay-as-you-go estremamente economico: coda "Standard" $0,0006/query (~5 min di attesa, va bene per batch/prefetch), "Live" $0,002/query (2–6s), "Priority" $0,0012/query (~1 min). Richiede un top-up minimo di $50 per uso reale oltre il trial. MCP server ufficiale disponibile.
**Verdetto: miglior rete di sicurezza a pagamento** per l'overflow oltre le quote gratuite — al volume di OpsFlow, costa centesimi/mese.

### 2.12 Gemini "Grounding with Google Search" — opzione nativa già nello stack

Poiché OpsFlow orchestra già Gemini via Genkit, vale la pena valutare il grounding nativo dell'API Gemini: **5.000 prompt grounded/mese gratuiti** sulla famiglia Gemini 3.x, poi $14/1.000 query aggiuntive (contro $35/1.000 sui modelli 2.5). Attenzione a due punti:

1. La regola AI-Engineer di OpsFlow blocca oggi su `gemini-1.5-flash`, un modello di generazione precedente rispetto alla famiglia 3.x a cui si riferisce questa quota gratuita — **da verificare se e come la quota gratuita si applica al tier di modello effettivamente in uso** prima di considerarla parte del budget.
2. L'output è una **risposta LLM già sintetizzata con metadati di citazione**, non un array JSON di risultati grezzi — utile se l'obiettivo è "fai rispondere Gemini con dati freschi", meno utile per gli usi dichiarati nel brief (scouting lead, verifica normative, ricerca fornitori) che richiedono risultati strutturati da processare con logica propria.
   **Verdetto: canale complementare interessante a costo marginale zero** (nessuna nuova integrazione vendor), da tenere distinto dal chaining di search API vere e proprie.

---

## 3. Matrice Comparativa di Dettaglio

| Provider & Servizio                                   | Piano Gratuito                                                                           | Costo oltre soglia                                                                                                 | Formato dati                                                 | Resistenza Anti-Bot & ToS                                                                                                                                          | Latenza media                                                  | Verdetto OpsFlow                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------- |
| **Tavily Search API**                                 | 1.000 credit/mese ricorrenti, no carta                                                   | $30/mese (Researcher) · $0,008/credit PAYG · $0,005/credit a volume                                                | JSON nativo, contenuto già estratto/sintetizzato per LLM     | Indice proprio + scraping controllato; ToS commerciale standard SaaS US                                                                                            | Non bench. indipendente — categoria tipica: centinaia di ms–2s | **Primaria**                                    |
| **Exa.ai**                                            | $20 iscrizione + $10/mese ricorrenti, no carta                                           | $7/1.000 (search) · $12–15/1.000 (deep) · $1/1.000 pagine (contents)                                               | JSON, ricerca semantica/neurale, contenuto token-efficient   | Indice proprio; ToS commerciale standard SaaS US                                                                                                                   | Non bench. indipendente                                        | **Secondaria** (fallback semantico)             |
| **Serper.dev**                                        | 2.500 query _una tantum_ (non mensile), no carta                                         | ~$1/1.000 (pacchetto $50) fino a ~$0,30/1.000 a volume; credit scadono a 6 mesi                                    | JSON SERP grezzo (title/snippet/link), no estrazione         | Wrapper Google SERP — dipende dalla tolleranza Google verso il provider, non dal singolo utente                                                                    | ~1–2s dichiarati dal vendor                                    | **Riserva burst iniziale**, non ricorrente      |
| **Kagi Search API**                                   | Nessuno                                                                                  | $15–25/1.000 (dato a bassa confidenza, verificare)                                                                 | JSON                                                         | Indice proprio; nessun MCP ufficiale                                                                                                                               | Non verificato                                                 | **Sconsigliato** (costo + assenza free tier)    |
| **SearXNG (self-hosted)**                             | Illimitato (software gratuito)                                                           | Solo costo infrastruttura (vedi §5)                                                                                | JSON (va abilitato in `settings.yml`, disattivo di default)  | **Debole**: da singolo IP la maggior parte dei motori (Google incl.) applica CAPTCHA rapidamente; di fatto degrada a proxy DuckDuckGo senza pool di proxy dedicati | Variabile, dipende dai motori a monte                          | **Backup a bassa priorità**, non primario       |
| **Bing Web Search API**                               | N/D                                                                                      | N/D                                                                                                                | N/D                                                          | ❌ **Servizio ritirato 11/08/2025**                                                                                                                                | N/D                                                            | **Escluso — non più esistente**                 |
| **Perplexity Sonar/Search API**                       | Trascurabile (crediti trial una tantum, o $5/mese solo per abbonati Pro $20/mese)        | $1/$1 per M token (Sonar) fino a $3/$15 (Sonar Pro); ~$5/1.000 (search grezza); $14–22/1.000 (Pro Search agentico) | Risposta LLM sintetizzata + citazioni (non array di link)    | ToS commerciale standard SaaS US                                                                                                                                   | Più alta (genera anche la risposta, non solo il risultato)     | **Sconsigliato** per questo caso d'uso          |
| **You.com API**                                       | $100 credito una tantum, no piano gratuito permanente                                    | $5/1.000 (search) · $1/1.000 pagine (contents) · da $12/1.000 (research)                                           | JSON, contenuto estratto                                     | SOC 2 dichiarato; "zero data retention" riportato da fonte terza, da confermare in DPA                                                                             | Non verificato                                                 | **Fallback pagato** dopo credito iniziale       |
| **Jina AI (Reader/Search)**                           | Rate-limited: 100 RPM/100K TPM/2 concorrenti + 1M token onboarding (uso non commerciale) | Tier a pagamento aumentano RPM/TPM/concorrenza                                                                     | Markdown pulito da URL (Reader) + JSON (Search)              | ToS commerciale standard SaaS                                                                                                                                      | Non verificato                                                 | **Complementare** (estrazione contenuto)        |
| **Firecrawl Search**                                  | 1.000 credit/mese ricorrenti, no carta                                                   | $16/mese (5.000 credit) · $83/mese (100.000 credit)                                                                | JSON/Markdown, search + estrazione full-page combinate       | Anti-bot gestito dal vendor (proxy/headless incl.); ToS commerciale standard SaaS US; core open-source self-hostabile                                              | Non verificato                                                 | **Terziaria** (chain)                           |
| **DataForSEO SERP API**                               | $1 credito trial una tantum (no carta per sandbox)                                       | $0,0006/query (Standard, ~5 min) · $0,002/query (Live, 2–6s) · min. top-up $50                                     | JSON/HTML parsato, 20+ endpoint Google                       | Gestito dal vendor; MCP ufficiale disponibile                                                                                                                      | ~2–6s (Live) · ~5 min (Standard)                               | **Rete di sicurezza a pagamento** per overflow  |
| **Google Custom Search JSON API**                     | 100/giorno (solo account esistenti)                                                      | $5/1.000, tetto rigido 10.000/giorno                                                                               | JSON                                                         | Chiusa a nuovi account dal 2025                                                                                                                                    | ~qualche centinaio di ms                                       | **Escluso** — shutdown 01/01/2027               |
| **Gemini Grounding w/ Google Search** (nativo Genkit) | 5.000 prompt grounded/mese (famiglia Gemini 3.x)                                         | $14/1.000 oltre soglia (3.x) · $35/1.000 (2.5)                                                                     | Risposta LLM groundata + metadati citazione (non array link) | Google Cloud ToS; per produzione EU tier a pagamento è di fatto richiesto (free tier può essere usato per migliorare i prodotti Google)                            | Non verificato                                                 | **Canale complementare** a costo marginale zero |

---

## 4. Architettura "Zero-Cost Strategy" — Multi-Provider Chaining

### 4.1 Combinazione proposta

Dato che nessun singolo provider copre più il target da solo (§ Executive Summary), la catena proposta usa **3 provider gratuiti ricorrenti** in sequenza di priorità, più **1 rete di sicurezza a pagamento** quasi-gratuita per l'overflow:

| Ordine | Provider                        | Ruolo                                              | Quota gratuita/mese                    | Trigger di rollover                          |
| ------ | ------------------------------- | -------------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| 1      | **Tavily**                      | Primario — ricerca AI-optimized + estrazione       | 1.000                                  | HTTP 429 (quota esaurita) · timeout · 5xx    |
| 2      | **Exa.ai**                      | Secondario — fallback semantico                    | ~1.000–1.400                           | HTTP 429/402 · timeout · 5xx                 |
| 3      | **Firecrawl Search**            | Terziario — search + estrazione combinate          | 1.000 (≈500 ricerche a 2 credit/query) | HTTP 429 · timeout · 5xx                     |
| 4      | **Jina AI Search/Reader**       | Overflow leggero — rate-limited, non a quota fissa | Fino a 100 RPM (assorbe picchi)        | Solo se 1–3 tutti esauriti nel mese          |
| 5      | **DataForSEO (Standard queue)** | Rete di sicurezza a pagamento                      | N/D (PAYG, $0,0006/query)              | Solo come ultima risorsa, con alert di spesa |

**Somma quote gratuite ricorrenti (1+2+3): ≈ 2.500–3.400 ricerche/mese a costo zero**, prima di toccare Jina AI o il livello a pagamento. Aggiungendo l'assorbimento di Jina AI (rate-limited, non a tetto mensile fisso) la fascia bassa del target dichiarato (3.000–6.000/mese) è raggiungibile restando a **€0,00** nella maggior parte dei mesi; l'eventuale overflow residuo va su DataForSEO Standard, dove anche 2.000 query extra costano **~$1,20 (≈€1,03)** — ben dentro il tetto di €5–10/mese.

> ⚠️ Nota: rispetto all'ipotesi originale del brief (Brave come base gratuita da 2.000 query), lo scenario reale richiede _tre_ integrazioni invece di _una_, con relativo aumento di complessità di manutenzione (3 SDK/API key da gestire invece di 1). È il costo dell'aver perso il free tier di Brave.

### 4.2 Schema del tool Genkit (bozza)

Coerente con le regole vincolanti già in AGENTS.md (Zod schema rigidi, sanitizzazione PII, timeout, sliding window, marcatori `/*end fn*/`):

```typescript
/**
 * @file searchWebAndPlatformsTool.ts
 * @description Multi-provider web search tool with automatic rollover across
 * Tavily, Exa, and Firecrawl free tiers, falling back to DataForSEO (paid) only
 * as a last resort. Tracks monthly usage per provider to pre-empt quota errors.
 * @author Vasile Chifeac
 * @created 2026-08-24
 * @modified 2026-08-24
 *
 * @notes
 * - Provider order is priority-based, not load-balanced: cheapest/most-relevant free tier first.
 * - Circuit breaker opens on 429/402/5xx or timeout, closes on next month's quota reset.
 * - All outbound queries pass through sanitizePii() before leaving the Cloud Function.
 *
 * @dependencies
 * - genkit, zod, sanitizePii (piiSanitizer.ts)
 *
 * @performance
 * - Target: <8,000 tokens/call, <5 Firestore reads/month for quota tracking (JWT-first design)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore, doc, getDoc, setDoc, increment } from "firebase/firestore";
// ── Types ────────────────────────────────────────────────────────────────────
import { z } from "zod";
// ── Utils ────────────────────────────────────────────────────────────────────
import { sanitizePii } from "src/utils/piiSanitizer";
import { logger } from "src/utils/logger";

const SearchInputSchema = z.object({
  query: z.string().min(1).max(400),
  maxResults: z.number().int().min(1).max(10).default(5),
}); // Zod input schema — required per AI-Engineer skill rule #3

const SearchResultSchema = z.object({
  provider: z.enum(["tavily", "exa", "firecrawl", "jina", "dataforseo"]),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string().max(500),
    }),
  ),
}); // Zod output schema

// Priority-ordered provider chain — cheapest/free-first
const PROVIDER_CHAIN = ["tavily", "exa", "firecrawl", "jina", "dataforseo"] as const;

const callProvider = async (
  provider: (typeof PROVIDER_CHAIN)[number],
  cleanQuery: string,
  maxResults: number,
): Promise<z.infer<typeof SearchResultSchema> | null> => {
  try {
    // Each branch has its own 8s timeout per AGENTS.md §5 resilience rule
    // (implementation per-provider omitted for brevity)
    return await fetchFromProvider(provider, cleanQuery, maxResults);
  } catch (err) {
    logger.warn(`[searchTool] ${provider} failed, rolling over`, { code: (err as Error).message });
    return null; // triggers rollover to next provider in chain
  }
}; /*end callProvider*/

export const searchWebAndPlatformsTool = defineTool(
  {
    name: "searchWebAndPlatformsTool",
    inputSchema: SearchInputSchema,
    outputSchema: SearchResultSchema,
  },
  async (input) => {
    // GDPR Art. 32 — no PII leaves the function un-sanitized (AI-Engineer skill rule #4)
    const cleanQuery = sanitizePii(input.query);

    for (const provider of PROVIDER_CHAIN) {
      const quotaOk = await hasQuotaRemaining(provider); // JWT/Firestore counter check
      if (!quotaOk) continue;

      const result = await callProvider(provider, cleanQuery, input.maxResults);
      if (result) {
        await incrementUsageCounter(provider); // 1 Firestore write, not a read (cost-optimized)
        return result;
      }
      // null result → try next provider in chain
    }

    throw new Error("All search providers exhausted or unavailable this month.");
  },
); /*end searchWebAndPlatformsTool*/
```

_(Pseudocodice architetturale — le funzioni `fetchFromProvider`, `hasQuotaRemaining`, `incrementUsageCounter` vanno implementate secondo lo standard `.ts` completo del progetto; qui si mostra solo la logica di rollover e gli schema Zod richiesti.)_

### 4.3 Tracciamento quote — costo Firestore quasi nullo

Per non vanificare il risparmio con letture Firestore continue, il contatore mensile per provider va tenuto in **RAM (Pinia/memoria di funzione)** con **scrittura Firestore solo sugli step significativi** (es. ogni 50 chiamate, non ad ogni singola richiesta), coerente con la strategia On-Demand Sync già definita in `cost-analysis.md`. Un reset mensile via Cloud Scheduler azzera i contatori il giorno 1 di ogni mese.

---

## 5. SearXNG su Google Cloud Run — Conviene?

**Risposta breve: il costo di calcolo puro è trascurabile, ma l'onere operativo reale lo rende inadatto come layer primario.**

### 5.1 Lato costi (favorevole)

Con `minInstances: 0` (scale-to-zero) e billing a richiesta, Cloud Run fattura solo CPU/memoria effettivamente usate durante l'elaborazione:

- CPU: $0,000024/vCPU-secondo (regioni Tier 1)
- Memoria: $0,0000025/GiB-secondo

Stimando 6.000 query/mese come fallback residuale, ~2s di elaborazione ciascuna, 1 vCPU/512MiB: si arriva a **meno di $0,50/mese** di puro compute, ben dentro il target di OpsFlow. Il primo milione di richieste/mese è comunque incluso nel free tier permanente di Cloud Run.

### 5.2 Lato operativo (sfavorevole) — il problema reale

Da un test pratico verificato in rete (luglio 2026): un'istanza SearXNG self-hosted, out-of-the-box:

1. Ha l'**API JSON disattivata di default** — va abilitata a mano in `settings.yml`.
2. Con la configurazione motori di default, alcuni motori restituiscono errori 500 finché non vengono ristretti manualmente.
3. **Da un singolo IP, la maggior parte dei motori (incluso Google) applica CAPTCHA molto rapidamente** — di fatto, senza un pool di proxy dedicato, l'istanza degrada a un proxy quasi-esclusivo di DuckDuckGo, perdendo la varietà di fonti che giustificherebbe l'uso di un metasearch.

Per ottenere risultati Google-quality servirebbe instradare le richieste su proxy rotanti (spesso residenziali) — il che **reintroduce un costo ricorrente non trascurabile** e complessità di manutenzione (rotazione, monitoraggio ban), vanificando parte del vantaggio "gratis" rispetto alle API SaaS con free tier.

### 5.3 Verdetto

SearXNG su Cloud Run è consigliato **solo come backup di ultimissima istanza** (es. quando tutti i provider SaaS della catena sono esauriti E DataForSEO non è disponibile per qualche motivo), non come pilastro primario o secondario. Il tempo di configurazione/manutenzione (proxy, `settings.yml`, monitoraggio) supera probabilmente il valore delle poche centinaia di query/mese che risparmierebbe rispetto a lasciare che l'overflow vada su DataForSEO (~€0,0005/query).

---

## 6. Privacy & GDPR Compliance

### 6.1 Policy "No-Log" — confronto

| Provider                                        | Posizione su log/retention                                                                                                                                                                                         | Zero Data Retention (ZDR)                                           | Note                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brave Search API**                            | Ritenzione query log **90 giorni di default** (fatturazione/troubleshooting); Brave sostiene che i dati di query non costituiscano "dati personali" ai sensi del GDPR poiché non associati a identificatori utente | Disponibile **solo per clienti Enterprise**, non sui piani standard | SOC 2 Type II attestato; DPA pubblico con SCC per trasferimenti extra-UE                                                                                              |
| **Tavily / Exa / Serper / You.com / Firecrawl** | Privacy policy commerciale standard (aziende USA); nessuna dichiarazione pubblica esplicita di "no-log" riscontrata nella ricerca                                                                                  | Non riscontrato per i piani standard esaminati                      | Presumibilmente SCC per trasferimenti UE→USA, **da verificare puntualmente sul DPA di ciascun vendor prima del lancio commerciale** — non assumere clausole non lette |
| **Kagi**                                        | Posizionamento privacy-first per il prodotto consumer; nessuna dichiarazione specifica per l'API verificata in questa ricerca                                                                                      | Non verificato                                                      | Da richiedere direttamente al vendor se si valuta l'adozione                                                                                                          |
| **Jina AI / DataForSEO**                        | Privacy policy commerciale standard                                                                                                                                                                                | Non verificato                                                      | Idem — verifica diretta necessaria                                                                                                                                    |

**Nessuno dei provider gratuiti/economici proposti in catena (Tavily, Exa, Firecrawl) offre oggi una garanzia "no-log" pubblicamente dichiarata equivalente a quella di Brave Enterprise.** Questo è un trade-off reale della strategia multi-provider rispetto all'opzione Brave originale (che comunque, va ricordato, offriva ZDR solo su Enterprise, non sul tier gratuito ormai eliminato).

### 6.2 Cache dei risultati in Firestore — considerazioni

- La cache dei **risultati** (URL, titolo, snippet pubblici) per supportare le sessioni di lavoro dell'utente è pratica comune nel settore e generalmente compatibile con un uso "ragionevole" delle API — ma **le Acceptable Use Policy di ciascun vendor vanno lette puntualmente**: alcune vietano esplicitamente la ri-distribuzione bulk dei risultati o la costruzione di un indice concorrente, un limite diverso dalla semplice cache per singola sessione utente.
- La **query stessa** inviata al provider può contenere dati personali (nome di un lead, dettagli di un fornitore) — per questo la regola già presente in AGENTS.md/AI-Engineer skill (passaggio obbligatorio da `sanitizePii()` prima di ogni chiamata esterna) **va applicata simmetricamente anche a ciò che viene poi scritto in cache su Firestore**, non solo al payload in uscita verso l'LLM.
- Nessuna fonte consultata in questa ricerca conferma in modo esplicito, per i provider AI-native esaminati (Tavily, Exa, Firecrawl), una clausola contrattuale che autorizzi o vieti espressamente la memorizzazione dei risultati estratti in un database applicativo lato cliente. **Raccomandazione: richiedere conferma scritta o DPA firmato ai vendor selezionati prima del go-live commerciale**, non assumere per analogia con altri provider.

### 6.3 Nota legale

Questa sezione fornisce un'analisi di posizionamento basata su fonti pubbliche (privacy policy, DPA, blog ufficiali dei vendor) raccolte il 24/08/2026 e **non costituisce parere legale formale**. Prima dell'adozione in produzione di uno o più provider, si raccomanda una revisione del DPA specifico da parte di un consulente legale qualificato in materia di protezione dati, in particolare per la valutazione dell'Art. 28 GDPR (nomina a responsabile del trattamento) e delle clausole di trasferimento extra-UE (SCC) di ciascun vendor selezionato.

---

## 7. Raccomandazione Finale

| Ruolo                             | Provider                                                                                                                                                      | Motivazione                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primario**                      | **Tavily**                                                                                                                                                    | Free tier ricorrente più ampio senza carta (1.000/mese), output già ottimizzato per RAG, MCP nativo, integrazione LangChain di riferimento                                                |
| **Secondario**                    | **Exa.ai**                                                                                                                                                    | Copre il gap semantico di Tavily (ricerca concettuale/similarity), free tier ricorrente da carta non richiesta                                                                            |
| **Terziario**                     | **Firecrawl Search**                                                                                                                                          | Free tier ricorrente + estrazione full-page nello stesso costo, utile quando serve leggere il contenuto oltre allo snippet                                                                |
| **Overflow leggero**              | **Jina AI Reader/Search**                                                                                                                                     | Rate-limited anziché a tetto fisso, complementare per l'estrazione contenuto senza costi aggiuntivi                                                                                       |
| **Rete di sicurezza a pagamento** | **DataForSEO (coda Standard)**                                                                                                                                | Overflow residuo a ~€0,0005/query — mantiene il costo totale ben dentro €5–10/mese anche nei mesi di picco                                                                                |
| **Backup di ultima istanza**      | **SearXNG su Cloud Run**                                                                                                                                      | Solo se tutto il resto è esaurito o non disponibile; costo compute trascurabile ma affidabilità bassa da singolo IP (§5)                                                                  |
| **Esclusi**                       | Bing Web Search API (ritirata), Google CSE JSON API (in chiusura 2027), Kagi (nessun free tier, costoso), Perplexity Sonar (forma output non adatta, costoso) | Vedi schede §2 per il dettaglio                                                                                                                                                           |
| **Da rivalutare separatamente**   | Gemini Grounding nativo (già in stack Genkit)                                                                                                                 | Non sostituisce la search API, ma è un canale complementare a costo marginale zero per risposte già groundate — verificare compatibilità con il tier di modello Gemini attualmente in uso |

**Stima costo totale atteso:** €0,00–€2,00/mese nella maggioranza dei mesi (solo compute/overflow occasionale), ben sotto il tetto di €5–10/mese richiesto — a fronte però di **3 integrazioni vendor invece di 1**, essendo venuto meno il free tier gratuito di Brave che rendeva possibile la soluzione mono-provider originariamente ipotizzata nel brief.

---

## 8. Prossimi Passi

1. Registrare account gratuiti Tavily, Exa, Firecrawl (nessuna carta richiesta per nessuno dei tre) e validare le chiavi in ambiente di sviluppo.
2. Implementare `searchWebAndPlatformsTool` con la logica di rollover a 3+1 livelli (§4.2), rispettando schema Zod e sanitizzazione PII già vincolanti in AGENTS.md.
3. Impostare contatori di quota mensile a scrittura sporadica (non ad ogni chiamata) per non generare costi Firestore paralleli al risparmio ottenuto.
4. Richiedere ai team legali dei singoli vendor (Tavily, Exa, Firecrawl) conferma scritta su: retention delle query, possibilità di cache dei risultati, DPA per trasferimento dati extra-UE (§6.3).
5. Rivalutare SearXNG su Cloud Run solo dopo aver misurato in produzione la frequenza reale di overflow oltre i tre free tier ricorrenti.
6. Monitorare trimestralmente i pricing dei provider selezionati: nella sola finestra di questa ricerca (2026) si sono osservati cambi di prezzo/quota non annunciati in anticipo su Brave, Exa e Serper.

---

## 📚 Fonti principali consultate (24/08/2026)

- tavily.com/pricing, docs.tavily.com, tavily.com/privacy, usagepricing.com (Tavily)
- exa.ai/pricing, exa.ai/docs/reference/pricing (Exa)
- serper.dev, dati aggregati da apiserpent.com e coldiq.com (Serper — pricing page pubblica limitata)
- brave.com/search/api, api-dashboard.search.brave.com/documentation, DPA pubblico Brave Search API (Brave)
- learn.microsoft.com/lifecycle/announcements/bing-search-api-retirement (Bing — fonte ufficiale Microsoft)
- developers.google.com/custom-search (Google CSE — fonte ufficiale, shutdown gennaio 2027)
- docs.perplexity.ai/guides/pricing (Perplexity)
- you.com/pricing, you.com/resources (You.com)
- dataforseo.com/apis/serp-api/pricing (DataForSEO)
- ai.google.dev/gemini-api/docs/pricing (Gemini grounding)
- cloud.google.com/run/pricing (Cloud Run)
- railway.com/deploy/searxng-search-api, apiserpent.com/blog/searxng-self-hosted-serp-api-tested (SearXNG — test pratico)
- investing.com/currencies/eur-usd, xe.com (cambio EUR/USD)

_Nota metodologica: i prezzi di questo mercato cambiano con frequenza mensile (osservato per Brave, Exa e Serper solo nella finestra dei primi 8 mesi del 2026). Riverificare le cifre chiave direttamente sulle pricing page ufficiali prima di qualsiasi commitment di budget o contratto._
