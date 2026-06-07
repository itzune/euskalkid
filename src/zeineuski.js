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
const WASM_PATH = import.meta.env.BASE_URL + "fastText.common.wasm";

async function getFastText() {
  const { getFastTextClass, getFastTextModule } = await import("fasttext.wasm.js");
  // Provide a wrapper that sets wasmPath so the WASM binary is found at the repo root
  const moduleWithPath = () => getFastTextModule({ wasmPath: WASM_PATH });
  const FastTextClass = await getFastTextClass({ getFastTextModule: moduleWithPath });
  return new FastTextClass();
}

export async function loadModels(onProgress) {
  if (_loaded) return { binaryModel, dialectModel };

  onProgress?.("WASM module loading…");
  const ft = await getFastText();

  onProgress?.("Binary model loading (21MB)…");
  binaryModel = await ft.loadModel(MODEL_FILES.binary);

  onProgress?.("Dialect model loading (13MB)…");
  dialectModel = await ft.loadModel(MODEL_FILES.dialect);

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
  const [binLabels, binProbs] = binaryModel.predict(text, 1);
  const binLabel = binLabels[0];
  const binConf = binProbs[0];

  if (binLabel === "__label__batua") {
    return {
      dialect: "batua",
      confidence: binConf,
      dialectName: DIALECT_NAMES.batua,
      predictions: [{ label: "batua", confidence: binConf }],
    };
  }

  // Step 2: Dialect
  const [labels, probs] = dialectModel.predict(text, 3);

  const topLabel = labels[0].replace("__label__", "");
  const topConf = probs[0];

  const predictions = [];
  for (let i = 0; i < labels.length; i++) {
    predictions.push({
      label: labels[i].replace("__label__", ""),
      confidence: probs[i],
    });
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

export { _loaded as loaded };
