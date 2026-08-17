# 📋 Step 10 — Piano Chirurgico: AI Prompt Architect (DBS), Skill Matrix, Anti-Allucinazione, Presets & Voice Experience

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Pair Architect  
> **Data:** 17 Agosto 2026  
> **Stato:** Planned / In Attesa di Autorizzazione  
> **Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §3 (GDPR & Security), §5 (Cloud Cost Optimization €0 Nativo), §14 (Agent Architecture)

---

## 🌟 1. Innovazione UX: Copilota "AI Prompt Architect" (Framework DBS No-Code)

Per eliminare la "sindrome della pagina bianca" e consentire a qualsiasi utente (anche senza esperienza di prompt engineering) di configurare l'Agente AI, viene aggiunto il pulsante **`[✨ AI Prompt Architect]`** direttamente nell'header del Workspace.

### 📌 Layout Workspace Header

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗂️ Versilia Care  [🟢 Active Working]      [✨ AI Prompt Architect] [🎭 Atteggiamento IA] [➕ Nuovo Task] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 🔄 Flusso di Interazione Step-by-Step

1. **Apertura Modale Minimalista:** L'utente clicca `[✨ AI Prompt Architect]`. Si apre un campo di input libero in cui descrivere l'idea a parole semplici:

   > _"Voglio che questo workspace mi aiuti a mappare medici e farmacie in Versilia, creare bozze email per proporre i servizi PICC e post-dimissione e inserire tutto su Google Sheets senza inventare contatti fake."_

