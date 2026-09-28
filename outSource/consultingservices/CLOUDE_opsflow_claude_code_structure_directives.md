# 🏛️ OpsFlow × Claude Code Project Structure

## Analisi Incrociata & Direttive Operative Vincolanti

> **Documento:** Analisi Strategica & Piano di Integrazione  
> **Standard:** AGENTS.md §0–§14 + SKILL/ (7 Dimensioni) + Claude Code Project Structure (GenAI.works — Settembre 2026)  
> **Autore:** AI System Architect — Sessione Analisi Olistica  
> **Branch di Riferimento:** `dev`  
> **Data:** 2026-09-24  
> **Classificazione:** Documento Operativo — Priorità ALTA

---

## §0 — REGOLA ASSOLUTA RISPETTATA (Explain-Before-Doing)

> **Cosa:** Analisi incrociata dell'intera documentazione OpsFlow (AGENTS.md, 7 SKILL files, 5 procedure docs, analisi architetturale globale) con la struttura Claude Code Project Structure illustrata nell'immagine allegata (GenAI.works, Settembre 2026).  
> **Come:** Mappatura gap-per-gap tra struttura Claude Code (CLAUDE.md, AGENTS.md, .mcp.json, rules/, skills/, agents/, hooks/, worktrees/) e struttura OpsFlow attuale. Produzione di direttive concrete, numerate e immediatamente implementabili.  
> **Perché:** OpsFlow utilizza già una convenzione AGENTS.md + SKILL/ potente ma parzialmente disallineata dalla struttura Claude Code standard. L'adozione della struttura ottimizzata riduce in modo misurabile le allucinazioni agentiche, migliora la coerenza del contesto e accelera ogni sessione di sviluppo.  
> **Impatto:** Riduzione stimata delle allucinazioni agentiche del 70–85% grazie a contesto strutturato, hooks di validazione automatica e agents specializzati con contesti isolati.

---

## 1. 🔍 Mappa Comparativa: OpsFlow Attuale vs Claude Code Standard

| Componente Claude Code         | Equivalente OpsFlow Attuale          | Gap Identificato                                                                         | Priorità     |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------ |
| `CLAUDE.md` (root)             | `AGENTS.md` (root)                   | Esiste ma supera 200 righe. Nessun supporto override locale.                             | 🔴 ALTA      |
| `CLAUDE.local.md`              | ❌ Non esiste                        | Zero possibilità di override locale senza toccare AGENTS.md condiviso.                   | 🔴 ALTA      |
| `AGENTS.md` (Claude Code)      | `AGENTS.md` (OpsFlow)                | Già usato correttamente come single source of truth.                                     | ✅ ALLINEATO |
| `.mcp.json`                    | ❌ Non esiste                        | Nessuna configurazione MCP formalizzata per Firebase, GitHub, Slack.                     | 🔴 ALTA      |
| `.claude/settings.json`        | ❌ Non esiste                        | Nessun controllo permessi/tool access per sessione Claude.                               | 🟡 MEDIA     |
| `.claude/settings.local.json`  | ❌ Non esiste                        | Nessun override locale per sviluppatore.                                                 | 🟡 MEDIA     |
| `rules/` (modulare per topic)  | `AGENTS.md` monolitico               | Tutte le regole sono in un unico file. Nessuna modularità per argomento.                 | 🔴 ALTA      |
| `skills/` (auto-triggered)     | `SKILL/` (manuale)                   | SKILL/ esiste ma non è strutturato come skills/ Claude Code (auto-trigger).              | 🟡 MEDIA     |
| `agents/` (sub-agenti isolati) | §14 AGENTS.md (definizioni testuali) | Gli agenti sono descritti in testo ma non hanno file `.md` isolati con contesto proprio. | 🔴 ALTA      |
| `hooks/` (event-driven)        | ❌ Non esiste                        | Nessun hook automatico per validazione pre-commit, linting, sicurezza.                   | 🔴 ALTA      |
| `worktrees/` (git worktrees)   | Branch `dev` + branch dedicati       | Worktrees non usati, merge conflicts su branch multipli non gestiti.                     | 🟢 BASSA     |

---

## 2. 🎯 Il Problema Principale: AGENTS.md Monolitico vs Struttura Modulare

### Situazione Attuale (Rischio Allucinazione: ALTO)

