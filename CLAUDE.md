# 🏛️ OpsFlow — Claude Code Compatibility Adapter

> **Role:** Adapter for Anthropic Claude Code & MCP Tools  
> **Master Authority:** All rules, invariants, and constraints are defined in [AGENTS.md](file:///home/chif-vas/projects/opsflow/AGENTS.md).  
> **Rule Plane:** Topic-specific instructions are modularized in `.agents/rules/`.  
> **Agent Registry:** Role definitions are maintained in `.agents/agents/`.

---

## ⚡ Essential Commands

Always use **yarn** in the root project:

```bash
yarn dev          # Start Quasar development server with HMR
yarn build        # Production bundle build
yarn lint         # oxfmt formatting + oxlint fix
yarn lint:check   # oxfmt check + oxlint check
yarn typecheck    # TypeScript vue-tsc verification
```

In `opsflow-functions`:

```bash
npm run build     # Compile Cloud Functions TypeScript
```

---

## 🛡️ Core Invariant Directives

1. **Explain-Before-Doing (§0 AGENTS.md):** Before every change, declare:
   `Cosa`, `Come`, `Perché`, and `Impatto`. Wait for user consensus.
2. **Git Workflow (§1 AGENTS.md):** Always work on `dev`. Never commit directly to `main`. Use Conventional Commits.
3. **GDPR & Privacy (§3 AGENTS.md):** Sensitive healthcare/PII data must be encrypted client-side with AES-256-GCM. No `console.log` in production. No unapproved HTTP libraries (no `axios`).
4. **Quasar 2 & Vue 3 (§4 AGENTS.md):** `<script setup lang="ts">` only. Triple-Pane layout. Centralized types in `src/types/models.ts`.
5. **Full-Stack Alignment:** Every backend function, tool, or listener must have immediate visual counterpart in Quasar UI.
6. **Zero-Hallucination Double Control Gate:** Zod schema enforcement + deterministic Node.js link grounding and pattern blocker.

---

## 📂 Modular Sub-Systems Pointer

- **Governance & Commits:** [00-governance.md](file:///home/chif-vas/projects/opsflow/.agents/rules/00-governance.md)
- **Security & GDPR:** [01-security-gdpr.md](file:///home/chif-vas/projects/opsflow/.agents/rules/01-security-gdpr.md)
- **Multi-Tenancy & Isolation:** [02-multitenancy.md](file:///home/chif-vas/projects/opsflow/.agents/rules/02-multitenancy.md)
- **Frontend Quasar 2:** [03-frontend-quasar.md](file:///home/chif-vas/projects/opsflow/.agents/rules/03-frontend-quasar.md)
- **Anti-Hallucination & DBS:** [04-anti-hallucination.md](file:///home/chif-vas/projects/opsflow/.agents/rules/04-anti-hallucination.md)
- **Cloud Cost Control:** [05-cost-optimization.md](file:///home/chif-vas/projects/opsflow/.agents/rules/05-cost-optimization.md)
- **Full-Stack Alignment:** [06-fullstack-alignment.md](file:///home/chif-vas/projects/opsflow/.agents/rules/06-fullstack-alignment.md)