2. **Generazione DBS in Background (Gemini Flash-Lite):**
   Un micro-prompt Genkit converte istantaneamente l'idea nella struttura **DBS (Direction, Blueprints, Solutions)**:
   - **Direction (Processo Operativo):** Definisce le fasi del task (`Scouting → Analisi → Bozza Email → Tabella Sheets`).
   - **Blueprints (Regole DO & DON'T):** Estrae i vincoli ferrei (_"DO: usa solo dati geografici verificati di Lucca/Massa-Carrara"_; _"DON'T: non inventare numeri di telefono o email"_).
   - **Solutions & Skill Matrix:** Seleziona i ruoli specialistici (`[Healthcare Specialist]`, `[Lead Scout]`, `[Business Analyst]`) ed i tool richiesti (`[Gmail Draft]`, `[Google Sheets]`, `[Jina Reader]`).

3. **Applicazione Istantanea (`[🚀 Applica all'Atteggiamento IA]`):**
   L'utente visualizza l'anteprima formattata e, con un solo click, i dati vengono scritti su Firestore in `WorkspaceAttitude`. Quando l'utente apre `[🎭 Atteggiamento IA]`, troverà tutti i tab già precompilati alla perfezione!

---

## 🌍 2. Benchmark Sistemi IA Internazionali (ChatGPT, Gemini, Claude, Perplexity)

### A. Prevenzione Allucinazioni (Anti-Hallucination Engineering)

I leader internazionali (Google Gemini, Anthropic Claude 3.5, OpenAI ChatGPT) applicano 4 pilastri per azzerare le allucinazioni:

1. **System Prompt Anchoring & Double Boundary:**
   Le regole ferree (_DO_ e _DON'T_) vengono ancorate in cima ed in fondo al prompt. L'Agente riceve istruzioni per rifiutare risposte se i vincoli territoriali o di dominio non sono soddisfatti.
2. **Grounding & Source Citation:**
   Ogni affermazione estratta sul web (`jinaReaderTool`) o da file PDF deve essere riconducibile alla fonte. Se l'informazione non c'è, l'Agente risponde _"Informazione non presente nelle fonti verificate"_.
3. **Structured Output Schemas (Zod Alignment):**
   Output forzato via schemi Zod rigidi per tabelle ed estrazioni.
4. **Confidence Assessment & Refusal Protocol:**
   Score di affidabilità ed etica per i dati sensibili.

---

### 🎙️ B. Analisi Vocale Approfondita & Mappa delle Alternative a Costo Zero

Le API vocali a pagamento (come ElevenLabs o OpenAI Whisper Cloud) fatturano a carattere o a minuto di audio, arrivando a costare tra **15 € e 50 € / mese** per utente attivo.

#### Mappa delle Alternative Senza Costi Cloud:

| Soluzione Vocale                       | Stack Tecnologico                             |   Costo    | Pro & Vantaggi                                                                                                 | Contro / Limitazioni                                         |
| :------------------------------------- | :-------------------------------------------- | :--------: | :------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| **1. Web Speech API (Nativa Browser)** | `webkitSpeechRecognition` + `speechSynthesis` | **€ 0,00** | • Latenza zero e consumo banda nullo.<br>• Nessun server intermedio.<br>• **100% GDPR compliant** (on-device). | Qualità audio dipendente dal SO (ottima su Mac/iOS/Android). |
| **2. Groq Whisper Cloud (Free Tier)**  | API `Whisper-large-v3` su LPU Groq            | **€ 0,00** | • Trascrizione STT ultra-accurata.<br>• Velocità istantanea (<500ms).<br>• Free Tier: 14.400 req/giorno.       | Richiede connessione web ed invio del chunk audio.           |
| **3. Modelli WASM / WebGPU On-Device** | `Transformers.js` con Kokoro / Piper TTS      | **€ 0,00** | • Voci neurali realistiche nel browser.<br>• Nessuna API key esterna.                                          | Download iniziale di 30-80 MB di modello WASM nella cache.   |

---

## 💰 3. Analisi Ingegneristica dei Costi (Prima vs Dopo)

### 📊 Confronto Impatto Economico Mensile (su 1.000 Utenti Attivi):

```
┌────────────────────────────────────────────────────────────────────────┐
│ SOLUZIONE CLOUD TRADIZIONALE (API Whisper + ElevenLabs)                │
│ • Speech-to-Text Cloud API:  ~ € 15.00 / mese                         │
│ • Text-to-Speech ElevenLabs: ~ € 35.00 / mese                         │
│ TOTALE CLOUD:                ~ € 50.00 / utente / mese (INSOSTENIBILE) │
├────────────────────────────────────────────────────────────────────────┤
│ ARCHITETTURA OPSFLOW ZERO-COST (Web Speech API + Groq + Gemini Lite)   │
│ • Text-to-Speech (TTS):     window.speechSynthesis  ➔ € 0,00         │
│ • Speech-to-Text (STT):     Web Speech API + Groq   ➔ € 0,00         │
│ • AI Prompt Architect:      Gemini 3.5 Flash-Lite   ➔ € 0,01 / mese  │
│ TOTALE OPSFLOW:              ~ € 0.01 / MESE (RISPARMIO DEL 99,98%)    │
└────────────────────────────────────────────────────────────────────────┘
```

> 💡 **Verdetto Economico:** L'architettura proposta azzera completamente i costi vocali mantenendo le funzionalità vocali fluide sia in ascolto (TTS) che in dettatura (STT), senza richiedere alcun abbonamento esterno!

---

## 🛠️ 4. Checklist Chirurgica delle Modifiche al Codice (5 Fasi)

### 📌 Fase 1: Copilota "AI Prompt Architect" (Workspace Header)

- [ ] Aggiungere il pulsante `[✨ AI Prompt Architect]` nell'header di `src/pages/index.vue`.
- [ ] Creare la modale `AIPromptArchitectModal.vue` per l'inserimento dell'idea in linguaggio naturale.
- [ ] Creare la Cloud Function Genkit `generateDbsAttitude` (modello `gemini-3.5-flash-lite`) per convertire l'idea in un oggetto `WorkspaceAttitude` strutturato.
- [ ] Aggiungere il pulsante `[🚀 Applica all'Atteggiamento IA]` per salvare l'atteggiamento generato in Firestore su `workspaces/{wsId}`.

### 📌 Fase 2: Estensione Modello Dati TypeScript (`src/types/models.ts`)

- [ ] Estendere `Workspace` e `WorkspaceLinkedResources` con `skills: string[]` (Skill Matrix ad input tag).
- [ ] Estendere `WorkspaceRules` con `doList: string[]` e `dontList: string[]`.
- [ ] Definire `TaskPresetCategory = 'web_search' | 'sheet_sync' | 'gmail_draft' | 'pdf_analysis'`.

### 📌 Fase 3: Interfaccia Configurazione Workspace & Task (`WorkspaceAttitudeModal.vue` & `CreateTaskModal.vue`)

- [ ] **Skill Matrix Tag Input:** Inserire in Tab 1 di `WorkspaceAttitudeModal.vue` il componente `q-select` dinamico (`use-chips`, `multiple`, `new-value-mode="add-unique"`).
- [ ] **Preset Task Selector:** Inserire in `CreateTaskModal.vue` la tendina Preset rapida (`📊 Genera Tabella`, `🔍 Lead Scout`, `✉️ Bozza Gmail`, `📄 Analisi PDF`).

### 📌 Fase 4: Motore Stacking Prompt Anti-Allucinazione (`opsflow-functions/src/ai/promptBuilder.ts`)

- [ ] Formattare nel Level 2 la **Skill Matrix**: `RUOLI SPECIALISTICI ATTIVI: [Healthcare Specialist, Lead Scout, ...]`.
- [ ] Formattare la sezione `=== EXPLICIT DO & DON'T RULES ===` per ancorare l'output.

### 📌 Fase 5: Voice Experience (TTS/STT Nativo) & Upload PDF in `TaskChatWindow.vue`

- [ ] **Composable `useWebSpeech.ts`:** Dettatura vocale (`SpeechRecognition`) con fallback a Groq Whisper Free Tier, e lettura vocale (`window.speechSynthesis`).
- [ ] **Voice Recorder (STT):** Pulsante microfono 🎙️ nel footer chat.
- [ ] **Voice Reader (TTS):** Icona altoparlante 🔊 su ogni messaggio per l'ascolto a voce alta.
- [ ] **Document Understanding (PDF Upload):** Pulsante allegato 📎 / Drag & Drop per inviare file PDF a Gemini Multimodal.

---

## 💡 Verdetto Finale

L'introduzione del copilota **AI Prompt Architect (Framework DBS)** e la **Voice Experience Nativa a costo zero** rendono OpsFlow una piattaforma SaaS di livello mondiale, immediata per qualsiasi utente e finanziariamente perfetta.