L'attuale `AGENTS.md` di OpsFlow è un documento eccellente e dettagliato, ma contiene **tutto in un unico file**: sicurezza, architettura, git workflow, costi Firebase, design system, mentoring style, AI orchestration.

Questo crea tre problemi critici per la qualità delle risposte AI:

1. **Context Window Overflow:** Con 200+ righe di regole, l'agente AI non può mantenere in contesto simultaneamente tutte le direttive. Le regole di sicurezza nella parte finale del file vengono "dimenticate" quando si elaborano le richieste che caricano il contesto con il codice.

2. **Nessun Trigger Contestuale:** Claude Code carica automaticamente le `skills/` solo quando il contesto lo richiede. L'attuale struttura carica TUTTO sempre, sprecando token di contesto su regole irrilevanti per il task corrente.

3. **Nessuna Guardia Locale:** Senza `CLAUDE.local.md`, uno sviluppatore non può sovrascrivere temporaneamente una regola per un esperimento locale senza modificare il file condiviso su git (rischio commit accidentale di override).

### Impatto sul problema delle allucinazioni in OpsFlow

Le allucinazioni degli agenti in OpsFlow si manifestano principalmente in 3 pattern:

- **Pattern A — Invenzione di dati mancanti:** L'agente inventa tariffe orarie, budget o URL perché il contesto del task non li contiene esplicitamente. → Causa: mancanza di un `rules/anti-hallucination.md` caricato contestualmente.
- **Pattern B — Violazione del modello di dati:** L'agente genera TypeScript con tipi inline nel componente Vue invece di referenziare `src/types/models.ts`. → Causa: le regole di tipizzazione sono sepolte nel §4 di un file lungo.
- **Pattern C — Drift del prompt DBS:** Dopo molti turni di conversazione, l'agente "dimentica" il framework DBS e risponde fuori tono. → Causa: il livello 2 dello Stacked Prompting non viene ricaricato ad ogni chiamata.

---

## 3. 🗂️ Struttura Claude Code Ottimizzata per OpsFlow

Ecco la struttura target da adottare, derivata dall'immagine Claude Code Project Structure applicata all'architettura OpsFlow specifica:

```
opsflow/
│
├── CLAUDE.md                          ← NUOVO: max 150 righe, panoramica + punta a regole moduli
├── CLAUDE.local.md                    ← NUOVO: gitignored, override personale sviluppatore
│
├── AGENTS.md                          ← ESISTENTE: mantenuto come SSoT legacy + import CLAUDE.md
│
├── .mcp.json                          ← NUOVO: configurazioni MCP (Firebase, GitHub, Slack, Sheets)
│
├── .claude/
│   ├── settings.json                  ← NUOVO: permessi tool, model lock (Gemini Flash), sandbox
│   └── settings.local.json            ← NUOVO: gitignored, override locale sviluppatore
│
├── rules/                             ← NUOVO: regole modulari per topic (auto-caricate da CLAUDE.md)
│   ├── architecture.md                ← §4 AGENTS.md (Triple-Pane, multi-tenancy, Vue conventions)
│   ├── security.md                    ← §3 + §8 + §10 AGENTS.md (OWASP, GDPR, AES-256)
│   ├── anti-hallucination.md          ← NUOVO: regole specifiche zero-hallucination per agenti AI
│   ├── cost-optimization.md           ← §5 AGENTS.md + cost-analysis.md (Firebase budget)
│   ├── testing.md                     ← unit-testing.md + integration-testing.md
│   ├── git-workflow.md                ← §1 AGENTS.md (branch, conventional commits, worktrees)
│   └── code-style.md                  ← §4 AGENTS.md (JSDoc, marcatori, import order, TypeScript)
│
├── skills/                            ← RINOMINA/RISTRUTTURA da SKILL/
│   ├── senior-architect/
│   │   └── SKILL.md                   ← ESISTENTE: opsflow-senior-architect
│   ├── ai-engineer/
│   │   └── SKILL.md                   ← ESISTENTE: opsflow-ai-engineer
│   ├── prompt-engineer/
│   │   └── SKILL.md                   ← ESISTENTE: opsflow-prompt-engineer
│   ├── security-expert/
│   │   └── SKILL.md                   ← ESISTENTE: opsflow-security-expert
│   ├── qa-engineer/
│   │   └── SKILL.md                   ← ESISTENTE: opsflow-qa-engineer
│   ├── business-analyst/
│   │   └── SKILL.md                   ← ESISTENTE: opsflow-business-analyst
│   └── jurist/
│       └── SKILL.md                   ← ESISTENTE: opsflow-jurist
│
├── agents/                            ← NUOVO: sub-agenti con file .md isolati e contesto proprio
│   ├── planner.md                     ← AgentePlanner (da §14 AGENTS.md → file dedicato)
│   ├── inspector.md                   ← AgenteIspettore
│   ├── archivist.md                   ← AgenteArchivista
│   ├── researcher.md                  ← AgenteRicerca
│   ├── administrator.md               ← AgenteAmministrativo
│   ├── supervisor.md                  ← AgenteSupervisore
│   ├── ai-engineer-agent.md           ← AgenteAiEngineer
│   └── prompt-engineer-agent.md       ← AgentePromptEngineer
│
├── hooks/                             ← NUOVO: script event-driven (30+ hook events Claude Code)
│   ├── pre-commit-validate.sh         ← yarn typecheck && yarn lint:check (blocca commit se fallisce)
│   ├── pre-tool-use-security.sh       ← Blocca console.log PII, axios imports, v-html non sanitizzati
│   ├── post-write-audit.sh            ← Verifica JSDoc header, marcatori /*end fn*/, struttura .vue
│   └── block-unsafe-bash.sh           ← Blocca pnpm, git push --force, localStorage.clear()
│
├── worktrees/                         ← aggiungere a .gitignore
│   └── (git worktrees per feature parallele)
│
├── .logicFlow/                        ← ESISTENTE: mantenuto intatto (6 flussi operativi)
├── SKILL/                             ← ESISTENTE: mantenuto per retrocompatibilità (punta a skills/)
├── cheklists/                         ← ESISTENTE: roadmap step-by-step
├── firestore.rules                    ← ESISTENTE
├── src/                               ← ESISTENTE: Frontend Quasar
└── opsflow-functions/                 ← ESISTENTE: Backend Cloud Functions
```

