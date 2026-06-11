# Nongoeuskara — Web Demo

Basque (Euskara) dialect and sub-dialect identification running entirely in
the browser using WebAssembly (fastText).

## 🧪 Demos

| Demo | URL | Model |
|------|-----|-------|
| **Euskalkiak** (dialect) | [itzune.eus/nongoeuskara](https://itzune.eus/nongoeuskara) | 2 models, 34MB — batua/dialectal → 5 euskalkis |
| **Azpieuskalkiak** (sub-dialect) | [itzune.eus/nongoeuskara/azpieuskalki](https://itzune.eus/nongoeuskara/azpieuskalki) | 1 model, 31MB — 9 azpieuskalkis + 430 towns |

## How it works

1. A 423KB WebAssembly module (fastText compiled via Emscripten) loads in the browser
2. Two compact fastText models (34MB total, hosted on Hugging Face CDN) are downloaded on first use
3. Hierarchical 2-step classification:
   - Binary: batua vs dialectal
   - Dialect: 5-class euskalkiak

## Model

| Model | Size | XNLI Accuracy |
|-------|------|---------------|
| Binary (web) | 21MB | — |
| Dialect (web) | 13MB | — |
| **Total** | **34MB** | **96.84%** |

Trained with dim=50, bucket=20K/50K — compressed from the original 1.6GB.

Models are hosted at [itzune/zeineuski](https://huggingface.co/itzune/zeineuski).

## Development

```bash
npm install
npm run dev      # Start dev server at localhost:3000
npm run build    # Build for production
npm run preview  # Preview production build
```

The WASM binary (`fastText.common.wasm`) must be placed in `public/`:
```bash
cp node_modules/fasttext.wasm.js/dist/core/fastText.common.wasm public/
```

## Deployment

GitHub Pages serves from the `gh-pages` branch. A simple `git push` to `main` does **not** update the live website — you must rebuild and deploy manually:

```bash
npm run build      # Vite build → dist/
npm run deploy     # gh-pages -d dist (pushes dist/ to gh-pages branch)
```

The `deploy` script runs `npm run build && gh-pages -d dist`. After pushing, GitHub automatically runs the "pages build and deployment" workflow (~30-60s). Verify with:
```bash
curl -s https://itzune.eus/nongoeuskara/nongoeuskara/index.html | grep -oP 'src="/nongoeuskara/assets/[^"]+\.js"'
```

## Related

- [Zeineuski main repo](https://github.com/xezpeleta/zeineuski) — Python/CLI tools
- [itzune/zeineuski](https://huggingface.co/itzune/zeineuski) — Hugging Face models
