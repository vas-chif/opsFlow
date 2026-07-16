# UX & Performance — Procedura Dettagliata

## Obiettivo

Garantire che ogni pagina raggiunga **Lighthouse 100/100** su tutti e 4 i pilastri,
rispettando il Design System "Elite" e la piena accessibilità.

---

## Lighthouse Audit — Procedura

```bash
# Build di produzione (mai testare su dev server con HMR!)
pnpm build

# Avvio preview server
pnpm preview

# Run Lighthouse CLI (installare globalmente se necessario)
npx lighthouse http://localhost:4173 \
  --output=html \
  --output-path=./reports/lighthouse-$(date +%Y%m%d).html \
  --preset=desktop \
  --chrome-flags="--headless"

# Per mobile
npx lighthouse http://localhost:4173 \
  --output=html \
  --output-path=./reports/lighthouse-mobile-$(date +%Y%m%d).html \
  --preset=mobile \
  --chrome-flags="--headless"
```

---

## Core Web Vitals — Target

| Metrica                               | Target             | Tool                  |
| ------------------------------------- | ------------------ | --------------------- |
| LCP (Largest Contentful Paint)        | < 2.5s             | Lighthouse            |
| FID / INP (Interaction to Next Paint) | < 100ms            | Chrome DevTools       |
| CLS (Cumulative Layout Shift)         | < 0.1              | Lighthouse            |
| TTFB (Time to First Byte)             | < 800ms            | WebPageTest           |
| Bundle size (gzip)                    | < 200KB initial JS | `pnpm build --report` |

---

## Bundle Analysis

```bash
# Analisi bundle size (visualizzazione interattiva)
pnpm build -- --report

# Oppure con vite-bundle-visualizer
npx vite-bundle-visualizer

# Controllare chunk sizes > 50KB
du -sh dist/assets/*.js | sort -h
```

**Red Flag:** Se un singolo chunk supera 100KB → candidato per lazy loading.

```typescript
// ✅ Lazy loading corretto per pagine non critiche
const AdminPage = defineAsyncComponent(() => import("./pages/AdminPage.vue"));

// ✅ Import dinamico librerie pesanti
const { Chart } = await import("chart.js");
```

---

## Design System "Elite" — Audit Visivo

### Palette Obbligatoria

```scss
// src/css/quasar.variables.scss — valori da rispettare
$primary: #0a2342; // Royal Navy
$secondary: #c5a065; // Gold
$background: #f9f7f2; // Off-White

// ❌ Vietato usare colori fuori palette senza approvazione
```

### Tipografia Audit

```html
<!-- Verificare in index.html: preload obbligatorio -->
<link
  rel="preload"
  href="/fonts/PlayfairDisplay.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
<link
  rel="preload"
  href="/fonts/Mulish.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

### Viewport Testing Checklist

| Breakpoint | Device simulato  | Verifica                              |
| ---------- | ---------------- | ------------------------------------- |
| 320px      | iPhone SE        | Layout non rotto, testo leggibile     |
| 375px      | iPhone 14        | Form usabili, bottoni raggiungibili   |
| 768px      | iPad             | Layout a 2 colonne se previsto        |
| 1024px     | Desktop small    | Sidebar visibile                      |
| 1440px     | Desktop standard | Spaziature Elite (`q-pa-xl`) corrette |

---

## Accessibility (a11y) — Checklist WCAG 2.1 AA

```bash
# Audit automatico accessibilità con axe-core
npx @axe-core/cli http://localhost:4173 --exit
```

**Controlli Manuali Obbligatori:**

1. **Keyboard navigation**: Tab attraverso tutti gli elementi → ogni interattivo è raggiungibile?
2. **Focus indicator**: Visibile su ogni elemento con Tab (non nascosto con `outline: none`)
3. **Screen reader**: Testare con NVDA (Windows) o VoiceOver (Mac) — form e tabelle leggibili?
4. **Color contrast**: Verificare con [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/)
   - Testo normale: ≥ 4.5:1
   - Testo grande (≥18pt): ≥ 3:1
   - Componenti UI: ≥ 3:1

**Pattern HTML Accessibili:**

```html
<!-- ✅ Form accessibile -->
<label for="patient-name">Nome paziente</label>
<input
  id="patient-name"
  type="text"
  aria-required="true"
  aria-describedby="name-hint"
/>
<span id="name-hint" class="sr-only">Inserire nome e cognome completi</span>

<!-- ✅ Feedback dinamico accessibile -->
<div role="alert" aria-live="polite">{{ errorMessage }}</div>

<!-- ✅ Immagini con alt significativo -->
<img
  src="/logo.png"
  alt="OPSFlow — Sistema gestione clinica"
  width="120"
  height="40"
/>
```

---

## Anti-Pattern Performance da Bloccare

```typescript
// ❌ Import dell'intera libreria (aumenta bundle size)
import * as _ from 'lodash';

// ✅ Import specifico (tree-shakeable)
import { debounce } from 'lodash-es';

// ❌ onSnapshot su lista pazienti (>1000 doc: costo + latenza)
onSnapshot(collection(db, 'patients'), handler);

// ✅ On-demand fetch con cache 30 giorni
await store.loadPatients(); // legge da cache se fresca

// ❌ Immagine senza dimensioni esplicite (CLS!)
<img src="photo.jpg" />

// ✅ Dimensioni esplicite + lazy loading
<img src="photo.jpg" width="400" height="300" loading="lazy" alt="..." />
```

---

## Regole QA — UX & Performance

- **Lighthouse sempre su build di produzione** — HMR invalida i risultati.
- Ogni nuova pagina deve avere audit Lighthouse prima del merge.
- CLS > 0 → identificare l'elemento che causa il layout shift prima di procedere.
- Font non preloadati → aggiungere `rel="preload"` in `index.html`.
- Segnalare design fuori palette come bug bloccante (non cosmético).