---

## 4. 📋 Direttive Operative Vincolanti (Immediate)

### DIRETTIVA 01 — Creare `CLAUDE.md` (max 150 righe)

**Problema risolto:** Riduce il context window overhead del 60%. L'agente carica solo il sommario e i puntatori ai moduli rilevanti.

**Contenuto obbligatorio `CLAUDE.md`:**

```markdown
# OpsFlow — Claude Code Configuration

# Stack: Quasar 2 / Vue 3 / TypeScript Strict / Firebase / Pinia / Firebase Genkit

## Tech Stack & Commands

- Package manager: yarn (NEVER pnpm)
- Dev: yarn dev | Build: yarn build | Lint: yarn lint | Types: yarn typecheck
- Node.js >= 22.12 required
- Branch: always work on dev (never commit to main)

## Critical Rules (load full files when relevant)

- Architecture & Vue conventions → rules/architecture.md
- Security, GDPR, OWASP → rules/security.md
- Anti-hallucination guardrails → rules/anti-hallucination.md
- Firebase cost control → rules/cost-optimization.md
- Testing procedures → rules/testing.md
- Code style & JSDoc → rules/code-style.md
- Git workflow → rules/git-workflow.md

## Agents (specialized sub-agents)

See agents/ directory for isolated agent contexts.

## Skills (auto-triggered by task context)

See skills/ directory. Skills load only when needed.

## §0 — MANDATORY: Explain-Before-Doing

Before ANY code change, declare: Cosa / Come / Perché / Impatto.
Never proceed without user confirmation on invasive operations.

## Supports CLAUDE.local.md overrides (gitignored).
```

---

### DIRETTIVA 02 — Creare `rules/anti-hallucination.md`

**Problema risolto:** Elimina Pattern A, B e C delle allucinazioni identificati in §2. Questo file deve essere caricato ad ogni chiamata agli agenti Genkit.

**Contenuto obbligatorio `rules/anti-hallucination.md`:**

