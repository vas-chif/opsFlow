# 🏢 OpsFlow Rule 02 — Multi-Tenancy & Workspace Data Isolation

> **Scope:** Multi-tenant path hierarchy, JWT Custom Claims, Zero-Cost Auth Navigation  
> **Source:** Derived from AGENTS.md §3, §5, Flow 01, Flow 02  
> **Applicability:** Firestore queries, Cloud Functions, Pinia Stores, Router Guards

---

## 🏛️ 1. Hierarchical Multi-Tenant Data Scoping

All application data must reside strictly within tenant boundaries:

```
tenants/{tenantId}/
├── workspaces/{workspaceId}/
│   ├── tasks/{taskId}/
│   │   ├── subtasks/{subtaskId}
│   │   └── timeline/{eventId}
│   └── scheduledJobs/{jobId}
├── webSearchCache/{queryHash}
└── knowledgeBase/{kbId}
```

- **Cross-Tenant Leakage Prevention:** Queries across tenant boundaries without matching `tenantId` are blocked both in Firestore Security Rules and in Cloud Functions callable context.
- **Tenant Context Inheritance:** Every background worker and Genkit agent execution must inherit and enforce the caller's `tenantId` extracted securely from JWT claims.

---

## 🔑 2. Zero-Cost Navigation via JWT Custom Claims

- **JWT-Only Route Guards:** Validate roles (`role: "owner" | "admin" | "member"`) and active status (`isActive: true`) exclusively from the Firebase Auth JWT token Custom Claims.
- **No Firestore `getDoc` on Navigation:** NEVER issue a Firestore document fetch merely to verify whether an authenticated user is permitted to open a page or view a workspace. This eliminates thousands of redundant DB reads per active user session.

---

## 🔒 3. Concurrency & Atomicity

- **Atomic Transactions (`runTransaction`):** Concurrent updates on shared task records must employ Firestore atomic transactions with optimistic concurrency checks against `updatedAt`.
- **Tenant Deletion & Offboarding:** Tenant teardowns must cascade cleanly through sub-collections, respecting storage minimisation directives.
