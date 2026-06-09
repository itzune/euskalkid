# Nongoeuskara — Implementation Plan

## Concept

A completely new UX for Basque dialect identification. Instead of card-based results,
the user sees a map of **Euskal Herria** with **430 Basque towns/villages** and
7 provincial boundaries. As they type Basque text, the azpieuskalki model runs in
the browser and highlights the predicted towns/regions on the map in real time —
a heatmap of dialect geography.

**URL:** `itzune.eus/euskalkid/nongoeuskara/`

---

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Map rendering | **Inline SVG** (Wiki Commons `Euskal_Herria_euskalkiak2.svg`) | 1,571 municipality paths across 12 dialect layers — no external dependencies |
| Framework | **Vanilla JS** (like `index.html` / `azpieuskalki.html`) | Consistent with existing stack. No build step needed beyond Vite |
| Model runtime | `fasttext.wasm.js` (existing) | Reuse the azpieuskalki 31MB WASM model |
| Styling | CSS custom properties + theme.js | Reuse the existing light/dark theme system |
| Build | Vite (existing) | Add `nongoeuskara/index.html` as a new entry in `vite.config.js` |

---

## Data: Azpieuskalki → SVG Layer Mapping

The `Euskal_Herria_euskalkiak2.svg` from Wikimedia Commons contains **1,571
municipality-level SVG paths** grouped into **12 dialect zone layers** following
Louis Luziano Bonaparte's classification (the same taxonomy used by Zuazo and
Ahotsak.eus).

Each `<path>` represents one Basque municipality with its geographic boundary.
Each path's parent `<g inkscape:label="...">` identifies which dialect zone it
belongs to. The SVG covers the **entire Euskal Herria**:

| SVG Layer | Municipalities | Fill color | Legend name | Our training label |
|-----------|:---:|-----------|-----------|-------------------|
| Mendebalde | 435 | `#ff8080` | gorri (Mendeabal) | mendebal-sartaldea + mendebal-sortaldea |
| Erdialde | 220 | `#aaeeff` | urdin (Erdialde) | erdialde-sartaldea + erdialde-sortaldea |
| Lapurdi | 24 | `#ffa955` | laranja (Lapurdi) | naflap-sartaldea |
| Hegoaldeko Nafarroa Garaia | 375 | `#5fd35f` | berde (Heg. NF Garaia) | nafar-erdigunea + nafar-hego-sartaldea |
| Iparraldeko Nafarroa Garaia | 115 | `#ffff3e` | hori (Ipar. NF Garaia) | nafar-ipar-sartaldea + nafar-sortaldea |
| Burunda | 200 | `#dedede` | zilar (Burunda) | nafar-hego-sartaldea (Sakana) |
| Nafarroa Beherea | 102 | `#d38d5f` | marroi (Naf. Beherea) | naflap-sortaldea |
| Zuberoa | 36 | `#ccaaff` | more (Zuberoa) | zuberera |
| Aezkoa | 20 | `#d1c821` | ziapre (Aezkoa) | nafar-sortaldea |
| Zaraitzu | 28 | `#f5deb3` | gari (Zaraitzu) | ekialde-nafarra |
| Erronkari | 14 | `#d8bfd8` | kardu (Erronkari) | ekialde-nafarra |
| Baztan | 2 | `#ffd700` | urre (Baztan) | nafar-sortaldea |

**Total: 1,571 municipalities × 12 dialect zones**

### Mapping 9-class model → 12 SVG layers

The azpieuskalki web model outputs 9 (or 12) Zuazo labels. We create a mapping
from each model label to one or more SVG layers:

```js
const LABEL_TO_LAYERS = {
  'mendebal-sartaldea':  ['Mendebalde'],
  'mendebal-sortaldea':  ['Mendebalde'],
  'erdialde-sartaldea':  ['Erdialde'],
  'erdialde-sortaldea':  ['Erdialde'],
  'nafar-ipar-sartaldea': ['Iparraldeko Nafarroa Garaia'],
  'nafar-erdigunea':     ['Hegoaldeko Nafarroa Garaia'],
  'nafar-hego-sartaldea': ['Burunda', 'Hegoaldeko Nafarroa Garaia'],
  'nafar-sortaldea':     ['Baztan', 'Aezkoa', 'Iparraldeko Nafarroa Garaia'],
  'naflap-sartaldea':    ['Lapurdi'],
  'naflap-sortaldea':    ['Nafarroa Beherea'],
  'zuberera':            ['Zuberoa'],
  'ekialde-nafarra':     ['Zaraitzu', 'Erronkari'],
};
```