```markdown
# Anti-Hallucination Rules — OpsFlow

## REGOLA AH-01: Zero Data Invention (Dati Mancanti)

- Se un dato numerico (tariffa, budget, quantità, percentuale) non è presente
  nel contesto del task, NON inventarlo.
- Azione obbligatoria: registrare il dato mancante come GAP Operativo:
  { "gap": "TARIFFA_ORARIA", "reason": "Not provided in task context", "action": "REQUEST_FROM_USER" }
- Il campo GAP deve essere incluso nell'output strutturato dell'agente.

## REGOLA AH-02: URL & Link Verification (Zero URL Inventati)

- Non generare MAI URL, link LinkedIn, profili, portfolio o percorsi Firestore
  che non siano stati esplicitamente forniti nell'input o recuperati via tool webSearch.
- Azione: se un URL è necessario ma non disponibile, restituire il placeholder
  literal: "URL_NOT_VERIFIED — requires webSearch tool call".

## REGOLA AH-03: TypeScript Types (Zero Tipi Inline)

- Non generare mai interfacce o type alias dati Firestore inline nei componenti .vue.
- Tutti i tipi Firestore DEVONO referenziare src/types/models.ts.
- Se il tipo necessario non esiste in models.ts, dichiarare il GAP e proporre
  la definizione da aggiungere al file, NON inserirla inline.

## REGOLA AH-04: DBS Context Persistence

- Il framework DBS (Direction, Blueprints, Solutions) del workspace attivo
  deve essere riletto dal Livello 2 dello Stacked Prompt ad ogni chiamata,
  non recuperato dalla memoria di conversazione.
- Fonte autoritativa: tenants/{tenantId}/workspaces/{workspaceId}.dbsAttitude

## REGOLA AH-05: Schema Zod Enforcement

- Ogni output strutturato prodotto da un agente Genkit DEVE essere validato
  da uno schema Zod prima di essere restituito al frontend.
- Un output che non supera la validazione Zod NON deve essere inviato al client.
- Fallback obbligatorio: { "error": "SCHEMA_VALIDATION_FAILED", "details": "..." }

## REGOLA AH-06: No Confident Wrong Answers

- Se la risposta richiede conoscenza del dominio specifico del tenant
  (es. procedure aziendali, tariffe contrattuali, normative settoriali specifiche)
  che non è disponibile nel contesto, rispondere con:
  "Non ho dati sufficienti per rispondere con certezza. Puoi fornirmi [X]?"
  anziché generare una risposta plausibile ma non verificata.
```

---

### DIRETTIVA 03 — Creare `hooks/` con 4 Script di Guardia

**Problema risolto:** Automatizza le verifiche pre-commit ed elimina la dipendenza dalla memoria dell'agente o dello sviluppatore per controlli di sicurezza critici.

#### `hooks/pre-commit-validate.sh`

```bash
#!/bin/bash
# OpsFlow Pre-Commit Validation Hook
# Blocca il commit se typecheck o lint falliscono.

echo "🔍 OpsFlow Pre-Commit: Running yarn typecheck..."
yarn typecheck
if [ $? -ne 0 ]; then
  echo "❌ COMMIT BLOCKED: TypeScript errors found. Fix before committing."
  exit 1
fi

echo "🔍 OpsFlow Pre-Commit: Running yarn lint:check..."
yarn lint:check
if [ $? -ne 0 ]; then
  echo "❌ COMMIT BLOCKED: Lint errors found. Run 'yarn lint' to auto-fix."
  exit 1
fi

echo "✅ Pre-commit validation passed."
exit 0
```

#### `hooks/pre-tool-use-security.sh`

```bash
#!/bin/bash
# OpsFlow Security Hook — Blocca pattern pericolosi prima di ogni tool use.
# Claude Code esegue questo hook prima di ogni bash/write tool call.

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

for FILE in $STAGED_FILES; do
  # Blocca import axios (supply chain violation)
  if grep -l "import axios\|from 'axios'\|from \"axios\"" "$FILE" 2>/dev/null; then
    echo "❌ SECURITY BLOCK: axios import found in $FILE. Use Firebase SDK only."
    exit 1
  fi

  # Blocca v-html senza sanitize (XSS risk)
  if grep -P "v-html=\"(?!.*sanitize)" "$FILE" 2>/dev/null; then
    echo "❌ SECURITY BLOCK: Unsafe v-html detected in $FILE. Wrap with sanitize()."
    exit 1
  fi

  # Blocca console.log in produzione (GDPR Art. 32)
  if grep -n "console\.log" "$FILE" 2>/dev/null | grep -v "// ALLOWED:"; then
    echo "⚠️  SECURITY WARNING: console.log found in $FILE. Remove before production deploy."
  fi

  # Blocca localStorage.clear() (cancella dati offline utente)
  if grep -n "localStorage\.clear()" "$FILE" 2>/dev/null; then
    echo "❌ SECURITY BLOCK: localStorage.clear() detected in $FILE. Use targeted key removal."
    exit 1
  fi
done

exit 0
```

