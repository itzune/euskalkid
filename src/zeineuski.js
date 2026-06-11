/**
 * Zeineuski WASM — Basque dialect identification in the browser.
 *
 * Hierarchical 2-step classifier using fasttext.wasm.js:
 *   1. Binary: batua vs dialectal
 *   2. Dialect: 5-class euskalkiak
 */

// Models hosted on Hugging Face Hub
const HF_BASE = "https://huggingface.co/itzune/zeineuski/resolve/main";
const MODEL_FILES = {
  binary: `${HF_BASE}/models/hier_binary_web.bin`,
  dialect: `${HF_BASE}/models/hier_dialect_web.bin`,
};

export const DIALECT_NAMES = {
  batua: "Batua",
  western: "Mendebaldekoa (Bizkaiera)",
  central: "Erdialdekoa (Gipuzkera)",
  "nav-lab": "Nafar-Lapurtera",
  navarrese: "Nafarrera",
  souletin: "Zuberera",
  uncertain: "Zalantzazkoa",
};

export const BADGE_CLASS = {
  batua: "badge-batua",
  western: "badge-western",
  central: "badge-central",
  "nav-lab": "badge-nav-lab",
  uncertain: "badge-uncertain",
};

// ── State ──
let binaryModel = null;
let dialectModel = null;
let _loaded = false;

// ── Load WASM module and models ──
function getWasmPath() {
  // Both dev and production need an explicit wasmPath because
  // the default locateFile (scriptDirectory + url) resolves wrong.
  // Dev: public/ served at base URL root => /zeineuski-wasm/fastText.common.wasm
  // Prod: WASM in assets/ alongside JS bundles => /zeineuski-wasm/assets/fastText.common.wasm
  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  if (typeof window !== "undefined" && window.location) {
    const loc = window.location;
    if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") {
      return base + "node_modules/fasttext.wasm.js/dist/core/fastText.common.wasm";
    }
  }
  // Production: WASM is copied into dist/assets/ alongside the JS
  return base + "assets/fastText.common.wasm";
}

async function getFastText() {
  const { getFastTextClass, getFastTextModule } = await import("fasttext.wasm.js");
  const FastTextModule = await getFastTextModule({
    wasmPath: getWasmPath(),
  });
  const FastTextClass = await getFastTextClass({ getFastTextModule: () => FastTextModule });
  return new FastTextClass();
}

export async function loadModels(onProgress) {
  if (_loaded) return { binaryModel, dialectModel };

  onProgress?.("WASM module loading…");
  
  // Each model needs its own FastTextClass instance — the C++ core
  // is shared per instance, so loading a second model would overwrite the first.
  const ftBinary = await getFastText();
  const ftDialect = await getFastText();

  onProgress?.("Binary model loading (21MB)…");
  binaryModel = await ftBinary.loadModel(MODEL_FILES.binary);

  onProgress?.("Dialect model loading (13MB)…");
  dialectModel = await ftDialect.loadModel(MODEL_FILES.dialect);

  _loaded = true;
  onProgress?.("✓ Ready");

  return { binaryModel, dialectModel };
}

// ── Prediction ──
export function predict(text, threshold = 0.7) {
  if (!_loaded) throw new Error("Models not loaded. Call loadModels() first.");

  text = text.replace(/\n/g, " ").trim();
  if (!text) {
    return {
      dialect: "uncertain",
      confidence: 0,
      dialectName: "No text",
      predictions: [],
    };
  }

  // Step 1: Binary
  // predict() returns Vector<[number, string]> (probability, label)
  const binResult = binaryModel.predict(text, 1);
  const [binConf, binLabel] = binResult.get(0);

  if (binLabel === "__label__batua") {
    return {
      dialect: "batua",
      confidence: binConf,
      dialectName: DIALECT_NAMES.batua,
      predictions: [{ label: "batua", confidence: binConf }],
    };
  }

  // Step 2: Dialect
  const result = dialectModel.predict(text, 3);
  const k = Math.min(3, result.size());

  const predictions = [];
  let topLabel = null;
  let topConf = 0;
  for (let i = 0; i < k; i++) {
    const [conf, label] = result.get(i);
    const cleanLabel = label.replace("__label__", "");
    predictions.push({
      label: cleanLabel,
      confidence: conf,
    });
    if (conf > topConf) {
      topConf = conf;
      topLabel = cleanLabel;
    }
  }

  if (topConf < threshold) {
    return {
      dialect: "uncertain",
      confidence: topConf,
      dialectName: `Zalantzazkoa (${DIALECT_NAMES[topLabel] || topLabel}?)`,
      predictions,
    };
  }

  return {
    dialect: topLabel,
    confidence: topConf,
    dialectName: DIALECT_NAMES[topLabel] || topLabel,
    predictions,
  };
}

/**
 * Raw outputs of both models, for the details view: full binary distribution
 * (batua vs dialectal) and dialect top-k, without the batua short-circuit
 * used by predict().
 */
export function predictDetailed(text) {
  if (!_loaded) throw new Error("Models not loaded. Call loadModels() first.");

  text = text.replace(/\n/g, " ").trim();
  if (!text) return { binary: [], dialect: [] };

  const binary = [];
  const binResult = binaryModel.predict(text, 2);
  for (let i = 0; i < binResult.size(); i++) {
    const [conf, label] = binResult.get(i);
    binary.push({ label: label.replace("__label__", ""), confidence: conf });
  }

  const dialect = [];
  const dialResult = dialectModel.predict(text, 5);
  for (let i = 0; i < dialResult.size(); i++) {
    const [conf, label] = dialResult.get(i);
    dialect.push({ label: label.replace("__label__", ""), confidence: conf });
  }

  return { binary, dialect };
}

export { _loaded as loaded };
