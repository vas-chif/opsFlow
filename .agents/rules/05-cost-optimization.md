# 💰 OpsFlow Rule 05 — Cloud Cost Optimization & Budget Lockdown

> **Scope:** Firebase/GCP Budget Management, Model Tiering, Caching Policies, Throttling & Quotas  
> **Source:** Derived from AGENTS.md §5, Flow 04, Flow 07, Step 28  
> **Target:** Total infrastructure cost < €1.00/month per 1,000 active users

---

## ⚡ 1. Model Tiering & Token Lockdown

- **Strict Lock-in on Gemini Flash:** All backend agent flows (Planner, Inspector, Researcher, etc.) must invoke **Gemini 1.5/3.6 Flash** via Firebase Genkit. Pro models are prohibited unless explicitly authorized by the project architect.
- **Cognitive Bleed & Token Caps:** Sliding windows for chat history are capped to 10 recent messages plus a compressed rolling summary, keeping context < 4,000 tokens.

---

## 💾 2. Multi-Level Caching Strategy

- **Client-Side Cache (30 Days):** Persist non-critical workspace and task data in Pinia / LocalStorage under namespace `opsflow_user_{userId}_{dbName}` with 30-day validity.
- **Firestore Web Search Cache (72 Hours):**
  - Path: `tenants/{tenantId}/webSearchCache/{queryHash}` (SHA-256 of normalized query).
  - Document expiration field: `expiresAt: Timestamp` (`now + 72h`).
  - **Native Google Cloud TTL Policy:** Automatic deletion at zero storage cost enabled via:
    `gcloud firestore fields ttls update expiresAt --collection-group=webSearchCache`.

---

## 🛑 3. Search Engine Governance & Rate Throttling

- **Brave Search Throttling (1.1s Delay):** Sequential queries must enforce `await sleep(1100)` to respect Brave's 1 QPS limit, avoiding false `HTTP 429` errors and preventing unnecessary spillover to paid secondary providers (Tavily/Exa).
- **Workspace Quota Hard-Cap:** Freemium workspaces are capped at **50 searches/month** (`workspace.searchUsageCount`).
- **Global Soft-Cap:** System-wide searches are capped at 950 calls/month (`system/searchUsage_{YYYY_MM}`).
- **Scale-to-Zero:** All Cloud Run functions run with `minInstances: 0` to ensure €0.00 idle cost.
