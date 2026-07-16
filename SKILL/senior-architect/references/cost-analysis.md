# Cost Analysis — Firebase Budget Review

Usa questa procedura per analizzare e ottimizzare i costi operativi Firebase.

## Prezzi Firebase (2026)

| Operazione                        | Costo Unitario         |
| --------------------------------- | ---------------------- |
| Firestore Read                    | €0,00006 / read        |
| Firestore Write                   | €0,00018 / write       |
| Firestore Delete                  | €0,00002 / delete      |
| Cloud Functions (2M calls gratis) | €0,0000004 / call      |
| Firebase Auth                     | Gratis fino a 50k/mese |
| Hosting                           | Gratis fino a 10GB     |

## Target di Progetto

| Metrica            | Target        | Baseline (auto-sync) |
| ------------------ | ------------- | -------------------- |
| Reads/user/mese    | 3–5           | ~1440 (ogni 30min)   |
| Costo 1.000 utenti | <€1,00/mese   | ~€86/mese            |
| Cache duration     | 30 giorni     | —                    |
| Permission checks  | 0 reads (JWT) | 1+ read/navigazione  |

---

## Strategia On-Demand Sync (Target 99.7% risparmio)

### Quando sincronizzare ✅

1. **Login** (se cache scaduta o vuota) — 1 read
2. **Post-write** (dopo ogni salvataggio Firestore) — 0 extra reads (già scritto)
3. **Manual refresh** (tasto refresh utente) — 1 read

### Quando NON sincronizzare ❌

- Ogni navigazione di pagina → usa JWT claims (0 reads)
- Timer periodici (setInterval) → MAI
- `onSnapshot` continuo su dati non real-time critici → MAI

### Cache Structure

```typescript
// localStorage namespace pattern
const CACHE_KEY = `{project}_user_{userId}_{dataType}`;
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 giorni in ms

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId: string;
}

// Leggi dalla cache
const cached = localStorage.getItem(CACHE_KEY);
if (cached) {
  const entry: CacheEntry<T> = JSON.parse(cached);
  const isValid = Date.now() - entry.timestamp < CACHE_DURATION;
  if (isValid) return entry.data; // GRATIS
}

// Cache miss → 1 Firestore read
const data = await getDoc(doc(db, "collection", id));
// Salva in cache
localStorage.setItem(
  CACHE_KEY,
  JSON.stringify({
    data: data.data(),
    timestamp: Date.now(),
    userId
  })
);
```

### JWT-Only Navigation

```typescript
// ✅ Permission check GRATIS (da token, no Firestore)
const { claims } = await getIdTokenResult(auth.currentUser!);
if (claims.role === "admin") {
  // accesso consentito
}

// ❌ Permission check A PAGAMENTO (Firestore read)
const userDoc = await getDoc(doc(db, "userProfiles", uid));
if (userDoc.data()?.role === "admin") {
  /* COSTO! */
}
```

### Firestore-First Write (offline resilience)

```typescript
// ✅ ORDINE CORRETTO
// 1. Scrivi Firestore (persistenza cloud garantita)
await setDoc(doc(db, "collection", id), data);
// 2. Solo dopo → aggiorna cache locale
localStorage.setItem(
  cacheKey,
  JSON.stringify({ data, timestamp: Date.now(), userId })
);

// ❌ ORDINE SBAGLIATO (rischio perdita dati se Firestore fallisce)
localStorage.setItem(cacheKey, JSON.stringify(data));
await setDoc(doc(db, "collection", id), data); // Se fallisce → dati inconsistenti!
```

---

## Safe Logout (Offline Resilience)

```typescript
// ✅ LOGOUT CORRETTO — mantiene dati offline utente
const performLogout = async () => {
  await signOut(auth); // 1. Disconnette Firebase Auth
  myStore.$reset(); // 2. Reset Pinia store (non localStorage!)
  sessionStorage.clear(); // 3. Rimuove solo sessione temporanea

  // 4. localStorage: mantieni dati user-specific
  //    (bozze, alert locali, cache profilo)
  //    Rimuovi SOLO auth tokens se presenti
  localStorage.removeItem(`${project}_auth_token`);
  // NON fare localStorage.clear()!
};

// ❌ LOGOUT SBAGLIATO — cancella tutto inclusi dati offline
const badLogout = async () => {
  await signOut(auth);
  localStorage.clear(); // ❌ Perde bozze, cache, dati offline!
};
```

---

## BUDGET-MONITORING.md — Template

Da aggiornare ogni volta che si implementa un'ottimizzazione:

```markdown
# Budget Monitoring — [Nome Progetto]

Ultimo Aggiornamento: YYYY-MM-DD

## 📊 Costi Attuali (Mensili — 1.000 Utenti)

| Servizio             | Operazioni/Mese | Costo Unitario | Totale         |
| -------------------- | --------------- | -------------- | -------------- |
| Firestore Reads      | ~4.000          | €0,00006       | €0,24          |
| Firestore Writes     | ~2.000          | €0,00018       | €0,36          |
| Cloud Function Calls | ~5.000          | €0,0000004     | €0,002         |
| Firebase Auth        | ~1.000 login    | Gratis         | €0,00          |
| **TOTALE**           |                 |                | **€0,60/mese** |

## 📈 Storico Ottimizzazioni

### [Nome Ottimizzazione] — YYYY-MM-DD

- **Files modificati**: [lista file]
- **Costo PRIMA**: €X/mese ([reads/user/mese] reads/user)
- **Costo DOPO**: €Y/mese ([reads/user/mese] reads/user)
- **RISPARMIO**: €Z/mese (X%)
- **Risparmio annuale**: €W/anno
- **Test**: ✅ Verified / ⏳ In monitoraggio

## 🎯 Target

- Obiettivo: <€1,00/mese (1.000 utenti)
- Attuale: €0,60/mese ✅
```

---

## Calcolo Rapido

Formula risparmio vs auto-sync ogni 30min:

```
Auto-sync: 48 reads/giorno × 30 giorni = 1.440 reads/mese/user
On-demand: ~4 reads/mese/user (login + refresh occasionali)

Con 1.000 utenti:
  Auto-sync: 1.440.000 reads × €0,00006 = €86,40/mese
  On-demand:     4.000 reads × €0,00006 = €0,24/mese
  Risparmio: €86,16/mese = 99.7%
```

## Pattern Costosi da Evitare

```typescript
// ❌ Pattern 1: onSnapshot continuo (€86+/mese)
onSnapshot(collection(db, "userProfiles"), snap => {
  // si aggiorna ogni modifica → migliaia di reads!
});

// ❌ Pattern 2: setInterval sync (€86+/mese)
setInterval(
  async () => {
    await syncProfile(); // 1 read ogni 30min = 1440/mese
  },
  30 * 60 * 1000
);

// ❌ Pattern 3: Firestore per ogni permission check
router.beforeEach(async to => {
  const doc = await getDoc(doc(db, "userProfiles", uid)); // 1 read per OGNI navigazione!
});

// ✅ Tutti e tre si risolvono con JWT claims (0 reads)
router.beforeEach(async to => {
  const token = await getIdToken(auth.currentUser!);
  const claims = token.claims; // Da JWT, GRATIS
  if (!claims.isActive) router.push("/auth");
});
```
