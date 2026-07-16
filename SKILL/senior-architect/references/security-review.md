# Security Review — Procedura OWASP + GDPR

Usa questa procedura per audit di sicurezza, review di codice esistente o Firestore Rules.

## Output Atteso

Al termine emetti un **Security Report**:

```markdown
## Security Report — [file/feature] — YYYY-MM-DD

### Vulnerabilità Trovate

| #   | Tipo | Gravità | File           | Remediation           |
| --- | ---- | ------- | -------------- | --------------------- |
| 1   | XSS  | ALTA    | ComponentX.vue | Aggiungere sanitize() |

### Compliance

- GDPR Art. 30: ✅/❌ [note]
- GDPR Art. 32: ✅/❌ [note]
- Auto-logout 15min: ✅/❌

### Security Score

- Before: X/100
- After fix: Y/100
```

---

## Checklist OWASP Top 10

### A01 — Broken Access Control

- [ ] JWT Custom Claims usati per permission checks (NON Firestore reads)?
- [ ] Firestore Rules applicano principio least-privilege?
- [ ] Route guard controlla `isActive` da JWT claims?
- [ ] Admin endpoints verificati lato Cloud Function?

```typescript
// ✅ CORRETTO — JWT claims, zero reads
const claims = await getIdTokenResult(auth.currentUser!);
if (claims.claims.role !== "admin") throw new Error("Forbidden");

// ❌ SBAGLIATO — Firestore read per ogni navigazione
const userDoc = await getDoc(doc(db, "userProfiles", uid)); // COSTO + LENTO
```

### A02 — Cryptographic Failures

- [ ] Dati PII/sanitari criptati client-side con AES-256-GCM?
- [ ] ID paziente/utente pseudonimizzato (SHA-256)?
- [ ] Chiavi crittografia NON salvate in Firestore?
- [ ] HTTPS forzato (Firebase/Netlify hosting)?
- [ ] `.env` file mai committato in git?

### A03 — Injection / XSS

- [ ] Tutti i `v-html` passano da `sanitize()`?
- [ ] Input da form validati e sanificati prima di salvataggio Firestore?
- [ ] Nessun `innerHTML` diretto nel codice?

```vue
<!-- ✅ CORRETTO -->
<div v-html="sanitize(userContent)"></div>
{{ simpleText }}

<!-- ❌ VIETATO -->
<div v-html="userContent"></div>
```

### A06 — Vulnerable Components (Supply Chain)

- [ ] `axios`, `got`, `node-fetch` assenti? (solo Firebase SDK + @emailjs/browser)
- [ ] Nessun nuovo package aggiunto senza review?
- [ ] `devDependencies` separate correttamente da `dependencies`?

Verifica supply chain:

```bash
grep -rn "import axios\|from 'axios'\|from \"axios\"" src/
grep -rn "import got\|from 'got'" src/
```

### A07 — Authentication Failures

- [ ] Auto-logout 15min su web/electron (device condivisi)?
- [ ] Auto-logout su mobile solo se utente lo abilita?
- [ ] Token JWT invalidato al logout (Firebase signOut)?
- [ ] `isActive` verificato ad ogni navigazione protetta?

### A09 — Security Logging Failures

- [ ] `console.log` assente in codice produzione? (GDPR Art. 32)
- [ ] Logger custom con auto-redaction PII in uso?
- [ ] Audit log presenti per operazioni su dati sanitari? (GDPR Art. 30)
- [ ] Log retention definita (massimo 90 giorni)?

---

## Firestore Security Rules — Review

```javascript
// Template regola sicura
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    //=======================================================
    // userProfiles — solo l'utente legge/scrive i propri dati
    //=======================================================
    match /userProfiles/{userId} {
      allow read: if request.auth != null
                  && request.auth.uid == userId
                  && request.auth.token.isActive == true;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.auth.token.isActive == true;
    }

    //=======================================================
    // Admin endpoints — solo custom claims verificati
    //=======================================================
    match /adminData/{docId} {
      allow read, write: if request.auth != null
                         && request.auth.token.role == 'admin'
                         && request.auth.token.isActive == true;
    }
  }
}
```

Check da fare su ogni regola:

- [ ] `request.auth != null` sempre presente
- [ ] `request.auth.uid == userId` per dati personali
- [ ] `request.auth.token.isActive == true` obbligatorio
- [ ] Nessuna regola con `allow read, write: if true`

Testa le rules prima di ogni deploy:

```bash
firebase deploy --only firestore:rules --project [PROJECT_ID]
# oppure con emulator:
firebase emulators:start --only firestore
```

---

## GDPR Compliance Check

### Art. 30 — Registro Trattamenti

- [ ] Audit log per ogni: login, accesso dati sensibili, modifica, cancellazione
- [ ] Log inalterabili e timestampati
- [ ] Retention max 90 giorni con auto-delete (Cloud Function scheduled)

### Art. 32 — Misure di Sicurezza Tecniche

- [ ] Crittografia end-to-end per dati sanitari
- [ ] Auto-logout 15min su device condivisi (web/electron)
- [ ] HTTPS forzato
- [ ] Backup crittografato

### Art. 17 — Diritto all'Oblio

- [ ] Meccanismo di cancellazione dati utente presente?
- [ ] Cancellazione in cascata su tutte le collection correlate?

### Art. 28 — DPA con Subfornitori

- [ ] Accordo DPA firmato con Firebase/Google?
- [ ] Accordo DPA firmato con Netlify/hosting provider?

---

## Comandi di Verifica Post-Review

```bash
# Cerca anti-pattern nel codice sorgente
grep -rn "console\.log\|console\.error" src/ --include="*.ts" --include="*.vue"
grep -rn "localStorage\.clear()" src/
grep -rn "import axios" src/
grep -rn "v-html=" src/ | grep -v "sanitize"

# Verifica nessun file .env committato
git log --all --name-only | grep "\.env$"
git diff HEAD --name-only | grep "\.env$"
```
