# Unit Testing — Procedura Dettagliata

## Obiettivo

Testare ogni funzione business in **isolamento completo** da Firebase, Pinia e DOM.
Un test unitario che passa deve garantire che la logica sia corretta **indipendentemente dall'ambiente**.

---

## Setup Standard

```typescript
// test/utils/setup.ts
import { vi } from "vitest";

// Mock Firebase SDK completo
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn()
}));

// Mock logger custom (mai usare console.log diretto)
vi.mock("src/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));
```

---

## Template Test Unitario

```typescript
/**
 * @file calculateVat.test.ts
 * @description Unit test per la funzione calculateVat
 */
import { describe, it, expect } from "vitest";
import { calculateVat } from "src/utils/tax";

describe("calculateVat", () => {
  // ── Happy Path ────────────────────────────────────────────────────────────
  it("should return correct VAT amount for standard rate", () => {
    expect(calculateVat(100, 22)).toBe(22);
  }); /*end it*/

  it("should return 0 for zero-rated items", () => {
    expect(calculateVat(100, 0)).toBe(0);
  }); /*end it*/

  // ── Edge Cases ────────────────────────────────────────────────────────────
  it("should throw for negative base amount", () => {
    expect(() => calculateVat(-100, 22)).toThrow();
  }); /*end it*/

  it("should throw for VAT rate above 100%", () => {
    expect(() => calculateVat(100, 101)).toThrow();
  }); /*end it*/

  it("should handle floating point precision correctly", () => {
    expect(calculateVat(33.33, 22)).toBeCloseTo(7.33, 2);
  }); /*end it*/
}); /*end describe calculateVat*/
```

---

## Funzioni Critiche — Copertura 100%

| Funzione                  | File                      | Casi edge obbligatori                         |
| ------------------------- | ------------------------- | --------------------------------------------- |
| `calculateVat()`          | `src/utils/tax.ts`        | 0%, 4%, 10%, 22%, negativo, >100              |
| `validateCodiceFiscale()` | `src/utils/validation.ts` | 16 char, formato errato, case insensitive     |
| `generateUUID()`          | `src/utils/uuid.ts`       | unicità su 10.000 chiamate, formato RFC 4122  |
| `encryptPII()`            | `src/utils/crypto.ts`     | input vuoto, chiave nulla, decrypt round-trip |
| `sanitize()`              | `src/utils/sanitize.ts`   | `<script>`, SQL injection, XSS payload        |

---

## Regole QA — Unit Testing

- **Mai** testare implementazione interna — testare **comportamento osservabile**.
- **Sempre** usare `describe` nidificati per raggruppare happy path / edge cases / error cases.
- **Mai** dati PII reali nelle fixture — usare generatori fake (es. `faker-it`).
- **Sempre** includere un test per ogni branch `if/else` significativo.
- Copertura minima: **80%** su `src/utils/`, **100%** su funzioni di pagamento e crypto.
