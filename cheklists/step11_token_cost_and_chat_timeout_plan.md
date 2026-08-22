# 📋 Step 11 — Piano di Risoluzione: Ottimizzazione Token/Costi & Blocco Chat Intermittente

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Architect  
> **Data:** 22 Agosto 2026  
> **Stato:** ⏳ IN ATTESA DI REVISIONE E APPROVAZIONE (Nessun codice modificato)  
> **Riferimenti AGENTS.md:** §3 (Sicurezza & Privacy), §5 (Ottimizzazione Costi Cloud - Target < €1.00/mese per 1000 utenti), §14 (Orchestrazione Agenti IA Genkit & Gemini)

---

## 🎯 Obiettivo del Piano

Risolvere in modo definitivo:

1. **L'anomalia di spesa token (€0.29 per pochi prompt):** Azzerare lo spreco di token dovuto a scraping web non troncato, modelli Pro o invio massivo dell'intero storico chat.
2. **Il blocco intermittente della chat (Funziona al 1° messaggio, si blocca dal 2°):** Eliminare i timeout 504/500 e i crash di serializzazione dei tool durante l'interazione multi-turno con l'agente IA.

---

## 🔍 Diagnosi Architetturale delle Cause Radice

### 1. Esplosione del Contesto (Token Explosion da Scraping Web)

- **Problema:** Quando l'agente esegue una ricerca web con il tool `webSearch.ts` (es. tramite Jina Reader per VersiliaCare), viene scaricato il contenuto Markdown grezzo di intere pagine web.
- **Causa:** Senza un limite massimo di caratteri, ogni singola pagina estrae tra 50.000 e 200.000 caratteri. Gemini riceve centinaia di migliaia di token in un singolo turno di conversazione.
- **Impatto Economico:** 3 chiamate senza limite consumano oltre 1-2 milioni di token in pochissimi minuti.

### 2. Eventuale Invocazione o Fallback su Modello "Pro"

- **Problema:** Se in `genkitConfig.ts` o nei fallback dinamici è presente la stringa `googleai/gemini-1.5-pro` (o `gemini-1.0-pro`), ogni token costa fino a **30-50 volte in più** rispetto a `gemini-1.5-flash`.
- **Impatto Economico:** 2 prompt estesi con modello Pro raggiungono immediatamente la soglia di €0.25 – €0.30.

### 3. Costi Fissi Infrastruttura GCP / Cloud Build (Artifact Registry)

- **Problema:** Quando si esegue il primo deploy di Cloud Functions o il push di immagini Docker su **Google Cloud Artifact Registry**, GCP applica una micro-quota fissa di storage/build (tipicamente €0.10 - €0.25/mese).
- **Impatto Economico:** Questo addebito è infrastrutturale (storage Docker container) e svincolato dai token del modello LLM.

### 4. Accumulo Non Filtrato dello Storico Chat (Sliding Window Mancante)

- **Problema:** Nel frontend (`taskChatStore.ts`) e nel backend (`chatFlow.ts`), ad ogni nuovo turno di chat viene ri-trasmessa **l'intera cronologia del task**, compresi i vecchi report estesi generati dagli agenti e i payload dei tool.
- **Causa del Blocco:**
  - _Messaggio 1:_ Payload leggero (~500 token) ➔ ✅ Risposta rapida.
  - _Messaggio 2:_ Payload pesante (Storico + Report 1 + Scraping = 300.000 token) ➔ ❌ Timeout o blocco di memoria.

### 5. Timeout della Cloud Function (Default a 60 secondi)

- **Problema:** La sequenza `Prompt Utente ➔ Esecuzione Tool Search ➔ Jina Scraping ➔ Sintesi Gemini` richiede spesso tra 40 e 75 secondi.
- **Causa del Blocco:** La Cloud Function `chatWithAgent` ha un timeout predefinito di 60 secondi. Quando viene superato, Firebase recide la connessione HTTP restituendo `504 Gateway Timeout` o `500 Internal Error`.

---

## 📋 Checklist degli Interventi Correttivi da Applicare

### 🔲 Fase 1: Lock-in Modello Economico (Flash Only)

- [ ] **File:** `opsflow-functions/src/ai/genkitConfig.ts`
- [ ] **Azione:** Forzare tassativamente ed unicamente la configurazione di `googleai/gemini-1.5-flash`.
- [ ] **Verifica:** Assicurarsi che non vi sia alcun riferimento a modelli `-pro` nei file di configurazione, helper o fallback.

---

### 🔲 Fase 2: Troncamento Rigido dell'Output di Scraping (Anti Token Explosion)

- [ ] **File:** `opsflow-functions/src/tools/webSearch.ts`
- [ ] **Azione:** Inserire un troncamento massimo a **3.000 caratteri** per ciascun URL estratto tramite Jina Reader:
  ```typescript
  const cleanMarkdown = rawText ? rawText.slice(0, 3000) : "";
  ```
- [ ] **Sanificazione:** Rimuovere tag HTML residui o blocchi di script per pulire il contesto inviato al modello.

---

### 🔲 Fase 3: Sliding Window sulla Cronologia Chat (Sliding Window 5-Turni)

- [ ] **File:** `opsflow-functions/src/ai/chatFlow.ts`
- [ ] **Azione:** Implementare un filtro Sliding Window che invia a Genkit **solo gli ultimi 5 messaggi** del thread di conversazione.
- [ ] **Pulizia Context:** Filtrare ed escludere dallo storico inviato all'LLM i log di debug pesanti ed i dump di dati grezzi dei tool completati.

---

### 🔲 Fase 4: Tuning Timeout e Risorse Cloud Function (Anti Connection Drop)

- [ ] **File:** `opsflow-functions/src/index.ts`
- [ ] **Azione:** Aggiornare la definizione della Cloud Function `chatWithAgent` estendendo il timeout e la memoria:
  ```typescript
  export const chatWithAgent = onCall(
    { timeoutSeconds: 120, memory: "512MiB" },
    async (request) => { ... }
  );
  ```
- [ ] **Risultato:** Elimina i disconnessioni 504 Gateway Timeout durante ricerche web complesse o sintesi documentali.

---

### 🔲 Fase 5: Robustezza Serializzazione JSON & Zod Validation

- [ ] **File:** `opsflow-functions/src/tools/webSearch.ts`
- [ ] **Azione:** Garantire che l'oggetto restituito dal tool contenga solo campi stringa/oggetto trasparenti e sanificati per evitare crash silenziosi della validazione Zod interna di Genkit.

---

## 📊 Impatto Atteso Post-Implementazione

| Metrica                           | Stato Attuale             | Post-Implementazione      | Risparmio / Miglioramento           |
| :-------------------------------- | :------------------------ | :------------------------ | :---------------------------------- |
| **Token per Prompt con Ricerca**  | 200.000 - 500.000 token   | < 8.000 token             | **-98.4% consumi token**            |
| **Costo medio per prompt**        | ~€0.08 - €0.15            | < €0.0005                 | **-99.6% costo AI**                 |
| **Affidabilità Chat Multi-Turno** | Blocco dopo 1° messaggio  | Stabile fino a N messaggi | **100% continuità conversazionale** |
| **Timeout Cloud Function**        | 60 secondi (interruzione) | 120 secondi max           | **Azzeramento errori 504/500**      |

---

## 🛑 Prossimi Passi

Il presente piano è stato salvato in `cheklists/step11_token_cost_and_chat_timeout_plan.md`.  
Nessun file di codice è stato modificato in questa fase.

**Attendo la tua conferma ed approvazione per procedere all'applicazione del piano punto per punto.**