When the model predicts class X with confidence C:
- All municipality paths in `LABEL_TO_LAYERS[X]` get fill-opacity proportional to C
- Top-1 class: full accent color + glow
- Top-2/3 classes: partial opacity
- Other paths: background/dim

### Key advantage

No GeoJSON needed. No geocoding needed. No external API calls. The SVG already
has municipality-level paths grouped by dialect — we just need to parse it,
map layer names to model labels, and toggle fill-opacity via JavaScript.

---

## UI Design

### Layout (desktop)
```
┌──────────────────────────────────────────┐
│  [☀/🌙]  Nongoeuskara                    │  ← header
│          Non dago euskara hau?            │
├──────────────────────┬───────────────────┤
│                      │                   │
│    MAP               │  TEXT AREA        │
│    (Euskal Herria    │  ┌─────────────┐  │
│     7 herrialde)     │  │ idatzi...   │  │
│                      │  │             │  │
│   provinces glow     │  │             │  │
│   based on model     │  │             │  │
│   confidence         │  │             │  │
│                      │  └─────────────┘  │
│                      │                   │
│                      │  PREDICTIONS      │
│                      │  ▸ Mendebal-      │
│                      │    sartaldea 78%  │
│                      │  ▸ ...            │
│                      │                   │
├──────────────────────┴───────────────────┤
│  Footer: links, 31MB, MIT               │
└──────────────────────────────────────────┘
```

### Layout (mobile)
```
┌──────────────────────┐
│  Nongoeuskara    [☀] │
├──────────────────────┤
│  ┌────────────────┐  │
│  │ idatzi hemen...│  │  ← text area first
│  └────────────────┘  │
│                      │
│  ▸ Mendebal-sart.78% │
│  ▸ ...               │
│                      │
│  ┌────────────────┐  │
│  │                │  │
│  │    MAP         │  │  ← map below
│  │                │  │
│  └────────────────┘  │
├──────────────────────┤
│  Footer              │
└──────────────────────┘
```

### Map Design

The map is the **Wiki Commons SVG** (`Euskal_Herria_euskalkiak2.svg`) embedded
inline and controlled via JavaScript/CSS:

- **Base layer:** 1,571 municipality polygons with thin borders
- **Default state:** All polygons at neutral fill (muted gray-blue, ~15% opacity)
  - Light theme: `#8899aa` at low opacity
  - Dark theme: `#4a5568` at low opacity
- **Highlighted state:** Polygons in the predicted layer get:
  - Accent color fill (matching theme accent)
  - Opacity proportional to model confidence
  - Subtle SVG drop-shadow/glow filter
- **Province outlines:** Thicker stroke for 7-herrialde boundaries (overlaid)
- **Labels:** Static Basque province names positioned on the map
- **Animation:** CSS `transition: fill-opacity 300ms ease-out` on `<path>` elements
- **Responsive:** SVG `viewBox` handles scaling; on mobile, map sits below textarea

---

## Interaction Flow

1. User opens page → map shows neutral state (all provinces at low opacity)
2. User types/pastes Basque text in the textarea
3. On each keystroke (debounced 300ms):
   a. Text is sent to the azpieuskalki WASM model
   b. Model returns probability distribution over 9 classes
   c. For each province, aggregate max confidence from its classes
   d. Provinces with confidence > 10% get proportional fill opacity
   e. Top-3 predictions shown in the results panel
4. Clicking a province → pins it (freezes highlight), user can compare
5. Clicking reset/clearing text → back to neutral state

---

## Implementation Steps

### Phase 1: Embedded SVG Map (standalone)