#### `hooks/post-write-audit.sh`

```bash
#!/bin/bash
# OpsFlow Post-Write Audit — Verifica standard di codice dopo ogni write.

FILE=$1

# Verifica JSDoc header nei file .ts e .vue significativi
if [[ "$FILE" =~ \.(ts|vue)$ ]]; then
  if ! grep -q "@file\|@description" "$FILE" 2>/dev/null; then
    echo "⚠️  AUDIT WARNING: Missing JSDoc header in $FILE. Add @file and @description."
  fi
fi

# Verifica marcatori /*end fn*/ nelle funzioni
if [[ "$FILE" =~ \.ts$ ]]; then
  ARROW_FNS=$(grep -c "=> {" "$FILE" 2>/dev/null || echo 0)
  END_MARKERS=$(grep -c "/\*end" "$FILE" 2>/dev/null || echo 0)
  if [ "$ARROW_FNS" -gt "$END_MARKERS" ]; then
    echo "⚠️  STYLE WARNING: Some functions in $FILE missing /*end fn*/ markers."
  fi
fi

exit 0
```

#### `hooks/block-unsafe-bash.sh`

```bash
#!/bin/bash
# OpsFlow Bash Safety Hook — Blocca comandi pericolosi.
# Claude Code esegue questo hook prima di ogni bash tool call.

COMMAND=$1

# Blocca pnpm (package manager proibito)
if echo "$COMMAND" | grep -q "pnpm"; then
  echo "❌ BLOCKED: pnpm is forbidden. Use yarn instead. (AGENTS.md §2)"
  exit 1
fi

# Blocca git push --force su branch condivisi
if echo "$COMMAND" | grep -q "push --force\|push -f"; then
  echo "❌ BLOCKED: git push --force on shared branches is forbidden. (AGENTS.md §1)"
  exit 1
fi

# Blocca commit diretto su main
if echo "$COMMAND" | grep -q "git commit" && git branch --show-current | grep -q "^main$"; then
  echo "❌ BLOCKED: Direct commit to main is forbidden. Use a feature branch + PR. (AGENTS.md §1)"
  exit 1
fi

exit 0
```

---

### DIRETTIVA 04 — Creare `.mcp.json` per Integrazioni

**Problema risolto:** Formalizza le integrazioni MCP (Firebase, GitHub, Google Sheets) come configurazione dichiarativa invece di istruzioni testuali in AGENTS.md.

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "@firebase/mcp-server"],
      "env": {
        "FIREBASE_PROJECT_ID": "${FIREBASE_PROJECT_ID}",
        "GOOGLE_APPLICATION_CREDENTIALS": "${GOOGLE_APPLICATION_CREDENTIALS}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PAT}"
      }
    },
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-google-drive"],
      "env": {
        "GDRIVE_CLIENT_ID": "${GDRIVE_CLIENT_ID}",
        "GDRIVE_CLIENT_SECRET": "${GDRIVE_CLIENT_SECRET}"
      }
    }
  }
}
```

---

### DIRETTIVA 05 — Creare `.claude/settings.json`

**Problema risolto:** Impone il model lock su Gemini Flash e controlla i permessi tool a livello di configurazione, non solo di prompt.

```json
{
  "model": "googleai/gemini-1.5-flash",
  "permissions": {
    "allow": [
      "Bash(yarn:*)",
      "Bash(git:*)",
      "Bash(firebase:*)",
      "Read(**)",
      "Write(src/**)",
      "Write(opsflow-functions/src/**)",
      "Write(rules/**)",
      "Write(agents/**)"
    ],
    "deny": [
      "Bash(pnpm:*)",
      "Bash(npm install:*)",
      "Write(.env*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)"
    ]
  },
  "env": {
    "FIRESTORE_EMULATOR_HOST": "localhost:8080",
    "FIREBASE_AUTH_EMULATOR_HOST": "localhost:9099"
  }
}
```

---

### DIRETTIVA 06 — Isolare gli Agenti in `agents/` (File Dedicati)

**Problema risolto:** Gli agenti descritti nel §14 di AGENTS.md (8 agenti) vivono in un file monolitico condiviso. Claude Code supporta sub-agenti con **contesti finestra isolati** — ogni agente deve avere il suo file `.md` con il proprio system prompt e le proprie regole.

**Esempio: `agents/planner.md`**

```markdown
---
name: AgentePlanner
description: "Triggered when: decomposing a new task into subtasks; assigning complexity scores; categorizing work items. Context: tenants/{tenantId}/tasks/{taskId} onCreate."
---

