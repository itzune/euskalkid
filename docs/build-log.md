# How we built a 34MB Basque dialect classifier that runs in your browser

> **TL;DR:** Zeineuski is a 2-step hierarchical fastText classifier that identifies Basque dialects (Batua, Western, Central, Navarrese-Lapurdian, Navarrese, Souletin) with **96.84% accuracy**. The model runs entirely in the browser via WebAssembly, weighs just **34MB**, and is served from a single static HTML page. Here's how we built it, the data bug that almost ruined everything, and how we compressed 1.6GB of models into something CDN-friendly.

---

## The problem: Basque dialect identification is hard

Basque (Euskara) has five main dialect groups—Western (Bizkaiera), Central (Gipuzkera), Navarrese-Lapurdian, Navarrese, and Souletin—plus Standard Basque (Batua), the unified literary variety taught in schools. Telling them apart is non-trivial even for native speakers, because:

- The dialects form a **continuum** — neighboring varieties bleed into each other
- Batua borrows morphology from multiple dialects, so it's easy to confuse with dialectal text
- Written dialectal Basque is **low-resource**: most digital text is Batua, and dialectal writing is sparse, inconsistent, and full of orthographic variation

We wanted to build a classifier that could handle all six categories, run fast enough for interactive use, and—ideally—work entirely in the browser with no server.

---

## Phase 1: Data is everything

### The XNLI dialectal corpus

