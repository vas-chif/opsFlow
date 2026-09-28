# 🏛️ OpsFlow Rule 00 — Governance, Git Workflow & Development Cycle

> **Scope:** Decision process, Explain-Before-Doing rule, Git branch management, Conventional Commits  
> **Source:** Derived from AGENTS.md §0, §1, §2  
> **Applicability:** All AI Agents (IDE & Runtime) and Human Contributors

---

## 🛡️ 1. Absolute Rule: Explain-Before-Doing (§0)

Before applying any modification to code or files, the Agent MUST declare:

```markdown
> **Cosa:** [file + funzione/componente + righe interessate]
> **Come:** [approccio tecnico specifico]
> **Perché:** [regola rispettata + problema risolto]
> **Impatto:** [rischio mitigato o valore aggiunto]
```

Never proceed to apply modifications without outputting this declaration for user consent.

---

## 🌐 2. Holistic Codebase Vision & Logic Flow Alignment

Before any change, the Agent MUST:

1. **Holistic Analysis:** Consider the entire architecture (Quasar Frontend, Pinia Store, Backend Cloud Functions, Firestore Security Rules, TypeScript contracts). Blind/local edits without cross-impact assessment are strictly forbidden.
2. **Strict Adherence to `.logicFlow/`:** Every code change must follow established architectural flows in `.logicFlow/`.
3. **Synchronous Flow Updates:** If a requirement or bugfix modifies established behavior, the Agent MUST update corresponding files in `.logicFlow/`.
4. **Differential Explanation:** Explain what is changing, why, and old vs new behavior.

---

## 📌 3. Git & Branch Management (§1 — dev Workflow)

- **Branch Check:** Verify the active branch at the start of every session (`git branch`). Always ensure you are on `dev`.
- **Unified Workflow on `dev`:** All development, testing, and validations must reside and merge directly into `dev`. Orphan feature branches scattered across the repo are prohibited.
- **Protected Release on `main`:** The `main` branch is strictly reserved for Production. Merging from `dev` into `main` is permitted **ONLY AFTER** full system validation (`yarn typecheck` = 0 errors, `yarn lint:check` = 0 errors/warnings, UI tested). NEVER commit directly to `main`. NEVER `git push --force` on shared branches.
- **Commit Messages:** Follow **Conventional Commits** (`feat: ...`, `fix: ...`, `chore: ...`, `security: ...`, `style: ...`) with header ≤ 100 characters.

---

## 📋 4. Package Manager & Project Commands (§2)

Exclusively use **yarn** as the main package manager. Use **npm** ONLY where strictly necessary (e.g. Firebase Functions directory). NEVER use `pnpm`.

| Task                     | Command           |
| ------------------------ | ----------------- |
| Dev server (HMR)         | `yarn dev`        |
| Production build         | `yarn build`      |
| Lint + format (auto-fix) | `yarn lint`       |
| Lint check only          | `yarn lint:check` |
| Type check               | `yarn typecheck`  |
