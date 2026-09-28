# 🛡️ OpsFlow Rule 01 — Security, Privacy & GDPR (Healthcare Data Protection)

> **Scope:** GDPR Compliance (Art. 30/32), Client-Side Encryption, XSS Sanitization, Safe Logging  
> **Source:** Derived from AGENTS.md §3, §8, §10, SECURITY.md  
> **Applicability:** All Components, Stores, Utilities and Cloud Functions

---

## 🔒 1. GDPR Compliance (Art. 30 & 32)

Every healthcare data and patient demographic item is highly sensitive (PII):

- **Client-Side Encryption (AES-256-GCM):** All personal and healthcare data (PII) of patients MUST be encrypted client-side using **AES-256-GCM** before being written to Firestore.
- **Pseudonymization:** Use SHA-256 hashes for patient IDs. NEVER store real full names in plaintext in the database. Decryption keys must NEVER leave the user's client device.
- **Audit Logs:** Generate tamper-evident tracking logs (GDPR Art. 30) for every creation, modification, or access to clinical data.
- **Auto-Logout:** Enforce automatic logout after 15 minutes of inactivity on shared or clinical devices.

---

## 🛡️ 2. Anti-XSS & Input Sanitization

- **Explicit Sanitization:** Explicitly sanitize every user-generated string before rendering.
- **v-html Restriction:** NEVER use `v-html` without an explicit `sanitize()` utility wrapper. Always prefer `{{ mustache }}` template interpolation for plain text.

---

## 📦 3. HTTP Stack & Supply Chain Security

- **Official SDK Only:** Use exclusively the official Firebase Client SDK for cloud operations.
- **Email Protocol:** Use only `@emailjs/browser` for client-side email dispatching.
- **Prohibited Libraries:** Adding or using `axios`, `got`, `node-fetch`, `superagent`, or similar unapproved HTTP client libraries is strictly prohibited to minimize attack surface.

---

## 🚫 4. Logging & Console Security

- **Custom Logger:** Always use an isolated custom logger for application diagnostics, guaranteeing zero PII logging in plaintext.
- **No `console.log` in Production:** `console.log` calls are strictly prohibited in production code (GDPR Art. 32). Exceptions are allowed ONLY in build scripts, service workers, or Firebase initialization bootstrap files.

---

## 🧱 5. Three-Layer Security Model

Every UI restriction must have DB and Server coverage:

1. **Layer 1 (Frontend):** Conditional rendering (`v-if`, `disabled`).
2. **Layer 2 (Database):** Firestore Security Rules (enforcing tenant scoping and field validations).
3. **Layer 3 (Backend):** Cloud Functions with JWT Custom Claims validation.
