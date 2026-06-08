/**
 * Azpieuskalki WASM — Basque sub-dialect identification in the browser.
 *
 * Single 9-class fastText model loaded via fasttext.wasm.js.
 */
import { AZPIEUSKALKI_TOWNS } from "./towns.js";

const HF_BASE = "https://huggingface.co/itzune/zeineuski/resolve/main";
const MODEL_URL = `${HF_BASE}/models/azpieuskalki_q.bin`;

export const AZPIEUSKALKI_NAMES = {
  "mendebal-sartaldea":  "Mendebal-sartaldea (Western Bizkaian)",
  "mendebal-sortaldea":  "Mendebal-sortaldea (Eastern Bizkaian)",
  "erdialde-sartaldea":  "Erdialde-sartaldea (coastal+western Gipuzkoan)",
  "erdialde-sortaldea":  "Erdialde-sortaldea (eastern Gipuzkoan)",
  "nafar-ipar-sartaldea": "Nafar ipar-sartaldea (Bortziriak/Malerreka)",
  "nafar-erdigunea":     "Nafar erdigunea (central Navarre)",
  "nafar-hego-sartaldea": "Nafar hego-sartaldea (Sakana)",
  "nafar-sortaldea":     "Nafar sortaldea (eastern Navarre)",
  "naflap-sartaldea":    "Nafar-lapur sartaldea (coastal Labourdin)",
  "naflap-sortaldea":    "Nafar-lapur sortaldea (Basse-Navarre)",
  "zuberera":            "Zuberera (Souletin)",
  "ekialde-nafarra":     "Ekialdeko nafarra (Zaraitzu/Erronkari)",
};

export const AZPIEUSKALKI_COLORS = {
  "mendebal-sartaldea":  "#c1121f",
  "mendebal-sortaldea":  "#e76f51",
  "erdialde-sartaldea":  "#2a9d8f",
  "erdialde-sortaldea":  "#457b9d",
  "nafar-ipar-sartaldea": "#6d597a",
  "nafar-erdigunea":     "#52796f",
  "nafar-hego-sartaldea": "#b5838d",
  "nafar-sortaldea":     "#9b5de5",
  "naflap-sartaldea":    "#f15bb5",
  "naflap-sortaldea":    "#00bbf9",
  "zuberera":            "#f4a261",
  "ekialde-nafarra":     "#ff6d00",
};

let model = null;
let _loaded = false;

function getWasmPath() {
  const base =
    (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  if (typeof window !== "undefined" && window.location) {
    const loc = window.location;
    if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") {
      return base + "fastText.common.wasm";
    }
  }
  return base + "assets/fastText.common.wasm";
}

async function getFastText() {
  const { getFastTextClass, getFastTextModule } = await import(
    "fasttext.wasm.js"
  );
  const FastTextModule = await getFastTextModule({ wasmPath: getWasmPath() });
  const FastTextClass = await getFastTextClass({
    getFastTextModule: () => FastTextModule,
  });
  return new FastTextClass();
}

export async function loadModel(onProgress) {
  if (_loaded) return model;
  onProgress?.("⬇ Downloading WASM module…");
  const ft = await getFastText();
  onProgress?.("⬇ Downloading model (31MB)…");
  model = await ft.loadModel(MODEL_URL);
  _loaded = true;
  onProgress?.("✅ Ready");
  return model;
}

export function predict(text) {
  if (!_loaded) throw new Error("Model not loaded. Call loadModel() first.");

  text = text.replace(/\n/g, " ").trim();
  if (!text) {
    return {
      azpieuskalki: null, confidence: 0, name: "No text",
      predictions: [], towns: [],
    };
  }

  const result = model.predict(text, 5);
  const k = Math.min(5, result.size());

  const predictions = [];
  let topLabel = null, topConf = 0;
  for (let i = 0; i < k; i++) {
    const [conf, label] = result.get(i);
    const cleanLabel = label.replace("__label__", "");
    predictions.push({ label: cleanLabel, confidence: conf });
    if (conf > topConf) { topConf = conf; topLabel = cleanLabel; }
  }

  if (!topLabel || topConf < 0.05) {
    return {
      azpieuskalki: null, confidence: 0, name: "Unable to classify",
      predictions, towns: [],
    };
  }

  return {
    azpieuskalki: topLabel,
    confidence: topConf,
    name: AZPIEUSKALKI_NAMES[topLabel] || topLabel,
    predictions,
    towns: AZPIEUSKALKI_TOWNS[topLabel] || [],
  };
}

export { _loaded as loaded };
