# 📋 Step 7 — Piano Chirurgico Bonifica Mock Statici & Attivazione Rete Neurale Multi-Settoriale (OpsFlow)

> **Standard Architetturale:** Full-Stack Alignment (Regola §0 AGENTS.md & Multi-Domain AI Orchestration)  
> **Autore:** Senior OpsFlow Architect & Lead AI Systems Engineer  
> **Data:** 14 Agosto 2026  
> **Stato:** ✅ COMPLETATO E VALIDATO FULL-STACK

---

## 🎯 Obiettivo Strategico

Eliminare definitivamente il bug di **Context Blindness** causato da Regex rigide ed array di risposte hardcoded sull'ambito IT/Software. Garantire che l'infrastruttura Genkit/Gemini 1.5 Flash elabori in modo **puro, dinamico e multi-settoriale** qualsiasi prompt operativo inserito dall'utente (es. **Sanità / VersiliaCare**, Legale, Finance, Real Estate, IT).

---

## ⚠️ DIRETTIVA FONDAMENTALE (Full-Stack Alignment & No Dummy Fallbacks)

- **È vietato mascherare errori con risposte fittizie** (Regola Guidelines: _Never resolve errors by returning dummy fallbacks_).
- Ogni interazione utente nella chat deve fluire **direttamente verso l'LLM generativo (Gemini 1.5 Flash)** senza filtri di categoria restrittivi o risposte preimpostate.

---

## 🗂️ Mappa dei File Oggetto di Bonifica Chirurgica

| Modulo                     | File Interessato                                                                                                            | Modifica Programmata                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Frontend UI**            | [TaskChatWindow.vue](file:///home/chif-vas/projects/opsflow/src/components/TaskChatWindow.vue)                              | Rimozione totale di `generateSmartLocalAiResponse()` e delle regex `lower.includes("cerca")`        |
| **Frontend UI**            | [TaskChatModal.vue](file:///home/chif-vas/projects/opsflow/src/components/TaskChatModal.vue)                                | Rimozione totale di `generateSmartLocalAiResponse()` e convogliamento verso la Cloud Function reale |
| **Backend Cloud Function** | [opsflow-functions/src/index.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/index.ts)                     | Rimozione di `isPlatformQuery` e dei template IT hardcoded nel blocco `catch`                       |
| **Backend Genkit Flow**    | [opsflow-functions/src/ai/chatFlow.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/ai/chatFlow.ts)         | Ottimizzazione Prompt System per garantire risposte flessibili a qualsiasi dominio verticale        |
| **Genkit Tools**           | [opsflow-functions/src/tools/webSearch.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/tools/webSearch.ts) | Rimozione degli array `mockResults` IT e attivazione dello scouting reale via `jinaReaderTool`      |

---

## 📋 Checklist Chirurgica di Bonifica Chirurgica

### 🔹 Fase 1: Bonifica Frontend (`TaskChatWindow.vue` e `TaskChatModal.vue`)

- [x] **Rimuovere `generateSmartLocalAiResponse()` da `TaskChatWindow.vue`**:
  - Eliminarne l'invocazione nel blocco `if (!fetchedOk)`.
  - In caso di errore di rete, notificare l'utente con `q.notify` ed un messaggio di errore trasparente anziché generare un testo IT fasullo.
- [x] **Rimuovere `generateSmartLocalAiResponse()` da `TaskChatModal.vue`**:
  - Eliminarne la dichiarazione e l'uso.
  - Sostituire il fallback con gestione trasparente dell'errore di rete.
- [x] **Verificare che tutte le azioni rapide (`Cerca Lead`, `Bozza Email`, `Sheets`)**:
  - Inviino direttive testuali pure che l'LLM Gemini 1.5 Flash interpreterà adattandole al contesto del task corrente (sanitario, legale, commerciale).

### 🔹 Fase 2: Bonifica Backend Cloud Function (`opsflow-functions/src/`)

- [x] **Bonificare `opsflow-functions/src/index.ts` (`chatWithAgent`)**:
  - Rimuovere la variabile ed il controllo `isPlatformQuery = /piattaform|piatafom|cerca|lead.../i`.
  - Rimuovere il testo finto su Clutch.co, GoodFirms e LinkedIn.
  - In caso di eccezione durante la chiamata Genkit, restituire un codice di errore HTTP 500 con messaggio JSON trasparente.
- [x] **Bonificare `opsflow-functions/src/tools/webSearch.ts`**:
  - Rimuovere l'array di test statico `mockResults` contenente `example-it-solutions`.
  - Integrare la chiamata di ricerca web ed il rendering tramite `jinaReaderTool` (`https://r.jina.ai/`).

### 🔹 Fase 3: Garanzia Multi-Dominio (Prompt Stacking Puro)

- [x] **Aggiornare `chatFlow.ts` & `promptBuilder.ts` System Prompt**:
  - Verificare che il prompt di sistema di Genkit istruisca l'Agente ad analizzare il settore specifico descritto nel task (Sanità, Assistenza Domiciliare, Legale, IT, Retail) senza assumere alcuno stack o dominio predefinito.
- [x] **Test di Integrità del Prompt VersiliaCare**:
  - Garantire che i parametri del prompt (es. _Versilia, Forte dei Marmi, PICC/Midline, Pacchetto ICU 250€_) vengano preservati intatti nella chiamata verso Gemini.

### 🔹 Fase 4: Verification & Quality Audit

- [x] Eseguire `yarn typecheck` per verificare la totale assenza di errori di tipo TypeScript (`vue-tsc`).
- [x] Eseguire `yarn lint` per confermare l'assenza di warning/errori di formatting o linting (`oxlint` e `oxfmt`).
- [x] Verificare che il codice rispetti la convenzione dei marcatori `/* end function */` ed i commenti JSDoc header in tutti i file modificati.

---

## 💡 Risultato Atteso Post-Bonifica

Quando l'utente inserisce un prompt come quello di **VersiliaCare**:

1. Il testo fluisce verso `chatWithAgent` senza subire alcuna intercettazione Regex.
2. Gemini 1.5 Flash riceve il testo integrale ed attiva il tool `searchWebAndPlatformsTool` / `jinaReaderTool`.
3. L’Agente restituisce un'analisi verticale accurata specifica per la **Versilia (Forte dei Marmi, Viareggio)** e per i servizi di **assistenza infermieristica ad alta tecnologia**, azzerando qualsiasi riferimento fuori contesto all'ambito IT.
