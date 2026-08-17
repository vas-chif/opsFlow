# ⚡ OpsFlow — AI-First SaaS Platform for Operational Intelligence

> **OpsFlow** is an enterprise-grade AI-first SaaS platform engineered with **Quasar 2 (Vue 3)**, **TypeScript**, **Firebase**, **Pinia**, and **Firebase Genkit**. It delivers automated task decomposition, multi-agent workspace orchestration, real-time web intelligence, and zero-trust GDPR-compliant data workflows.

---

## 🌟 Key Architecture Highlights

- **🤖 Multi-Agent Orchestration (Genkit & Gemini):** Specialized AI agents (`AgentePlanner`, `AgenteRicerca`, `AgenteIspettore`, `AgenteAmministrativo`) for strategic planning, web research, quality auditing, and document synthesis.
- **🛡️ 3-Layer Security & GDPR Compliance (Art. 30 & 32):** Client-side **AES-256-GCM** encryption for PII, automated PII Sanitizer middleware for AI prompts, and **JWT Custom Claims** for zero-database permission checks.
- **🤝 Human-in-the-Loop (`<ApprovalCard.vue>`):** Autonomous agents generate preview diffs for Gmail drafts and Google Sheets writes, requiring explicit user approval before execution.
- **⚡ Elite UI Design System:** Navy Blue (`#0a2342`), Gold (`#c5a065`), and Off-White (`#f9f7f2`) visual identity powered by Quasar 2 and Glassmorphism components.
- **💰 Ultra-Low Cloud Cost Optimization:** Designed to run at under **€ 1.00 - 2.00 / month** for 1,000 active users via local Pinia/IndexedDB caching, JWT navigation, and model tiering.

---

## 🛠️ Technology Stack

| Layer                  | Technology                                                                      |
| :--------------------- | :------------------------------------------------------------------------------ |
| **Frontend UI**        | Vue 3 (`<script setup lang="ts">`), Quasar 2 (App-Vite), SCSS                   |
| **State & Cache**      | Pinia Stores with local persistence                                             |
| **Backend & AI**       | Firebase Cloud Functions (Gen 2 Node 22), Firebase Genkit SDK, Gemini 3.5 Flash |
| **Database & Auth**    | Cloud Firestore, Firebase Auth (JWT Custom Claims), Firebase Storage            |
| **Security & Privacy** | AES-256-GCM Client Encryption, PII Sanitizer, OWASP Top 10 Safeguards           |

---

## 📁 Project Structure

```
opsflow/
├── src/
│   ├── boot/          # App initialization & Firebase boot plugins
│   ├── components/    # Reusable Vue components (ApprovalCard, TaskChatWindow, etc.)
│   ├── composables/   # Vue composables (useFirestore, useSecureLogger)
│   ├── css/           # Design system SCSS & Quasar variables
│   ├── pages/         # Filename-based routing (Index dashboard, Login, Register)
│   ├── stores/        # Pinia stores (authStore, taskStore, uiStore)
│   └── types/         # Centralized TypeScript Firestore & UI models
├── opsflow-functions/ # Firebase Genkit Cloud Functions backend
├── cheklists/         # Architectural checklists & step-by-step implementation plans
│   ├── step8_rbac_roles_implementation_plan.md
│   └── step9_operational_goals_roadmap.md
├── AGENTS.md          # Single Source of Truth for AI Agent directives & guidelines
└── SECURITY.md        # Enterprise Security Policy & Vulnerability Disclosure SLA
```

---

## 🚀 Quick Start & Commands

Always use **yarn** as the primary package manager.

```bash
# 1. Install dependencies
yarn install

# 2. Run local development server (HMR at http://localhost:9000)
yarn dev

# 3. Type check with vue-tsc
yarn typecheck

# 4. Lint and auto-fix formatting (oxlint & oxfmt)
yarn lint

# 5. Build production bundle
yarn build
```

---

## 📋 Security & Compliance

For complete details on OpsFlow's security policy, GDPR compliance, and responsible vulnerability disclosure SLAs, please consult **[SECURITY.md](file:///home/chif-vas/projects/opsflow/SECURITY.md)**.

---

## 📜 License & Author

- **Author:** Vasile Chifeac
- **Copyright:** © 2026 OpsFlow. All rights reserved.