We started with the [XNLI dialectal dataset](https://huggingface.co/datasets/hitz-zentroa/Catalog-of-Basque-Dialects) from HiTZ Zentroa, which provides ~15K sentences labeled by dialect (3-class: Western, Central, Navarrese-Lapurdian). This became our primary evaluation metric: **XNLI accuracy** measures how well the model generalizes across domains.

### Klasikoak: the dataset that almost broke us

To expand to 5 dialects + Batua, we scraped the [Klasikoak corpus](https://klasikoak.armiarma.eus/) — a massive collection of Basque literary texts with author-level dialect metadata. We built a scraper to extract sentences and auto-label them based on the author's known dialect. The result: **80,519 training lines across 6 classes**.

Training looked great. Validation accuracy hit 94.5%. Then we noticed something odd: XNLI accuracy was stuck at 91.5%, well below the 5-class ceiling of 96.85%. A 5.4 percentage point gap is not normal for fastText on this kind of task.

### The `__label__` pollution bug

After days of hyperparameter sweeps that went nowhere, we finally looked at the raw training data line by line. That's when we found it:

```
__label__western __label__central __label__SAN __label__AMA ...
```

Klasikoak texts use `__label__` tokens as section/chapter/author markers. fastText, by design, treats the **first** `__label__` on each line as the class label and everything else as training text. So it was silently training on thousands of spurious classes like `__label__SAN`, `__label__AMA`, `__label__Literaturaren_Zubitegia`.

**63% of training lines were corrupted** — 50,542 out of 80,519. The model wasn't learning dialect features; it was memorizing metadata noise.

#### The fix

We filtered training lines to keep only those where the first `__label__` matched a valid dialect class:

```python
valid_labels = {'__label__batua', '__label__western', '__label__central', 
                '__label__nav-lab', '__label__navarrese', '__label__souletin'}
clean_lines = [line for line in lines if line.split()[0] in valid_labels]
```

Clean dataset: **29,977 lines**. Training time dropped 7.8× (137s → 17.6s for epoch=25). XNLI improved +0.59pp with identical hyperparameters.

**Lesson learned:** When using scraped text for classification, always validate that your label tokens are actual class labels, not metadata that shares the same prefix.

---

## Phase 2: The hierarchical solution

Even with clean data, flat 6-class fastText hit a wall at ~93.3% XNLI. The confusion matrix showed the pattern clearly:

|  | Batua | Western | Central | Nav-Lab |
|---|---|---|---|---|
| **Batua** | — | 15% misclassified as dialectal | 10% misclassified | 12% misclassified |

Batua-vs-dialect confusion was the dominant error source. The model was trying to solve two fundamentally different problems at once: "Is this Batua?" (a binary distinction) and "Which dialect is this?" (a fine-grained 5-way classification among mutually intelligible varieties).

### Architecture: 2-step hierarchical classifier

Instead of one 6-class model, we trained two:

1. **Binary classifier** (batua vs dialectal): lr=3.0, 50 epochs, dim=100
2. **Dialect classifier** (5-class): lr=0.2, 150 epochs, dim=100

The key insight: the dialect model is trained **only on dialectal data** — it never sees Batua samples. This means it can focus entirely on the subtle differences between Western, Central, Navarrese-Lapurdian, Navarrese, and Souletin without being confused by standard Basque.

### Results

- **XNLI accuracy: 96.73%** — only 0.12pp below the 5-class ceiling (96.85%)
- **6-class test accuracy: 97.83%**
- **Total training time: ~57 seconds**
- Batua F1: 0.962, Western: 0.976, Central: 0.958, Nav-Lab: 0.968

The 0.12pp gap to the ceiling is within fastText's non-determinism noise. Further tuning won't close it — this is effectively the theoretical maximum for this architecture on this data.

---

## Phase 3: Model compression

The two models (binary + dialect) at dim=100 with the default 2 million hash buckets weighed ~800MB each — 1.6GB total. Way too much for browser delivery.

### Where does the size come from?

fastText stores `(nwords + nbuckets + nclasses) × dim × 4` bytes. With 2M buckets and dim=100:

```
(~75K words + 2,000,000 buckets + 2 classes) × 100 × 4 ≈ 830 MB
```

The word embeddings are only ~30MB (4%). **96% of the model is hash bucket weights** — the n-gram embedding table that maps character substrings to dense vectors.

### Compression strategy: reduce bucket count

For Basque dialect classification, 2 million hash buckets is massive overkill. The character n-gram space isn't that large, and hash collisions at lower bucket counts act as a form of regularization that helps generalization.

We trained four variants:

| Variant | Binary buckets | Dialect buckets | Total size | XNLI | Compression |
|---|---|---|---|---|---|
| final | 2M | 2M | 1,588 MB | — | 1× |
| quantized | 500K | 500K | 438 MB | 96.94% | 3.7× |
| **compact** | 200K | 200K | **198 MB** | **96.85%** | **8×** |
| tiny | 100K | 100K | 118 MB | 96.68% | 13.6× |

The `compact` variant is our default for CLI usage: it matches the 5-class ceiling exactly (96.85% XNLI) at 198MB.

### Web-optimized variant: dim=50

For browser delivery, we went further — reducing the embedding dimension from 100 to 50, and dropping bucket counts to 20K/50K:

| Variant | Binary | Dialect | Total | XNLI |
|---|---|---|---|---|
| **web** | 20K buckets | 50K buckets | **34 MB** | **96.84%** |

**34MB is 46× smaller than the original 1.6GB** while keeping XNLI at 96.84% — just 0.01pp below the 5-class ceiling.

The reason this works: at bucket=20K, hash collisions are frequent, and the model is forced to share representations between character n-grams. This acts as aggressive regularization — the model can't overfit to rare n-gram patterns because they collide with common ones in the same bucket. For a task with only 29K training examples and highly structured morphological patterns (Basque is agglutinative), this is a feature, not a bug.

---

## Phase 4: WebAssembly & the browser demo

The goal was a static site — no server, no API, no backend. Everything runs client-side.

### The stack

- **[fasttext.wasm.js](https://github.com/TimeoutIO/fasttext.wasm.js):** Emscripten-compiled fastText, 423KB WASM binary
- **[Vite](https://vitejs.dev/):** Bundler with ES module support, tree-shaking, and dev server
- **Hugging Face CDN:** Models served via `https://huggingface.co/itzune/zeineuski/resolve/main/models/…` (free, globally cached)
- **GitHub Pages:** Static hosting with custom domain (itzune.eus)

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser                                                  │
│                                                           │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐ │
│  │ fasttext.wasm│    │ Binary model│    │ Dialect model│ │
│  │ (423 KB)    │    │ (21 MB)     │    │ (13 MB)      │ │
│  │ from gh-pages│    │ from HF CDN │    │ from HF CDN  │ │
│  └─────────────┘    └─────────────┘    └──────────────┘ │
│                                                           │
│  Input text → Binary (batua?) → if dialectal → 5-class   │
│                                                           │
│  Result: "Erdialdekoa (Gipuzkera)" 95.4% confidence      │
└──────────────────────────────────────────────────────────┘
```

### The tricky parts

#### 1. Separate WASM instances per model

The biggest bug we hit was subtle. `fasttext.wasm.js` wraps a C++ core — one instance per `FastTextClass`. When we loaded the binary model, then the dialect model into the **same** instance, the C++ `loadModel()` overwrote the first model's weights. Both JavaScript objects pointed to the dialect model, so every prediction returned binary labels (`__label__dialectal` instead of e.g. `__label__central`).

The fix: instantiate two separate `FastTextClass` objects:

```javascript
const ftBinary = await getFastText();
const ftDialect = await getFastText();

binaryModel = await ftBinary.loadModel(MODEL_FILES.binary);
dialectModel = await ftDialect.loadModel(MODEL_FILES.dialect);
```

Double the WASM memory (~423KB each) but negligible for a desktop/mobile browser.

#### 2. WASM path resolution in production

The default `locateFile` callback in Emscripten computes the WASM URL from the script's directory. In development (Vite), this worked. In production (GitHub Pages with base path `/euskalkid/`), it resolved to `https://itzune.github.io/fastText.common.wasm` — missing the base path entirely.

The fix: always provide an explicit `wasmPath`:

```javascript
function getWasmPath() {
  const base = import.meta.env.BASE_URL || "/";
  if (window.location.hostname === "localhost") {
    return base + "fastText.common.wasm";  // dev: served from public/
  }
  return base + "assets/fastText.common.wasm"; // prod: Vite copies to dist/assets/
}
```

#### 3. Model delivery

34MB is too big for git. We host the models on Hugging Face's CDN and the JS code fetches them on-demand:

```javascript
const MODEL_FILES = {
  binary: "https://huggingface.co/itzune/zeineuski/resolve/main/models/hier_binary_web.bin",
  dialect: "https://huggingface.co/itzune/zeineuski/resolve/main/models/hier_dialect_web.bin",
};
```

The page loads in ~950KB (JS + WASM), then the 34MB of models are fetched and cached by the browser on first use.

### The UI

Dark-themed, responsive, with 8 clickable example sentences (2 per dialect class). The prediction flow:

```
User types or clicks an example
  → "Identifikatu" button
  → Binary model: "Is this Batua?"
  → If yes: show "Batua" with confidence
  → If no: run dialect model → show e.g. "Mendebaldekoa (Bizkaiera) 99.9%"
```

Confidence bar color-coded: green ≥90%, yellow ≥70%, red <70%.

### Live demo

**[https://itzune.eus/euskalkid/](https://itzune.eus/euskalkid/)**

Source: [github.com/itzune/euskalkid](https://github.com/itzune/euskalkid)

---

## Phase 5: CLI & Python package

For programmatic use, we built a Python CLI that uses the same hierarchical architecture:

```bash
# Install
uv pip install git+https://github.com/itzune/zeineuski.git

# Single prediction
zeineuski predict "Kaixo, zer moduz zaude?"
# → Batua (86.2%)

# Batch from file
zeineuski predict --batch testuak.txt

# Download models for offline use
zeineuski download --variant compact
```

Supports all four variants (`final`, `quantized`, `compact`, `tiny`) with auto-download from Hugging Face.

Source: [github.com/itzune/zeineuski](https://github.com/itzune/zeineuski)

---

## What we learned

1. **Data quality > model architecture.** The Klasikoak `__label__` pollution bug wasted days of hyperparameter tuning. Always validate that your label tokens are what you think they are.

2. **Hierarchical decomposition beats flat classification when confusion is structured.** The batua-vs-dialect boundary is a fundamentally different problem from dialect-vs-dialect discrimination. Two simple models outperform one complex one.

3. **Hash bucket collisions are your friend.** For low-resource tasks with strong morphological structure (like Basque dialects), aggressive bucket compression acts as regularization. The `web` variant at 20K buckets actually matches the 2M-bucket variant in accuracy.

4. **WebAssembly is production-ready for NLP inference.** A 423KB WASM binary running fastText in the browser, loading 34MB models from CDN, classifying text in milliseconds — all with no backend. The ergonomics aren't perfect yet (separate instances per model, careful path management), but it works.

5. **fastText remains incredibly strong for this class of problem.** No transformer, no GPU, no fine-tuning — a character n-gram model trained in 60 seconds achieves 96.84% on a 6-way dialect classification task that even native speakers find challenging.

---

## What's next

- **Speech dialect identification:** Extending to audio using Whisper/XLSR fine-tuned on Ahotsak.eus oral archives
- **Multi-label support:** Handling the dialect continuum where a text may belong to multiple categories
- **Dialect strength scoring:** Instead of binary classification, quantify how "dialectal" a text is on a continuous scale
- **Sub-dialect granularity:** Goierri vs Beterri, Markina vs Gernika — the finer distinctions within dialect groups

---

*Built with fastText, WebAssembly, Vite, and a lot of Basque coffee. Models hosted on Hugging Face. Demo live at [itzune.eus/euskalkid](https://itzune.eus/euskalkid).*