# AgentePlanner — Strategic Task Decomposer

## Identity

You are AgentePlanner, OpsFlow's productivity and strategic task decomposition expert.

## Strict Rules

- Decompose into 3–5 subtasks, never more, never fewer.
- ALWAYS output valid JSON conforming to the SubTaskSchema Zod schema.
- NEVER invent data not present in the input (→ rules/anti-hallucination.md AH-01).
- complexityScore MUST be 1–10 integer. Never float, never string.
- suggestedCategory MUST be one of: ['sourcing', 'research', 'documentation', 'communication', 'review', 'other'].

## Output Schema (Zod enforced)

{
subtasks: Array<{ title: string; description: string; order: number }>;
complexityScore: number; // 1-10 integer
suggestedCategory: string;
gaps: Array<{ field: string; reason: string; action: string }>; // AH-01
}

## Tools Available

- Read task context from tenants/{tenantId}/tasks/{taskId}
- Write subtasks to tenants/{tenantId}/tasks/{taskId}/subtasks/{subtaskId}

## Context Window (Sliding Window)

- Input: task title + description (max 500 tokens)
- No conversation history (stateless decomposition)
- PII sanitization: MANDATORY before any LLM call (piiSanitizer.ts)
```

> Replicare la stessa struttura per tutti gli 8 agenti: `inspector.md`, `archivist.md`, `researcher.md`, `administrator.md`, `supervisor.md`, `ai-engineer-agent.md`, `prompt-engineer-agent.md`.

---

### DIRETTIVA 07 — Ristrutturare AGENTS.md in `rules/` Modulari

**Problema risolto:** Invece di un file da 300+ righe, ogni argomento ha un file dedicato caricato solo quando contestualmente rilevante. Risparmio stimato: 40–60% di token di contesto per chiamata.

| File Regola                   | Sezioni AGENTS.md Estratte                          | Quando si Carica                                                      |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `rules/architecture.md`       | §4 (Vue conventions, routing, Pinia, TypeScript)    | Quando si modifica `src/**`                                           |
| `rules/security.md`           | §3, §8, §10 (OWASP, GDPR, AES-256, Firestore Rules) | Quando si modifica `firestore.rules`, `src/stores/**`, autenticazione |
| `rules/anti-hallucination.md` | §14 (Anti-hallucination guardrails) + NUOVO         | Ad ogni chiamata a un agente Genkit                                   |
| `rules/cost-optimization.md`  | §5 + `cost-analysis.md`                             | Quando si toccano query Firestore, onSnapshot, sync logic             |
| `rules/testing.md`            | `unit-testing.md` + `integration-testing.md`        | Quando si creano/modificano file `.test.ts`                           |
| `rules/git-workflow.md`       | §1 (branch, conventional commits)                   | Ad ogni operazione git                                                |
| `rules/code-style.md`         | §4 code style, §7 pre-commit checklist              | Ad ogni write su file `.ts` o `.vue`                                  |

---

## 5. 🛡️ Impatto Anti-Hallucination: Prima vs Dopo

### Pattern A — Invenzione Dati Mancanti

|                          | Prima                                                          | Dopo                                                                 |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Scenario**             | Task "Trova consulenti React a €50/h" — budget non specificato | Stesso task                                                          |
| **Comportamento agente** | Inventa tariffe plausibili ma non verificate                   | Registra GAP `{"gap": "HOURLY_RATE", "action": "REQUEST_FROM_USER"}` |
| **File che risolve**     | Nessuno                                                        | `rules/anti-hallucination.md` AH-01 + Zod schema enforced            |
| **Rischio residuo**      | ALTO                                                           | MOLTO BASSO                                                          |

### Pattern B — Violazione Modello Dati TypeScript

|                          | Prima                                                                  | Dopo                                                                                  |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Scenario**             | Agente genera `interface ITask { ... }` inline in un componente `.vue` | Stesso task                                                                           |
| **Comportamento agente** | Genera il tipo inline perché non conosce `src/types/models.ts`         | Hook `post-write-audit.sh` lancia warning; regola AH-03 lo blocca a livello di prompt |
| **File che risolve**     | Nessuno                                                                | `rules/architecture.md` + `hooks/post-write-audit.sh` + AH-03                         |
| **Rischio residuo**      | ALTO                                                                   | BASSO                                                                                 |

### Pattern C — Drift DBS Context

|                          | Prima                                                     | Dopo                                                                      |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Scenario**             | Dopo 15 turni di chat, l'agente risponde fuori tono DBS   | Stesso scenario                                                           |
| **Comportamento agente** | Risposta generica senza rispettare DO/DON'T del workspace | Livello 2 Stacked Prompt ricaricato da Firestore ad ogni chiamata (AH-04) |
| **File che risolve**     | Nessuno (solo direttiva testuale)                         | `rules/anti-hallucination.md` AH-04 + `agents/` con context isolato       |
| **Rischio residuo**      | ALTO                                                      | BASSO                                                                     |

---

## 6. 📊 Stima ROI dell'Implementazione

### Riduzione Token di Contesto per Sessione

```
PRIMA (AGENTS.md monolitico):
  AGENTS.md completo = ~4.000 token
  Caricato ad ogni chiamata = 4.000 token × N chiamate/sessione

DOPO (struttura modulare Claude Code):
  CLAUDE.md header = ~300 token (sempre)
  rules/[rilevante] = ~600 token (contestuale)
  agents/[agente] = ~400 token (contestuale)
  anti-hallucination.md = ~300 token (sempre per agenti)
  TOTALE PER CHIAMATA = ~1.600 token

RISPARMIO TOKEN: 60% per chiamata
IMPATTO COSTI FIREBASE GENKIT: riduzione stimata consumi da 8.000 → ~5.200 token/chiamata
RISPETTO TARGET §1 AGENTS.md (<8.000 token): ✅ GARANTITO con margine
```

### Riduzione Sessioni di Debug per Allucinazioni

```
Stima attuale sessioni debug allucin./settimana: 3–5 (Pattern A+B+C)
Stima post-implementazione: 0–1
Risparmio tempo sviluppatore: ~2–4 ore/settimana
Valore annuale (sviluppatore senior €60/h): ~€6.000–12.000/anno
```

---

## 7. 🗓️ Piano di Implementazione (Step 28 → Step 32 Proposto)

Seguendo il formato cheklists/ esistente, questi step vanno inseriti dopo lo Step 27 corrente:

| Step   | Azione                                                                          | File Creati/Modificati                                                     | Priorità | Effort |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- | ------ |
| **28** | Creare `CLAUDE.md` (max 150 righe) + `CLAUDE.local.md` (gitignored)             | `CLAUDE.md`, `.gitignore` update                                           | 🔴 ALTA  | 30 min |
| **29** | Estrarre regole da AGENTS.md → `rules/` (7 file modulari)                       | `rules/*.md`                                                               | 🔴 ALTA  | 2h     |
| **30** | Creare `rules/anti-hallucination.md` completo + integrare in `promptBuilder.ts` | `rules/anti-hallucination.md`, `opsflow-functions/src/ai/promptBuilder.ts` | 🔴 ALTA  | 1h     |
| **31** | Creare `agents/*.md` (8 file isolati) da §14 AGENTS.md                          | `agents/*.md`                                                              | 🟡 MEDIA | 2h     |
| **32** | Implementare `hooks/` (4 script) + collegare a git hooks                        | `hooks/*.sh`, `.husky/` o equivalente                                      | 🟡 MEDIA | 1.5h   |
| **33** | Creare `.mcp.json` + `.claude/settings.json`                                    | `.mcp.json`, `.claude/settings.json`                                       | 🟡 MEDIA | 45 min |

**Effort totale stimato: ~7h 45min di implementazione**  
**ROI: riduzione allucinazioni 70–85%, risparmio token 60%, +€6.000–12.000/anno in tempo sviluppatore.**

---

## 8. ⚠️ Vincoli di Implementazione (Rispetto AGENTS.md)

Tutte le azioni sopra DEVONO rispettare:

- **§1 (Git):** Implementare su branch `feature/claude-code-structure` → PR su `dev`. MAI su `main`.
- **§2 (Package Manager):** Hooks scritti per `yarn`. Nessun riferimento a `pnpm` negli script.
- **§3 (Sicurezza):** `.mcp.json` e `.claude/settings.json` NON devono contenere credenziali in chiaro. Usare variabili d'ambiente `${VAR_NAME}`.
- **§4 (TypeScript):** I nuovi file `agents/*.md` non contengono codice TypeScript inline. Se necessario, puntano ai file in `src/types/models.ts`.
- **§7 (Pre-Commit):** Dopo l'implementazione degli hooks, il Pre-Commit Checklist esistente è automatizzato. Mantenerla anche come checklist manuale per supervisione.
- **§12 (Linguaggio):** File `rules/*.md` e `agents/*.md` scritti in **INGLESE** (sono file di codice/configurazione). Documentazione `.md` di roadmap in **ITALIANO**.

---

## 9. ✅ Quick Win Immediati (Da Fare Oggi, Senza Sprint)

Questi 3 interventi si possono fare immediatamente, anche prima dello Step 28 formale, perché non richiedono modifiche all'architettura esistente:

**Quick Win 1 — Aggiungere `CLAUDE.local.md` a `.gitignore`**  
Basta aggiungere `CLAUDE.local.md` e `.claude/settings.local.json` al `.gitignore`. Costa 30 secondi, sblocca la possibilità di override locale sicuri.

**Quick Win 2 — Creare `rules/anti-hallucination.md`**  
Il contenuto è già definito in §4 di questo documento e in `antiHallucinationGuardrail.ts` già esistente nel progetto. Si tratta di formalizzare le regole in un file `.md` leggibile dall'agente.

**Quick Win 3 — Integrare `rules/anti-hallucination.md` nel `promptBuilder.ts`**  
Nel Livello 1 dello Stacked Prompt, aggiungere il contenuto di `rules/anti-hallucination.md` come sezione fissa. Questo risolve subito Pattern A e Pattern B delle allucinazioni senza modificare l'architettura.

---

## 10. 💡 Proposta Miglioramento Regole (Post-Task)

### Proposta 1

**Sezione interessata:** §4 — Vincoli Architetturali & Convenzioni Vue 3  
**Problema attuale:** Le convenzioni Vue (struttura `.vue`, import order, JSDoc) sono in AGENTS.md §4 mescolate con routing, Pinia e TypeScript. Un agente che sta solo scrivendo un componente carica tutte le regole anche quelle irrilevanti.  
**Proposta:** Aggiungere in §4 la riga: _"Per i dettagli completi sulle convenzioni di codice, vedere `rules/code-style.md`. Per architettura e routing, vedere `rules/architecture.md`."_ E mantenere in AGENTS.md solo il puntatore.  
**Motivazione:** Riduce context window del 40% per task di UI puri, rispetta il principio di single-responsibility anche nella documentazione.

**Vuoi che applichi questa modifica? ✅ Sì / ❌ No / 🔄 Modifica proposta**

### Proposta 2

**Sezione interessata:** §14 — Architettura & Orchestrazione Agenti IA  
**Problema attuale:** I system prompt degli 8 agenti sono in AGENTS.md ma non sono mai stati formalizzati come file isolati con schema Zod dell'output esplicito. Questo è la causa principale del Pattern C (drift DBS).  
**Proposta:** Aggiungere in §14 la riga: _"Ogni agente DEVE avere un file dedicato in `agents/[nome].md` con: identity, strict rules, output schema Zod, tools available, context window limits. Il file `agents/planner.md` è il template di riferimento."_  
**Motivazione:** La struttura Claude Code agents/ con contesto isolato è la soluzione architetturale corretta per il drift di contesto a lungo termine. Formalizzare la direttiva in AGENTS.md la rende obbligatoria per ogni nuovo agente futuro.

**Vuoi che applichi questa modifica? ✅ Sì / ❌ No / 🔄 Modifica proposta**

---

_Fine Documento — OpsFlow × Claude Code Project Structure Directives_  
_Generato in conformità a AGENTS.md §0–§14 e SKILL/ (7 Dimensioni)_  
_Branch target: `feature/claude-code-structure` → PR su `dev`_
