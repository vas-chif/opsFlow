# 🛡️ Security & Data Privacy Policy (SECURITY.md)

OpsFlow is an AI-first SaaS platform designed with a **Security-First & GDPR-Compliant (Art. 30 & 32)** architecture. We take data protection, privacy, and system security extremely seriously.

---

## 📋 Supported Versions

Only the latest active release branch receives critical security updates and vulnerability patches.

| Version                        |     Supported      | Notes                                    |
| ------------------------------ | :----------------: | ---------------------------------------- |
| `1.x.x` (Main / Production)    | :white_check_mark: | Currently active production SaaS release |
| `< 1.0.0` (Development / Beta) |        :x:         | Legacy pre-release versions              |

---

## 🔒 OpsFlow Security Safeguards (3-Layer Architecture)

OpsFlow enforces strict security controls across Client, Database, and Cloud Server layers:

1. **Client-Side Encryption (GDPR Art. 32):**
   - All Personally Identifiable Information (PII) and sensitive health/personal data are encrypted client-side using **AES-256-GCM** before writing to Cloud Firestore.
   - Decryption keys remain local to the authorized user device.

2. **AI Prompt PII Sanitization:**
   - Every user message dispatched to Genkit/Gemini AI agents passes through an automated **PII Sanitizer Middleware**, stripping raw emails, phone numbers, and patient names prior to LLM processing.

3. **JWT Custom Claims Access Control (Zero DB Query Auth):**
   - Role-Based Access Control (`superadmin`, `admin`, `user`) and `tenantId` isolated scoping are verified strictly via **JWT Custom Claims** on Firebase Auth tokens.

4. **Human-in-the-Loop Approval Gate:**
   - AI Agents are strictly restricted from executing external side-effects (e.g. Gmail drafts, Google Sheets writes) without visual user confirmation via `<ApprovalCard.vue>`.

5. **Session Security & Inactivity Logout:**
   - Automatic session termination after **15 minutes of inactivity** to protect shared workstation access.

---

## 🚨 Reporting a Vulnerability

If you discover a potential security vulnerability within OpsFlow, please report it responsibly. **Do NOT open a public GitHub issue.**

### How to Submit a Vulnerability Report:

- **Email:** Send a detailed security report to `security@opsflow.it` (or `versiliacare@gmail.com`).
- **Required Details:**
  - A clear summary of the issue.
  - Steps to reproduce or proof-of-concept (PoC).
  - Potential impact assessment.

### Response Timeline (SLA):

- **Initial Acknowledgment:** Within **24 hours**.
- **Triage & Risk Assessment:** Within **72 hours**.
- **Fix & Patch Deployment:** High-severity issues patched within **7 business days**.

We kindly ask researchers to allow reasonable time to resolve vulnerabilities before public disclosure.

---

## 📜 Compliance & Ethical Directives

OpsFlow complies with European Union **GDPR (EU 2016/679)** regulations, Italian Healthcare Professional Standards (L. 24/2017), and OWASP Top 10 Security Principles.