- [ ] Download `Euskal_Herria_euskalkiak2.svg` and clean it up:
  - Remove Inkscape metadata, unused defs, clip paths (~50% size reduction)
  - Group paths by layer into `<g>` elements with `data-layer` attributes
  - Add CSS classes: `.municipio`, `.layer-mendebalde`, `.layer-erdialde`, etc.
- [ ] Build `map.js` to parse the SVG DOM and manage highlighting
- [ ] Implement `highlightLayer(layers, confidence)` function
  - Set `fill-opacity` and `fill` on all paths in matching layers
  - Transition: CSS `transition: fill-opacity 0.3s ease`
- [ ] Standalone test page `nongoeuskara/map.html` to verify rendering
- [ ] Test light/dark theme support (change fill color per theme)

### Phase 2: Wire Model

- [ ] Add `nongoeuskara/index.html` entry to `vite.config.js`
- [ ] Load the azpieuskalki fastText WASM model (same 31MB model)
- [ ] Implement debounced prediction on textarea input
- [ ] Map model output probabilities to province highlights
- [ ] Show per-class predictions in sidebar/panel

### Phase 3: Polish

- [ ] Town-level dots (optional, needs coordinate data)
- [ ] Click-to-pin provinces
- [ ] Share button (copy URL with text?)
- [ ] Responsive layout (mobile-first)
- [ ] Animations and transitions
- [ ] Accessibility (keyboard nav, ARIA labels)

### Phase 4: Integration

- [ ] Add to main site navigation (link from index/azpieuskalki pages)
- [ ] Build & deploy to GitHub Pages
- [ ] Cross-browser testing

---

## SVG Map Data — How It Works

The Wiki Commons SVG (`Euskal_Herria_euskalkiak2.svg`) is embedded inline in the
HTML. It contains **1,571 municipality polygons** grouped into **12 dialect
layers** via Inkscape `<g>` elements with `inkscape:label` attributes.

No GeoJSON, no geocoding, no external data needed — the SVG already contains
every municipality boundary in the correct dialect grouping.

### SVG cleanup needed

1. Download and strip Inkscape metadata, unused defs, clip paths
2. Rename `inkscape:label` layers to consistent `data-layer` attributes
3. Add CSS classes to all municipality `<path>` elements
4. Keep only the visual elements we need (~50% size reduction)

---

## Open Questions

1. **Model label names:** Need to confirm the exact label strings the web model
   outputs (likely the 9 labels from `AZPIEUSKALKI_NAMES` in `azpieuskalki_map.py`)

2. **Batua handling:** If prediction is batua, show all municipalities at uniform
   low opacity with a "Euskara batua — no specific region" overlay.

3. **Model loading UX:** Show loading progress for the 31MB WASM model.

4. **Province boundary overlay:** Should we also draw thicker 7-herrialde
   boundary lines over the municipality polygons for orientation?

5. **Town labels on hover:** Optionally show municipality name on hover
   using the `id` attribute of named paths (281 of 1,571 paths are named).

6. **SVG size:** The raw SVG is large (~1MB). After stripping metadata and
   optimizing it should be ~300-400KB. Can we gzip it via Vite?

---

## File Structure

```
nongoeuskara/
├── PLAN.md              ← this file
├── index.html           ← main page (Vite entry point)
├── map.svg              ← inline SVG data or separate file
├── src/
│   ├── map.js           ← map rendering, province highlighting
│   ├── predict.js       ← model loading, debounced prediction
│   └── nongoeuskara.js  ← main coordination (imports above)
└── data/
    └── provinces.json   ← province geometry + azpieuskalki mappings
```

---

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `fasttext.wasm.js` | ML inference | (existing) |

No additional libraries needed. The SVG is embedded directly in the HTML
and manipulated via standard DOM API.

---

## References

- Azpieuskalki map data: `zeineuski/src/data/azpieuskalki_map.py`
- Town assignments: `zeineuski/data/reference/ahotsak_azpieuskalki_towns.json`
- Existing WASM model: `euskalkid/node_modules/fasttext.wasm.js/`
- Theme system: `euskalkid/src/theme.js`
- Vite config: `euskalkid/vite.config.js`
- OSM Euskal Herria: https://www.openstreetmap.org/relation/390852
