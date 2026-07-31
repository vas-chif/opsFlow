# Integration Testing — Procedura Dettagliata

## Obiettivo

Verificare che **Pinia store + Firestore + componenti Vue** comunichino correttamente.
Usare Firebase Emulator Suite per test realistici senza costi cloud.

---

## Setup Firebase Emulator

```bash
# Avvio emulatori locali (Firestore + Auth)
firebase emulators:start --only firestore,auth

# In vitest.config.ts — puntare all'emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
```

---

## Test WriteBatch — Atomicità Obbligatoria

```typescript
/**
 * @file invoiceInventory.integration.test.ts
 * @description Integration test per WriteBatch fattura + inventario
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useInvoiceStore } from "src/stores/invoiceStore";
import { setActivePinia, createPinia } from "pinia";

describe("Invoice + Inventory WriteBatch", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  }); /*end beforeEach*/

  it("should atomically write invoice and decrement inventory", async () => {
    const store = useInvoiceStore();
    const initialStock = await getStockLevel("PROD-001");

    await store.createInvoice({ productId: "PROD-001", qty: 2 });

    const finalStock = await getStockLevel("PROD-001");
    expect(finalStock).toBe(initialStock - 2);
  }); /*end it*/

  it("should rollback both documents if Firestore write fails", async () => {
    // Simulare errore Firestore a metà batch
    vi.spyOn(batch, "commit").mockRejectedValueOnce(new Error("Network error"));

    const store = useInvoiceStore();
    await expect(store.createInvoice({ productId: "PROD-001", qty: 1 })).rejects.toThrow();

    // Verificare che l'inventario NON sia stato decrementato
    const stock = await getStockLevel("PROD-001");
    expect(stock).toBe(initialStock); // invariato
  }); /*end it*/
}); /*end describe WriteBatch*/
```

---

## Test Cache Locale (Pinia ↔ localStorage)

```typescript
describe("Cache Sync Strategy", () => {
  it("should serve data from cache if freshness < 30 days", async () => {
    // Seed cache con timestamp recente
    localStorage.setItem(
      `opsflow_user_${userId}_patients`,
      JSON.stringify({ data: mockPatients, timestamp: Date.now() }),
    );

    const store = usePatientStore();
    await store.loadPatients();

    // Firestore NON deve essere interrogato
    expect(firestoreGetDoc).not.toHaveBeenCalled();
  }); /*end it*/

  it("should refetch from Firestore when cache is expired", async () => {
    const expiredTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 giorni fa
    localStorage.setItem(
      `opsflow_user_${userId}_patients`,
      JSON.stringify({ data: mockPatients, timestamp: expiredTimestamp }),
    );

    const store = usePatientStore();
    await store.loadPatients();

    expect(firestoreGetDoc).toHaveBeenCalledOnce();
  }); /*end it*/
}); /*end describe Cache Sync*/
```

---

## Test Flusso Auth End-to-End

| Scenario                        | Verifica                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| Login con credenziali valide    | JWT claims `isActive: true`, `role` presenti                |
| JWT scaduto durante navigazione | Redirect a `/login` senza perdita dati                      |
| Utente `isActive: false`        | Blocco accesso a tutte le rotte protette                    |
| Logout                          | Store Pinia resettati, token rimossi, cache offline intatta |

---

## Regole QA — Integration Testing

- **Firebase Emulator** obbligatorio: nessun test su progetto Firebase reale.
- Ogni test deve partire da uno **stato pulito** (beforeEach con reset store + emulator flush).
- Verificare sempre sia il **successo** che il **fallimento controllato** delle operazioni batch.
- Mai usare `setTimeout` nei test — usare `await` e `vi.useFakeTimers()` per timer.
- Documentare ogni scenario con commento `// Scenario: ...` prima del test.
