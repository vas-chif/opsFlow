# 📋 Step 10 — Piano Chirurgico: Skill Matrix, Anti-Allucinazione, Presets & Voice Experience (TTS/STT)

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Pair Architect  
> **Data:** 17 Agosto 2026  
> **Stato:** Planned / In Attesa di Autorizzazione  
> **Riferimenti AGENTS.md:** §0 (Explain-Before-Doing), §3 (GDPR & Security), §5 (Cloud Cost Optimization €0 Nativo), §14 (Agent Architecture)

---

## 🌍 1. Benchmark Sistemi IA Internazionali (ChatGPT, Gemini, Claude, Perplexity)

### A. Prevenzione Allucinazioni (Anti-Hallucination Engineering)

I leader internazionali nella Generazione IA (Google Gemini, Anthropic Claude 3.5, OpenAI ChatGPT) applicano 4 pilastri fondamentali per eliminare le allucinazioni:

1. **System Prompt Anchoring & Double Boundary:**
   Le regole ferree (_DO_ e _DON'T_) non vengono inserite solo all'inizio del prompt, ma vengono ancorate ed inquadrate con tag di delimitazione rigidi. L'Agente riceve istruzioni per rifiutare risposte se i vincoli territoriali o di dominio non sono soddisfatti.
2. **Grounding & Source Citation:**
   Quando l'Agente effettua ricerche web (`jinaReaderTool` o `searchWebAndPlatformsTool`) o legge un documento PDF, ogni affermazione deve essere direttamente riconducibile alla fonte. Se un'informazione non è presente nel documento o nei risultati della ricerca, l'Agente deve rispondere _"Informazione non presente nelle fonti verificate"_ anziché ipotizzare.
3. **Structured Output Schemas (Zod Alignment):**
   Per l'estrazione di dati e tabelle, l'output dell'Agente viene forzato tramite schemi Zod rigidi, impedendo la generazione di testo libero non controllato.
4. **Confidence Assessment & Refusal Protocol:**
   L'Agente valuta l'accuratezza delle fonti ed applica un protocollo di rifiuto etico per dati sensibili non verificabili.

---

### B. Interfaccia "User-Friendly" & Interazione Vocale (Voice Experience)

Per rendere OpsFlow intuitivo, moderno e piacevole da usare come l'applicazione di Gemini o ChatGPT:

1. **Dettatura Vocale (Voice Recorder — Speech-to-Text STT):**
   Un pulsante microfono 🎙️ posizionato nel campo di input della Task Chat permette all'utente di dettare istruzioni, note e prompt senza dover digitare da tastiera.
2. **Lettura Vocale della Chat (Voice Reader — Text-to-Speech TTS):**
   Ogni risposta dell'Agente AI include un pulsante altoparlante 🔊. Cliccandolo, l'Agente legge il messaggio a voce alta con un tono naturale e fluido.
3. **Controlli Audio & Feedback Visivo:**
   Pulsanti di Play, Pausa e Stop con animazione ad onda vocale (_sound wave_) durante l'ascolto o la dettatura.
4. **Design Elite & Micro-Interazioni Quasar:**
   Pillole di stato dell'Agente (_"AgenteRicerca sta analizzando le fonti..."_), Glassmorphism cards ed transizioni fluide.

---

### 💰 C. Analisi Approfondita dei Costi (Web Speech API Native vs Cloud API)

| Soluzione Vocale                    | Tecnologia Utilizzata                                    |            Impatto Economico            | Latenza & Privacy                                                                                                                 |
| :---------------------------------- | :------------------------------------------------------- | :-------------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Web Speech API (Scelta OpsFlow)** | Native Browser (`SpeechRecognition` + `speechSynthesis`) |            **€ 0,00 / Mese**            | **Latenza Zero**, elaborazione sul dispositivo utente, **GDPR Art. 32 100% Client-Side** (nessun audio inviato a server esterni). |
| Cloud Speech-to-Text / TTS API      | Google Cloud / OpenAI Whisper & ElevenLabs               | € 0.006 - 0.015 / min (~€ 15 - 50 / mo) | Richiede server intermedi, fa salire i costi del cloud ed invia lo streaming vocale a server terzi.                               |

> [!TIP]
> **Scelta Strategica OpsFlow:** L'utilizzo della **Web Speech API nativa del browser** garantisce una risposta vocale istantanea sia in ingresso (STT) che in uscita (TTS) con **€ 0,00 di costi aggiuntivi**, mantenendo la bolletta cloud ampiamente sotto € 1.00/mese per 1000 utenti!

---

## 🛠️ 2. Checklist Chirurgica delle Modifiche al Codice (4 Fasi)

### 📌 Fase 1: Estensione Modello Dati TypeScript (`src/types/models.ts`)

- [ ] Estendere l'interfaccia `Workspace` ed `WorkspaceLinkedResources` con il campo `skills: string[]` per memorizzare la Skill Matrix ad input tag.
- [ ] Estendere `WorkspaceRules` con le liste vincolanti `doList: string[]` e `dontList: string[]`.
- [ ] Definire i tipi dei Preset di Creazione Task (`TaskPresetCategory = 'web_search' | 'sheet_sync' | 'gmail_draft' | 'pdf_analysis'`).

### 📌 Fase 2: Interfaccia Configurazione Workspace & Task (`WorkspaceAttitudeModal.vue` & `CreateTaskModal.vue`)

- [ ] **Skill Matrix Tag Input:** Inserire in Tab 1 di `WorkspaceAttitudeModal.vue` un componente `q-select` dinamico (`use-input`, `use-chips`, `multiple`, `new-value-mode="add-unique"`) per permettere all'utente di aggiungere e rimuovere al volo le competenze dell'Agente.
- [ ] **Preset Task Selector:** Inserire in `CreateTaskModal.vue` la tendina di selezione Preset rapida (`📊 Genera Tabella Google Sheets`, `🔍 Ricerca Web & Lead Scout`, `✉️ Prepara Bozza Gmail`, `📄 Analisi Documentale PDF`).

### 📌 Fase 3: Motore Stacking Prompt Anti-Allucinazione (`opsflow-functions/src/ai/promptBuilder.ts`)

- [ ] Iniettare espressamente nel Level 2 del System Prompt la **Skill Matrix** combinata: `RUOLI SPECIALISTICI ATTIVI: [Business Analyst, Lead Scout, Healthcare Specialist]`.
- [ ] Formattare la sezione `=== EXPLICIT DO & DON'T RULES ===` per ancorare l'output ed azzerare le allucinazioni.

### 📌 Fase 4: Voice Experience (STT + TTS Nativo) & Upload PDF in `TaskChatWindow.vue`

- [ ] **Composable `useWebSpeech.ts`:** Creare il composable per gestire la dettatura vocale (`SpeechRecognition`) ed la lettura vocale (`speechSynthesis`).
- [ ] **Voice Recorder (STT):** Aggiungere il pulsante microfono 🎙️ con feedback visivo nel footer di `TaskChatWindow.vue`.
- [ ] **Voice Reader (TTS):** Aggiungere l'icona altoparlante 🔊 su ogni fumetto di risposta dell'Agente AI per la riproduzione audio a voce alta.
- [ ] **Document Understanding (PDF Upload):** Aggiungere il pulsante allegato 📎 / Drag & Drop per inviare file PDF a Gemini Multimodal.

---

## 💡 Verdetto Finale

Questo piano unisce l'eccellenza dell'esperienza utente delle migliori AI internazionali (ChatGPT/Gemini) con la massima sicurezza contro le allucinazioni e l'ottimizzazione dei costi a **€ 0,00 aggiuntivi** per la componente vocale.
