# 🐙 Guida Operativa al Git Workflow & Push su OpsFlow

> **Progetto:** OpsFlow SaaS Platform  
> **Autore:** Vasile Chifeac & AI Architect  
> **Data:** 22 Agosto 2026  
> **Riferimenti AGENTS.md:** §1 (Git & Branch Management), §4 (Linting & Formatting), §7 (Pre-Commit Checklist)

---

## 📌 Regole Tassative di Branch Management (AGENTS.md §1)

1. **Sviluppo SEMPRE su branch dedicati:** Usare prefissi standard (`feature/`, `fix/`, `chore/`, `refactor/`).
2. **Branch Protetti:** MAI committare o fare push diretto sui branch `main` o `master`. Le modifiche vanno integrate tramite Pull Request (PR).
3. **Divieto di Force Push:** MAI eseguire `git push --force` su branch condivisi.

---

## 🛠️ Workflow Passo-Passo per Commit e Push

### 📜 Sequenza Completa dei Comandi

```bash
# Step 1: Verifica dello stato dei file modificati
git status

# Step 2: Aggiunta delle modifiche alla staging area
git add .

# Step 3: Commit con messaggio conforme a Conventional Commits
git commit -m "feat(ai): descrivi qui la funzionalita aggiunta"

# Step 4: Invio delle modifiche sul repository remoto Git
git push origin feature/nome-branch-corrente
```

---

## 🔍 Spiegazione Dettagliata di Ogni Comando Git

| Comando                    | Cosa Fa (Spiegazione Tecnica)                                                                                                 | Perché è Necessario / Impatto                                                                                                                                                                                                                              |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status`               | Mostra il branch corrente, i file modificati, i file nuovi (untracked) e quelli pronti per il commit (staged).                | Permette di verificare esattamente quali file stiamo per includere nel commit, evitando di aggiungere per errore file temporanei o chiavi d'ambiente (`.env`).                                                                                             |
| `git add .`                | Sposta tutti i file modificati e creati dalla working directory alla **Staging Area**.                                        | Prepara i file per il congelamento nel commit successivo. Se si vogliono aggiungere solo file specifici, si usa `git add src/percorso/file.ts`.                                                                                                            |
| `git commit -m "..."`      | Crea un nuovo **commit snapshot** salvando lo stato dei file staged nel registro storico di Git con un messaggio descrittivo. | **IMPORTANTE:** Durante questo comando si attivano gli **Husky Pre-Commit Hooks** che eseguono automaticamente `oxfmt --check`, `oxlint`, `vue-tsc` e `commitlint`. Se ci sono errori di sintassi o formattazione, il commit viene bloccato per sicurezza. |
| `git push origin <branch>` | Invia i nuovi commit locali al server remoto (es. GitHub/GitLab) sul branch specificato.                                      | Sincronizza il lavoro locale con il repository centrale, permettendo la creazione di PR o la collaborazione in team.                                                                                                                                       |

---

## 🏷️ Convenzione Messaggi di Commit (Conventional Commits)

I messaggi di commit DEVONO seguire la struttura standard:
`<tipo>(<ambito>): <descrizione in minuscolo>`

### Esempi Validi

| Tipo       | Esempio Reale                                      | Quando Usarlo                                   |
| :--------- | :------------------------------------------------- | :---------------------------------------------- |
| `feat`     | `feat(ai): add dbs prompt architect modal`         | Nuova funzionalità per l'utente                 |
| `fix`      | `fix(chat): solve HTTP 500 error and add fallback` | Risoluzione di un bug                           |
| `chore`    | `chore(router): update typed-router ignore rules`  | Manutenzione script, dipendenze o linter        |
| `style`    | `style(css): adjust glasscard blur and padding`    | Modifiche estetiche/CSS senza impatto su logica |
| `refactor` | `refactor(store): simplify taskStore actions`      | Refactoring codice senza cambiare comportamento |

> [!WARNING]
> **Regola Commitlint:** Il messaggio **non deve superare i 100 caratteri di lunghezza** e l'oggetto deve essere scritto interamente in **lettere minuscole**.
>
> **Esempio SBAGLIATO (Fallisce):**  
> `❌ feat(AI): Add DBS Prompt Architect Modal and Voice STT/TTS Experience for All Users` _(> 100 caratteri + maiuscole)_
>
> **Esempio CORRETTO (Passa):**  
> `✅ feat(ai): add dbs prompt architect modal and voice stt` _(80 caratteri, tutto minuscolo)_

---

## 🛡️ Pre-Commit Hook Automated Checks (Husky & Oxlint)

Quando esegui `git commit`, OpsFlow lancia automaticamente la pipeline di controllo pre-commit:

```bash
yarn lint:check && yarn typecheck
```

1. **`oxfmt --check`**: Verifica che il codice rispetti la formattazione di sistema. Se fallisce, esegui `yarn lint` per formattare automaticamente.
2. **`oxlint`**: Esegue l'analisi statica ultra-veloce del codice per individuare bug e variabili inutilizzate.
3. **`vue-tsc --noEmit`**: Verifica l'assenza di errori di tipo TypeScript su componenti Vue e file `.ts`.
4. **`commitlint`**: Verifica la sintassi del messaggio di commit.

---

## 💡 Risoluzione dei Problemi Comuni di Git

> [!TIP]
> **Il commit fallisce per errore `oxfmt` (formattazione):**  
> Esegui semplicemente `yarn lint` prima di rifare il commit per auto-formattare tutti i file:
>
> ```bash
> yarn lint && git add . && git commit -m "feat(scope): your message"
> ```

> [!NOTE]
> **Modifiche su `typed-router.d.ts`:**  
> Il file `src/router/typed-router.d.ts` viene rigenerato automaticamente da Quasar durante `yarn dev`. È stato escluso in `.oxfmtignore` e `.oxlintignore` così da non bloccare mai i tuoi commit.
